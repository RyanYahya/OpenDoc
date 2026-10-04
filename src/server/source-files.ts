import { lstat, readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { validId } from './render';

/**
 * The text files that make up one document, template, or theme folder. Language detection reads
 * them, and their modification times give the item's “last edited” time for sorting the library.
 */
export interface SourceFile { path: string; name: string; size: number; mtimeMs: number }

const maximumFileSize = 512_000;
const maximumFiles = 60;
const textExtensions = new Set(['.tsx', '.ts', '.jsx', '.json', '.md', '.txt']);

/** Local text files of one item, skipping media, history, and dot folders. */
export async function itemFiles(folder: string, depth = 0, found: SourceFile[] = []): Promise<SourceFile[]> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (found.length >= maximumFiles || entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'media') continue;
    const path = resolve(folder, entry.name);
    if (entry.isDirectory() && depth < 2) await itemFiles(path, depth + 1, found);
    else if (entry.isFile() && textExtensions.has(extname(entry.name))) {
      const info = await lstat(path).catch(() => undefined);
      if (info?.isFile() && info.size <= maximumFileSize) found.push({ path, name: entry.name, size: info.size, mtimeMs: info.mtimeMs });
    }
  }
  return found;
}

/** The text files of `documents/<id>`, `templates/<id>`, or `themes/<id>`; none for an invalid ID. */
export async function sourceFiles(root: string, kind: 'documents' | 'templates' | 'themes', id: string): Promise<SourceFile[]> {
  return validId(id) ? itemFiles(resolve(root, kind, id)) : [];
}

/** Saved comments are feedback about the content, so a new comment does not count as an edit. */
const feedbackFile = (name: string) => name === 'comments.json';

/** When the item's source last changed, as an ISO time, or undefined when it has no readable files. */
export function sourceUpdatedAt(files: readonly SourceFile[]): string | undefined {
  let latest = -Infinity;
  for (const file of files) if (!feedbackFile(file.name) && file.mtimeMs > latest) latest = file.mtimeMs;
  return Number.isFinite(latest) ? new Date(latest).toISOString() : undefined;
}
