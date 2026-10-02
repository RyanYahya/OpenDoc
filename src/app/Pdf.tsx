import { Button } from "./ui";
import { Icon } from './ui/Icon';
import { InspectionLayer } from './InspectionLayer';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { getBlock, type Fragment, type RenderArtifact } from "../shared/types";
import type { DocumentSelection, TextTarget } from "../shared/selection";
import { nearestBox, phraseSelection, wordRange, type TextRange } from './phraseSelection';
import { mapPdfTextSpans, pdfSpanRangeForSelection, type PdfSpanMapping } from "./pdfSelection";
import { loadPdfWithDeadline } from './pdfLoading';
import { componentName, componentNavigation, isWithin, moveComponentFocus, navigationMove } from './componentNavigation';
import { useNearViewport } from './nearViewport';
import { textLang, type Language } from '../shared/language';

let pdfJs: Promise<typeof import('pdfjs-dist')> | undefined;
function loadPdfJs() {
  pdfJs ??= import('pdfjs-dist').then(module => {
    module.GlobalWorkerOptions.workerSrc = worker;
    return module;
  }).catch(error => { pdfJs = undefined; throw error; });
  return pdfJs;
}

const spanMappings = new WeakMap<HTMLElement, PdfSpanMapping>();

function rangeWithinSpan(element: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let cursor = 0, began = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!began && start <= cursor + length) {
      range.setStart(node, Math.max(0, start - cursor));
      began = true;
    }
    if (began && end <= cursor + length) {
      range.setEnd(node, Math.max(0, end - cursor));
      return range;
    }
    cursor += length;
  }
  return null;
}

type Rect = { left: number; top: number; width: number; height: number };

function rangeKey(range: DocumentSelection | null | undefined) {
  return range ? `${range.renderHash ?? ''}:${range.blockId}:${range.targetId ?? ''}:${range.start ?? ''}:${range.end ?? ''}` : '';
}

type CachedPdf = {
  loading: Promise<PDFDocumentLoadingTask>;
  ready: Promise<PDFDocumentProxy>;
  readers: number;
  release?: ReturnType<typeof setTimeout>;
};
const pdfs = new Map<string, CachedPdf>();

function acquirePdf(key: string) {
  let entry = pdfs.get(key);
  if (!entry) {
    const loading = loadPdfJs().then(module => module.getDocument({ url: key }));
    entry = { loading, ready: loadPdfWithDeadline(loading), readers: 0 };
    pdfs.set(key, entry);
  }
  clearTimeout(entry.release);
  entry.readers += 1;
  return entry;
}

function releasePdf(key: string, entry: CachedPdf) {
  entry.readers -= 1;
  if (entry.readers) return;
  // Keep the worker alive briefly when moving between a thumbnail and its full preview.
  entry.release = setTimeout(() => {
    if (entry.readers || pdfs.get(key) !== entry) return;
    pdfs.delete(key);
    void entry.loading.then(task => task.destroy()).catch(() => {});
  }, 5_000);
}

function errorMessage(error: unknown) {
  // PDF.js passes the browser's own network failure through, sometimes renamed by its worker.
  if (error instanceof Error && /failed to fetch|networkerror|load failed/i.test(error.message)) {
    return 'OpenDoc can’t reach the local server to load this PDF. Try again once it reconnects.';
  }
  return error instanceof Error ? error.message : String(error);
}

export function usePdf(id: string, hash?: string, enabled = true, collection: 'documents' | 'templates' | 'themes' = 'documents', sourceUrl?: string) {
  const key =
    enabled && hash
      ? sourceUrl ?? `/api/${collection}/${encodeURIComponent(id)}/pdf?hash=${encodeURIComponent(hash)}`
      : "";
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const [state, setState] = useState<{
    key: string;
    pdf: PDFDocumentProxy | null;
    error: string;
  }>({ key: "", pdf: null, error: "" });
  useEffect(() => {
    if (!key) {
      setState({ key: "", pdf: null, error: "" });
      return;
    }
    let active = true;
    setState({ key, pdf: null, error: "" });
    const entry = acquirePdf(key);
    entry.ready
      .then((result) => {
        if (active) setState({ key, pdf: result, error: "" });
      })
      .catch((error) => {
        // A retry must acquire a fresh task rather than reuse a cached failure.
        if (pdfs.get(key) === entry) {
          pdfs.delete(key);
          void entry.loading.then(task => task.destroy()).catch(() => {});
        }
        if (active) setState({ key, pdf: null, error: errorMessage(error) });
      });
    return () => {
      active = false;
      releasePdf(key, entry);
    };
  }, [key, attempt]);
  return key && state.key === key
    ? { pdf: state.pdf, error: state.error, retry }
    : { pdf: null, error: "", retry };
}

type PdfPageProps = {
  pdf: PDFDocumentProxy;
  number: number;
  width: number;
  thumbnail?: boolean;
  artifact?: RenderArtifact;
  selected?: string | null;
  selection?: DocumentSelection | null;
  commented?: ReadonlySet<string>;
  /** Open phrase comments, highlighted where their text appears on this page. */
  commentPhrases?: DocumentSelection[];
  onSelect?: (id: string, page: number) => void;
  onComment?: (id: string, page: number) => void;
  onTextClick?: (selection: DocumentSelection, rect: { left: number; top: number; width: number; height: number }) => void;
  /** A mouse or pen drag across words selects that phrase within one text component. */
  onPhraseSelect?: (selection: DocumentSelection) => void;
  /** Double-click opens the text editor, with the clicked word when it can be located. */
  onTextEdit?: (selection: DocumentSelection, caret?: TextRange) => void;
  onNavigate?: (page: number) => void;
  /** Names the page for assistive technology, such as "Page 2 of 8". */
  label?: string;
  /** Identifies the element that explains keyboard navigation between components. */
  keyboardHelp?: string;
  /** The document's derived language, for page text without letters of its own. */
  language?: Language;
};
export const PdfPage = memo(function PdfPage({
  pdf,
  number,
  width,
  thumbnail,
  artifact,
  selected,
  selection,
  commented,
  commentPhrases,
  onSelect,
  onComment,
  onTextClick,
  onPhraseSelect,
  onTextEdit,
  onNavigate,
  label,
  keyboardHelp,
  language,
}: PdfPageProps) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const pointerStart = useRef({ x: 0, y: 0 });
  const visibilityKey = useMemo(() => ({ pdf, number }), [pdf, number]);
  const activated = useNearViewport(
    container,
    visibilityKey,
    thumbnail ? "240px 0px" : "900px 0px",
  );
  const retained = useNearViewport(container, visibilityKey, "4000px 0px", {
    once: false,
    enabled: !thumbnail && pdf.numPages >= 25,
  });
  // Long documents retain several screens in each direction, without keeping
  // every full-resolution canvas and text layer alive after a complete read.
  const renderPage = activated && retained;
  const [links, setLinks] = useState<
    { rect: number[]; url?: string; dest?: unknown }[]
  >([]);
  const [pageSize, setPageSize] = useState<{
    pdf: PDFDocumentProxy;
    number: number;
    width: number;
    height: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [rendered, setRendered] = useState(false);
  const [textReady, setTextReady] = useState(false);
  const [highlightState, setHighlightState] = useState<{ key: string; rects: Rect[]; comments: Rect[] }>({ key: '', rects: [], comments: [] });
  const geometry =
    artifact?.pages[number - 1] ??
    (pageSize?.pdf === pdf && pageSize.number === number ? pageSize : null);
  const scale = width / (geometry?.width ?? 595.28);
  const height = scale * (geometry?.height ?? 841.89);
  // Identifies the highlighted ranges; rebuilt only when the selection or comments for this page change.
  const highlightKey = useMemo(() => [artifact?.hash, width, number, rangeKey(selection), ...(commentPhrases ?? []).map(rangeKey)].join('|'),
    [artifact?.hash, width, number, selection, commentPhrases]);
  const preciseTarget = selection?.targetId && Number.isInteger(selection.start) && Number.isInteger(selection.end) && selection.end! > selection.start!
    ? artifact?.textTargets?.find(target => target.id === selection.targetId && target.blockId === selection.blockId) : undefined;
  const fullTargetSelection = !!preciseTarget && selection?.start === 0 && selection?.end === preciseTarget.text.length;
  const highlightsCurrent = textReady && highlightState.key === highlightKey;
  const phraseHighlights = !fullTargetSelection && highlightsCurrent ? highlightState.rects : [];
  const commentHighlights = highlightsCurrent ? highlightState.comments : [];
  const phraseOnPage = preciseTarget?.lines.some(line => line.page === number && line.end > selection!.start! && line.start < selection!.end!);
  const showBlockSelection = !preciseTarget || (!fullTargetSelection && phraseOnPage && !phraseHighlights.length);
  useEffect(() => {
    let active = true,
      task: RenderTask | undefined,
      layer: TextLayer | undefined;
    setError("");
    setRendered(false);
    setTextReady(false);
    setLinks(current => current.length ? [] : current);
    text.current?.replaceChildren();
    if (!renderPage || width <= 0) {
      if (canvas.current) {
        canvas.current.width = 0;
        canvas.current.height = 0;
      }
      return;
    }
    void (async () => {
      const page = await pdf.getPage(number);
      if (!active || !canvas.current) return;
      const size = page.getViewport({ scale: 1 });
      setPageSize((current) =>
        current?.pdf === pdf &&
        current.number === number &&
        current.width === size.width &&
        current.height === size.height
          ? current
          : { pdf, number, width: size.width, height: size.height },
      );
      const viewport = page.getViewport({
        scale: width / size.width,
      });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const element = canvas.current;
      element.width = Math.floor(viewport.width * dpr);
      element.height = Math.floor(viewport.height * dpr);
      const context = element.getContext("2d");
      if (!context) throw new Error("The page canvas is unavailable.");
      task = page.render({
        canvasContext: context,
        canvas: element,
        viewport,
        transform: [dpr, 0, 0, dpr, 0, 0],
      });
      await task.promise;
      if (!active) return;
      setRendered(true);
      if (!thumbnail && text.current) {
        const textElement = text.current;
        const [content, annotations] = await Promise.all([
          page.getTextContent(),
          page.getAnnotations(),
        ]);
        const { TextLayer } = await loadPdfJs();
        if (!active) return;
        layer = new TextLayer({
          textContentSource: content,
          container: textElement,
          viewport,
        });
        await layer.render();
        if (active) {
          for (const span of layer.textDivs) {
            span.dataset.pdfText = '';
            span.dataset.pdfPage = String(number);
          }
          setTextReady(true);
        }
        if (active)
          setLinks(
            annotations
              .filter((a) => a.subtype === "Link")
              .map((a) => ({
                rect: [
                  ...viewport.convertToViewportPoint(a.rect[0], a.rect[1]),
                  ...viewport.convertToViewportPoint(a.rect[2], a.rect[3]),
                ],
                url: a.url,
                dest: a.dest,
              })),
          );
      }
    })().catch((error) => {
      if (active && error?.name !== "RenderingCancelledException")
        setError(`Could not display this page: ${errorMessage(error)}`);
    });
    return () => {
      active = false;
      task?.cancel();
      layer?.cancel();
    };
  }, [pdf, number, width, thumbnail, renderPage]);

  // Screen readers voice each line in its own language; lines without letters follow the document.
  useEffect(() => {
    if (!textReady || !text.current) return;
    for (const span of text.current.querySelectorAll<HTMLElement>('[data-pdf-text]')) {
      const lang = textLang(span.textContent ?? '', language);
      if (lang) span.lang = lang;
      else span.removeAttribute('lang');
    }
  }, [language, textReady]);

  useEffect(() => {
    if (!textReady || !text.current || !container.current) return;
    const pageRect = container.current.getBoundingClientRect();
    const spans = Array.from(text.current.querySelectorAll<HTMLElement>('[data-pdf-text]'));
    const mappings = mapPdfTextSpans(spans.map(span => {
      const rect = span.getBoundingClientRect();
      return { text: span.textContent ?? '', page: number, x: (rect.left - pageRect.left) / scale,
        y: (rect.top - pageRect.top) / scale, width: rect.width / scale, height: rect.height / scale };
    }), artifact?.textTargets ?? []);
    spans.forEach((span, index) => {
      spanMappings.delete(span);
      if (mappings[index]) spanMappings.set(span, mappings[index]);
    });
  }, [artifact, number, scale, textReady]);

  useEffect(() => {
    const layer = text.current, page = container.current;
    // Without a text layer nothing is highlighted; the ranges are measured once it is ready.
    if (!textReady || !layer || !page) return;
    const pageRect = page.getBoundingClientRect();
    const spans = Array.from(layer.querySelectorAll<HTMLElement>('[data-pdf-text]'));
    const rectsFor = (range: DocumentSelection) => spans.flatMap(span => {
      const offsets = pdfSpanRangeForSelection(spanMappings.get(span), range);
      const selected = offsets && rangeWithinSpan(span, offsets.start, offsets.end);
      return selected ? Array.from(selected.getClientRects()).flatMap(rect => rect.width > 0 && rect.height > 0
        ? [{ left: rect.left - pageRect.left, top: rect.top - pageRect.top, width: rect.width, height: rect.height }] : []) : [];
    });
    const current = selection?.targetId && (!selection.renderHash || selection.renderHash === artifact?.hash);
    setHighlightState({ key: highlightKey, rects: current ? rectsFor(selection) : [], comments: (commentPhrases ?? []).flatMap(rectsFor) });
  }, [artifact, highlightKey, selection, commentPhrases, textReady]);

  /** The logical text range of the character nearest a point, within one text component. */
  function textAt(targetId: string, x: number, y: number): TextRange | undefined {
    const spans = Array.from(text.current?.querySelectorAll<HTMLElement>('[data-pdf-text]') ?? []).flatMap(span => {
      const mapping = spanMappings.get(span);
      return mapping?.targetId === targetId ? [{ span, mapping }] : [];
    });
    const nearest = spans[nearestBox(spans.map(({ span }) => span.getBoundingClientRect()), x, y)];
    if (!nearest) return undefined;
    const { span, mapping } = nearest;
    const index = nearestBox(mapping.starts.map((start, offset) => mapping.synthetic?.[offset] || mapping.ends[offset] <= start
      ? null : rangeWithinSpan(span, offset, offset + 1)?.getBoundingClientRect()), x, y);
    return index < 0 ? undefined : { start: mapping.starts[index], end: mapping.ends[index] };
  }

  function wholeText(target: TextTarget): DocumentSelection {
    return { blockId: target.blockId, targetId: target.id, start: 0, end: target.text.length, quote: target.text, page: number, renderHash: artifact?.hash };
  }

  // Native selection stays off on the page, where it would fight component
  // clicks. A drag instead chooses whole words within the pressed component.
  function startPhrase(event: ReactPointerEvent<HTMLElement>, target: TextTarget) {
    if (!onPhraseSelect || event.button !== 0 || event.pointerType === 'touch') return;
    const element = event.currentTarget;
    const origin = { x: event.clientX, y: event.clientY };
    let anchor: TextRange | undefined, chosen = '', frame = 0, point = origin, dragging = false;
    const selectWhole = () => {
      const { left, top, width, height } = element.getBoundingClientRect();
      onTextClick?.(wholeText(target), { left, top, width, height });
    };
    const update = () => {
      frame = 0;
      anchor ??= textAt(target.id, origin.x, origin.y);
      const focus = anchor && textAt(target.id, point.x, point.y);
      if (!anchor || !focus) return;
      const range = wordRange(target.text, Math.min(anchor.start, focus.start), Math.max(anchor.end, focus.end));
      const phrase = phraseSelection(target, range, number, artifact?.hash);
      const key = phrase ? `${phrase.start}:${phrase.end}` : range ? 'whole' : '';
      if (!key || key === chosen) return;
      chosen = key;
      if (phrase) onPhraseSelect(phrase);
      else selectWhole();
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return;
      // Matches the page's click threshold, which suppresses the click after a drag.
      if (!dragging && Math.hypot(next.clientX - origin.x, next.clientY - origin.y) <= 4) return;
      dragging = true;
      point = { x: next.clientX, y: next.clientY };
      frame ||= requestAnimationFrame(update);
    };
    const finish = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (!dragging) return;
      if (frame) { cancelAnimationFrame(frame); update(); }
      // A drag over text the page cannot map still selects its component.
      if (!chosen && next.type === 'pointerup') selectWhole();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  async function followDestination(dest: unknown) {
    try {
      const value =
        typeof dest === "string" ? await pdf.getDestination(dest) : dest;
      if (Array.isArray(value)) {
        const index =
          typeof value[0] === "number"
            ? value[0]
            : await pdf.getPageIndex(value[0]);
        if (Number.isInteger(index) && index >= 0 && index < pdf.numPages) {
          onNavigate?.(index + 1);
          return;
        }
      }
      setError("This reference does not point to an available page.");
    } catch {
      setError("This reference could not be opened.");
    }
  }
  const fragments = useMemo(
    () =>
      renderPage && !thumbnail
        ? [...(artifact?.pages[number - 1]?.fragments ?? [])].sort(
            (a, b) => b.width * b.height - a.width * a.height,
          )
        : [],
    [artifact, number, renderPage, thumbnail],
  );
  const textComponents = useMemo(() => renderPage && !thumbnail ? (artifact?.textTargets ?? []).flatMap(target => {
    const lines = target.lines.filter(line => line.page === number && line.width > 0 && line.height > 0);
    if (!lines.length || !target.text) return [];
    const x = Math.min(...lines.map(line => line.x));
    const y = Math.min(...lines.map(line => line.y));
    return [{ target, x, y, width: Math.max(...lines.map(line => line.x + line.width)) - x,
      height: Math.max(...lines.map(line => line.y + line.height)) - y }];
  }) : [], [artifact, number, renderPage, thumbnail]);
  // Each page is one tab stop. Arrow keys move through its components in
  // visual reading order without changing their stacking or click targets.
  const navigation = useMemo(() => {
    const textBlocks = new Set(textComponents.map(item => item.target.blockId));
    return componentNavigation([
      ...(renderPage && !thumbnail ? artifact?.pages[number - 1]?.fragments ?? [] : []).map(fragment => ({
        key: `block:${fragment.id}`, x: fragment.x, y: fragment.y, width: fragment.width, height: fragment.height,
        linear: !textBlocks.has(fragment.id), rowsFirst: getBlock(artifact, fragment.id)?.kind === 'table',
      })),
      ...textComponents.map(item => ({ key: `text:${item.target.id}`, owner: `block:${item.target.blockId}`,
        x: item.x, y: item.y, width: item.width, height: item.height })),
    ]);
  }, [artifact, number, renderPage, textComponents, thumbnail]);
  const names = useMemo(() => {
    const result = new Map<string, string>();
    const textBlocks = new Set(textComponents.map(item => item.target.blockId));
    const texts = new Map(textComponents.map(item => [`text:${item.target.id}`, item.target.text]));
    for (const item of textComponents) {
      result.set(`text:${item.target.id}`, componentName({ kind: getBlock(artifact, item.target.blockId)?.kind, text: item.target.text }));
    }
    for (const key of navigation.order) {
      if (!key.startsWith('block:')) continue;
      const id = key.slice(6);
      const block = getBlock(artifact, id);
      const depicts = block?.kind !== 'block' ? undefined
        : artifact?.assets?.some(use => use.blockId === id && use.kind === 'logo') ? 'Logo'
        : artifact?.media?.some(use => use.blockId === id) ? 'Image' : undefined;
      // A container without text of its own is named by its first contents.
      const contents = navigation.order.find(other => texts.has(other) && isWithin(navigation, other, key));
      result.set(key, componentName({ kind: block?.kind, depicts, whole: textBlocks.has(id),
        text: block?.text.trim() || (depicts ? '' : texts.get(contents ?? '')) }));
    }
    return result;
  }, [artifact, navigation, textComponents]);
  const [activeComponent, setActiveComponent] = useState<string | null>(null);
  const tabStop = activeComponent && navigation.order.includes(activeComponent)
    ? activeComponent : navigation.order.find(key => navigation.linear.has(key));
  function componentFocus(key: string) {
    return {
      tabIndex: key === tabStop ? 0 : -1,
      onFocus: () => setActiveComponent(key),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        const move = navigationMove(event);
        if (!move) return;
        event.preventDefault();
        const next = moveComponentFocus(navigation, key, move);
        if (!next) return;
        container.current?.querySelector<HTMLElement>(next.startsWith('text:')
          ? `[data-text-target="${CSS.escape(next.slice(5))}"]`
          : `.component-target[data-block-id="${CSS.escape(next.slice(6))}"]`)?.focus();
      },
    };
  }
  function rectStyle(f: Pick<Fragment, 'x' | 'y' | 'width' | 'height'>): CSSProperties {
    return {
      left: f.x * scale,
      top: f.y * scale,
      width: f.width * scale,
      height: f.height * scale,
    };
  }
  return (
    <div
      ref={container}
      className={`pdf-page ${thumbnail ? "thumbnail" : ""}`}
      data-page={number}
      data-render-hash={artifact?.hash}
      data-rendered={rendered}
      role={label ? 'group' : undefined}
      aria-label={label}
      aria-describedby={label ? keyboardHelp : undefined}
      onPointerDownCapture={event => { pointerStart.current = { x: event.clientX, y: event.clientY }; }}
      onClickCapture={event => {
        if (event.detail > 0 && Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y) > 4) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      style={
        {
          width,
          height,
          "--total-scale-factor": scale,
          "--scale-round-x": "1px",
          "--scale-round-y": "1px",
        } as CSSProperties
      }
    >
      <canvas
        ref={canvas}
        aria-label={`Page ${number}`}
        style={{ width, height }}
      />
      {renderPage && !thumbnail && (
        <>
          <div ref={text} className="textLayer" />
          <div className="link-layer">
            {links.map((link, index) => {
              const [x1, y1, x2, y2] = link.rect;
              const style = {
                left: Math.min(x1, x2),
                top: Math.min(y1, y2),
                width: Math.abs(x2 - x1),
                height: Math.abs(y2 - y1),
              };
              return link.url && /^(https?:|mailto:)/i.test(link.url) ? (
                <a
                  key={index}
                  style={style}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open reference: ${link.url}`}
                />
              ) : link.dest ? (
                <Button
                  static
                  key={index}
                  style={style}
                  onClick={() => void followDestination(link.dest)}
                  aria-label="Go to reference"
                />
              ) : null;
            })}
          </div>
          <InspectionLayer key={`${artifact?.hash}:${width}`}>
            {commentHighlights.map((rect, index) => <div key={`comment-${index}`} className="comment-phrase-highlight" aria-hidden="true" style={rect} />)}
            {phraseHighlights.map((rect, index) => <div key={index} className="text-selection-highlight" aria-hidden="true" style={{ ...rect, pointerEvents: 'none' }} />)}
            {fragments.map(fragment => {
              const block = getBlock(artifact, fragment.id);
              return <Button static key={fragment.id} className={`block-target component-target ${selected === fragment.id && showBlockSelection ? 'selected' : ''}`}
                data-block-id={fragment.id} style={rectStyle(fragment)} {...componentFocus(`block:${fragment.id}`)}
                aria-label={names.get(`block:${fragment.id}`)}
                onClick={() => onSelect?.(fragment.id, number)}>
                <span className="block-label" aria-hidden="true">{block?.kind ?? 'Component'}</span>
              </Button>;
            })}
            {textComponents.map(item => {
              const block = getBlock(artifact, item.target.blockId);
              const fullSelected = selection?.targetId === item.target.id && selection.start === 0 && selection.end === item.target.text.length;
              return <Button static key={item.target.id} className={`block-target component-target text-component ${fullSelected ? 'selected' : ''}`}
                data-text-target={item.target.id} style={rectStyle(item)} {...componentFocus(`text:${item.target.id}`)}
                aria-label={names.get(`text:${item.target.id}`)}
                onPointerDown={event => startPhrase(event, item.target)}
                onClick={event => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onTextClick?.(wholeText(item.target), { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
                }}
                onDoubleClick={event => {
                  const hit = onTextEdit && textAt(item.target.id, event.clientX, event.clientY);
                  onTextEdit?.(wholeText(item.target), hit ? wordRange(item.target.text, hit.start, hit.end) ?? { start: hit.start, end: hit.start } : undefined);
                }}>
                <span className="block-label" aria-hidden="true">{block?.kind ?? 'Text'}</span>
              </Button>;
            })}
            {/* A page is one Tab stop: markers are pointer shortcuts to comments the Comments tab also lists. */}
            {fragments.filter(fragment => commented?.has(fragment.id)).map(fragment => {
              return <Button static key={fragment.id} className="comment-marker" tabIndex={-1}
                aria-label={`View comments on ${(names.get(`block:${fragment.id}`) ?? 'Component').replace(/^./, letter => letter.toLowerCase())}`}
                style={{ left: (fragment.x + fragment.width) * scale + 4, top: fragment.y * scale - 6, pointerEvents: 'auto' }}
                onClick={() => (onComment ?? onSelect)?.(fragment.id, number)}><Icon name="comment" size={12} /></Button>;
            })}
          </InspectionLayer>
        </>
      )}
      {error && (
        <div className="page-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
});
