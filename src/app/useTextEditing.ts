import { useEffect, useRef, useState } from 'react';
import type { DocumentState } from '../shared/types';
import type { TextEditPreview } from '../shared/selection';
import { api } from './api';
import {
  createSession, createSessionStore, materializeTarget, pendingEdits,
  rebaseSession, redo, sessionForDocument, undo, updateComponent, type EditSession,
} from './editSession';

const drafts = createSessionStore(() => window.sessionStorage);
const memoryDrafts = new Map<string, EditSession>();
type SaveReceipt = { id: string; revision: number };
const receipts = new Map<string, SaveReceipt>();
function readReceipt(id: string): SaveReceipt | undefined {
  if (receipts.has(id)) return receipts.get(id);
  try {
    const receipt = JSON.parse(sessionStorage.getItem(`opendoc:saved-draft:${id}`) ?? 'null');
    return typeof receipt?.id === 'string' && Number.isInteger(receipt.revision) ? receipt : undefined;
  } catch { return undefined; }
}
function keepReceipt(id: string, receipt?: SaveReceipt) {
  if (receipt) receipts.set(id, receipt); else receipts.delete(id);
  try { if (receipt) sessionStorage.setItem(`opendoc:saved-draft:${id}`, JSON.stringify(receipt)); else sessionStorage.removeItem(`opendoc:saved-draft:${id}`); } catch { /* The current tab retains its receipt. */ }
}

/** Draft PDFs and source saves deliberately have separate lifetimes. */
export function useTextEditing(state: DocumentState, connected: boolean, onState: (state: DocumentState) => void) {
  const [storedSession, setSession] = useState<EditSession | null>(() => memoryDrafts.get(state.id) ?? drafts.read(state.id)?.session ?? null);
  const session = sessionForDocument(storedSession, { revision: state.revision, hash: state.artifact?.hash });
  const current = useRef(storedSession);
  const [preview, setPreview] = useState<TextEditPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(() => !!readReceipt(state.id));
  const [savedId, setSavedId] = useState<string | null>(() => readReceipt(state.id)?.id ?? null);
  const [undoing, setUndoing] = useState(false);
  const [saved, setSaved] = useState(false);
  const requestVersion = useRef(0);
  const previewAbort = useRef<AbortController | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(!!readReceipt(state.id));
  const submitted = useRef<SaveReceipt | null>(readReceipt(state.id) ?? null);
  const restoredSave = useRef(!!readReceipt(state.id));
  const [persistenceFailed, setPersistenceFailed] = useState(false);
  const changes = session ? pendingEdits(session) : [];
  const count = changes.length;
  const stale = !!session && (count > 0 || !!session.future.length) && (session.hash !== state.artifact?.hash || session.revision !== state.revision) && !savedId;
  const previewKey = session ? JSON.stringify([session.hash, session.revision, changes]) : '';

  function keep(next: EditSession | null) {
    current.current = next;
    setSession(next);
    if (next) { memoryDrafts.set(state.id, next); setPersistenceFailed(!drafts.write(state.id, next)); }
    else { memoryDrafts.delete(state.id); drafts.clear(state.id); setPersistenceFailed(false); }
    setSaved(false);
  }

  useEffect(() => {
    const version = ++requestVersion.current;
    const controller = new AbortController();
    previewAbort.current = controller;
    if (!count) { setPreview(null); setPreviewing(false); return; }
    if (stale || !connected || savedId) { setPreviewing(false); return; }
    setPreviewing(true);
    const timer = previewTimer.current = setTimeout(() => {
      void api<TextEditPreview>(`/api/documents/${state.id}/edits/preview`, {
        method: 'POST', body: JSON.stringify({ revision: session!.revision, hash: session!.hash, edits: changes }), signal: controller.signal,
      }).then(next => {
        if (version !== requestVersion.current) return;
        setPreview(next); setError('');
      }).catch((failure: Error) => {
        if (!controller.signal.aborted && version === requestVersion.current) setError(failure.message);
      }).finally(() => { if (version === requestVersion.current) setPreviewing(false); });
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [previewKey, stale, connected, savedId, state.id]);

  useEffect(() => {
    if (!savedId || (!restoredSave.current && state.revision <= (submitted.current?.revision ?? -1)) || state.status === 'rendering') return;
    restoredSave.current = false;
    if (state.manualEdit?.id !== savedId) {
      keep(null); keepReceipt(state.id); setPreview(null); setSavedId(null); setSaving(false); busy.current = false;
      setError('Your changes were saved. The document has since changed; you are viewing its latest version.');
      return;
    }
    if (state.status === 'ready') {
      keep(null); keepReceipt(state.id); setPreview(null); setSavedId(null); setSaving(false); setError(''); setSaved(true); busy.current = false;
    } else if (state.status === 'error') {
      setSaving(false); busy.current = false;
      setError('Your changes were saved, but the PDF could not update. Undo the saved changes or ask your agent to repair the document.');
    }
  }, [savedId, state.status, state.revision, state.manualEdit?.id]);
  useEffect(() => {
    if (!persistenceFailed || !count) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [persistenceFailed, count]);
  useEffect(() => { if (!saved) return; const timer = setTimeout(() => setSaved(false), 2500); return () => clearTimeout(timer); }, [saved]);

  function target(id: string | undefined) {
    if (!id) return undefined;
    const active = sessionForDocument(current.current, { revision: state.revision, hash: state.artifact?.hash });
    return active ? materializeTarget(active, id) : state.artifact?.textTargets?.find(item => item.id === id);
  }
  function change(targetId: string, text: string) {
    if (busy.current || savedId) return 'Wait for the current save to finish.';
    const base = sessionForDocument(current.current, { revision: state.revision, hash: state.artifact?.hash })
      ?? createSession({ revision: state.revision, hash: state.artifact!.hash, targets: state.artifact?.textTargets ?? [] });
    const result = updateComponent(base, targetId, text);
    if (!result.error) { keep(result.session); setError(''); }
    return result.error;
  }
  function discard() {
    if (busy.current || savedId) return;
    ++requestVersion.current; keep(null); setPreview(null); setPreviewing(false); setError('');
  }
  function undoDraft() { if (session && !busy.current && !savedId) { keep(undo(session)); setError(''); } }
  function redoDraft() { if (session && !busy.current && !savedId) { keep(redo(session)); setError(''); } }
  function refresh() {
    if (!current.current || !state.artifact || state.status !== 'ready' || busy.current) return;
    const result = rebaseSession(current.current, { revision: state.revision, hash: state.artifact.hash, targets: state.artifact.textTargets ?? [] });
    if (result.error) setError(result.error);
    else { keep(result.session); setError(''); }
  }
  async function save() {
    const draft = current.current;
    if (!draft || !pendingEdits(draft).length || busy.current || !connected || stale || state.status !== 'ready') return false;
    busy.current = true; setSaving(true); setSaved(false); setError(''); ++requestVersion.current;
    clearTimeout(previewTimer.current); previewAbort.current?.abort(); setPreviewing(false);
    try {
      const next = await api<DocumentState>(`/api/documents/${state.id}/edits`, {
        method: 'POST', body: JSON.stringify({ revision: draft.revision, hash: draft.hash, edits: pendingEdits(draft) }),
      });
      if (!next.manualEdit) throw new Error('OpenDoc could not confirm this save. Your draft is still here.');
      submitted.current = { id: next.manualEdit.id, revision: draft.revision };
      keepReceipt(state.id, submitted.current);
      setSavedId(next.manualEdit.id); onState(next);
      return true;
    } catch (failure) { setError((failure as Error).message); setSaving(false); busy.current = false; return false; }
  }
  async function undoSaved() {
    if (!state.manualEdit?.canUndo || busy.current || !connected || (count && !savedId)) return false;
    busy.current = true; setUndoing(true); setError('');
    try {
      const next = await api<DocumentState>(`/api/documents/${state.id}/edits/${state.manualEdit.id}/undo`, { method: 'POST', body: '{}' });
      keep(null); keepReceipt(state.id); setPreview(null); setSavedId(null); setSaving(false); onState(next); return true;
    } catch (failure) { setError((failure as Error).message); return false; }
    finally { busy.current = false; setUndoing(false); }
  }

  return { session, preview, previewing, error, count, stale, saving, savedId, undoing, saved, persistenceFailed, dismissError: () => setError(''),
    canUndo: !!session?.past.length, canRedo: !!session?.future.length,
    target, change, discard, undoDraft, redoDraft, refresh, save, undoSaved };
}
