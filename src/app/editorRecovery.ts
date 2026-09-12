export interface EditorBaseline { hash: string; revision: number; text: string }
export interface OpenEditorRecord { targetId: string; text: string; baseline?: EditorBaseline }
export interface EditorRecovery { record: OpenEditorRecord; stage: boolean; error?: string }

export function readOpenEditor(value: unknown): OpenEditorRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Partial<OpenEditorRecord>;
  if (typeof record.targetId !== 'string' || typeof record.text !== 'string' || record.text.length > 8000) return undefined;
  const baseline = record.baseline;
  return { targetId: record.targetId, text: record.text, ...(baseline && typeof baseline.hash === 'string' && Number.isInteger(baseline.revision) && typeof baseline.text === 'string' ? { baseline } : {}) };
}

/** Raw editor recovery cannot establish a new source baseline for old wording. */
export function recoverEditor(record: OpenEditorRecord, current: EditorBaseline, pending?: EditorBaseline, typing = false): EditorRecovery {
  const unchanged = !!record.baseline && record.text === record.baseline.text;
  // A validated pending session already owns this exact text and its source guards.
  // An untouched older editor must also not undo a newer accepted draft on restore.
  if (pending && (record.text === pending.text || (!typing && unchanged))) return { record: { ...record, text: pending.text, baseline: pending }, stage: false };
  if (!record.baseline && record.text === current.text) return { record: { ...record, baseline: current }, stage: false };
  if (!record.baseline) return { record, stage: false, error: 'This recovered text needs review before it can join your draft.' };
  const matches = record.baseline.hash === current.hash && record.baseline.revision === current.revision;
  if (matches) return { record, stage: record.text !== (pending?.text ?? current.text) };
  if (unchanged && !typing) return { record: { ...record, text: current.text, baseline: current }, stage: false };
  return { record, stage: false, error: 'The document changed. Your text is kept here for review.' };
}
