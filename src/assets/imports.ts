import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import type { AssetFile, FontCompatibility, FontFace } from '../shared/assets';
import { runtimeResolve, runtimeSource } from '../runtime/paths';

export interface UploadFile { filename: string; bytes: Uint8Array }
export interface PreparedFile extends AssetFile { contents: Uint8Array }
export interface PreparedLogo { original: PreparedFile; image: PreparedFile }
export interface PreparedFonts {
  name: string;
  description: string;
  faces: Array<Omit<FontFace, 'file'> & { file: PreparedFile }>;
  compatibility: FontCompatibility;
  specimen?: PreparedFile;
}

export function preparedFile(contents: Uint8Array, extension: string, mime: string, dimensions?: { width: number; height: number }): PreparedFile {
  const hash = createHash('sha256').update(contents).digest('hex');
  return { file: `files/${hash}.${extension}`, hash, mime, bytes: contents.byteLength, ...dimensions, contents };
}

type PreparedMedia = { image: PreparedFile };
type ImportResult = PreparedLogo | PreparedFonts | PreparedMedia;
const cache = new Map<string, { result: ImportResult; size: number }>();
const pending = new Map<string, Promise<ImportResult>>();
let cachedBytes = 0;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
let activeWorkers = 0;
const waitingWorkers: Array<() => void> = [];

async function withWorkerSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeWorkers < 2) activeWorkers++;
  else await new Promise<void>(accept => waitingWorkers.push(accept));
  try { return await work(); }
  finally {
    const next = waitingWorkers.shift();
    if (next) next();
    else activeWorkers--;
  }
}

function resultSize(result: ImportResult) {
  const files = 'faces' in result ? [...result.faces.map(face => face.file), ...(result.specimen ? [result.specimen] : [])] : [...('original' in result ? [result.original] : []), result.image];
  return files.reduce((sum, file) => sum + file.bytes, 0);
}

/** Native parsers and PDF shaping run outside the server, with a hard time limit. */
async function runImport<T extends ImportResult>(kind: 'logo' | 'fonts' | 'media', files: UploadFile[], root?: string): Promise<T> {
  const key = createHash('sha256').update(kind).update(files.map(file => `${extname(file.filename).toLowerCase()}:${createHash('sha256').update(file.bytes).digest('hex')}`).join('|')).digest('hex');
  const cached = cache.get(key);
  if (cached) { cache.delete(key); cache.set(key, cached); return cached.result as T; }
  const underway = pending.get(key);
  if (underway) return underway as Promise<T>;
  const promise = withWorkerSlot(() => new Promise<T>((accept, reject) => {
    const child = fork(runtimeSource('assets/import-worker.ts'), [], {
      cwd: root,
      execArgv: ['--max-old-space-size=512', '--import', runtimeResolve('tsx')],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced',
    });
    let result: T | undefined;
    let failure: string | undefined;
    let stderr = '';
    child.stderr?.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-2000); });
    const timer = setTimeout(() => { failure = `${kind === 'fonts' ? 'Font validation' : 'Image preparation'} took too long. Try a simpler or smaller file.`; child.kill('SIGKILL'); }, 30_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.on('message', (message: { ok: boolean; result?: T; error?: string }) => {
      if (message.ok) result = message.result;
      else failure = message.error ?? 'The asset could not be prepared.';
    });
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0 && result && !failure) accept(result);
      else reject(new Error(failure ?? (stderr ? `The asset parser could not read this file: ${stderr}` : 'The asset parser stopped before validation completed.')));
    });
    child.send({ kind, files }, error => { if (error) { failure = 'The asset could not be sent for validation.'; child.kill(); } });
  }));
  pending.set(key, promise);
  try {
    const result = await promise;
    const size = resultSize(result);
    if (size <= MAX_CACHE_BYTES) {
      while (cache.size >= 8 || cachedBytes + size > MAX_CACHE_BYTES) {
        const oldest = cache.keys().next().value;
        if (!oldest) break;
        cachedBytes -= cache.get(oldest)!.size;
        cache.delete(oldest);
      }
      cache.set(key, { result, size }); cachedBytes += size;
    }
    return result;
  } finally { pending.delete(key); }
}

function requireUpload(file: UploadFile) {
  if (!file || typeof file.filename !== 'string' || !(file.bytes instanceof Uint8Array) || !file.bytes.byteLength) throw new Error('Choose a nonempty local file.');
}

export async function prepareLogo(file: UploadFile): Promise<PreparedLogo> {
  requireUpload(file);
  const extension = extname(file.filename).toLowerCase();
  if (!['.png', '.svg'].includes(extension)) throw new Error('Logos accept SVG or PNG files.');
  const limit = extension === '.svg' ? 5 : 50;
  if (file.bytes.byteLength > limit * 1024 * 1024) throw new Error(`${extension === '.svg' ? 'SVG' : 'PNG'} logos must be ${limit} MB or smaller.`);
  return runImport<PreparedLogo>('logo', [file]);
}

export async function prepareFonts(root: string, files: UploadFile[]): Promise<PreparedFonts> {
  if (!Array.isArray(files) || !files.length || files.length > 24) throw new Error('Choose between 1 and 24 static TTF or OTF faces from one font family.');
  for (const file of files) {
    requireUpload(file);
    if (!['.ttf', '.otf'].includes(extname(file.filename).toLowerCase())) throw new Error('Fonts accept static TTF or OTF files. Web fonts, collections, and variable fonts are not supported.');
  }
  if (files.reduce((sum, file) => sum + file.bytes.byteLength, 0) > 100 * 1024 * 1024) throw new Error('A font import must be 100 MB or smaller.');
  return runImport<PreparedFonts>('fonts', files, root);
}

/** Original document media uses the same bounded image parser as managed logos. */
export async function prepareMediaImage(file: UploadFile): Promise<PreparedFile> {
  requireUpload(file);
  if (!['.png', '.jpg', '.jpeg'].includes(extname(file.filename).toLowerCase())) throw new Error('Document media accepts PNG or JPEG images.');
  if (file.bytes.byteLength > 50_000_000) throw new Error('Keep an embedding image below 50 MB.');
  return (await runImport<PreparedMedia>('media', [file])).image;
}
