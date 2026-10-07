import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { limits, packPath } from './archive';

export async function exists(path: string) {
  try { return await lstat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

/** Check every parent, not just the final file. Never follow a workspace link while importing/exporting. */
export async function localPath(root: string, path: string, missing = false): Promise<string> {
  packPath(path);
  let cursor = await realpath(root);
  const parts = path.split('/');
  for (let index = 0; index < parts.length; index++) {
    const entries = await readdir(cursor).catch(error => { if (missing && (error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; });
    const alias = entries.find(name => name.toLowerCase() === parts[index].toLowerCase() && name !== parts[index]);
    if (alias) throw new Error(`Case-colliding workspace path: ${path} (${alias}).`);
    cursor = resolve(cursor, parts[index]);
    const info = await exists(cursor);
    if (!info && missing) continue;
    if (!info) throw new Error(`Missing pack dependency: ${path}.`);
    if (info.isSymbolicLink() || (index < parts.length - 1 ? !info.isDirectory() : !info.isFile() && !info.isDirectory())) throw new Error(`Pack paths must be ordinary local files and directories: ${path}.`);
  }
  return cursor;
}

export async function readLocal(root: string, path: string) {
  const target = await localPath(root, path), info = await lstat(target);
  if (!info.isFile() || info.size > limits.file) throw new Error(`Pack file must be regular and at most 32 MiB: ${path}.`);
  const bytes = await readFile(target);
  if (bytes.length > limits.file) throw new Error(`Pack file exceeds 32 MiB: ${path}.`);
  return bytes;
}

export async function writeSnapshot(root: string, files: Map<string, Buffer>) {
  for (const [path, bytes] of files) {
    packPath(path);
    const target = resolve(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }
}
