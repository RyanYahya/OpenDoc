import { constants, lstatSync, readFileSync, unlinkSync } from 'node:fs';
import { mkdir, open, readFile, rename, rm, unlink, writeFile, realpath } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
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

/** A terminated CLI must not leave all later manifest changes permanently busy. */
function releaseDeadLock(lock: string) {
  try {
    const before = lstatSync(lock);
    if (!before.isFile() || before.isSymbolicLink() || before.size > 128) return;
    let pid: number | undefined;
    try { pid = (JSON.parse(readFileSync(lock, 'utf8')) as { pid?: number } | null)?.pid; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    if (Number.isSafeInteger(pid) && pid! > 0) {
      try { process.kill(pid!, 0); return; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return; }
    } else if (Date.now() - before.mtimeMs < 30_000) return;
    const current = lstatSync(lock);
    if (current.dev === before.dev && current.ino === before.ino && current.mtimeMs === before.mtimeMs) unlinkSync(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Serialize browser and CLI changes to one small workspace manifest through `.opendoc/<name>`. */
export async function withLocalLock<T>(workspace: string, name: string, busy: () => Error, action: () => Promise<T>): Promise<T> {
  const runtime = resolve(workspace, '.opendoc');
  await mkdir(runtime, { recursive: true });
  const lock = resolve(runtime, name);
  let handle;
  const started = Date.now();
  while (!handle) {
    try { handle = await open(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      releaseDeadLock(lock);
      if (Date.now() - started > 5000) throw busy();
      await setTimeout(25);
    }
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid }));
    return await action();
  } finally { await handle.close(); await unlink(lock); }
}
