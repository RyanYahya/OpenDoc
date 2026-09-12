/** Source values are issued by the renderer. Clients never choose a file to edit. */
export type { TextEditPreview } from './types';
export interface TextSourceValue {
  /** Identity of the authored token; draft previews retain their original binding. */
  bindingId?: string;
  file: string;
  digest: string;
  start: number;
  end: number;
  kind: 'jsx-text' | 'jsx-attribute' | 'string' | 'json-string';
  value: string;
  linkedOccurrences?: number;
}

export interface TextRun {
  start: number;
  end: number;
  source?: TextSourceValue;
  protected?: boolean;
  reason?: string;
}

export interface TextLine {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  start: number;
  end: number;
}

/** A stable content slot within a block, independent of its current page. */
export interface TextTarget {
  id: string;
  blockId: string;
  slot: string;
  /** Anonymous positional slots support revision-checked edits, not durable phrase anchors. */
  stable?: boolean;
  text: string;
  runs: TextRun[];
  lines: TextLine[];
  reason?: string;
}

export interface DocumentSelection {
  blockId: string;
  targetId?: string;
  start?: number;
  end?: number;
  quote?: string;
  page: number;
  renderHash?: string;
  revision?: number;
}

export interface TextAnchor {
  targetId: string;
  start: number;
  end: number;
  quote: string;
  prefix: string;
  suffix: string;
}

export interface ManualEditSummary {
  id: string;
  blockId: string;
  targetId: string;
  before: string;
  after: string;
  at: string;
  canUndo: boolean;
  count?: number;
}

export interface TextEditChange {
  targetId: string;
  start: number;
  end: number;
  replacement: string;
}

export interface TextEditInput extends TextEditChange {
  revision: number;
  hash: string;
}

export interface TextEditBatchInput {
  revision: number;
  hash: string;
  edits: TextEditChange[];
}
