import { mkdir, readFile, rename, rm, writeFile, realpath } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function atomicWrite(file: string, contents: string | Uint8Array) {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temp, contents); await rename(temp, file); }
  finally { await rm(temp, { force: true }); }
}
export async function readJSON<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error; }
}
export async function containedFile(root: string, file: string) {
  const actualRoot = await realpath(root);
  const actualFile = await realpath(file);
  const rel = relative(actualRoot, actualFile);
  if (rel === '..' || rel.startsWith(`..${sep}`) || resolve(actualRoot, rel) !== actualFile) throw new Error('Path is outside the workspace.');
  return actualFile;
}
