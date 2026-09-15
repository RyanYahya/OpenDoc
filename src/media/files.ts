import { readFileSync, realpathSync, lstatSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { resolve, relative, sep, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import type { MediaMeta, MediaKind } from '../shared/media';

export const mediaId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const kinds: MediaKind[] = ['photo', 'illustration', 'chart', 'diagram', 'image'];
function fileHash(file: string) {
  const info = statSync(file, {bigint:true});
  const stamp = `${info.size}:${info.mtimeNs}:${info.ctimeNs}:${info.ino}`;
  const digest = createHash('sha256'), buffer = Buffer.allocUnsafe(64 * 1024);
  const fd = openSync(file, 'r');
  try { let count; while ((count = readSync(fd, buffer, 0, buffer.length, null)) > 0) digest.update(buffer.subarray(0,count)); }
  finally { closeSync(fd); }
  const after = statSync(file,{bigint:true});
  if (`${after.size}:${after.mtimeNs}:${after.ctimeNs}:${after.ino}` !== stamp) throw new Error('A source changed while it was being read. Try again after the edit finishes.');
  return digest.digest('hex');
}
export const hashBytes = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export function localPath(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.')) || /[\u0000-\u001f]/.test(value)) throw new Error(`${label} must be a relative local path without hidden files or parent traversal.`);
}
/** Refuse symlinks as well as paths outside the owning folder. */
export function ownedFile(directory: string, name: string) {
  localPath(name, 'File path');
  const base = realpathSync(directory);
  let current = base;
  for (const part of name.split('/')) {
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error('Linked files are not supported. Copy the file into the owning document.');
  }
  const file = realpathSync(current);
  const rel = relative(base, file);
  if (rel === '..' || rel.startsWith(`..${sep}`) || !statSync(file).isFile()) throw new Error('Expected a regular file inside the owning folder.');
  return file;
}
export function mediaDirectory(document: string, id: string) {
  if (!mediaId.test(id)) throw new Error('Use a lowercase media folder name with single hyphens.');
  const base = realpathSync(document);
  const dir = resolve(base, 'media', id);
  for (const folder of [resolve(base, 'media'), dir]) if (lstatSync(folder).isSymbolicLink() || !lstatSync(folder).isDirectory()) throw new Error('Media must live in ordinary folders inside its document.');
  return dir;
}
export function parseMediaMeta(value: unknown): MediaMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('meta.json must contain a media record.');
  const v = value as Record<string, unknown>;
  const keys = ['title', 'description', 'file', 'kind', 'alt', 'sources', 'data', 'recipe', 'attribution'];
  for (const key of Object.keys(v)) if (!keys.includes(key)) throw new Error(`Unknown media field: ${key}.`);
  for (const key of ['title', 'description']) if (typeof v[key] !== 'string' || !(v[key] as string).trim() || (v[key] as string).length > (key === 'title' ? 200 : 4000)) throw new Error(`Media ${key} must be nonempty text (${key === 'title' ? 200 : 4000} characters maximum).`);
  localPath(v.file, 'Media file');
  if (!['.png', '.jpg', '.jpeg'].includes(extname(v.file).toLowerCase())) throw new Error('The embedding image must be PNG or JPEG. Keep other originals beside it and export a PNG copy.');
  if (!kinds.includes(v.kind as MediaKind)) throw new Error(`Media kind must be ${kinds.join(', ')}.`);
  for (const key of ['alt', 'attribution']) if (v[key] !== undefined && (typeof v[key] !== 'string' || !(v[key] as string).trim())) throw new Error(`Media ${key} must be nonempty text when provided.`);
  for (const key of ['data', 'recipe']) if (v[key] !== undefined) localPath(v[key], `Media ${key}`);
  if (v.sources !== undefined) {
    if (!Array.isArray(v.sources)) throw new Error('Media sources must be a list of provenance notes or locations.');
    for (const source of v.sources) if (typeof source !== 'string' || !source.trim() || source.length > 4000 || /[\u0000-\u001f]/.test(source)) throw new Error('Each source reference must be nonempty text, up to 4,000 characters.');
    if (new Set(v.sources).size !== v.sources.length) throw new Error('Media source references must be unique.');
  }
  return v as unknown as MediaMeta;
}
export function imageInfo(bytes: Buffer) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16) === 'IHDR') {
    return checkedImage('image/png', bytes.readUInt32BE(16), bytes.readUInt32BE(20));
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const size = bytes.readUInt16BE(offset);
      if (size < 2 || offset + size > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && size >= 7) return checkedImage('image/jpeg',bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3));
      offset += size;
    }
  }
  throw new Error('The image is not a readable PNG or JPEG. Export it again from its original.');
}
function checkedImage(mime: string, width: number, height: number) {
  if (!width || !height || width * height > 100_000_000) throw new Error('Media image dimensions must be positive and no more than 100 megapixels.');
  return { mime, width, height };
}
export function readMedia(document: string, id: string) {
  const directory = mediaDirectory(document, id);
  const metaFile = ownedFile(directory, 'meta.json');
  if (statSync(metaFile).size > 32_000) throw new Error('Keep media metadata below 32 KB.');
  const meta = parseMediaMeta(JSON.parse(readFileSync(metaFile, 'utf8')));
  const image = ownedFile(directory, meta.file);
  if (statSync(image).size > 50_000_000) throw new Error('Keep an embedding image below 50 MB.');
  const bytes = readFileSync(image);
  const info = imageInfo(bytes);
  if (info.mime !== (extname(meta.file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg')) throw new Error('The image extension does not match its contents.');
  const inputs: Record<string, string> = Object.create(null);
  for (const path of [meta.data, meta.recipe]) if (path) inputs[`media/${id}/${path}`] = fileHash(ownedFile(directory, path));
  return { directory, meta, image, bytes, ...info, hash: hashBytes(bytes), inputs };
}
export interface GenerationRecord { version: 1; imageHash: string; inputs: Record<string,string>; recordedAt: string }
export function mediaFreshness(media: ReturnType<typeof readMedia>) {
  if (!Object.keys(media.inputs).length) return { freshness: 'original' as const, changedInputs: [] };
  try {
    const file = ownedFile(media.directory, 'generation.json');
    if (statSync(file).size > 64_000) throw new Error('Generation record is too large.');
    const record = JSON.parse(readFileSync(file, 'utf8')) as GenerationRecord;
    if (record.version !== 1 || !record.inputs || typeof record.inputs !== 'object' || Array.isArray(record.inputs) || typeof record.imageHash !== 'string') throw new Error('Invalid generation.json. Regenerate and record this image again.');
    // Older records may include original-source hashes. Those remain historical notes.
    const prefix = `media/${basename(media.directory)}/`;
    const recordedInputs = Object.keys(record.inputs).filter(key => key.startsWith(prefix));
    const changedInputs = [...new Set([...recordedInputs, ...Object.keys(media.inputs)])].filter(key => record.inputs[key] !== media.inputs[key]);
    if (record.imageHash !== media.hash) changedInputs.push(media.meta.file);
    return { freshness: changedInputs.length ? 'stale' as const : 'current' as const, changedInputs };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { freshness: 'unrecorded' as const, changedInputs: [] };
    throw error;
  }
}
