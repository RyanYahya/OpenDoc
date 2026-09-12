import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { lstatSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validId } from './render';
import { exportInfo, type ExportFormat } from '../shared/export';

export class ExportChangedError extends Error {
  constructor() { super('The document changed during export. Wait for the latest preview and try again.'); }
}

/** Prepare bytes first, then publish atomically while the revision is still current. */
export async function publishFile(root: string, id: string, bytes: Uint8Array, format: ExportFormat, isCurrent: () => boolean = () => true, collection?: 'themes' | 'templates') {
  if (!validId(id)) throw new Error('Invalid document ID.');
  const folder = await outputFolder(root, collection ? [collection] : []);
  const output = resolve(folder, `${id}${exportInfo(format).extension}`);
  const previous = await lstat(output).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (previous && (!previous.isFile() || previous.isSymbolicLink())) throw new Error('The export destination must be a regular local file.');
  const temporary = resolve(folder, `.${id}.${randomUUID()}.tmp`);
  let published = false;
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    for (const parent of new Set([resolve(root, 'output'), folder])) {
      const info = lstatSync(parent);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('The export output folder changed during preparation.');
    }
    const current = (() => { try { return lstatSync(output); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; } })();
    if (current && (!current.isFile() || current.isSymbolicLink())) throw new Error('The export destination must be a regular local file.');
    if (!isCurrent()) throw new ExportChangedError();
    // No event-loop turn may separate the revision check from publication.
    renameSync(temporary, output);
    published = true;
    return output;
  } finally { if (!published) await rm(temporary, { force: true }); }
}

export async function publishRenderedPDF(root: string, id: string, directory: string, isCurrent?: () => boolean) {
  const bytes = await readFile(resolve(directory, 'document.pdf'));
  return publishPDF(root, id, bytes, isCurrent);
}

export function publishPDF(root: string, id: string, bytes: Uint8Array, isCurrent?: () => boolean, collection?: 'themes' | 'templates') {
  return publishFile(root, id, bytes, 'pdf', isCurrent, collection);
}

/** Create output parents one at a time without traversing a linked directory. */
export async function outputFolder(root: string, segments: string[] = []) {
  let folder = root;
  for (const segment of ['output', ...segments]) {
    if (!validId(segment)) throw new Error('Invalid output folder.');
    folder = resolve(folder, segment);
    await mkdir(folder).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const info = await lstat(folder);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Exports need regular local output folders; symbolic links are not supported.');
  }
  return folder;
}
