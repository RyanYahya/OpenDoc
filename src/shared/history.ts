/** Where a recorded version came from, when OpenDoc knows. */
export type HistoryOrigin = 'baseline' | 'edit' | 'undo' | 'external' | 'restore';
export type RestoreScope = 'version' | 'block' | 'section';

export const historyOriginLabels: Record<HistoryOrigin, string> = {
  baseline: 'Earliest saved state',
  edit: 'Your edit',
  undo: 'Undo',
  external: 'Agent change',
  restore: 'Restored',
};

/** A compact description of one recorded version, as listed in the history panel and CLI. */
export interface HistoryVersionSummary {
  id: string;
  at: string;
  origin: HistoryOrigin;
  label: string;
  /** Changes relative to the previous recorded version. */
  summary: { blocks: number; ids: string[]; files: string[] };
  restore?: { from: string; scope: RestoreScope; blockId?: string };
  /** Text files whose stored bytes are missing or damaged, for example while sync is incomplete. */
  unavailable?: string[];
}

export interface HistoryList {
  documentId: string;
  retentionDays: number;
  versions: HistoryVersionSummary[];
}

export interface RestoreAvailability { ok: boolean; reason?: string }

/** One stable block that differs between a recorded version and the current source. */
export interface HistoryBlockChange {
  id: string;
  file: string;
  /** The JSX element name, such as Paragraph or Section. */
  kind: string;
  status: 'changed' | 'contents' | 'added' | 'removed' | 'moved' | 'ambiguous';
  /** Contains other blocks with literal IDs. */
  container: boolean;
  parent: string | null;
  /** Readable text excerpts from that version and from the current source. */
  before?: string;
  after?: string;
  /** IDs of blocks inside this one, in either version; used to highlight a section. */
  descendants: string[];
  block: RestoreAvailability;
  section: RestoreAvailability;
}

export interface HistoryFileChange { path: string; status: 'added' | 'removed' | 'modified' }

export interface HistoryComparison {
  documentId: string;
  version: HistoryVersionSummary;
  /** Digest of the current text sources; restores send it back to detect intervening changes. */
  base: string;
  blocks: HistoryBlockChange[];
  files: HistoryFileChange[];
  /** True when that version's text sources equal the current ones. */
  identical: boolean;
}

export interface BlockHistoryEntry {
  version: HistoryVersionSummary;
  text: string;
  container: boolean;
}

export interface BlockHistory {
  documentId: string;
  /** The requested rendered block and the authored block that holds it. */
  requested: string;
  id: string;
  resolution: 'exact' | 'enclosing';
  kind: string;
  container: boolean;
  current: string;
  base: string;
  entries: BlockHistoryEntry[];
}

export interface RestoreResult {
  documentId: string;
  scope: RestoreScope;
  blockId?: string;
  /** The version recorded for the restored state. */
  version: HistoryVersionSummary | null;
  /** The version holding the state immediately before the restore; restoring it undoes this restore. */
  previous: string;
  files: string[];
}
