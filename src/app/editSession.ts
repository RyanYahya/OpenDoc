import type { TextEditInput, TextSourceValue, TextTarget } from '../shared/selection';
import { componentCorrection } from './componentCorrection';

export type PendingTextEdit = Pick<TextEditInput, 'targetId' | 'start' | 'end' | 'replacement'>;
export interface DraftTextEdit extends PendingTextEdit { sourceId: string }
export interface EditSessionBaseline { revision: number; hash: string; targets: TextTarget[] }
export interface EditSession extends EditSessionBaseline {
  pending: DraftTextEdit[];
  past: DraftTextEdit[][];
  future: DraftTextEdit[][];
  group?: { sourceId: string; at: number };
}
export interface EditSessionUpdate { session: EditSession; error?: string }

const HISTORY_LIMIT = 50;
const GROUP_MS = 500;
const MAX_REPLACEMENT = 8_000;
const STORAGE_PREFIX = 'opendoc:text-draft:';

/** Identity always belongs to the captured source, never the changing preview offsets. */
export function sourceIdentity(source: TextSourceValue): string {
  return JSON.stringify([source.file, source.digest, source.start, source.end]);
}

function sourceBindings(targets: TextTarget[]) {
  const bindings = new Map<string, { targetId: string; start: number; end: number; value: string }>();
  for (const target of targets) for (const run of target.runs) {
    if (!run.source || run.protected || run.source.value !== target.text.slice(run.start, run.end)) continue;
    const id = sourceIdentity(run.source);
    if (!bindings.has(id)) bindings.set(id, { targetId: target.id, start: run.start, end: run.end, value: run.source.value });
  }
  return bindings;
}

export function createSession(baseline: EditSessionBaseline): EditSession {
  return { revision: baseline.revision, hash: baseline.hash, targets: structuredClone(baseline.targets), pending: [], past: [], future: [] };
}

/** An idle session must not bring old source text back after an external update. */
export function sessionForDocument(session: EditSession | null, document: { revision: number; hash?: string }): EditSession | null {
  if (!session) return null;
  return session.pending.length || session.future.length || (session.revision === document.revision && session.hash === document.hash) ? session : null;
}

/** These targets are for editing; page geometry still belongs to the rendered PDF. */
export function materializeTarget(session: EditSession, targetId: string): TextTarget | undefined {
  const target = session.targets.find(target => target.id === targetId);
  if (!target) return undefined;
  const replacements = new Map(session.pending.map(edit => [edit.sourceId, edit.replacement]));
  if (!target.runs.some(run => run.source && replacements.has(sourceIdentity(run.source)))) return target;
  let text = '', cursor = 0;
  const runs = target.runs.map(run => {
    text += target.text.slice(cursor, run.start);
    const start = text.length;
    const replacement = run.source && replacements.get(sourceIdentity(run.source));
    const value = typeof replacement === 'string' ? replacement : target.text.slice(run.start, run.end);
    text += value;
    cursor = run.end;
    return { ...run, start, end: text.length, ...(run.source ? { source: { ...run.source, value } } : {}) };
  });
  text += target.text.slice(cursor);
  return { ...target, text, runs };
}

export function pendingEdits(session: EditSession): PendingTextEdit[] {
  return session.pending.map(({ targetId, start, end, replacement }) => ({ targetId, start, end, replacement }));
}

function equalEdits(left: DraftTextEdit[], right: DraftTextEdit[]) {
  return left.length === right.length && left.every((edit, index) => edit.sourceId === right[index].sourceId && edit.replacement === right[index].replacement);
}

export function updateComponent(session: EditSession, targetId: string, text: string, now = Date.now()): EditSessionUpdate {
  const target = materializeTarget(session, targetId);
  if (!target) return { session, error: 'This component is no longer available.' };
  if (text === target.text) return { session };
  const correction = componentCorrection(target, text);
  if (!correction) return { session, error: 'Change one text value at a time. Formatting and generated content need an agent.' };
  if (correction.replacement.length > MAX_REPLACEMENT) return { session, error: 'Keep each text value under 8,000 characters.' };
  const run = target.runs.find(run => run.source && !run.protected && run.start === correction.start && run.end === correction.end);
  if (!run?.source) return { session, error: 'This text value is no longer editable.' };
  const sourceId = sourceIdentity(run.source);
  const binding = sourceBindings(session.targets).get(sourceId);
  if (!binding) return { session, error: 'This text value is no longer editable.' };
  const pending = session.pending.filter(edit => edit.sourceId !== sourceId);
  if (correction.replacement !== binding.value) {
    const edit = { sourceId, targetId: binding.targetId, start: binding.start, end: binding.end, replacement: correction.replacement };
    // Keep a stable order when typing so history compares values, not edit order.
    const previousIndex = session.pending.findIndex(edit => edit.sourceId === sourceId);
    pending.splice(previousIndex < 0 ? pending.length : previousIndex, 0, edit);
  }
  if (equalEdits(pending, session.pending)) return { session };
  const grouped = session.group?.sourceId === sourceId && now >= session.group.at && now - session.group.at <= GROUP_MS;
  let past = grouped ? session.past : [...session.past, session.pending].slice(-HISTORY_LIMIT);
  // Typing back to the beginning of a group should not leave an empty undo step.
  const cancelled = past.length > 0 && equalEdits(pending, past[past.length - 1]);
  if (cancelled) past = past.slice(0, -1);
  return { session: { ...session, pending, past, future: [], group: cancelled ? undefined : { sourceId, at: now } } };
}

export function undo(session: EditSession): EditSession {
  if (!session.past.length) return session;
  return { ...session, pending: session.past[session.past.length - 1], past: session.past.slice(0, -1), future: [...session.future, session.pending].slice(-HISTORY_LIMIT), group: undefined };
}

export function redo(session: EditSession): EditSession {
  if (!session.future.length) return session;
  return { ...session, pending: session.future[session.future.length - 1], past: [...session.past, session.pending].slice(-HISTORY_LIMIT), future: session.future.slice(0, -1), group: undefined };
}

/** Rebase only after an explicit refresh; ambiguous or externally changed values stay untouched. */
export function rebaseSession(session: EditSession, baseline: EditSessionBaseline): EditSessionUpdate {
  const next = createSession(baseline);
  const bindings = sourceBindings(next.targets);
  const pending = new Map<string, DraftTextEdit>();
  const conflict = (): EditSessionUpdate => ({ session, error: 'Some edited text changed outside this draft. Keep the draft open and ask your agent to reconcile it.' });
  for (const edit of session.pending) {
    let nextSourceId: string | undefined;
    for (const previousTarget of session.targets) {
      const previousRuns = previousTarget.runs.filter(run => run.source && sourceIdentity(run.source) === edit.sourceId);
      if (!previousRuns.length) continue;
      const target = next.targets.find(target => target.id === previousTarget.id);
      if (!target || target.stable === false || previousTarget.stable === false) return conflict();
      for (const previousRun of previousRuns) {
        const source = previousRun.source!;
        const identity = (source as TextSourceValue & { bindingId?: string }).bindingId ?? sourceIdentity(source);
        let candidates = target.runs.filter(run => run.source && !run.protected
          && ((run.source as TextSourceValue & { bindingId?: string }).bindingId ?? sourceIdentity(run.source)) === identity);
        if (!candidates.length && target.text === previousTarget.text) {
          candidates = target.runs.filter(run => run.source && !run.protected && run.start === previousRun.start && run.end === previousRun.end
            && run.source.file === source.file && run.source.kind === source.kind && run.source.value === source.value);
        }
        if (!candidates.length || new Set(candidates.map(run => sourceIdentity(run.source!))).size !== 1
          || candidates.some(run => run.source!.value !== source.value || target.text.slice(run.start, run.end) !== source.value)) return conflict();
        const id = sourceIdentity(candidates[0].source!);
        if (nextSourceId && nextSourceId !== id) return conflict();
        nextSourceId = id;
      }
    }
    if (!nextSourceId) return conflict();
    const binding = bindings.get(nextSourceId);
    if (!binding) return conflict();
    const existing = pending.get(nextSourceId);
    if (existing && existing.replacement !== edit.replacement) return conflict();
    pending.set(nextSourceId, { sourceId: nextSourceId, targetId: binding.targetId, start: binding.start, end: binding.end, replacement: edit.replacement });
  }
  next.pending = [...pending.values()];
  next.past = next.pending.length ? [[]] : [];
  return { session: next };
}

type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type UnknownRecord = Record<string, unknown>;
function record(value: unknown): value is UnknownRecord { return !!value && typeof value === 'object' && !Array.isArray(value); }
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function optionalString(value: unknown) { return value === undefined || typeof value === 'string'; }
function optionalBoolean(value: unknown) { return value === undefined || typeof value === 'boolean'; }

function validSource(value: unknown): value is TextSourceValue {
  return record(value) && typeof value.file === 'string' && value.file.length > 0 && typeof value.digest === 'string' && value.digest.length > 0
    && integer(value.start) && integer(value.end) && value.end > value.start
    && ['jsx-text', 'jsx-attribute', 'string', 'json-string'].includes(value.kind as string) && typeof value.value === 'string'
    && optionalString(value.bindingId) && (value.linkedOccurrences === undefined || integer(value.linkedOccurrences));
}

function validTarget(value: unknown): value is TextTarget {
  if (!record(value) || typeof value.id !== 'string' || !value.id || typeof value.blockId !== 'string' || !value.blockId || typeof value.slot !== 'string'
    || typeof value.text !== 'string' || !optionalBoolean(value.stable) || !optionalString(value.reason) || !Array.isArray(value.runs) || !Array.isArray(value.lines)) return false;
  const text = value.text;
  let previousEnd = 0;
  for (const run of value.runs) {
    if (!record(run) || !integer(run.start) || !integer(run.end) || run.start < previousEnd || run.end < run.start || run.end > text.length
      || !optionalBoolean(run.protected) || !optionalString(run.reason) || (run.source !== undefined && (!validSource(run.source) || run.source.value !== text.slice(run.start, run.end)))) return false;
    previousEnd = run.end;
  }
  return value.lines.every(line => record(line) && integer(line.page) && line.page > 0 && finite(line.x) && finite(line.y) && finite(line.width) && line.width >= 0
    && finite(line.height) && line.height >= 0 && typeof line.text === 'string' && integer(line.start) && integer(line.end) && line.end >= line.start && line.end <= text.length);
}

/** Validate against the saved baseline so source drift preserves a recoverable, stale draft. */
function restoredSession(value: unknown): EditSession | undefined {
  if (!record(value) || value.version !== 1 || !record(value.session)) return undefined;
  const session = value.session;
  if (!integer(session.revision) || typeof session.hash !== 'string' || !session.hash || !Array.isArray(session.targets) || !session.targets.every(validTarget)
    || new Set(session.targets.map(target => target.id)).size !== session.targets.length) return undefined;
  const targets = session.targets;
  const sourceValues = new Map<string, string>();
  for (const target of targets) for (const run of target.runs) if (run.source) {
    const key = sourceIdentity(run.source);
    if (sourceValues.has(key) && sourceValues.get(key) !== run.source.value) return undefined;
    sourceValues.set(key, run.source.value);
  }
  const bindings = sourceBindings(targets);
  function validSnapshot(snapshot: unknown): snapshot is DraftTextEdit[] {
    if (!Array.isArray(snapshot) || snapshot.length > bindings.size) return false;
    const ids = new Set<string>();
    for (const edit of snapshot) {
      if (!record(edit) || typeof edit.sourceId !== 'string' || ids.has(edit.sourceId) || typeof edit.replacement !== 'string' || edit.replacement.length > MAX_REPLACEMENT) return false;
      const binding = bindings.get(edit.sourceId);
      if (!binding || edit.targetId !== binding.targetId || edit.start !== binding.start || edit.end !== binding.end || edit.replacement === binding.value) return false;
      ids.add(edit.sourceId);
    }
    return true;
  }
  if (!validSnapshot(session.pending) || !Array.isArray(session.past) || session.past.length > HISTORY_LIMIT || !session.past.every(validSnapshot)
    || !Array.isArray(session.future) || session.future.length > HISTORY_LIMIT || !session.future.every(validSnapshot)) return undefined;
  // A reload is a fresh typing group. Only validated fields survive restoration.
  return { revision: session.revision, hash: session.hash, targets, pending: session.pending, past: session.past, future: session.future };
}

/** Inject sessionStorage at the UI boundary; the model is also usable without a browser. */
export function createSessionStore(storage: SessionStorage | (() => SessionStorage)) {
  const access = () => typeof storage === 'function' ? storage() : storage;
  const key = (documentId: string) => `${STORAGE_PREFIX}${encodeURIComponent(documentId)}`;
  return {
    read(documentId: string, current?: Pick<EditSessionBaseline, 'revision' | 'hash'>): { session: EditSession; stale: boolean } | undefined {
      try {
        const raw = access().getItem(key(documentId));
        if (raw === null) return undefined;
        const session = restoredSession(JSON.parse(raw));
        if (!session) { access().removeItem(key(documentId)); return undefined; }
        return { session, stale: !!current && (session.revision !== current.revision || session.hash !== current.hash) };
      } catch {
        try { access().removeItem(key(documentId)); } catch { /* Storage itself may be unavailable. */ }
        return undefined;
      }
    },
    write(documentId: string, session: EditSession): boolean {
      try { access().setItem(key(documentId), JSON.stringify({ version: 1, session: { ...session, group: undefined, past: session.past.slice(-HISTORY_LIMIT), future: session.future.slice(-HISTORY_LIMIT) } })); return true; }
      catch { return false; }
    },
    clear(documentId: string): boolean {
      try { access().removeItem(key(documentId)); return true; }
      catch { return false; }
    },
  };
}
