import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { atomicWrite, withLocalLock } from './files';
import { Conflict } from './comments';
import { documentEntry, validId } from './render';
import { compareBlocks, isBlockSource, snapshotBlocks } from './history-blocks';
import { historyFolder, trackedSourcePath } from './history-paths';
import { historyOriginLabels, type HistoryOrigin, type HistoryVersionSummary, type RestoreScope } from '../shared/history';

export { historyFolder, trackedSourcePath } from './history-paths';
export const historyFormat = 1;
export const defaultRetentionDays = 90;
const maxStoredBytes = 1024 * 1024;
const textExtensions = /\.(?:tsx|ts|jsx|js|mjs|cjs|json|csv|tsv|txt|md|yaml|yml|xml)$/i;
const versionName = /^(\d{8}T\d{9}Z-[a-f0-9]{8})(?:.*)\.json$/;
const blobName = /^([a-f0-9]{64})\.gz$/;
const hashPattern = /^[a-f0-9]{64}$/;
const origins = new Set<HistoryOrigin>(['baseline', 'edit', 'undo', 'external', 'restore']);

export interface HistoryFileEntry { hash: string; size: number }
/** One immutable version manifest. Text files point at compressed, content-addressed blobs. */
export interface HistoryVersion {
  format: number;
  id: string;
  documentId: string;
  at: string;
  origin: HistoryOrigin;
  /** Stored text sources, relative to the document folder. */
  files: Record<string, HistoryFileEntry>;
  /** Media and other binary or oversized files: identified by hash, never copied or restored. */
  recorded: Record<string, string>;
  summary: { blocks: number; ids: string[]; files: string[] };
  restore?: { from: string; scope: RestoreScope; blockId?: string };
}

export const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const posix = (path: string) => path.split(sep).join('/');

export interface Snapshot { text: Map<string, { hash: string; size: number; content: string }>; recorded: Map<string, string> }

/** A stable digest of the stored text sources, used to detect intervening changes. */
export function snapshotDigest(files: Iterable<[string, { hash: string }]>) {
  return sha256([...files].map(([path, file]) => `${path}\0${file.hash}`).sort().join('\n'));
}

function validRecord(value: unknown): value is HistoryVersion {
  if (!value || typeof value !== 'object') return false;
  const record = value as HistoryVersion;
  return record.format === historyFormat && typeof record.id === 'string' && /^\d{8}T\d{9}Z-[a-f0-9]{8}$/.test(record.id)
    && typeof record.documentId === 'string' && typeof record.at === 'string' && Number.isFinite(Date.parse(record.at))
    && origins.has(record.origin) && !!record.files && typeof record.files === 'object' && !Array.isArray(record.files)
    && Object.entries(record.files).every(([path, file]) => trackedSourcePath(path) && !!file && hashPattern.test(file.hash) && Number.isInteger(file.size))
    && !!record.recorded && typeof record.recorded === 'object' && Object.values(record.recorded).every(hash => typeof hash === 'string' && hashPattern.test(hash))
    && !!record.summary && Number.isInteger(record.summary.blocks) && Array.isArray(record.summary.ids) && Array.isArray(record.summary.files);
}

export function summarize(record: HistoryVersion, unavailable: string[] = []): HistoryVersionSummary {
  return {
    id: record.id, at: record.at, origin: record.origin, label: historyOriginLabels[record.origin], summary: record.summary,
    ...(record.restore ? { restore: record.restore } : {}), ...(unavailable.length ? { unavailable } : {}),
  };
}

const sameFiles = (a: Record<string, HistoryFileEntry>, b: Record<string, HistoryFileEntry>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && b[key].hash === a[key].hash);
};

export class HistoryError extends Error { constructor(message: string, public status = 400) { super(message); } }

/**
 * Append-only history for one workspace. Every version is its own immutable manifest file,
 * so two synced machines never edit the same file; conflict copies of a manifest are
 * recognised by the ID they contain and collapse into one version.
 */
export class HistoryStore {
  readonly retentionDays: number;
  private now: () => number;
  private hashes = new Map<string, { size: number; mtimeMs: number; hash: string }>();
  private blobs = new Map<string, string>();
  constructor(public root: string, options: { now?: () => number; retentionDays?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.retentionDays = options.retentionDays ?? defaultRetentionDays;
  }

  async folder(id: string) {
    if (!validId(id)) throw new HistoryError('Invalid document ID.');
    const entry = await documentEntry(this.root, id);
    return resolve(entry, '..');
  }

  private async history(id: string) { return resolve(await this.folder(id), historyFolder); }

  /** Read the document's owned text sources and record everything else by hash. */
  async snapshot(id: string): Promise<Snapshot> {
    const base = await this.folder(id);
    const text: Snapshot['text'] = new Map(), recorded: Snapshot['recorded'] = new Map();
    const visit = async (directory: string) => {
      for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const path = resolve(directory, entry.name);
        const name = posix(relative(base, path));
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name.endsWith('.tmp') || entry.name.startsWith('.forme-render-')) continue;
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) { await visit(path); continue; }
        if (!entry.isFile() || name === 'comments.json') continue;
        const info = await stat(path);
        if (trackedSourcePath(name) && textExtensions.test(name) && info.size <= maxStoredBytes) {
          const bytes = await readFile(path);
          text.set(name, { hash: sha256(bytes), size: bytes.length, content: bytes.toString('utf8') });
        } else {
          const cached = this.hashes.get(path);
          if (cached && cached.size === info.size && cached.mtimeMs === info.mtimeMs) recorded.set(name, cached.hash);
          else {
            const hash = sha256(await readFile(path));
            this.hashes.set(path, { size: info.size, mtimeMs: info.mtimeMs, hash });
            recorded.set(name, hash);
          }
        }
      }
    };
    await visit(base);
    return { text, recorded };
  }

  /** All readable manifests, oldest first. Damaged or partially synced files are skipped, not deleted. */
  private async manifests(id: string) {
    const folder = resolve(await this.history(id), 'versions');
    const byId = new Map<string, { record: HistoryVersion; names: string[] }>();
    let damaged = 0;
    let names: string[] = [];
    try { names = await readdir(folder); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    for (const name of names) {
      const match = versionName.exec(name);
      if (!match) continue;
      try {
        const record = JSON.parse(await readFile(resolve(folder, name), 'utf8'));
        if (!validRecord(record) || record.id !== match[1] || record.documentId !== id) { damaged++; continue; }
        const existing = byId.get(record.id);
        if (existing) existing.names.push(name); else byId.set(record.id, { record, names: [name] });
      } catch { damaged++; }
    }
    const records = [...byId.values()].sort((a, b) => Date.parse(a.record.at) - Date.parse(b.record.at) || a.record.id.localeCompare(b.record.id));
    return { folder, records, damaged };
  }

  /** Versions oldest first; consecutive identical states (for example from two synced machines) collapse. */
  async versions(id: string): Promise<HistoryVersion[]> {
    const { records } = await this.manifests(id);
    const result: HistoryVersion[] = [];
    for (const { record } of records) if (!result.length || !sameFiles(result.at(-1)!.files, record.files) || record.origin === 'restore') result.push(record);
    return result;
  }

  async list(id: string): Promise<HistoryVersionSummary[]> {
    const versions = await this.versions(id);
    const available = new Set<string>();
    try { for (const name of await readdir(resolve(await this.history(id), 'blobs'))) { const match = blobName.exec(name); if (match) available.add(match[1]); } }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return versions.map(record => summarize(record, Object.entries(record.files).filter(([, file]) => !available.has(file.hash)).map(([path]) => path))).reverse();
  }

  async version(id: string, versionId: string) {
    if (!/^\d{8}T\d{9}Z-[a-f0-9]{8}$/.test(versionId)) throw new HistoryError('Unknown version.', 404);
    const record = (await this.manifests(id)).records.find(item => item.record.id === versionId)?.record;
    if (!record) throw new HistoryError('That version is no longer in this document’s history.', 404);
    return record;
  }

  /** Read and verify one stored text file. */
  async readBlob(id: string, hash: string) {
    if (!hashPattern.test(hash)) throw new HistoryError('Invalid stored file.');
    const cached = this.blobs.get(hash);
    if (cached !== undefined) return cached;
    let bytes: Buffer;
    try { bytes = gunzipSync(await readFile(resolve(await this.history(id), 'blobs', `${hash}.gz`))); }
    catch { throw new HistoryError('A stored file for this version is missing or incomplete. If the folder is still syncing, try again later.', 409); }
    if (sha256(bytes) !== hash) throw new HistoryError('A stored file for this version is damaged. Choose another version.', 409);
    const text = bytes.toString('utf8');
    if (this.blobs.size > 64) this.blobs.delete(this.blobs.keys().next().value!);
    this.blobs.set(hash, text);
    return text;
  }

  async versionFiles(id: string, record: HistoryVersion) {
    const files = new Map<string, string>();
    for (const [path, file] of Object.entries(record.files)) files.set(path, await this.readBlob(id, file.hash));
    return files;
  }

  private lock<T>(id: string, action: () => Promise<T>) {
    return withLocalLock(this.root, `history-${id}.lock`, () => new Conflict('History is being updated. Retry in a moment.'), action);
  }

  private async header(id: string) {
    const folder = await this.history(id);
    const file = resolve(folder, 'history.json');
    try {
      const value = JSON.parse(await readFile(file, 'utf8'));
      if (Number.isInteger(value?.format) && value.format > historyFormat) throw new HistoryError('This history was written by a newer OpenDoc. Update OpenDoc to record new versions.', 409);
    } catch (error) {
      if (error instanceof HistoryError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      await atomicWrite(file, JSON.stringify({ format: historyFormat, retentionDays: this.retentionDays, about: 'OpenDoc version history for this document. Each file in versions/ is one recorded version; blobs/ holds compressed text sources.' }, null, 2) + '\n');
    }
    return folder;
  }

  /**
   * Record the current text sources when they differ from the latest version.
   * The first version of a document is its baseline, whatever prompted it.
   */
  async capture(id: string, origin: HistoryOrigin, extra: Pick<HistoryVersion, 'restore'> = {}): Promise<{ version: HistoryVersion | null; latest: HistoryVersion | null }> {
    return this.lock(id, async () => {
      const folder = await this.header(id);
      const snapshot = await this.snapshot(id);
      const existing = await this.versions(id);
      const latest = existing.at(-1) ?? null;
      const files = Object.fromEntries([...snapshot.text].map(([path, file]) => [path, { hash: file.hash, size: file.size }]));
      if (latest && sameFiles(latest.files, files)) { await this.pruneLocked(id); return { version: null, latest }; }
      const at = new Date(this.now()).toISOString();
      const record: HistoryVersion = {
        format: historyFormat, id: `${at.replace(/[-:.]/g, '')}-${randomBytes(4).toString('hex')}`, documentId: id, at,
        origin: latest ? origin : 'baseline', files, recorded: Object.fromEntries(snapshot.recorded),
        summary: latest ? await this.changeSummary(id, latest, snapshot) : { blocks: 0, ids: [], files: [] },
        ...(extra.restore ? { restore: extra.restore } : {}),
      };
      await mkdir(resolve(folder, 'blobs'), { recursive: true });
      for (const file of snapshot.text.values()) {
        const target = resolve(folder, 'blobs', `${file.hash}.gz`);
        if (await lstat(target).then(info => info.isFile(), () => false)) continue;
        await atomicWrite(target, gzipSync(Buffer.from(file.content, 'utf8'), { level: 9 }));
      }
      // Blobs land before their manifest, so a listed version never points at a missing local file.
      await atomicWrite(resolve(folder, 'versions', `${record.id}.json`), JSON.stringify(record, null, 2) + '\n');
      await this.pruneLocked(id);
      return { version: record, latest: record };
    });
  }

  private async changeSummary(id: string, previous: HistoryVersion, snapshot: Snapshot): Promise<HistoryVersion['summary']> {
    const changed = new Set<string>();
    for (const path of new Set([...Object.keys(previous.files), ...snapshot.text.keys()])) {
      if (previous.files[path]?.hash !== snapshot.text.get(path)?.hash) changed.add(path);
    }
    let blockChanges: string[] = [];
    try {
      const before = new Map<string, string>(), after = new Map<string, string>();
      for (const [path, file] of snapshot.text) if (isBlockSource(path)) after.set(path, file.content);
      for (const [path, file] of Object.entries(previous.files)) {
        if (!isBlockSource(path)) continue;
        const current = snapshot.text.get(path);
        before.set(path, current?.hash === file.hash ? current.content : await this.readBlob(id, file.hash));
      }
      blockChanges = compareBlocks(snapshotBlocks(before), snapshotBlocks(after)).filter(change => change.status !== 'contents').map(change => change.id);
    } catch { /* A missing earlier blob only limits the summary. */ }
    return { blocks: blockChanges.length, ids: blockChanges.slice(0, 12), files: [...changed].sort() };
  }

  async prune(id: string) { return this.lock(id, () => this.pruneLocked(id)); }

  /** Remove versions older than the retention period, always keeping the latest one, then unreferenced blobs. */
  private async pruneLocked(id: string) {
    const { folder, records, damaged } = await this.manifests(id);
    const cutoff = this.now() - this.retentionDays * 86_400_000;
    const latest = records.at(-1);
    const kept = new Set<string>();
    let removed = 0;
    for (const item of records) {
      if (item !== latest && Date.parse(item.record.at) < cutoff) {
        for (const name of item.names) await rm(resolve(folder, name), { force: true });
        removed++;
      } else for (const file of Object.values(item.record.files)) kept.add(file.hash);
    }
    // A manifest that is still arriving through sync may reference blobs we cannot see yet.
    if (damaged) return { removed, blobs: 0 };
    let blobs = 0;
    const blobFolder = resolve(folder, '..', 'blobs');
    let names: string[] = [];
    try { names = await readdir(blobFolder); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    for (const name of names) {
      const match = blobName.exec(name);
      const path = resolve(blobFolder, name);
      if (match && kept.has(match[1])) continue;
      if (!match && !name.endsWith('.tmp')) continue;
      // Leave recent files alone: another machine's manifest may not have synced yet.
      const info = await stat(path).catch(() => undefined);
      if (!info || this.now() - info.mtimeMs < 3_600_000) continue;
      await rm(path, { force: true }); blobs++;
    }
    return { removed, blobs };
  }
}

/**
 * Debounces watcher events per document so one save, or one burst of agent writes,
 * becomes one version. OpenDoc's own writes record immediately with their origin.
 */
export class HistoryRecorder {
  private timers = new Map<string, { timer: ReturnType<typeof setTimeout>; first: number }>();
  private queues = new Map<string, Promise<unknown>>();
  private closed = false;
  constructor(public store: HistoryStore, private onError: (error: unknown) => void = () => {}, private quietMs = 2_500, private maxWaitMs = 15_000) {}

  /** Returns the owning document when a workspace path is a versioned source. */
  noteChange(path: string) {
    if (this.closed) return undefined;
    const parts = posix(relative(this.store.root, resolve(this.store.root, path))).split('/');
    if (parts[0] !== 'documents' || !validId(parts[1] ?? '')) return undefined;
    if (parts.length > 2 && !trackedSourcePath(parts.slice(2).join('/'))) return undefined;
    this.schedule(parts[1]);
    return parts[1];
  }

  schedule(id: string) {
    const pending = this.timers.get(id);
    const first = pending?.first ?? Date.now();
    if (pending) clearTimeout(pending.timer);
    const wait = Math.max(0, Math.min(this.quietMs, first + this.maxWaitMs - Date.now()));
    const timer = setTimeout(() => { this.timers.delete(id); void this.record(id, 'external').catch(this.onError); }, wait);
    this.timers.set(id, { timer, first });
  }

  pending(id: string) { return this.timers.has(id); }

  private serialize<T>(id: string, operation: () => Promise<T>) {
    const next = (this.queues.get(id) ?? Promise.resolve()).catch(() => undefined).then(operation);
    this.queues.set(id, next);
    void next.finally(() => { if (this.queues.get(id) === next) this.queues.delete(id); }).catch(() => undefined);
    return next;
  }

  /** Record now, cancelling a pending debounced capture for the same document. */
  record(id: string, origin: HistoryOrigin, extra: Pick<HistoryVersion, 'restore'> = {}) {
    const pending = this.timers.get(id);
    if (pending) { clearTimeout(pending.timer); this.timers.delete(id); }
    return this.serialize(id, async () => {
      try { return (await this.store.capture(id, origin, extra)).version; }
      catch (error) {
        // A deleted or moved document has nothing left to record.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' || /Invalid document ID/.test(String(error))) return null;
        throw error;
      }
    });
  }

  /** Capture outstanding outside changes before OpenDoc writes, so they keep their own version. */
  flush(id: string) { return this.record(id, 'external'); }

  async close() {
    this.closed = true;
    for (const { timer } of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await Promise.allSettled([...this.queues.values()]);
  }
}
