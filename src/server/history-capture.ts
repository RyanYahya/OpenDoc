import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validId } from './render';
import { HistoryStore, type HistoryVersion } from './history';
import { historyDisabledVariable } from './history-paths';

/** Whether a local OpenDoc service owns this workspace; its file watcher then records history itself. */
export async function historyService(root: string) {
  const read = async (file: string) => {
    try { return JSON.parse(await readFile(resolve(root, '.opendoc', file), 'utf8')) as Record<string, unknown> | null; }
    catch { return null; }
  };
  // Headless never runs a service, so a stale or copied session file cannot suppress recording.
  if ((await read('workspace.json'))?.edition === 'headless') return false;
  const pid = (await read('server.json'))?.pid;
  if (!Number.isSafeInteger(pid) || (pid as number) <= 0) return false;
  try { process.kill(pid as number, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

/**
 * Record agent edits made since a document's latest version, from the commands an agent
 * runs after editing: create, check, review, export, comments, documents, and history. While the
 * normal edition's service runs, its watcher records them with the reader's own origins.
 * Without one, as always in OpenDoc Headless, these commands are the only place an edit is
 * seen, so they record it as an Agent change. Unchanged documents add nothing.
 *
 * History never blocks the command: a document that does not exist is left to the command
 * to report, and any other failure is a warning.
 */
export async function recordAgentChanges(root: string, ids: Iterable<string>, warn: (message: string) => void = message => console.error(message)): Promise<HistoryVersion[]> {
  if (process.env[historyDisabledVariable] === 'off' || await historyService(root)) return [];
  const store = new HistoryStore(root);
  const recorded: HistoryVersion[] = [];
  for (const id of new Set(ids)) {
    if (!validId(id)) continue;
    try {
      const { version } = await store.capture(id, 'external');
      if (version) recorded.push(version);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      warn(`Could not record version history for ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return recorded;
}
