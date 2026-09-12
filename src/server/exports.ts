import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { linkSync, lstatSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { atomicWrite, containedFile } from './files';
import { ExportChangedError } from './export-file';
import { validId } from './render';
import { exportInfo, type ExportFormat, type SavedExport, type ExportHistoryEntry } from '../shared/export';
import { readZip } from '@shbernal/ts-pptx/zip';
import { copyFileToClipboard } from './clipboard';
import type { AssetUse, DocumentAssets } from '../shared/assets';
import { parseDocumentAssets, validAssetId, validRevision } from '../assets/files';

type Receipt = SavedExport & { digest: string; requestedName: string; deletedAt?: string; deletedFile?: boolean };
type ExportPreparation = { bytes: Uint8Array; isCurrent: () => boolean; assetBindings?: DocumentAssets; assets?: AssetUse[] };
export class ExportError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const maxReceiptBytes = 2_000_000;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function assetProvenance(value: Pick<ExportPreparation, 'assetBindings' | 'assets'>): Pick<SavedExport, 'assetBindings' | 'assets'> {
  const result: Pick<SavedExport, 'assetBindings' | 'assets'> = {};
  if (value.assetBindings !== undefined) result.assetBindings = structuredClone(parseDocumentAssets(value.assetBindings));
  if (value.assets !== undefined) {
    if (!Array.isArray(value.assets) || value.assets.length > 100_000) throw new ExportError('The export asset provenance is invalid.');
    const uses = new Map<string, AssetUse>();
    for (const use of value.assets) {
      if (!use || !['logo', 'font'].includes(use.kind) || !validAssetId(use.id) || !validRevision(use.revision)
        || (use.variation !== undefined && !validAssetId(use.variation)) || (use.face !== undefined && !validAssetId(use.face))) throw new ExportError('The export asset provenance is invalid.');
      // Block-level evidence remains in the render artifact; receipts retain compact actual identities.
      const ref: AssetUse = { kind: use.kind, id: use.id, revision: use.revision,
        ...(use.variation !== undefined ? { variation: use.variation } : {}), ...(use.face !== undefined ? { face: use.face } : {}) };
      uses.set(JSON.stringify(ref), ref);
    }
    result.assets = [...uses.values()];
  }
  return result;
}
export function exportFormat(value: unknown = 'pdf'): ExportFormat {
  if (value !== 'pdf' && value !== 'pptx') throw new ExportError('Choose PDF or PowerPoint as the export format.');
  return value;
}
export function exportFilename(value: unknown, maximum = 120, format: ExportFormat = 'pdf') {
  if (typeof value !== 'string') throw new ExportError('Enter a filename.');
  const trimmed = value.trim();
  if (!trimmed || /[<>:"/\\|?*\u0000-\u001f\u007f]/.test(trimmed) || /^[.]/.test(trimmed) || /[. ]$/.test(trimmed)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(trimmed)) throw new ExportError('Use a filename without slashes or special characters.');
  const extension = exportInfo(format).extension;
  const name = trimmed.toLowerCase().endsWith(extension) ? trimmed : `${trimmed.replace(/\.(pdf|pptx)$/i, '')}${extension}`;
  if (name.length > maximum || Buffer.byteLength(name) > maximum + 100) throw new ExportError('This filename is too long. Choose a shorter name.');
  return name;
}

/** Receipts survive a server restart; a hard link publishes a complete file without overwriting. */
export class ExportStore {
  private changes = new Map<string, Promise<unknown>>();
  constructor(private root: string) {}
  private async change<T>(id: string, run: () => Promise<T>): Promise<T> {
    const previous = this.changes.get(id);
    const next = (previous ?? Promise.resolve()).catch(() => {}).then(run);
    this.changes.set(id, next);
    try { return await next; } finally { if (this.changes.get(id) === next) this.changes.delete(id); }
  }
  private result(value: Receipt): SavedExport {
    const { digest: _, requestedName: __, deletedAt: ___, deletedFile: ____, ...result } = value;
    return result;
  }
  private async records() {
    const folder = await this.folder('.opendoc/exports');
    const records = await Promise.all((await readdir(folder)).filter(name => uuid.test(name.slice(0, -5)) && name.endsWith('.json')).map(async name => {
      try { return await this.receipt(name.slice(0, -5)); } catch { return undefined; }
    }));
    return records.filter((value): value is Receipt => !!value);
  }
  // CLI exports use a fixed filename. Adopt only that documented path,
  // never guess document membership from arbitrary PDF filenames.
  private async adoptCliExport(documentId: string, format: ExportFormat = 'pdf') {
    const extension = exportInfo(format).extension;
    const output = await this.folder('output');
    const path = resolve(output, `${documentId}${extension}`);
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink()) return;
      const records = await this.records();
      for (const record of records) {
        try {
          const snapshot = await lstat(resolve(this.root, '.opendoc/exports', `${record.id}${exportInfo(record.format).extension}`));
          if (snapshot.ino === info.ino && snapshot.dev === info.dev) return;
        } catch { /* Missing snapshots do not claim the file. */ }
      }
      const bytes = await readFile(path);
      if (format === 'pdf') { if (bytes.subarray(0, 5).toString() !== '%PDF-') return; }
      else { try { if (!(await readZip(bytes)).has('ppt/presentation.xml')) return; } catch { return; } }
      const key = digest(Buffer.from(`${documentId}:${info.dev}:${info.ino}:${info.mtimeMs}:${info.size}`));
      const id = `${key.slice(0, 8)}-${key.slice(8, 12)}-4${key.slice(13, 16)}-8${key.slice(17, 20)}-${key.slice(20, 32)}`;
      if (await this.receipt(id)) return;
      const folder = await this.folder('.opendoc/exports');
      const current = lstatSync(path);
      if (current.ino !== info.ino || current.dev !== info.dev || current.mtimeMs !== info.mtimeMs || current.size !== info.size || current.isSymbolicLink()) return;
      linkSync(path, resolve(folder, `${id}${extension}`));
      const receipt: Receipt = { id, documentId, format, hash: '', filename: `${documentId}${extension}`, path, bytes: bytes.length, createdAt: info.mtime.toISOString(), digest: digest(bytes), requestedName: `${documentId}${extension}` };
      await atomicWrite(resolve(folder, `${id}.json`), JSON.stringify(receipt));
    } catch (error) { if (!['ENOENT', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
  }
  async list(documentId: string): Promise<ExportHistoryEntry[]> {
    if (!validId(documentId)) throw new ExportError('Invalid document.');
    await this.change(`cli:${documentId}`, async () => { await this.adoptCliExport(documentId); await this.adoptCliExport(documentId, 'pptx'); });
    const records = (await this.records()).filter(value => value.documentId === documentId && !value.deletedAt);
    return Promise.all(records.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map(async value => {
      let available = false;
      try { available = !!await this.get(value.id); } catch { /* Retain history for changed files. */ }
      return { ...this.result(value), available };
    }));
  }
  async remove(id: string) {
    return this.change(id, async () => {
      const value = await this.receipt(id);
      if (!value) throw new ExportError('Export not found.', 404);
      if (value.deletedAt) return;
      let owned = false;
      try { owned = !!await this.get(id); } catch { /* Never remove an externally changed file. */ }
      const removed = { ...value, deletedAt: new Date().toISOString(), deletedFile: owned };
      const receiptPath = resolve(this.root, '.opendoc/exports', `${id}.json`);
      await atomicWrite(receiptPath, JSON.stringify(removed));
      if (owned) {
        try {
          const file = lstatSync(value.path), snapshot = lstatSync(resolve(this.root, '.opendoc/exports', `${id}${exportInfo(value.format).extension}`));
          if (!file.isSymbolicLink() && file.ino === snapshot.ino && file.dev === snapshot.dev && digest(readFileSync(value.path)) === value.digest) unlinkSync(value.path);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { await atomicWrite(receiptPath, JSON.stringify(value)); throw error; }
        }
      }
    });
  }
  async restore(id: string) {
    return this.change(id, async () => {
      const value = await this.receipt(id);
      if (!value) throw new ExportError('Export not found.', 404);
      if (!value.deletedAt) return this.result(value);
      if (value.deletedFile) {
        const snapshot = resolve(this.root, '.opendoc/exports', `${id}${exportInfo(value.format).extension}`);
        const info = await lstat(snapshot);
        if (!info.isFile() || info.isSymbolicLink() || digest(await readFile(snapshot)) !== value.digest) throw new ExportError('The saved copy has changed and cannot be restored.', 409);
        const output = await this.folder('output');
        let restored = false;
        const original = value.filename;
        for (let suffix = 1; suffix <= 10_000; suffix++) {
          const filename = suffix === 1 ? original : `${original.slice(0, -exportInfo(value.format).extension.length)} (${suffix})${exportInfo(value.format).extension}`;
          const path = resolve(output, filename);
          try { linkSync(snapshot, path); }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            const existing = lstatSync(path);
            if (existing.isSymbolicLink() || existing.ino !== info.ino || existing.dev !== info.dev) continue;
          }
          value.filename = filename; value.path = path; restored = true; break;
        }
        if (!restored) throw new ExportError('Too many files have this name.');
      }
      delete value.deletedAt; delete value.deletedFile;
      await atomicWrite(resolve(this.root, '.opendoc/exports', `${id}.json`), JSON.stringify(value));
      return this.result(value);
    });
  }
  private async folder(relative: string) {
    let path = this.root;
    for (const part of relative.split('/')) {
      path = resolve(path, part);
      await mkdir(path, { recursive: true });
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new ExportError('The local export folder must be a regular folder.');
      await containedFile(this.root, path);
    }
    return path;
  }
  private async receipt(id: string): Promise<Receipt | undefined> {
    if (!uuid.test(id)) throw new ExportError('Invalid export request.');
    const folder = await this.folder('.opendoc/exports');
    const path = resolve(folder, `${id}.json`);
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > maxReceiptBytes) throw new ExportError('The export receipt cannot be read.');
      const value = JSON.parse(await readFile(path, 'utf8')) as Receipt;
      if (value.id !== id || !validId(value.documentId) || value.filename !== exportFilename(value.filename, 140, exportFormat(value.format))
        || value.path !== resolve(this.root, 'output', value.filename) || !/^[a-f0-9]{64}$/.test(value.digest) || !Number.isFinite(Date.parse(value.createdAt)) || !Number.isSafeInteger(value.bytes) || value.bytes < 1) throw new ExportError('The export receipt is invalid.');
      assetProvenance(value);
      return value;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  }
  async get(id: string): Promise<SavedExport | undefined> {
    const value = await this.receipt(id);
    if (!value || value.deletedAt) return;
    await this.folder('output');
    try {
      const [output, snapshot] = await Promise.all([lstat(value.path), lstat(resolve(this.root, '.opendoc/exports', `${id}${exportInfo(value.format).extension}`))]);
      if (!output.isFile() || output.isSymbolicLink() || !snapshot.isFile() || snapshot.isSymbolicLink()
        || output.ino !== snapshot.ino || output.dev !== snapshot.dev) return;
      if (digest(await readFile(value.path)) !== value.digest) throw new ExportError('This exported file was changed outside OpenDoc. Export a new copy.', 409);
      return this.result(value);
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  }
  async bytes(id: string) {
    const result = await this.get(id);
    if (!result) throw new ExportError('This export could not be found. Export a new copy.', 404);
    const bytes = await readFile(result.path);
    const receipt = (await this.receipt(id))!;
    if (digest(bytes) !== receipt.digest) throw new ExportError('The exported file changed. Export a new copy.', 409);
    return { result, bytes };
  }
  async save(input: { id: string; documentId: string; hash: string; filename: string; format?: ExportFormat }, prepare: () => Promise<ExportPreparation>) {
    return this.change(input.id, () => this.saveInternal(input, prepare));
  }
  private async saveInternal(input: { id: string; documentId: string; hash: string; filename: string; format?: ExportFormat }, prepare: () => Promise<ExportPreparation>) {
    if (!uuid.test(input.id) || !validId(input.documentId) || typeof input.hash !== 'string' || !input.hash) throw new ExportError('Invalid export request.');
    const format = exportFormat(input.format);
    const filename = exportFilename(input.filename, 120, format);
    try { return await this.publish({ ...input, filename, format }, prepare); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOSPC') throw new ExportError('There is not enough disk space to save the file. Free some space and try again.');
      if (code && ['EACCES', 'EPERM', 'EROFS'].includes(code)) throw new ExportError('OpenDoc cannot write to the export folder. Check its permissions and try again.');
      if (code === 'EXDEV') throw new ExportError('The output folder and workspace must be on the same disk for a safe export.');
      throw error;
    }
  }
  private async publish(input: { id: string; documentId: string; hash: string; filename: string; format?: ExportFormat }, prepare: () => Promise<ExportPreparation>) {
    const previous = await this.receipt(input.id);
    if (previous && (previous.documentId !== input.documentId || previous.hash !== input.hash || previous.requestedName !== input.filename || (previous.format ?? 'pdf') !== (input.format ?? 'pdf'))) throw new ExportError('This export request belongs to another file.', 409);
    if (previous?.deletedAt) throw new ExportError('This export was deleted. Start a new export.', 409);
    const saved = await this.get(input.id);
    if (saved) return saved;
    const prepared = await prepare();
    const { bytes, isCurrent } = prepared;
    const provenance = assetProvenance(prepared);
    if (input.format === 'pptx') {
      try {
        const parts = await readZip(bytes);
        if (!parts.has('ppt/presentation.xml') || !parts.has('[Content_Types].xml') || !parts.has('ppt/slides/slide1.xml')) throw new Error('Missing presentation parts');
      } catch { throw new ExportError('The PowerPoint file is incomplete. Try exporting again.'); }
    } else if (!bytes.length || Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') throw new ExportError('The PDF is incomplete. Wait for a valid preview and try again.');
    const folder = await this.folder('.opendoc/exports');
    const output = await this.folder('output');
    const snapshot = resolve(folder, `${input.id}${exportInfo(input.format).extension}`);
    // A receipt without a published link is an interrupted preparation, safe to retry.
    await rm(snapshot, { force: true });
    let published = false;
    try {
      await writeFile(snapshot, bytes, { flag: 'wx' });
      const contentDigest = digest(bytes);
      for (let suffix = 1; suffix <= 10_000; suffix++) {
        const filename = suffix === 1 ? input.filename : `${input.filename.slice(0, -exportInfo(input.format).extension.length)} (${suffix})${exportInfo(input.format).extension}`;
        const receipt: Receipt = { format: input.format, id: input.id, documentId: input.documentId, hash: input.hash, filename, path: resolve(output, filename), bytes: bytes.length, createdAt: new Date().toISOString(), digest: contentDigest, requestedName: input.filename, ...provenance };
        const serialized = JSON.stringify(receipt);
        if (Buffer.byteLength(serialized) > maxReceiptBytes) throw new ExportError('This document has too much asset provenance for one saved export.');
        await atomicWrite(resolve(folder, `${input.id}.json`), serialized);
        if (!isCurrent()) throw new ExportChangedError();
        try { linkSync(snapshot, receipt.path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue; throw error; }
        published = true;
        const { digest: _, requestedName: __, ...result } = receipt;
        return result;
      }
      throw new ExportError('Too many files have this name. Choose another filename.');
    } finally {
      if (!published) { await rm(snapshot, { force: true }); await rm(resolve(folder, `${input.id}.json`), { force: true }); }
    }
  }
  async reveal(id: string) {
    const value = await this.get(id);
    if (!value) throw new ExportError('This exported file is no longer available.', 404);
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
    const args = process.platform === 'darwin' ? ['-R', value.path] : process.platform === 'win32' ? [`/select,${value.path}`] : [resolve(this.root, 'output')];
    try { await promisify(execFile)(command, args, { timeout: 10_000 }); }
    catch { throw new ExportError(`Could not open the file manager. Your file is saved at ${value.path}.`); }
  }
  async copy(id: string) {
    const value = await this.get(id);
    if (!value) throw new ExportError('This exported file is no longer available. Export a new copy.', 404);
    await copyFileToClipboard(value.path);
  }
}
