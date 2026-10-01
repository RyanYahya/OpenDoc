import React, { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import { PdfPage } from "./Pdf";
import { useReaderPreview } from "./useReaderPreview";
import { useTextEditing } from "./useTextEditing";
import { CommentDock, CommentsButton } from "./CommentDock";
import { DeletedComments } from "./DeletedComments";
import { ReaderPanel } from "./ReaderPanel";
import { closePanel, isShowing, loadPanelPreference, panelFromPreference, savePanelPreference, selectTab, showPanel, togglePanel, type PanelState, type PanelTarget } from "./readerPanel";
import { saveBarStatus, saveBarVisible } from "./saveBar";
import { unionBox, useAnchoredPanel } from "./anchoredPanel";
import { applyCommentsPrompt } from "./agentPrompts";
import { api } from "./api";
import { ExportMenu } from "./ExportMenu";
import { SkillIndex } from './SkillIndex';
import { getBlock, documentFormat, documentName, type Comment, type DocumentState } from "../shared/types";
import { PageNumberInput } from "./PageNumberInput";
import { commentDraftKey, componentCommentDraftKey, commentDrafts, type CommentDrafts } from "./commentDrafts";
import type { DocumentSelection, TextAnchor } from "../shared/selection";
import { anchorForSelection, getTextTarget, resolveCommentAnchor, selectionReason } from "../shared/anchors";
import { textLang, type Language } from "../shared/language";
import { canCorrectComponent, correctionUnavailableReason, selectedTextTarget } from "./componentCorrection";
import { useNotificationClearance } from "./notificationClearance";
import { carryRange, isPhrase, phraseFromText, savedPhrase, type TextRange } from './phraseSelection';
import { missingGlyphs, pageList } from "./missingGlyphs";
import { pageSlices, type PageSlice } from "./pageSlices";
import { sessionForDocument, sourceIdentity } from './editSession';
import { readOpenEditor, recoverEditor, type EditorBaseline, type OpenEditorRecord } from './editorRecovery';
import "./selection.css";
import "./reader-toolbar.css";
import "./edit-workbench.css";

import { Icon } from "./ui/Icon";
import {
  Button,
  HintButton,
  IconButton,
  SelectControl,
  useNotifications,
} from "./ui";

// Version history loads when its tab first opens; the panel shows its own loading placeholder meanwhile.
const HistoryPanel = lazy(() => import("./HistoryPanel").then(module => ({ default: module.HistoryPanel })));
const historyLoading = <section className="history-panel" aria-busy="true"><div className="history-content"><div className="history-skeleton" aria-hidden="true"><span /><span /><span /></div></div></section>;

type CorrectionDraft = { selection: DocumentSelection; text: string; linked: number; baseline?: EditorBaseline };
const openEditors = new Map<string, OpenEditorRecord>();
/** Narrow screens show the side panel, editor, and comment composer as bottom sheets, one at a time. */
const sheetQuery = '(max-width: 620px)';
function sheetLayoutNow() {
  try { return window.matchMedia(sheetQuery).matches; } catch { return false; }
}
function subscribeSheetLayout(change: () => void) {
  const query = window.matchMedia(sheetQuery);
  query.addEventListener('change', change);
  return () => query.removeEventListener('change', change);
}
/** A stable function that calls the latest handler, so memoized pages skip renders that do not concern them. */
function useLatest<Args extends unknown[]>(handler: (...args: Args) => void) {
  const latest = useRef(handler);
  useLayoutEffect(() => { latest.current = handler; });
  return useCallback((...args: Args) => latest.current(...args), []);
}

export function Reader({
  state: incomingState,
  generation,
  connected,
  identity,
  options,
  onShowExports,
  language,
}: {
  state: DocumentState;
  generation: number;
  connected: boolean;
  identity: React.ReactNode;
  options: React.ReactNode;
  onShowExports: () => void;
  /** The document's derived language, for page text without letters of its own. */
  language?: Language;
}) {
  const [responseState, setResponseState] = useState<DocumentState | null>(null);
  const state = responseState && responseState.revision > incomingState.revision ? responseState : incomingState;
  const { id } = state;
  const presentation = documentFormat(state) === 'presentation';
  const pageLabel = presentation ? 'Slide' : 'Page';
  const formatLabel = presentation ? 'Presentation' : 'Document';
  const editing = useTextEditing(state, connected, setResponseState);
  const readerPreview = useReaderPreview(id, editing.preview ?? { artifact: state.artifact });
  const { pdf, artifact, error: pdfError } = readerPreview;
  const [selection, setSelection] = useState<DocumentSelection | null>(null);
  const selected = selection?.blockId ?? null;
  const selectionAnchor = useRef<TextAnchor | undefined>(undefined);
  /** Whether the selection is part of its text, judged against the text it was chosen from. */
  const selectionPhrase = useRef(false);
  const [editor, setEditor] = useState<CorrectionDraft | null>(null);
  const [editError, setEditError] = useState('');
  const editPending = editing.saving;
  const undoPending = editing.undoing;
  const editField = useRef<HTMLTextAreaElement>(null);
  const editorCaret = useRef<TextRange | null>(null);
  const commentField = useRef<HTMLTextAreaElement>(null);
  const editAction = useRef<HTMLButtonElement>(null);
  const commentAction = useRef<HTMLButtonElement>(null);
  const selectionPanel = useRef<HTMLElement>(null);
  const bars = useRef<HTMLDivElement>(null);
  const composingText = useRef(false);
  const componentTrigger = useRef<HTMLElement | null>(null);
  const readingPosition = useRef<{ blockId: string; offset: number } | null>(null);
  const previousPreview = useRef({ hash: artifact?.hash, revision: state.revision });
  const sheetLayout = useSyncExternalStore(subscribeSheetLayout, sheetLayoutNow, () => false);
  // The side panel reopens on its last tab, except as a bottom sheet over a newly opened document.
  const [panel, setPanel] = useState<PanelState>(() => panelFromPreference(loadPanelPreference(), !sheetLayoutNow()));
  const restoredPanel = useRef(panel.open);
  const panelReturn = useRef<HTMLElement | null>(null);
  const [composing, setComposing] = useState(false);
  const [commentEditor, setCommentEditor] = useState<{ id: string; text: string; version: number } | null>(null);
  const [navigation, setNavigation] = useState(false);
  const [navigationMode, setNavigationMode] = useState("pages");
  const [comments, setComments] = useState<Comment[]>([]);
  const [drafts, setDrafts] = useState<CommentDrafts>(() => commentDrafts.read(id));
  const selectedPhrase = isPhrase(selection, getTextTarget(artifact, selection?.targetId));
  // Phrase drafts stay with their phrase; component drafts follow edited wording.
  const draftKey = selectedPhrase ? commentDraftKey(selection) : componentCommentDraftKey(selection);
  const legacyDraftKey = commentDraftKey(selection);
  const draft = draftKey && Object.hasOwn(drafts, draftKey) ? drafts[draftKey] : drafts[legacyDraftKey] ?? "";
  function setDraft(value: string) {
    if (draftKey) {
      commentDrafts.set(id, legacyDraftKey, '');
      setDrafts(commentDrafts.set(id, draftKey, value));
    }
  }
  const [zoom, setZoom] = useState("fit");
  const [readingControlsOpen, setReadingControlsOpen] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(800);
  const [page, setPage] = useState(1);
  const [pageGutter, setPageGutter] = useState(40);
  const notify = useNotifications();
  const [submitting, setSubmitting] = useState(false);
  const [changing, setChanging] = useState<string | null>(null);
  const mutationPending = useRef(false);
  const [commentError, setCommentError] = useState("");
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const commentsTrigger = useRef<HTMLButtonElement>(null);
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  const optionsTrigger = useRef<HTMLButtonElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const commentRequest = useRef(0);
  const commentAbort = useRef<AbortController | null>(null);
  const pages = artifact?.pages ?? [];
  const outline = artifact?.outline ?? [];
  const issues = artifact?.issues ?? [];
  const glyphs = missingGlyphs(issues);
  const contents = navigationMode === "contents" && outline.length > 0;
  const selectedBlock = getBlock(artifact, selected);
  const editorTarget = editing.target(editor?.selection.targetId);
  const editorWritable = canCorrectComponent(editorTarget);
  // A selected component explains why Edit is unavailable instead of a silent disabled control.
  const editTargetId = selectedTextTarget(artifact?.textTargets, selection);
  const editUnavailable = selection ? correctionUnavailableReason(editing.target(editTargetId)) : undefined;
  const editStale = editing.stale;
  const ready = state.status === "ready" && connected;
  const width =
    zoom === "fit"
      ? Math.max(120, Math.min(availableWidth - pageGutter * 2, 920))
      : 595.28 * Number(zoom);
  const safePage = Math.min(page, pages.length || 1);
  const pageWidth = (index: number) => zoom === "fit" ? width : (pages[index]?.width ?? 595.28) * Number(zoom);
  const widestPage = zoom === "fit" ? width : Math.max(...pages.map((item) => item.width), 595.28) * Number(zoom);
  useEffect(() => {
    const controller = new AbortController();
    const version = ++commentRequest.current;
    commentAbort.current = controller;
    const timer = setTimeout(() => {
      void api<Comment[]>(`/api/documents/${id}/comments`, { signal: controller.signal })
        .then((value) => {
          if (version === commentRequest.current) { setComments(value); setCommentError(""); }
        })
        .catch((error: Error) => {
          if (!controller.signal.aborted && version === commentRequest.current) setCommentError(error.message);
        });
    }, generation === 0 ? 0 : 80);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [id, generation]);
  useEffect(() => {
    if (!editor && !composing) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.text-edit-panel, .reader-bars, .reader-panel, .comment-dock-trigger, .component-target, .comment-marker, [aria-controls="reader-panel"]') || mutationPending.current || editPending || editError) return;
      setEditor(null); forgetOpenEditor();
      clearSelection();
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [!!editor, composing, editPending, editError]);
  useEffect(() => () => { if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current); }, []);
  useEffect(() => {
    const field = editField.current, caret = editorCaret.current;
    editorCaret.current = null;
    field?.focus({ preventScroll: true });
    if (field && caret && caret.end <= field.value.length) field.setSelectionRange(caret.start, caret.end);
  }, [editor?.selection.targetId]);
  useEffect(() => { if (composing) commentField.current?.focus({ preventScroll: true }); }, [composing, selection?.blockId]);
  // The editor and composer open beside the selection, keeping it in view; narrow screens use a bottom sheet.
  useAnchoredPanel({
    panel: selectionPanel, container: scroll, avoid: bars, active: (!!editor || composing) && !!selection, sheet: sheetLayout,
    anchorKey: `${composing ? 'comment' : 'edit'}:${selection?.page}:${selection?.blockId}:${selection?.targetId ?? ''}:${selection?.start ?? ''}:${selection?.end ?? ''}`,
    findAnchor: () => {
      const container = scroll.current;
      if (!container || !selection) return undefined;
      const sheet = container.querySelector(`[data-sheet="${selection.page}"]`);
      // A selected phrase anchors to its own lines, which may sit deep in a long paragraph.
      const phrase = selectedPhrase && sheet ? unionBox([...sheet.querySelectorAll('.text-selection-highlight')].map(line => line.getBoundingClientRect())) : undefined;
      if (phrase) return phrase;
      const selector = selection.targetId ? `[data-text-target="${CSS.escape(selection.targetId)}"]` : `[data-block-id="${CSS.escape(selection.blockId)}"]`;
      return (sheet?.querySelector(selector) ?? container.querySelector(selector))?.getBoundingClientRect();
    },
  });
  useEffect(() => { savePanelPreference(panel); }, [panel.open, panel.tab]);
  useEffect(() => {
    // A panel reopened with the document must not take focus from the page.
    if (!restoredPanel.current) return;
    restoredPanel.current = false;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('#reader-panel')) active.blur();
  }, []);
  useEffect(() => {
    // Bottom sheets take turns: when the window narrows, the editor or composer keeps the screen.
    if (sheetLayout && panel.open && (editor || composing)) setPanel(closePanel);
  }, [sheetLayout]);
  useEffect(() => {
    if (!pdf) return;
    if (previousPreview.current.hash === artifact?.hash && previousPreview.current.revision === state.revision) return;
    previousPreview.current = { hash: artifact?.hash, revision: state.revision };
    if (selection) {
      const target = getTextTarget(artifact, selection.targetId);
      // A selected phrase follows its wording; otherwise the selection widens to its component.
      const anchored = target && selectionPhrase.current
        ? resolveCommentAnchor(artifact, { blockId: selection.blockId, quote: selection.quote ?? '', anchor: selectionAnchor.current }).selection : undefined;
      const phrase = anchored?.targetId === target?.id && isPhrase(anchored, target) ? anchored
        : selectionPhrase.current && target?.text.slice(selection.start, selection.end) === selection.quote ? selection : undefined;
      const resolved = phrase ? { ...phrase, renderHash: artifact?.hash, revision: state.revision }
        : target ? { ...selection, start: 0, end: target.text.length, quote: target.text,
        page: target.lines[0]?.page ?? selection.page, renderHash: artifact?.hash, revision: state.revision }
        : resolveCommentAnchor(artifact, { blockId: selection.blockId, quote: selection.quote ?? '', anchor: selectionAnchor.current }).selection;
      if (resolved) holdSelection(resolved);
    }
    const anchor = readingPosition.current;
    if (anchor) {
      const frame = requestAnimationFrame(() => {
        const fragmentPage = pages.findIndex(item => item.fragments.some(fragment => fragment.id === anchor.blockId));
        const container = scroll.current;
        const sheet = container?.querySelector<HTMLElement>(`[data-sheet="${fragmentPage + 1}"] .pdf-page`);
        const fragment = pages[fragmentPage]?.fragments.find(item => item.id === anchor.blockId);
        if (container && sheet && fragment) container.scrollTop += sheet.getBoundingClientRect().top + fragment.y * pageWidth(fragmentPage) / pages[fragmentPage].width - container.getBoundingClientRect().top - anchor.offset;
        readingPosition.current = null;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [pdf, artifact?.hash, state.revision]);
  const restoredEditor = useRef(false);
  useEffect(() => {
    if (restoredEditor.current || !artifact || state.status !== 'ready') return;
    restoredEditor.current = true;
    try {
      const value = readOpenEditor(openEditors.get(id) ?? JSON.parse(sessionStorage.getItem(`opendoc:open-editor:${id}`) ?? 'null'));
      const target = editing.target(value?.targetId);
      const recovery = value && reconcileEditor(value);
      if (target && recovery) {
        const next = { blockId: target.blockId, targetId: target.id, start: 0, end: target.text.length, quote: target.text, page: target.lines[0]?.page ?? 1, revision: state.revision, renderHash: artifact.hash };
        holdSelection(next);
        setEditor({ selection: next, text: recovery.record.text, baseline: recovery.record.baseline, linked: Math.max(1, ...target.runs.map(run => run.source?.linkedOccurrences ?? 1)) });
        rememberOpenEditor(target.id, recovery.record.text, recovery.record.baseline);
        setEditError(recovery.error ?? (recovery.stage ? editing.change(target.id, recovery.record.text) : undefined) ?? '');
      }
    } catch { /* A malformed or unavailable browser draft does not block reading. */ }
  }, [artifact, state.status]);
  useEffect(() => {
    if (!editor?.selection.targetId || state.status !== 'ready' || editPending || editing.savedId || composingText.current) return;
    const result = reconcileEditor({ targetId: editor.selection.targetId, text: editor.text, baseline: editor.baseline });
    if (result.error) { setEditError(result.error); return; }
    if (result.record.text !== editor.text || result.record.baseline?.hash !== editor.baseline?.hash || result.record.baseline?.revision !== editor.baseline?.revision) {
      setEditor({ ...editor, text: result.record.text, baseline: result.record.baseline });
      rememberOpenEditor(editor.selection.targetId, result.record.text, result.record.baseline);
      setEditError('');
    }
  }, [state.status, state.revision, state.artifact?.hash, editing.session?.revision, editing.session?.hash, editor?.selection.targetId, editPending, editing.savedId]);
  useEffect(() => {
    if (!scroll.current) return;
    const observer = new ResizeObserver((entries) => {
      setAvailableWidth(entries[0].contentRect.width);
      setPageGutter(
        parseFloat(
          getComputedStyle(entries[0].target).getPropertyValue(
            "--sheet-gutter",
          ),
        ) || 40,
      );
    });
    observer.observe(scroll.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      void api("/api/context", {
        method: "POST",
        body: JSON.stringify({
          documentId: id,
          blockId: selected,
          page: safePage,
          selection,
          editing: !!editor || editing.count > 0,
          pendingEdits: editing.count,
          draftPreview: !!editing.preview,
        }),
      }).catch(() => {});
    }, 150);
    return () => clearTimeout(timer);
  }, [id, selection, safePage, artifact?.hash, !!editor, editing.count, !!editing.preview]);
  const goPage = useCallback(
    (number: number) => {
      const next = Math.max(1, Math.min(number, pages.length || 1));
      scroll.current
        ?.querySelector(`[data-sheet="${next}"]`)
        ?.scrollIntoView({ block: "start" });
      setPage(next);
    },
    [pages.length],
  );
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        (event.target as HTMLElement)?.closest(
          "input,textarea,select,[role=combobox],[role=listbox],[role=dialog],[contenteditable=true]",
        )
      )
        return;
      if (event.key === "PageDown") {
        event.preventDefault();
        goPage(safePage + 1);
      }
      if (event.key === "PageUp") {
        event.preventDefault();
        goPage(safePage - 1);
      }
      if (event.key === "Escape") {
        if (editor) closeEditor();
        else if (composing) closeComposer();
        else clearSelection();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [goPage, safePage, selection, !!editor, composing, editPending, ready, editError]);
  function onScroll() {
    if (scrollFrame.current !== null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const container = scroll.current;
      if (!container) return;
      const top = container.getBoundingClientRect().top + 20;
      const elements = container.querySelectorAll<HTMLElement>("[data-sheet]");
      // At small zoom levels the last page cannot reach the top of the viewport.
      if (elements.length && container.scrollTop > 0 && container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
        setPage(Number(elements[elements.length - 1].dataset.sheet));
        return;
      }
      // Page positions are ordered. A binary search keeps long-document scrolling cheap.
      let low = 0, high = elements.length - 1;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        const element = elements[middle];
        if (element.getBoundingClientRect().bottom < top) low = middle + 1;
        else high = middle;
      }
      const closest = elements[low];
      if (closest) setPage(Number(closest.dataset.sheet));
    });
  }
  function clearSelection() {
    setComposing(false);
    holdSelection(null);
    window.getSelection()?.removeAllRanges();
  }
  function holdSelection(next: DocumentSelection | null) {
    setSelection(next);
    selectionAnchor.current = next ? anchorForSelection(artifact, next) : undefined;
    selectionPhrase.current = isPhrase(next, getTextTarget(artifact, next?.targetId));
  }
  const chooseSelection = useCallback((next: DocumentSelection) => {
    if (editPending || editError) return;
    setComposing(false);
    holdSelection({ ...next, revision: state.revision, renderHash: artifact?.hash });
    setPage(next.page);
  }, [editPending, editError, state.revision, artifact]);
  function selectBlock(block: string, pageNumber: number) {
    chooseSelection({ blockId: block, page: pageNumber });
  }
  function openComments() {
    if (!selection || mutationPending.current || editPending || editError) return;
    // In the text editor, its selected words are the phrase; with none, the comment covers the component.
    const field = editField.current, target = getTextTarget(artifact, editor?.selection.targetId);
    if (editor && field && target) chooseSelection(phraseFromText(target, editor.text, field.selectionStart, field.selectionEnd, selection.page, artifact?.hash)
      ?? { blockId: target.blockId, targetId: target.id, start: 0, end: target.text.length, quote: target.text, page: target.lines[0]?.page ?? selection.page });
    setEditor(null); forgetOpenEditor();
    if (sheetLayout) setPanel(closePanel);
    setComposing(true);
  }
  function closeComposer() {
    if (mutationPending.current) return;
    setComposing(false);
    commentAction.current?.focus();
  }
  /** Open or switch the side panel from a button or marker, which receives focus again when it closes. */
  function changePanel(next: PanelState) {
    if (!next.open) { closeReaderPanel(); return; }
    if (sheetLayout && (editor || composing)) {
      // Bottom sheets take turns; text changes stay in the draft and a comment stays in its draft.
      if (editPending || editError || mutationPending.current) return;
      setEditor(null); forgetOpenEditor(); setComposing(false);
    }
    panelReturn.current = document.activeElement instanceof HTMLElement && !document.activeElement.closest('#reader-panel') ? document.activeElement : panelReturn.current;
    if (next.tab !== 'comments' || !isShowing(panel, 'comments')) setCommentEditor(null);
    setPanel(next);
  }
  function closeReaderPanel() {
    if (mutationPending.current) return;
    const tab = panel.tab;
    setPanel(closePanel);
    setCommentEditor(null);
    requestAnimationFrame(() => {
      const back = panelReturn.current;
      panelReturn.current = null;
      const fallback = tab === 'history' ? historyTrigger.current : commentsTrigger.current;
      (back?.isConnected && back.getClientRects().length ? back : fallback?.getClientRects().length ? fallback : optionsTrigger.current)?.focus({ preventScroll: true });
    });
  }
  function viewComments(block: string, pageNumber: number) {
    if (editPending || editError) return;
    setEditor(null); forgetOpenEditor();
    selectBlock(block, pageNumber);
    componentTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const comment = comments.find(item => item.blockId === block && item.status === 'open');
    const anchor = comment && resolveCommentAnchor(artifact, comment);
    if (anchor?.selection) holdSelection({ ...anchor.selection, revision: state.revision });
    changePanel(showPanel(panel, 'comments', { kind: 'block', blockId: block }));
  }
  function pendingEditorBaseline(targetId: string): EditorBaseline | undefined {
    const session = editing.session;
    const target = editing.target(targetId);
    if (!session || !target || !target.runs.some(run => run.source && session.pending.some(edit => edit.sourceId === sourceIdentity(run.source!)))) return undefined;
    return { hash: session.hash, revision: session.revision, text: target.text };
  }
  function reconcileEditor(value: OpenEditorRecord, typing = false) {
    const target = getTextTarget(state.artifact, value.targetId);
    if (!target || state.status !== 'ready') return { record: value, stage: false, error: target ? 'The document is updating. Your text is kept here.' : 'This component is no longer in the document. Your text is kept here to copy or discard.' };
    const result = recoverEditor(value, { hash: state.artifact!.hash, revision: state.revision, text: target.text }, pendingEditorBaseline(value.targetId), typing);
    const session = sessionForDocument(editing.session, { hash: state.artifact?.hash, revision: state.revision });
    if (result.stage && session && (session.hash !== state.artifact!.hash || session.revision !== state.revision)) return { ...result, stage: false, error: 'Refresh your draft before editing this text.' };
    return result;
  }
  function rememberOpenEditor(targetId: string, text: string, baseline?: EditorBaseline) {
    const value = { targetId, text, baseline };
    openEditors.set(id, value);
    try { sessionStorage.setItem(`opendoc:open-editor:${id}`, JSON.stringify(value)); } catch { /* The in-memory editor stays available. */ }
  }
  function forgetOpenEditor() {
    openEditors.delete(id);
    try { sessionStorage.removeItem(`opendoc:open-editor:${id}`); } catch { /* Storage may be unavailable. */ }
  }
  function selectComponent(next: DocumentSelection) {
    if (mutationPending.current || editPending || editError) return;
    setEditor(null); forgetOpenEditor();
    componentTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    chooseSelection(next);
  }
  function canEditText(targetId: string | undefined) {
    return !!targetId && canCorrectComponent(editing.target(targetId)) && !editPending && !submitting && !editError && !editing.savedId;
  }
  /** Double-click edits text where editing is available, and otherwise only selects it. */
  function editFromPage(next: DocumentSelection, caret?: TextRange) {
    if (canEditText(next.targetId)) openTextComponent(next, caret);
    else selectComponent(next);
  }
  function openTextComponent(next: DocumentSelection, caret?: TextRange) {
    if (editPending || editError) return;
    const target = editing.target(next.targetId);
    if (!target) return;
    // The page shows the previewed text; carry the clicked word or phrase into the editor's copy.
    const shown = getTextTarget(artifact, next.targetId)?.text;
    const range = caret ?? (isPhrase(next, getTextTarget(artifact, next.targetId)) ? { start: next.start!, end: next.end! } : undefined);
    editorCaret.current = range && shown !== undefined ? carryRange(shown, target.text, range) ?? null : null;
    chooseSelection(next);
    componentTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const current = { ...next, start: 0, end: target.text.length, quote: target.text, revision: state.revision, renderHash: artifact?.hash };
    const session = sessionForDocument(editing.session, { hash: state.artifact?.hash, revision: state.revision });
    const baseline = { hash: session?.hash ?? state.artifact!.hash, revision: session?.revision ?? state.revision, text: target.text };
    setEditError('');
    setEditor({ selection: current, text: target.text, baseline,
      linked: Math.max(1, ...target.runs.map(run => run.source?.linkedOccurrences ?? 1)) });
    rememberOpenEditor(target.id, target.text, baseline);
  }
  function changeText(text: string) {
    if (!editor?.selection.targetId) return;
    rememberReadingPosition(editor.selection.blockId);
    const result = reconcileEditor({ targetId: editor.selection.targetId, text, baseline: editor.baseline }, true);
    setEditor({ ...editor, text: result.record.text, baseline: result.record.baseline });
    rememberOpenEditor(editor.selection.targetId, result.record.text, result.record.baseline);
    setEditError(result.error ?? (result.stage ? editing.change(editor.selection.targetId, result.record.text) : undefined) ?? '');
  }
  function resetText() {
    if (!editor?.selection.targetId || state.status !== 'ready') return;
    const pending = pendingEditorBaseline(editor.selection.targetId);
    const target = pending ? editing.target(editor.selection.targetId) : getTextTarget(state.artifact, editor.selection.targetId);
    if (target) {
      const baseline = pending ?? { hash: state.artifact!.hash, revision: state.revision, text: target.text };
      setEditor({ ...editor, text: target.text, baseline }); rememberOpenEditor(target.id, target.text, baseline); setEditError('');
    }
  }
  function closeEditor() {
    if (editPending || editError) return;
    setEditor(null); forgetOpenEditor();
    editAction.current?.focus({ preventScroll: true });
  }
  function rememberReadingPosition(blockId: string) {
    const container = scroll.current;
    const index = pages.findIndex(item => item.fragments.some(fragment => fragment.id === blockId));
    const sheet = container?.querySelector<HTMLElement>(`[data-sheet="${index + 1}"] .pdf-page`);
    const fragment = pages[index]?.fragments.find(item => item.id === blockId);
    if (container && sheet && fragment) readingPosition.current = { blockId, offset: sheet.getBoundingClientRect().top + fragment.y * pageWidth(index) / pages[index].width - container.getBoundingClientRect().top };
  }
  async function saveAll() {
    if (editError || mutationPending.current || composingText.current) return;
    if (selected) rememberReadingPosition(selected);
    const fromEditor = !!selectionPanel.current?.contains(document.activeElement);
    const accepted = await editing.save();
    if (accepted) { setEditor(null); forgetOpenEditor(); if (fromEditor) editAction.current?.focus({ preventScroll: true }); }
    return accepted;
  }
  function undoChange() {
    if (editPending || undoPending) return;
    if (editing.savedId) { void editing.undoSaved(); return; }
    if (editError) { resetText(); return; }
    if (editing.canUndo) editing.undoDraft();
    else if (!editing.count) { if (state.manualEdit) rememberReadingPosition(state.manualEdit.blockId); void editing.undoSaved(); }
    const target = editing.target(editor?.selection.targetId);
    if (editor && target) { setEditor({ ...editor, text: target.text }); rememberOpenEditor(target.id, target.text, editor.baseline); }
  }
  function redoChange() {
    if (editPending || undoPending || editError) return;
    editing.redoDraft();
    const target = editing.target(editor?.selection.targetId);
    if (editor && target) { setEditor({ ...editor, text: target.text }); rememberOpenEditor(target.id, target.text, editor.baseline); }
  }
  function discardChanges() {
    editing.discard(); setEditor(null); forgetOpenEditor(); setEditError(''); clearSelection();
  }
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void saveAll(); return; }
      if ((event.target as HTMLElement)?.closest('input,textarea,[contenteditable=true],#reader-panel') || composing) return;
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redoChange(); else undoChange(); }
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); redoChange(); }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [editing.session, editing.saving, editing.count, editing.stale, connected, editError, editor, composing, state.manualEdit]);
  function scrollToBlock(block: string, preferredPage?: number, y?: number) {
    const found = preferredPage && pages[preferredPage - 1]?.fragments.some(fragment => fragment.id === block)
      ? preferredPage - 1 : pages.findIndex((item) => item.fragments.some((fragment) => fragment.id === block));
    if (found < 0) return;
    goPage(found + 1);
    const fragment = pages[found].fragments.find((item) => item.id === block)!;
    const container = scroll.current;
    const sheet = container?.querySelector<HTMLElement>(`[data-sheet="${found + 1}"]`);
    if (container && sheet) {
      const top = sheet.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      container.scrollTo({ top: top + (y ?? fragment.y) * pageWidth(found) / pages[found].width - 48 });
    }
  }
  function findBlock(block: string) {
    // Moving to another component leaves the open editor, as selecting one on the page does; its changes stay in the draft.
    if (editPending || editError) return;
    setEditor(null); forgetOpenEditor();
    chooseSelection({ blockId: block, page: Math.max(1, pages.findIndex(item => item.fragments.some(fragment => fragment.id === block)) + 1) });
    scrollToBlock(block);
  }
  function goToComment(comment: Comment) {
    const { selection: next } = resolveCommentAnchor(artifact, comment);
    if (!next || editPending || editError) return;
    setEditor(null); forgetOpenEditor();
    const target = getTextTarget(artifact, next.targetId);
    chooseSelection(next);
    setCommentEditor(null);
    // A phrase can sit lower in a long paragraph; bring its own line into view.
    const line = isPhrase(next, target) ? target!.lines.find(item => item.page === next.page && item.end > next.start! && item.start < next.end!) : undefined;
    scrollToBlock(next.blockId, next.page, line?.y);
    scroll.current?.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      const sheet = scroll.current?.querySelector(`[data-sheet="${next.page}"]`);
      const selector = target ? `[data-text-target="${CSS.escape(target.id)}"]` : `[data-block-id="${CSS.escape(next.blockId)}"]`;
      sheet?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    });
  }
  function skipToDocument() {
    const sheet = scroll.current?.querySelector(`[data-sheet="${safePage}"]`);
    const component = sheet?.querySelector<HTMLElement>('.component-target[tabindex="0"]');
    if (component) component.focus();
    else scroll.current?.focus();
  }
  function skipToComments() {
    const list = isShowing(panel, 'comments') ? document.querySelector('#reader-panel .comment-dock-panel') : null;
    // With History showing, the Comments tab is the way there; the floating button can be hidden beside the panel.
    const tab = panel.open && !list ? document.querySelector<HTMLElement>('#reader-panel [role="tab"]') : null;
    (list?.querySelector<HTMLElement>('.comment-dock-content :is(button:not(:disabled), textarea)') ?? list?.querySelector<HTMLElement>('h2') ?? tab ?? commentsTrigger.current)?.focus();
  }
  function navigateFromRail(number: number, block?: string) {
    if (block) scrollToBlock(block);
    else goPage(number);
    setNavigation(false);
    navigationTrigger.current?.focus();
  }
  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    if (mutationPending.current || !draft.trim() || !selectedBlock || !ready) return;
    mutationPending.current = true;
    ++commentRequest.current;
    commentAbort.current?.abort();
    setSubmitting(true);
    try {
      setComments(
        await api(`/api/documents/${id}/comments`, {
          method: "POST",
          body: JSON.stringify({
            blockId: selected,
            text: draft,
            hash: state.artifact?.hash,
            selection: canonicalCommentSelection(),
          }),
        }),
      );
      commentDrafts.clearSubmitted(id, legacyDraftKey, draft);
      setDrafts(commentDrafts.clearSubmitted(id, draftKey, draft));
      clearSelection();
      componentTrigger.current?.focus();
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      mutationPending.current = false;
      setSubmitting(false);
    }
  }
  async function updateSavedComment(comment: Comment, action: 'edit' | 'delete') {
    if (mutationPending.current || !connected || (action === 'edit' && !commentEditor?.text.trim())) return;
    mutationPending.current = true;
    setChanging(comment.id);
    ++commentRequest.current;
    commentAbort.current?.abort();
    try {
      setComments(await api<Comment[]>(`/api/documents/${id}/comments/${comment.id}`, {
        method: action === 'delete' ? 'DELETE' : 'PATCH',
        body: JSON.stringify(action === 'delete' ? { version: comment.version } : { text: commentEditor!.text, version: commentEditor!.version }),
      }));
      setCommentEditor(null);
      // Focus stays in the list: on the edited comment, or on the list's heading after a deletion.
      requestAnimationFrame(() => (document.querySelector<HTMLElement>(`[data-comment-id="${CSS.escape(comment.id)}"] .comment-jump:not(:disabled)`)
        ?? document.getElementById('comment-dock-heading'))?.focus({ preventScroll: true }));
      // Deletion keeps the record, so Undo restores the same comment, anchor, and history.
      if (action === 'delete') notify.success('Comment deleted', { label: 'Undo', onClick: async () => {
        ++commentRequest.current;
        commentAbort.current?.abort();
        setComments(await api<Comment[]>(`/api/documents/${id}/comments/${comment.id}/restore`, { method: 'POST', body: JSON.stringify({ version: comment.version + 1 }) }));
        notify.success('Comment restored');
      } });
    } catch (error) { notify.error((error as Error).message); }
    finally { mutationPending.current = false; setChanging(null); }
  }
  const unresolvedComments = useMemo(() => comments.filter((comment) => comment.status === "open"), [comments]);
  const commented = useMemo(() => new Set(unresolvedComments.map((comment) => comment.blockId)), [unresolvedComments]);
  // Comments anchor to saved text, which a previewed draft may have reworded.
  const commentPhrase = savedPhrase(getTextTarget(artifact, selection?.targetId), getTextTarget(state.artifact, selection?.targetId), selection);
  function canonicalCommentSelection() {
    if (!selection) return null;
    const target = getTextTarget(state.artifact, selection.targetId);
    const page = (state.artifact?.pages.findIndex(item => item.fragments.some(fragment => fragment.id === selection.blockId)) ?? 0) + 1;
    return { blockId: selection.blockId, page: Math.max(1, page), revision: state.revision, renderHash: state.artifact?.hash,
      ...(commentPhrase ?? (target ? { targetId: target.id, start: 0, end: target.text.length, quote: target.text } : {})) };
  }
  // Highlight open phrase comments where their text currently appears.
  const commentPhrases = useMemo(() => unresolvedComments.flatMap(comment => {
    if (!comment.anchor) return [];
    const resolved = resolveCommentAnchor(artifact, comment);
    return resolved.status === 'attached' && resolved.selection?.targetId ? [resolved.selection] : [];
  }), [unresolvedComments, artifact]);
  // Each page receives only its own share of the selection and comments, and stable handlers.
  const previousSlices = useRef<PageSlice[]>([]);
  const slices = useMemo(() => previousSlices.current = pageSlices(artifact, selection, commented, commentPhrases, previousSlices.current),
    [artifact, selection, commented, commentPhrases]);
  const selectFromPage = useLatest((block: string, number: number) => selectComponent({ blockId: block, page: number }));
  const commentsFromPage = useLatest(viewComments);
  const chooseFromPage = useLatest(selectComponent);
  const editTextFromPage = useLatest(editFromPage);
  function showHistoryBlock(ids: string[]) {
    // A section's own ID may not render; derived and nested blocks still locate it.
    const found = ids.flatMap(item => ['', '-heading', '-title', '-lead'].map(suffix => item + suffix)).find(item => getBlock(artifact, item) && pages.some(page => page.fragments.some(fragment => fragment.id === item)))
      ?? ids.find(item => artifact?.textTargets?.some(target => target.blockId === item));
    if (found) findBlock(found);
  }
  const undoDisabled = editPending || undoPending || (editing.savedId ? !state.manualEdit?.canUndo || !connected : !editError && !editing.canUndo && (editing.count > 0 || !state.manualEdit?.canUndo || !connected));
  const showSelectionBar = !!selection || !!editor || composing;
  const saveState = { count: editing.count, saving: editPending, undoing: undoPending, saved: editing.saved, savedId: editing.savedId, canRedo: editing.canRedo, error: editing.error || editError };
  const showSaveBar = saveBarVisible(saveState);
  const showNotice = (showSelectionBar || showSaveBar) && (!!editing.error || editStale || !connected || editing.persistenceFailed);
  const savedNow = editing.saved && !editing.count && !editPending;
  const selectedHistory: PanelTarget | undefined = selection ? { kind: 'block', blockId: selection.blockId } : undefined;
  const commentTarget = panel.targets.comments;
  const commentFilter = commentTarget.kind === 'block' ? commentTarget.blockId : null;
  useNotificationClearance([showSelectionBar, showSaveBar, showNotice, panel.open, sheetLayout, !!editor || composing]);
  // The save bar leaves once changes are saved or discarded; focus moves to the selection or the page, not the window.
  const saveBarFocus = useRef(false);
  useEffect(() => {
    if (showSaveBar || !saveBarFocus.current) return;
    saveBarFocus.current = false;
    if (document.activeElement && document.activeElement !== document.body) return;
    (editAction.current ?? (componentTrigger.current?.isConnected ? componentTrigger.current : scroll.current))?.focus({ preventScroll: true });
  }, [showSaveBar]);
  const pageControls = <>
    <div className="reader-pagination">
      <IconButton label={`Previous ${pageLabel.toLowerCase()}`} disabled={safePage <= 1} onClick={() => goPage(safePage - 1)}><Icon name="left" size={14} /></IconButton>
      <PageNumberInput label={`${pageLabel} number`} page={safePage} count={pages.length} onNavigate={goPage} />
      <IconButton label={`Next ${pageLabel.toLowerCase()}`} disabled={safePage >= pages.length} onClick={() => goPage(safePage + 1)}><Icon name="right" size={14} /></IconButton>
    </div>
    <SelectControl label="Zoom" value={zoom} onValueChange={setZoom} items={[
      { value: 'fit', label: 'Fit width' }, { value: '0.75', label: '75%' }, { value: '1', label: '100%' }, { value: '1.25', label: '125%' }, { value: '1.5', label: '150%' },
    ]} />
  </>;
  return (
    <div className="reader">
      <nav className="skip-links" aria-label="Skip links">
        <Button static className="skip-link" onClick={skipToDocument}>Skip to {formatLabel.toLowerCase()}</Button>
        <Button static className="skip-link" onClick={skipToComments}>Skip to comments</Button>
      </nav>
      <p id="reader-component-keys" className="sr-only">
        Use the arrow keys to move between components in reading order, Home and End for the first and last, and Enter to select. {navigator.platform.includes('Mac') ? 'Option' : 'Alt'} with Up Arrow moves to the enclosing component, and with Down Arrow to its contents.
      </p>
      <header className="reader-toolbar" aria-label={`${formatLabel} toolbar`}>
        <div className="reader-identity">{identity}</div>
        <div className="reader-page-controls">{pageControls}</div>
        <div className="reader-compact-controls">
          <Popover.Root open={readingControlsOpen} onOpenChange={setReadingControlsOpen}>
            <Popover.Trigger ref={navigationTrigger} render={<Button className="reader-reading-trigger" />} aria-label="Reading controls">
              <span>{safePage}<span className="reader-page-total"> / {pages.length || '—'}</span></span><Icon name="down" size={12} />
            </Popover.Trigger>
            <Popover.Portal><Popover.Positioner className="ui-positioner" align="end" sideOffset={8}>
              <Popover.Popup className="ui-menu-popup reader-reading-popup">
                <Popover.Title className="ui-menu-label">Reading controls</Popover.Title>
                <div className="reader-page-controls">{pageControls}</div>
                <Button className="ui-menu-item reader-navigation-option" disabled={!pages.length} aria-expanded={navigation} aria-controls="reader-navigation" onClick={() => { setReadingControlsOpen(false); setNavigation(value => !value); }}><Icon name="sidebar" size={16} />{formatLabel} navigation</Button>
              </Popover.Popup>
            </Popover.Positioner></Popover.Portal>
          </Popover.Root>
        </div>
        <div className="reader-actions">
          <IconButton ref={historyTrigger} label="Version history" aria-expanded={isShowing(panel, 'history')} aria-controls="reader-panel" onClick={() => changePanel(togglePanel(panel, 'history'))}><Icon name="history" size={18} /></IconButton>
          <SkillIndex />
          <ExportMenu state={state} connected={connected} ready={ready && !!pdf && !readerPreview.loading && artifact?.hash === state.artifact?.hash} unsaved={editing.count} saving={editPending || undoPending} correctionError={editError || editing.error || (editStale ? 'Refresh your draft before saving and exporting.' : '')} canSave={!!editing.count && ready && !editPending && !undoPending && !editStale && !editError && !editing.savedId} onSave={saveAll} onShowExports={onShowExports} />
          <Menu.Root>
            <Menu.Trigger ref={optionsTrigger} render={<IconButton label={`${formatLabel} options`} />}><Icon name="more" size={18} /></Menu.Trigger>
            <Menu.Portal><Menu.Positioner className="ui-positioner" align="end" sideOffset={8}>
              <Menu.Popup className="ui-menu-popup">
                {state.manualEdit?.canUndo && <Menu.Item className="ui-menu-item" disabled={undoDisabled} onClick={undoChange}><Icon name="undo" size={16} /><span>Undo saved changes</span></Menu.Item>}
                {options}
              </Menu.Popup>
            </Menu.Positioner></Menu.Portal>
          </Menu.Root>
        </div>
      </header>
      {state.status !== "ready" && (
        <div
          className={
            state.status === "error" ? "render-banner error" : "render-banner"
          }
          role="status"
        >
          <strong>
            {state.status === "error"
              ? (editing.savedId ? "Source saved. Preview needs attention." : "This draft needs attention.")
              : (editing.savedId ? "Source saved. Updating the preview…" : "Rendering your changes…")}
          </strong>
          <span>
            {artifact
              ? "Showing the last successful preview. Export is paused."
              : "Your preview will appear here."}
          </span>
          {state.error && <pre>{state.error}</pre>}
        </div>
      )}

      {glyphs && state.status === "ready" && (
        <div className="render-banner glyph-notice" role="status">
          <strong>Some characters can’t be displayed.</strong>
          <span>
            {glyphs.characters.length > 0 && <>No font covers {glyphs.characters.map(({ character, code }, index) => <React.Fragment key={code}>{index > 0 && ", "}<bdi className="glyph-character">{character}</bdi> <span className="glyph-code">{code}</span></React.Fragment>)}{glyphs.more > 0 && ` and ${glyphs.more} more`}{glyphs.pages.length > 0 && ` on ${pageList(pageLabel, glyphs.pages)}`}, so {glyphs.characters.length + glyphs.more === 1 ? "it prints" : "they print"} as {glyphs.characters.length + glyphs.more === 1 ? "a question mark" : "question marks"}. </>}
            Add a font that covers these characters, or ask your agent.
          </span>
          {glyphs.first && <Button className="text-button" onClick={() => glyphs.first!.blockId ? findBlock(glyphs.first!.blockId) : goPage(glyphs.first!.page!)}>Show {pageLabel.toLowerCase()}{glyphs.first.page ? ` ${glyphs.first.page}` : ""}</Button>}
        </div>
      )}
      {issues.length > 0 && state.status === "ready" && (
        <details className="review-issues">
          <summary>{issues.length} {issues.length === 1 ? "layout note" : "layout notes"} to review</summary>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.blockId ?? issue.page ?? index}`}>
                {issue.blockId || issue.page ? (
                  <Button static className="review-issue-link" onClick={() => issue.blockId ? findBlock(issue.blockId) : goPage(issue.page!)}>
                    <span>{issue.message}</span>{issue.page && <span className="issue-page">{pageLabel} {issue.page}</span>}
                  </Button>
                ) : <p>{issue.message}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {pdfError && pdf && <div className="error-banner" role="alert"><span>Could not load the latest PDF. Showing the previous preview.</span><Button className="text-button" onClick={readerPreview.retry}>Try again</Button></div>}
      <div className="reader-body">
        <aside className={`page-rail ${contents ? "contents-rail" : ""} ${navigation ? "navigation-open" : ""}`} id="reader-navigation" aria-label={`${formatLabel} navigation`}>
          <div className="rail-heading">
            {outline.length > 0 ? <SelectControl label="Navigation view" value={contents ? "contents" : "pages"} onValueChange={setNavigationMode} items={[{ value: "pages", label: `${pageLabel}s` }, { value: "contents", label: "Contents" }]} /> : <div className="rail-label">{pageLabel}s</div>}
            <IconButton label="Close navigation" className="navigation-close" onClick={() => { setNavigation(false); navigationTrigger.current?.focus(); }}><Icon name="close" size={16} /></IconButton>
          </div>
          {contents ? (
            <nav className="document-outline" aria-label={`${formatLabel} contents`}>
              {outline.map((entry, index) => <Button static key={`${entry.id}-${index}`} className={`outline-entry level-${Math.min(entry.level, 3)}`} onClick={() => navigateFromRail(entry.page, entry.id)}>
                <span dir="auto" lang={textLang(entry.title)}>{entry.title}</span><span className="outline-page">{entry.page}</span>
              </Button>)}
            </nav>
          ) : pdf && pages.map((_, index) => (
            <Button static key={index} className={safePage === index + 1 ? "page-thumb active" : "page-thumb"} onClick={() => navigateFromRail(index + 1)} aria-label={`Go to ${pageLabel.toLowerCase()} ${index + 1}`} aria-current={safePage === index + 1 ? "page" : undefined}>
              <PdfPage pdf={pdf} number={index + 1} width={72} artifact={artifact} thumbnail />
              <span>{index + 1}</span>
            </Button>
          ))}
        </aside>
        <div
          ref={scroll}
          className="reader-scroll"
          tabIndex={-1}
          onPointerDownCapture={() => {
            if (!editor && !mutationPending.current) clearSelection();
          }}
          onScroll={onScroll}
        >
          {pdfError && !pdf ? (
            <div className="empty-state" role="alert">
              <p>{pdfError}</p>
              <Button onClick={readerPreview.retry}>Try again</Button>
            </div>
          ) : pdf ? (
            <div
              className="sheets"
              style={{ minWidth: widestPage + pageGutter * 2 }}
            >
              {pages.map((p, i) => (
                <section data-sheet={i + 1} key={i} className="sheet">
                  <div className="sheet-label">
                    {pageLabel} {i + 1}{" "}
                    <span>
                      {presentation ? '16:9' : `${Math.round((p.width / 72) * 25.4)} × ${Math.round((p.height / 72) * 25.4)} mm`}
                    </span>
                  </div>
                  <PdfPage
                    pdf={pdf}
                    number={i + 1}
                    width={pageWidth(i)}
                    artifact={artifact}
                    selected={slices[i]?.selection?.blockId ?? null}
                    selection={slices[i]?.selection ?? null}
                    commented={slices[i]?.commented}
                    commentPhrases={slices[i]?.commentPhrases}
                    onSelect={selectFromPage}
                    onComment={commentsFromPage}
                    onTextClick={chooseFromPage}
                    onPhraseSelect={chooseFromPage}
                    onTextEdit={editTextFromPage}
                    onNavigate={goPage}
                    label={`${pageLabel} ${i + 1} of ${pages.length}`}
                    keyboardHelp="reader-component-keys"
                    language={language}
                  />
                </section>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="loading-mark" />
              <p>{state.status === "error" ? "The preview will appear after the draft is corrected." : `Preparing your ${pageLabel.toLowerCase()}s…`}</p>
            </div>
          )}
        </div>
        {panel.open && <ReaderPanel tab={panel.tab} commentCount={unresolvedComments.length} sheet={sheetLayout}
          onTabChange={tab => changePanel(selectTab(panel, tab))} onClose={closeReaderPanel}
          comments={<CommentDock pageLabel={pageLabel} heading={commentFilter ? `${(getBlock(artifact, commentFilter)?.kind ?? 'component').replace(/^./, letter => letter.toUpperCase())} comments` : 'All comments'}
            filtered={!!commentFilter} openCount={unresolvedComments.length} agentPrompt={applyCommentsPrompt({ id, name: documentName(state), format: documentFormat(state) })}
            items={comments.filter(comment => comment.status !== 'deleted' && (!commentFilter || comment.blockId === commentFilter)).map(comment => {
              const anchor = resolveCommentAnchor(artifact, comment);
              return { comment, page: anchor.selection?.page, kind: getBlock(artifact, comment.blockId)?.kind ?? 'Component', canJump: !!pdf && !!anchor.selection,
                quote: comment.anchor?.quote, textChanged: anchor.status === 'changed' };
            })}
            error={commentError} connected={connected} changing={changing} editing={commentEditor}
            onEdit={comment => setCommentEditor({ id: comment.id, text: comment.text, version: comment.version })}
            onEditText={text => setCommentEditor(current => current ? { ...current, text } : null)}
            onSaveEdit={comment => updateSavedComment(comment, 'edit')} onCancelEdit={() => setCommentEditor(null)}
            onDelete={comment => updateSavedComment(comment, 'delete')} onJump={goToComment}
            onShowAll={() => setPanel(current => showPanel(current, 'comments'))} onClose={closeReaderPanel}
            footer={<DeletedComments documentId={id} blockId={commentFilter} connected={connected} refreshKey={comments}
              onRestored={value => { ++commentRequest.current; commentAbort.current?.abort(); setComments(value); notify.success('Comment restored'); }} onError={notify.error} />} />}
          history={<Suspense fallback={historyLoading}><HistoryPanel key={panel.targets.history.kind === 'block' ? `block:${panel.targets.history.blockId}` : 'document'} documentId={id} target={panel.targets.history} generation={generation} connected={connected} pageLabel={pageLabel}
            unsaved={editing.count} saving={editPending || undoPending} onSave={saveAll} onDiscard={discardChanges} onJump={showHistoryBlock}
            onShowDocument={() => setPanel(current => showPanel(current, 'history'))} onClose={closeReaderPanel} /></Suspense>} />}
      </div>
      {(editor || composing) && <section ref={selectionPanel} className="text-edit-panel" id="selection-panel" role="dialog" aria-modal="false" aria-labelledby="correction-title">
        {composing ? <form key="comment" onSubmit={submitComment} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeComposer(); }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); if (!submitting) event.currentTarget.requestSubmit(); }
        }}>
          <div className="text-edit-heading"><div><Icon name="comment" size={15} /><h2 id="correction-title">Add comment</h2><span className="text-edit-kind">{selectedBlock?.kind ?? 'Component'}</span></div><IconButton label="Close comment composer" disabled={submitting} onClick={closeComposer}><Icon name="close" size={15} /></IconButton></div>
          {commentPhrase ? <p className="comment-phrase" id="comment-phrase">on “<bdi dir="auto" lang={textLang(commentPhrase.quote)}>{commentPhrase.quote}</bdi>”</p>
            : selectedPhrase && <p className="correction-note comment-phrase-note" id="comment-phrase">This phrase includes unsaved wording, so the comment applies to the whole component.</p>}
          <textarea ref={commentField} dir="auto" lang={textLang(draft)} aria-label="Comment" aria-describedby={selectedPhrase ? 'comment-phrase' : undefined} placeholder="Describe the change for your agent…" value={draft} maxLength={8000} readOnly={submitting} onChange={event => setDraft(event.target.value)} />
          <div className="text-edit-footer"><span>Your agent applies comments</span><Button disabled={submitting} onClick={closeComposer}>Cancel</Button><Button className="add-comment" type="submit" disabled={!draft.trim() || !ready || submitting || !selectedBlock}>{submitting ? 'Adding…' : 'Add comment'}</Button></div>
        </form> : editor && <form key="edit" onSubmit={event => { event.preventDefault(); closeEditor(); }} onKeyDown={event => {
          if (event.nativeEvent.isComposing || composingText.current) return;
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeEditor(); }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); closeEditor(); }
        }}>
          <div className="text-edit-heading"><div><Icon name="edit" size={15} /><h2 id="correction-title">{editorWritable ? 'Edit text' : 'Selected text'}</h2><span className="text-edit-kind">{selectedBlock?.kind ?? 'Component'}</span></div><IconButton label="Close text editor" disabled={editPending || !!editError} onClick={closeEditor}><Icon name="close" size={15} /></IconButton></div>
          <textarea ref={editField} dir="auto" lang={textLang(editor.text)} aria-label="Text correction" value={editor.text} readOnly={!editorWritable || editPending || !!editing.savedId} maxLength={8000} onCompositionStart={() => { composingText.current = true; }} onCompositionEnd={event => { composingText.current = false; changeText(event.currentTarget.value); }} onChange={event => { if (composingText.current) { setEditor({ ...editor, text: event.target.value }); rememberOpenEditor(editor.selection.targetId!, event.target.value, editor.baseline); } else changeText(event.target.value); }} />
          {editor.linked > 1 && <p className="correction-note">This text appears {editor.linked} times. All occurrences change together.</p>}
          {!editorWritable && <p className="correction-note">{selectionReason(artifact, editor.selection)}</p>}
          {editError && <p className="correction-error" role="alert">{editError} <Button className="text-button" disabled={state.status !== 'ready' || !getTextTarget(state.artifact, editor.selection.targetId)} onClick={resetText}>{editor.selection.targetId && pendingEditorBaseline(editor.selection.targetId) ? 'Reset text' : 'Use latest text'}</Button></p>}
          <div className="text-edit-footer"><span>Changes stay in your draft</span><Button type="submit" disabled={editPending || !!editError}>Done</Button></div>
        </form>}
      </section>}
      <p className="sr-only" role="status">{showSaveBar ? saveBarStatus(saveState) : ''}</p>
      {(showSelectionBar || showSaveBar) && <div className="reader-bars" ref={bars}>
        {showNotice && <div className="edit-session-notice" role="status">
          <p>{editing.error || (editStale ? 'The document changed. Refresh your draft to keep edits that still match.' : !connected ? 'Offline. Your draft is kept here until you reconnect.' : 'Browser storage is full. Save your draft before reloading or closing this tab.')}</p>
          {editing.error && !editStale && <IconButton label="Dismiss editing message" onClick={editing.dismissError}><Icon name="close" size={14} /></IconButton>}
          {editStale && <Button disabled={!ready || editPending} onClick={editing.refresh}>Refresh draft</Button>}
        </div>}
        <div className="reader-bars-row">
          {showSelectionBar && <div className="selection-bar" role="group" aria-label="Selection actions">
            <HintButton ref={editAction} aria-label="Edit selected text" hint={editUnavailable} focusableWhenDisabled aria-pressed={!!editor} aria-controls="selection-panel" disabled={!canEditText(editTargetId)} onClick={() => { if (editor) closeEditor(); else if (selection) openTextComponent({ ...selection, targetId: editTargetId }); }}><Icon name="edit" size={16} />Edit</HintButton>
            <HintButton ref={commentAction} focusableWhenDisabled aria-label={selectedPhrase && !editor ? 'Comment on selected phrase' : 'Comment on selection'} aria-pressed={composing} aria-controls="selection-panel" disabled={!selectedBlock || editPending || submitting || !!editError} onClick={composing ? closeComposer : openComments}><Icon name="comment" size={16} />Comment</HintButton>
            <HintButton focusableWhenDisabled aria-label="History for this block" aria-pressed={!!selectedHistory && isShowing(panel, 'history', selectedHistory)} aria-controls="reader-panel" disabled={!selectedBlock || editPending || submitting} onClick={() => selectedHistory && changePanel(togglePanel(panel, 'history', selectedHistory))}><Icon name="history" size={16} />History</HintButton>
          </div>}
          {showSaveBar && <div className="save-bar" role="group" aria-label="Unsaved changes" onFocus={() => { saveBarFocus.current = true; }} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) saveBarFocus.current = false; }}>
            <div className={savedNow ? 'edit-session-status saved' : 'edit-session-status'}><Icon name={savedNow ? 'check' : 'edit'} size={15} /><span>{saveBarStatus(saveState)}</span>{(editing.previewing || readerPreview.loading) && editing.count > 0 && !editPending && <span className="draft-preview-status">Updating preview…</span>}</div>
            <div className="edit-history"><IconButton focusableWhenDisabled label={!editing.savedId && (editing.canUndo || editing.count) ? 'Undo change' : 'Undo saved changes'} disabled={undoDisabled} onClick={undoChange}><Icon name="undo" size={16} /></IconButton><IconButton focusableWhenDisabled label="Redo change" disabled={!editing.canRedo || editPending || undoPending || !!editError} onClick={redoChange}><Icon name="redo" size={16} /></IconButton></div>
            <Button className="discard-edits" focusableWhenDisabled disabled={editPending || undoPending || !!editing.savedId || (!editing.count && !editing.canRedo && !editError)} onClick={discardChanges}>Discard</Button>
            <Button className="primary save-edits" focusableWhenDisabled disabled={!editing.count || !ready || editPending || undoPending || editStale || !!editError || !!editing.savedId} onClick={() => void saveAll()}>Save all<kbd aria-hidden="true">{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} S</kbd></Button>
          </div>}
        </div>
      </div>}
      <CommentsButton count={unresolvedComments.length} expanded={isShowing(panel, 'comments')} triggerRef={commentsTrigger}
        onClick={() => changePanel(togglePanel(panel, 'comments'))} />
    </div>
  );
}
