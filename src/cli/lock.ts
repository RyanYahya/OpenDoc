import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Startup, update activation, and Headless commands share the workspace runtime lock. */
export async function withWorkspaceLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  const file = resolve(root, '.opendoc/update.lock');
  await mkdir(resolve(root, '.opendoc'), { recursive: true });
  const contents = JSON.stringify({ pid: process.pid, id: randomUUID() });
  try {
    const handle = await open(file, 'wx', 0o600);
    try { await handle.writeFile(contents); } finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const recovery = `Confirm no OpenDoc command is running, then remove ${file} and retry.`;
    let owner: { pid?: number };
    try { owner = JSON.parse(await readFile(file, 'utf8')); } catch { throw new Error(`OpenDoc has an incomplete workspace runtime lock. ${recovery}`); }
    if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid! <= 0 || owner.pid! > 2 ** 31 - 1) throw new Error(`Invalid OpenDoc workspace runtime lock. ${recovery}`);
    try { process.kill(owner.pid!, 0); }
    catch (ownerError) {
      if ((ownerError as NodeJS.ErrnoException).code !== 'ESRCH') throw ownerError;
      // Stat-then-unlink recovery could delete a new contender's lock. Leave stale locks intact.
      throw new Error(`The previous OpenDoc command stopped before releasing its lock. ${recovery}`);
    }
    throw new Error('Another OpenDoc command is in progress. Wait for it to finish, then retry.');
  }
  try { return await action(); }
  finally {
    try { if (await readFile(file, 'utf8') === contents) await unlink(file); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`OpenDoc could not remove its workspace runtime lock after the operation: ${error instanceof Error ? error.message : String(error)}. Confirm no OpenDoc command is running, then remove ${file} and retry.`);
    }
  }
}
