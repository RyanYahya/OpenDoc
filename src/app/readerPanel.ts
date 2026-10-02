/** The reader's right-hand side panel: one surface with a tab for comments and one for version history. */
export type PanelTab = 'comments' | 'history';
/** What a tab shows: the whole document, or one component (a marker's comments, a block's earlier wording). */
export type PanelTarget = { kind: 'document' } | { kind: 'block'; blockId: string };
export interface PanelState { open: boolean; tab: PanelTab; targets: Record<PanelTab, PanelTarget> }

export const panelTabs: readonly PanelTab[] = ['comments', 'history'];
const wholeDocument: PanelTarget = { kind: 'document' };

export function closedPanel(tab: PanelTab = 'comments'): PanelState {
  return { open: false, tab, targets: { comments: wholeDocument, history: wholeDocument } };
}

export function sameTarget(a: PanelTarget, b: PanelTarget) {
  return a.kind === 'document' ? b.kind === 'document' : b.kind === 'block' && a.blockId === b.blockId;
}

/** Whether the panel currently shows this tab, and this target when one is given. */
export function isShowing(state: PanelState, tab: PanelTab, target?: PanelTarget) {
  return state.open && state.tab === tab && (!target || sameTarget(state.targets[tab], target));
}

/** Open the panel on a tab and target, such as a comment marker's component. */
export function showPanel(state: PanelState, tab: PanelTab, target: PanelTarget = wholeDocument): PanelState {
  return { open: true, tab, targets: { ...state.targets, [tab]: target } };
}

/** A button for one view: it opens that view, or closes the panel when exactly that view is showing. */
export function togglePanel(state: PanelState, tab: PanelTab, target: PanelTarget = wholeDocument): PanelState {
  return isShowing(state, tab, target) ? closePanel(state) : showPanel(state, tab, target);
}

/** Choosing a tab keeps each tab's own target, so switching back returns to the same view. */
export function selectTab(state: PanelState, tab: PanelTab): PanelState {
  return { ...state, open: true, tab };
}

/** Closing remembers the tab; targets return to the whole document for the next opening. */
export function closePanel(state: PanelState): PanelState {
  return closedPanel(state.tab);
}

export interface PanelPreference { open: boolean; tab: PanelTab }

/** The remembered panel, read defensively from browser storage. */
export function readPanelPreference(value: unknown): PanelPreference {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const tab = panelTabs.includes(record.tab as PanelTab) ? record.tab as PanelTab : 'comments';
  return { open: record.open === true, tab };
}

export function panelFromPreference(preference: PanelPreference, restoreOpen: boolean): PanelState {
  return { ...closedPanel(preference.tab), open: restoreOpen && preference.open };
}

const storageKey = 'opendoc:reader-panel';

export function loadPanelPreference(): PanelPreference {
  try { return readPanelPreference(JSON.parse(localStorage.getItem(storageKey) ?? 'null')); }
  catch { return readPanelPreference(null); }
}

export function savePanelPreference(state: PanelState) {
  try { localStorage.setItem(storageKey, JSON.stringify({ open: state.open, tab: state.tab })); }
  catch { /* The panel still works for this page; it is not remembered. */ }
}
