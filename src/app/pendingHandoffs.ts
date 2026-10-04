import type { DocumentFormat } from '../shared/types';

// A handoff is a creation prompt the user copied for their own agent. OpenDoc cannot see the
// agent, so it waits for the result to appear in the workspace instead. Handoffs live in this
// browser's storage: they are a view preference of one person, not workspace content, so they
// never reach the workspace folder, its sync service, or the agent's context.

/** A waiting card gives up after a day; by then the work was done elsewhere or abandoned. */
export const handoffLifetime = 24 * 60 * 60 * 1000;
/** A ready card stays long enough to be noticed, then the document card alone shows the result. */
export const readyLifetime = 15 * 60 * 1000;
const handoffLimit = 20;
const storageKey = 'opendoc:pending-handoffs';

export interface PendingHandoff {
  id: string;
  /** When the prompt was copied, in milliseconds. */
  copiedAt: number;
  format: DocumentFormat;
  projectId?: string;
  projectName?: string;
  themeName?: string;
  templateName?: string;
  brief: string;
  /** The exact prompt, so the user can copy it again. */
  prompt: string;
  /** Every document ID in the workspace when the prompt was copied; anything else is new. */
  knownIds: string[];
  documentId?: string;
  resolvedAt?: number;
}

export type HandoffDocument = { id: string; projectId?: string | null; format?: DocumentFormat };

const formatOf = (document: HandoffDocument): DocumentFormat => document.format ?? 'document';

/**
 * The same origin can serve another workspace later, such as a second workspace on the default
 * port. A handoff whose snapshot shares no document with this workspace belongs to that other one.
 */
export function belongsHere(handoff: PendingHandoff, ids: ReadonlySet<string>) {
  return !handoff.knownIds.length || !ids.size || handoff.knownIds.some(id => ids.has(id));
}

/**
 * Matches waiting handoffs to new documents and drops expired, finished, or orphaned ones.
 * Each new document answers at most one handoff, oldest first, preferring the requested format;
 * a handoff without a project accepts a new document in any project. Returns the same array when
 * nothing changed, and lists the handoffs that resolved in this pass.
 */
export function reconcileHandoffs(handoffs: readonly PendingHandoff[], documents: readonly HandoffDocument[], now: number) {
  const ids = new Set(documents.map(document => document.id));
  let changed = false;
  const kept = handoffs.filter(handoff => {
    const live = now - handoff.copiedAt < handoffLifetime
      && (!handoff.resolvedAt || now - handoff.resolvedAt < readyLifetime)
      // A resolved document that was deleted or moved to the trash has nothing left to open.
      && (!handoff.documentId || ids.has(handoff.documentId) || !belongsHere(handoff, ids));
    if (!live) changed = true;
    return live;
  });
  const claimed = new Set(kept.flatMap(handoff => handoff.documentId ? [handoff.documentId] : []));
  const waiting = kept.filter(handoff => !handoff.documentId && belongsHere(handoff, ids)).sort((a, b) => a.copiedAt - b.copiedAt);
  const answers = new Map<string, string>();
  for (const sameFormat of [true, false]) {
    for (const handoff of waiting) {
      if (answers.has(handoff.id)) continue;
      const known = new Set(handoff.knownIds);
      const match = documents.find(document => !known.has(document.id) && !claimed.has(document.id)
        && (!handoff.projectId || document.projectId === handoff.projectId)
        && (!sameFormat || formatOf(document) === handoff.format));
      if (match) { answers.set(handoff.id, match.id); claimed.add(match.id); }
    }
  }
  const resolved: PendingHandoff[] = [];
  const next = kept.map(handoff => {
    const documentId = answers.get(handoff.id);
    if (!documentId) return handoff;
    const update = { ...handoff, documentId, resolvedAt: now };
    resolved.push(update);
    return update;
  });
  return { handoffs: changed || resolved.length ? next : handoffs as PendingHandoff[], resolved };
}

/** The format a handoff will add to a page: what actually arrived, or else what was requested. */
function handoffFormat(handoff: PendingHandoff, documents: readonly HandoffDocument[]) {
  const answered = handoff.documentId ? documents.find(document => document.id === handoff.documentId) : undefined;
  return answered ? formatOf(answered) : handoff.format;
}

/** Handoffs shown on a page: one project's, or a library format's across projects. */
export function visibleHandoffs(handoffs: readonly PendingHandoff[], documents: readonly HandoffDocument[], scope: { projectId: string } | { format: DocumentFormat }) {
  const ids = new Set(documents.map(document => document.id));
  return handoffs.filter(handoff => {
    if (!belongsHere(handoff, ids)) return false;
    if ('projectId' in scope) return handoff.projectId === scope.projectId;
    return handoffFormat(handoff, documents) === scope.format;
  }).sort((a, b) => b.copiedAt - a.copiedAt);
}

/** What a library page is narrowed to: its format choice, and whether a search or filter is active. */
export interface HandoffFilters { format: 'all' | DocumentFormat; narrowed: boolean }

/**
 * A page's handoffs that its own filters keep. A card follows the format choice like the documents
 * do. A waiting card has no title, type, status, or tags to match yet, so a search or filter hides
 * every card rather than leave one above a “No matching items” message; clearing it brings them back.
 */
export function filteredHandoffs(handoffs: readonly PendingHandoff[], documents: readonly HandoffDocument[], { format, narrowed }: HandoffFilters) {
  if (narrowed) return [];
  return format === 'all' ? [...handoffs] : handoffs.filter(handoff => handoffFormat(handoff, documents) === format);
}

/** The opening words of the brief, for a card that must stay one or two lines. */
export function briefExcerpt(brief: string, words = 14) {
  const parts = brief.trim().split(/\s+/u).filter(Boolean);
  return parts.length > words ? `${parts.slice(0, words).join(' ')}…` : parts.join(' ');
}

function isHandoff(value: unknown): value is PendingHandoff {
  const item = value as PendingHandoff;
  return Boolean(item) && typeof item.id === 'string' && typeof item.copiedAt === 'number' && (item.format === 'document' || item.format === 'presentation')
    && typeof item.prompt === 'string' && typeof item.brief === 'string' && Array.isArray(item.knownIds) && item.knownIds.every(id => typeof id === 'string');
}

export function parseHandoffs(text: string | null): PendingHandoff[] {
  try {
    const value = JSON.parse(text ?? '[]');
    return Array.isArray(value) ? value.filter(isHandoff) : [];
  } catch { return []; }
}

// A tiny external store, so every page and the dialog share one list, across tabs as well.
let cache: { text: string | null; handoffs: PendingHandoff[] } | undefined;
const listeners = new Set<() => void>();

function readStored(): PendingHandoff[] {
  let text: string | null = null;
  try { text = localStorage.getItem(storageKey); } catch { /* Without storage, handoffs last for this page only. */ return cache?.handoffs ?? []; }
  if (cache?.text !== text) cache = { text, handoffs: parseHandoffs(text) };
  return cache.handoffs;
}

export function pendingHandoffs() { return readStored(); }

export function savePendingHandoffs(next: PendingHandoff[]) {
  const trimmed = [...next].sort((a, b) => b.copiedAt - a.copiedAt).slice(0, handoffLimit);
  const text = JSON.stringify(trimmed);
  cache = { text, handoffs: trimmed };
  try { localStorage.setItem(storageKey, text); } catch { /* Keep them for this page. */ }
  for (const listener of listeners) listener();
}

export function subscribePendingHandoffs(listener: () => void) {
  listeners.add(listener);
  const sync = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) listener(); };
  window.addEventListener('storage', sync);
  return () => { listeners.delete(listener); window.removeEventListener('storage', sync); };
}

/** Records or refreshes a handoff; copying again from the same dialog keeps one card. */
export function recordHandoff(handoff: PendingHandoff) {
  const current = pendingHandoffs();
  const existing = current.find(item => item.id === handoff.id);
  // A second copy keeps the first snapshot, so work that started after the first copy still counts.
  // Once answered, copying again starts a new wait.
  const next = existing && !existing.documentId ? { ...handoff, copiedAt: existing.copiedAt, knownIds: existing.knownIds, documentId: existing.documentId, resolvedAt: existing.resolvedAt } : handoff;
  savePendingHandoffs([next, ...current.filter(item => item.id !== handoff.id)]);
}

export function dismissHandoff(id: string) {
  savePendingHandoffs(pendingHandoffs().filter(item => item.id !== id));
}

/** Work OpenDoc itself adds, such as a duplicate or a restored document, is not the agent's answer. */
export function ignoreDocument(id: string) {
  const current = pendingHandoffs();
  if (current.every(item => item.documentId || item.knownIds.includes(id))) return;
  savePendingHandoffs(current.map(item => item.documentId || item.knownIds.includes(id) ? item : { ...item, knownIds: [...item.knownIds, id] }));
}
