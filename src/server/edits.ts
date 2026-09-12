import { readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { readFileSync, realpathSync, renameSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DocumentState, TextEditPreview } from '../shared/types';
import type { ManualEditSummary, TextEditBatchInput, TextEditChange, TextEditInput, TextSourceValue } from '../shared/selection';
import { containedFile } from './files';
import { documentEntry, renderOnce } from './render';
import { Conflict } from './comments';
import { serializeSourceValue, textDigest, validateTextSyntax } from './text-source';
import type { SourceOverride } from './source-overrides';

type EditInput = TextEditInput | TextEditBatchInput;
interface FileChange { path: string; file: string; before: string; after: string; beforeDigest: string; afterDigest: string }
interface UndoRecord { summary: ManualEditSummary; files: FileChange[] }
interface Prepared { files: FileChange[]; overrides: SourceOverride[]; summary: Omit<ManualEditSummary, 'id' | 'at' | 'canUndo'>; entry: string }
interface PreviewRecord { id: string; directory: string; at: number; pages: number }

function current(state: DocumentState, input: Pick<TextEditInput, 'revision' | 'hash'>, id: string) {
  if (state.id !== id || state.status !== 'ready' || !state.artifact || state.revision !== input.revision || state.artifact.hash !== input.hash) throw new Conflict('This document changed. Your unsaved edits are still available; refresh or discard them before saving.');
}

/** Session-local grouped Save/Undo. Authored files stay authoritative until Save. */
export class TextEditService {
  private records = new Map<string, UndoRecord>();
  private queues = new Map<string, Promise<unknown>>();
  private previews = new Map<string, PreviewRecord>();
  constructor(private root: string) {}

  /** Keep folder operations from racing an in-flight Save or Undo. */
  withDocument<T>(id: string, operation: () => Promise<T>) { return this.serialize(id, operation); }

  private serialize<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    this.queues.set(id, next);
    void next.finally(() => { if (this.queues.get(id) === next) this.queues.delete(id); }).catch(() => undefined);
    return next;
  }

  changedFiles(id: string) { return this.records.get(id)?.files.map(file => file.file) ?? []; }

  async summary(id: string): Promise<ManualEditSummary | undefined> {
    const record = this.records.get(id);
    if (!record) return undefined;
    let canUndo = record.summary.canUndo;
    if (canUndo) {
      try {
        const entry = await documentEntry(this.root, id);
        for (const item of record.files) {
          const file = await containedFile(dirname(entry), resolve(this.root, item.file));
          if (file !== item.path || textDigest(await readFile(file, 'utf8')) !== item.afterDigest) { canUndo = false; break; }
        }
      } catch { canUndo = false; }
    }
    return { ...record.summary, canUndo };
  }

  private async prepare(id: string, input: EditInput, state: DocumentState): Promise<Prepared> {
    const batch = !!input && typeof input === 'object' && 'edits' in input;
    const changes: TextEditChange[] = batch ? (input as TextEditBatchInput).edits : [input as TextEditInput];
    if (!input || !Number.isInteger(input.revision) || typeof input.hash !== 'string' || !Array.isArray(changes) || !changes.length || changes.length > 100) throw new Error('Save between 1 and 100 text edits from the current document.');
    let length = 0;
    for (const change of changes) {
      if (!change || typeof change.targetId !== 'string' || !Number.isInteger(change.start) || !Number.isInteger(change.end) || change.start < 0 || change.end <= change.start || typeof change.replacement !== 'string' || change.replacement.length > 8_000) throw new Error('Select one text range and enter a correction of up to 8,000 characters.');
      length += change.replacement.length;
    }
    if (length > 128_000) throw new Error('Save a smaller group of text edits.');
    current(state, input, id);
    const entry = await documentEntry(this.root, id);
    const workspaceRoot = await realpath(this.root);
    const comments = await realpath(resolve(dirname(entry), 'comments.json')).catch(() => '');
    const files = new Map<string, FileChange>();
    const groups = new Map<string, { source: TextSourceValue; file: FileChange; edits: { start: number; end: number; replacement: string }[] }>();
    let first: Prepared['summary'] | undefined;
    for (const change of changes) {
      const target = state.artifact!.textTargets?.find(target => target.id === change.targetId);
      if (!target || change.end > target.text.length) throw new Conflict('This selected text is no longer available. Refresh the selection.');
      const runs = target.runs.filter(run => run.start <= change.start && run.end >= change.end);
      const run = runs.length === 1 ? runs[0] : undefined;
      if (!run?.source || run.protected || target.text.slice(run.start, run.end) !== run.source.value) throw new Error('This selection spans separate values or generated content. Ask your agent to change it.');
      const source = run.source;
      const path = await containedFile(dirname(entry), resolve(this.root, source.file));
      if (path === comments) throw new Error('Feedback cannot be changed through a text correction.');
      if (!/\.(?:tsx?|json)$/.test(path)) throw new Error('This source does not support text corrections.');
      let file = files.get(path);
      if (!file) {
        const before = await readFile(path, 'utf8');
        file = { path, file: relative(workspaceRoot, path), before, after: before, beforeDigest: textDigest(before), afterDigest: '' };
        files.set(path, file);
      }
      if (file.beforeDigest !== source.digest) throw new Conflict('The source changed elsewhere. Your unsaved edits have not been applied.');
      if (!Number.isInteger(source.start) || !Number.isInteger(source.end) || source.start < 0 || source.end <= source.start || source.end > file.before.length) throw new Error('This source binding is invalid. Refresh the document.');
      if (source.kind === 'json-string') {
        const dataFile = state.artifact!.provenance?.dataFile;
        if (!dataFile || await containedFile(dirname(entry), resolve(this.root, dataFile)) !== path) throw new Error('This data is not bound to the selected document.');
      }
      const key = JSON.stringify([path, source.start, source.end]);
      let group = groups.get(key);
      if (!group) { group = { source, file, edits: [] }; groups.set(key, group); }
      if (group.source.value !== source.value || group.source.kind !== source.kind) throw new Conflict('Linked text has inconsistent bindings. Refresh the document.');
      const local = { start: change.start - run.start, end: change.end - run.start, replacement: change.replacement };
      if (group.edits.some(edit => edit.start === local.start && edit.end === local.end && edit.replacement === local.replacement)) continue;
      if (group.edits.some(edit => edit.start < local.end && local.start < edit.end)) throw new Conflict('Two edits overlap the same source text. Keep one final correction for that text before saving.');
      if (target.text.slice(change.start, change.end) === change.replacement) continue;
      group.edits.push(local);
      first ??= { blockId: target.blockId, targetId: target.id, before: target.text.slice(change.start, change.end), after: change.replacement };
    }
    const overrides: SourceOverride[] = [];
    let count = 0;
    for (const file of files.values()) {
      const changes = [...groups.values()].filter(group => group.file === file && group.edits.length).sort((a, b) => a.source.start - b.source.start);
      if (!changes.length) continue;
      if (changes.some((group, index) => index > 0 && group.source.start < changes[index - 1].source.end)) throw new Conflict('These text bindings overlap. Refresh the document before saving.');
      const replacements: SourceOverride['replacements'] = [];
      for (const group of changes) {
        let value = group.source.value;
        for (const edit of group.edits.sort((a, b) => b.start - a.start)) value = value.slice(0, edit.start) + edit.replacement + value.slice(edit.end);
        const token = serializeSourceValue(group.source, value);
        replacements.push({ start: group.source.start, end: group.source.end, tokenLength: token.length, value });
      }
      for (let index = changes.length - 1; index >= 0; index--) {
        const { source } = changes[index];
        file.after = file.after.slice(0, source.start) + serializeSourceValue(source, replacements[index].value) + file.after.slice(source.end);
      }
      validateTextSyntax(file.path, file.after);
      file.afterDigest = textDigest(file.after);
      overrides.push({ file: file.path, contents: file.after, originalDigest: file.beforeDigest, replacements });
      count += changes.length;
    }
    if (!count || !first) throw new Error('Change some text before saving.');
    return { entry, files: [...files.values()].filter(file => file.afterDigest), overrides, summary: { ...first, count } };
  }

  /** Stage everything before replacement; rollback only bytes written by this operation. */
  private async commit(files: FileChange[], check: () => void) {
    const staged: { file: FileChange; temporary: string }[] = [];
    const written: FileChange[] = [];
    try {
      for (const file of files) {
        const temporary = `${file.path}.${randomUUID()}.tmp`;
        staged.push({ file, temporary });
        await writeFile(temporary, file.after);
      }
      check();
      // No awaits between the final checks and renames, so our own watcher cannot
      // publish an intermediate batch. Independent files have no OS-wide rename.
      for (const file of files) {
        if (realpathSync(resolve(this.root, file.file)) !== file.path || textDigest(readFileSync(file.path, 'utf8')) !== file.beforeDigest) throw new Conflict('The source changed during validation. Your edits have not been applied.');
      }
      for (const item of staged) {
        if (realpathSync(resolve(this.root, item.file.file)) !== item.file.path || textDigest(readFileSync(item.file.path, 'utf8')) !== item.file.beforeDigest) throw new Conflict('The source changed during saving. Your edits have not been applied.');
        renameSync(item.temporary, item.file.path); written.push(item.file);
      }
    } catch (error) {
      let incomplete = false;
      for (const file of written.reverse()) {
        let temporary: string | undefined;
        try {
          if (realpathSync(resolve(this.root, file.file)) !== file.path || textDigest(readFileSync(file.path, 'utf8')) !== file.afterDigest) { incomplete = true; continue; }
          temporary = `${file.path}.${randomUUID()}.tmp`;
          await writeFile(temporary, file.before);
          if (realpathSync(resolve(this.root, file.file)) !== file.path || textDigest(readFileSync(file.path, 'utf8')) !== file.afterDigest) { incomplete = true; continue; }
          renameSync(temporary, file.path);
        } catch { incomplete = true; }
        finally { if (temporary) await rm(temporary, { force: true }).catch(() => {}); }
      }
      if (incomplete) throw new Conflict('The source changed while saving. Some edits could not be restored safely; review the document before continuing.');
      throw error;
    } finally { await Promise.all(staged.map(item => rm(item.temporary, { force: true }))); }
  }

  private async verifySources(prepared: Prepared, input: EditInput, state: DocumentState, id: string) {
    current(state, input, id);
    for (const file of prepared.files) {
      if (await containedFile(dirname(prepared.entry), resolve(this.root, file.file)) !== file.path || textDigest(await readFile(file.path, 'utf8')) !== file.beforeDigest) throw new Conflict('The source changed during validation. Your unsaved edits have not been applied.');
    }
    current(state, input, id);
  }

  preview(id: string, input: TextEditBatchInput, state: DocumentState): Promise<TextEditPreview> {
    return this.serialize(id, async () => {
      const prepared = await this.prepare(id, input, state);
      const result = await renderOnce(this.root, id, 30_000, prepared.overrides);
      try {
        await this.verifySources(prepared, input, state, id);
        const key = randomUUID();
        this.previews.set(key, { id, directory: result.directory, at: Date.now(), pages: result.artifact.pages.length });
        await this.prunePreviews();
        return { artifact: result.artifact, pdfUrl: `/api/documents/${id}/edits/previews/${key}/pdf` };
      } catch (error) { await rm(result.directory, { recursive: true, force: true }); throw error; }
    });
  }

  async previewPDF(id: string, key: string) {
    const preview = this.previews.get(key);
    if (!preview || preview.id !== id || Date.now() - preview.at > 10 * 60_000) throw new Conflict('This draft preview expired. Update an edit to render it again.');
    return readFile(resolve(preview.directory, 'document.pdf'));
  }

  previewPageCount(id: string) {
    return Math.max(1, ...[...this.previews.values()].filter(preview => preview.id === id && Date.now() - preview.at <= 10 * 60_000).map(preview => preview.pages));
  }

  private async prunePreviews() {
    const previews = [...this.previews.entries()];
    const keep = new Set(previews.slice(-24).map(([key]) => key));
    const counts = new Map<string, number>();
    for (const [key, preview] of previews.reverse()) {
      const count = (counts.get(preview.id) ?? 0) + 1; counts.set(preview.id, count);
      if (keep.has(key) && count <= 8 && Date.now() - preview.at <= 10 * 60_000) continue;
      this.previews.delete(key); await rm(preview.directory, { recursive: true, force: true });
    }
  }

  apply(id: string, input: EditInput, state: DocumentState): Promise<ManualEditSummary> {
    return this.serialize(id, async () => {
      const prepared = await this.prepare(id, input, state);
      const result = await renderOnce(this.root, id, 30_000, prepared.overrides);
      await rm(result.directory, { recursive: true, force: true });
      await this.verifySources(prepared, input, state, id);
      await this.commit(prepared.files, () => current(state, input, id));
      const summary: ManualEditSummary = { ...prepared.summary, id: randomUUID(), at: new Date().toISOString(), canUndo: true };
      this.records.set(id, { summary, files: prepared.files });
      return { ...summary };
    });
  }

  undo(id: string, editId: string): Promise<ManualEditSummary> {
    return this.serialize(id, async () => {
      const record = this.records.get(id);
      if (!record || record.summary.id !== editId || !record.summary.canUndo) throw new Conflict('That correction is no longer the latest undoable edit.');
      const entry = await documentEntry(this.root, id);
      for (const file of record.files) {
        const path = await containedFile(dirname(entry), resolve(this.root, file.file));
        if (path !== file.path || textDigest(await readFile(path, 'utf8')) !== file.afterDigest) throw new Conflict('The source changed after these edits. Undo would overwrite newer work; ask your agent to restore the wording.');
      }
      await this.commit(record.files.map(file => ({ ...file, before: file.after, after: file.before, beforeDigest: file.afterDigest, afterDigest: file.beforeDigest })), () => {});
      record.summary = { ...record.summary, canUndo: false };
      return { ...record.summary };
    });
  }

  async close() {
    await Promise.allSettled([...this.queues.values()]);
    await Promise.all([...this.previews.values()].map(preview => rm(preview.directory, { recursive: true, force: true })));
    this.previews.clear();
  }
}
