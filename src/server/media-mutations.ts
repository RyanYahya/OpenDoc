import { constants, lstatSync, mkdirSync, openSync, closeSync, fstatSync, readFileSync, renameSync, realpathSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { prepareMediaImage, type UploadFile } from '../assets/imports';
import { hashBytes, mediaId, parseMediaMeta } from '../media/files';
import type { MediaKind, MediaMeta } from '../shared/media';
import { Conflict, withCommentLock } from './comments';
import { documentEntry } from './render';

export interface MediaImportMetadata {
  id?: string;
  title: string;
  description: string;
  kind: MediaKind;
  alt?: string;
  attribution?: string;
  sources?: string[];
}
export interface MediaMutationResult { documentId: string; id: string; metadataRevision: string }
const editable = ['title', 'description', 'kind', 'alt', 'attribution', 'sources'] as const;
const known = [...editable, 'file', 'data', 'recipe'];
const metadataHash = (meta: unknown) => hashBytes(Buffer.from(JSON.stringify(meta)));

/** Check each component before creating the next one; never follow a linked folder. */
function ordinaryDirectory(root: string, parts: string[], create = false) {
  let path = root;
  for (const part of parts) {
    path = resolve(path, part);
    let info;
    try { info = lstatSync(path); }
    catch (error) {
      if (!create || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try { mkdirSync(path); } catch (failure) { if ((failure as NodeJS.ErrnoException).code !== 'EEXIST') throw failure; }
      info = lstatSync(path);
    }
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Document media must stay in ordinary local folders, without symbolic links.');
  }
  return path;
}

async function ownerDirectory(root: string, documentId: string) {
  const entry = await documentEntry(root, documentId);
  const directory = ordinaryDirectory(root, ['documents', documentId]);
  const info = lstatSync(resolve(directory, 'index.tsx'));
  if (!info.isFile() || info.isSymbolicLink() || entry !== resolve(directory, 'index.tsx')) throw new Error('Choose an ordinary document in this workspace as the media owner.');
  return directory;
}

function readMetadata(folder: string) {
  const file = resolve(folder, 'meta.json');
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > 32_000) throw new Error('Keep media metadata in a regular local file below 32 KB.');
    const value = JSON.parse(readFileSync(fd, 'utf8')) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('meta.json must contain a media record.');
    const raw = value as Record<string, unknown>;
    // Preserve future or source-specific fields without giving this editor authority to change them.
    parseMediaMeta(Object.fromEntries(Object.entries(raw).filter(([key]) => known.includes(key as (typeof known)[number]))));
    return raw;
  } finally { closeSync(fd); }
}

function metadataText(meta: unknown) {
  const text = JSON.stringify(meta, null, 2) + '\n';
  if (Buffer.byteLength(text) > 32_000) throw new Error('Keep media metadata below 32 KB.');
  return text;
}

function stagingRoot(root: string) {
  const directory = ordinaryDirectory(root, ['.opendoc', 'media-imports'], true);
  // A killed import can leave its private stage behind. Only remove dead-process stages
  // with the exact files this service owns; leave any unexpected user material alone.
  for (const name of readdirSync(directory)) {
    const match = /^(\d+)-[0-9a-f-]{36}$/.exec(name);
    if (!match) continue;
    try {
      const path = resolve(directory, name);
      const info = lstatSync(path);
      if (!info.isDirectory() || info.isSymbolicLink()) continue;
      try { process.kill(Number(match[1]), 0); continue; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') continue; }
      const entries = readdirSync(path, { withFileTypes: true });
      if (entries.every(entry => entry.isFile() && ['image.png', 'image.jpg', 'meta.json'].includes(entry.name))) rmSync(path, { recursive: true, force: true });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return directory;
}

function prepareDocumentLock(root: string, documentId: string) {
  const directory = ordinaryDirectory(root, ['.opendoc', 'locks'], true);
  try {
    const info = lstatSync(resolve(directory, `${documentId}.lock`));
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('The document lock must be an ordinary local folder, without symbolic links.');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

export async function importMedia(root: string, documentId: string, metadata: MediaImportMetadata, file: UploadFile): Promise<MediaMutationResult> {
  const workspace = realpathSync(root);
  await ownerDirectory(workspace, documentId);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Give the image a title, description, and kind.');
  for (const key of Object.keys(metadata)) if (key !== 'id' && !editable.includes(key as (typeof editable)[number])) throw new Error(`This image import cannot set ${key}. Add preparation files separately.`);
  if (metadata.id !== undefined && (!mediaId.test(metadata.id) || metadata.id.length > 100)) throw new Error('Use a lowercase media ID with single hyphens, up to 100 characters.');
  const { id: requestedId, ...fields } = metadata;
  // Validate text before starting the bounded image parser.
  parseMediaMeta({ ...fields, file: 'image.png' });
  const image = await prepareMediaImage(file);
  const name = image.mime === 'image/png' ? 'image.png' : 'image.jpg';
  const meta = parseMediaMeta({ ...fields, file: name });
  const text = metadataText(meta);
  const stageRoot = stagingRoot(workspace);
  prepareDocumentLock(workspace, documentId);
  const stage = resolve(stageRoot, `${process.pid}-${randomUUID()}`);
  mkdirSync(stage);
  try {
    writeFileSync(resolve(stage, name), image.contents, { flag: 'wx' });
    writeFileSync(resolve(stage, 'meta.json'), text, { flag: 'wx' });
    return await withCommentLock(workspace, documentId, async () => {
      await ownerDirectory(workspace, documentId);
      const parent = ordinaryDirectory(workspace, ['documents', documentId, 'media'], true);
      let id = requestedId ?? (metadata.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '') || 'media');
      let target = resolve(parent, id);
      try {
        lstatSync(target);
        if (requestedId) throw new Conflict('That media ID already exists. Choose another ID; the existing visual was preserved.');
        id = `${id}-${randomUUID().slice(0, 8)}`; target = resolve(parent, id);
        try { lstatSync(target); throw new Conflict('That media ID already exists. Try adding the image again.'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      // No asynchronous gap between the final existence check and directory publication.
      renameSync(stage, target);
      return { documentId, id, metadataRevision: metadataHash(meta) };
    });
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

export async function editMedia(root: string, documentId: string, id: string, input: { expectedRevision: string; meta: MediaMeta }): Promise<MediaMutationResult> {
  const workspace = realpathSync(root);
  await ownerDirectory(workspace, documentId);
  if (!mediaId.test(id)) throw new Error('Choose a valid media item.');
  if (!input || typeof input.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(input.expectedRevision)) throw new Conflict('Reload this image before saving its metadata.');
  if (!input.meta || typeof input.meta !== 'object' || Array.isArray(input.meta)) throw new Error('Provide the image metadata to edit.');
  prepareDocumentLock(workspace, documentId);
  return withCommentLock(workspace, documentId, async () => {
    await ownerDirectory(workspace, documentId);
    const folder = ordinaryDirectory(workspace, ['documents', documentId, 'media', id]);
    const current = readMetadata(folder);
    if (metadataHash(current) !== input.expectedRevision) throw new Conflict('This image metadata changed. Reload it before saving; your changes have not overwritten it.');
    for (const [key, value] of Object.entries(input.meta)) {
      if (!editable.includes(key as (typeof editable)[number]) && JSON.stringify(value) !== JSON.stringify(current[key])) throw new Error(`The metadata editor cannot change ${key}. Ask your agent to update preparation files separately.`);
    }
    const next = { ...current };
    for (const key of editable) {
      if (input.meta[key] === undefined) delete next[key];
      else next[key] = input.meta[key];
    }
    parseMediaMeta(Object.fromEntries(Object.entries(next).filter(([key]) => known.includes(key as (typeof known)[number]))));
    const text = metadataText(next);
    const temporary = resolve(folder, `.meta-${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, text, { flag: 'wx' });
      ordinaryDirectory(workspace, ['documents', documentId, 'media', id]);
      if (metadataHash(readMetadata(folder)) !== input.expectedRevision) throw new Conflict('This image metadata changed while saving. Reload it and try again.');
      renameSync(temporary, resolve(folder, 'meta.json'));
    } finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
    return { documentId, id, metadataRevision: metadataHash(next) };
  });
}
