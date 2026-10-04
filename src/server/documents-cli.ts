import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { rm } from 'node:fs/promises';
import { deleteDocument, duplicateDocument, listTrash, renameDocument, restoreDocument, type TrashEntry } from './documents';
import { readProjects } from './projects';
import { withCommentLock } from './comments';
import { recordAgentChanges } from './history-capture';
import { renderOnce, validId } from './render';

const usage = `Usage: npx opendoc documents rename <id> "New title"
       npx opendoc documents duplicate <id> [--id <new-id>] [--title "Title"] [--project <project-id>]
       npx opendoc documents delete <id>
       npx opendoc documents trash [list]
       npx opendoc documents restore <restore-id|id>
       Add --json for structured results.

rename changes the name shown in OpenDoc; the ID, source, and PDF title stay the same.
duplicate copies the saved source, data, media, comments, and tags into a new document with its own
history and no status, in the original's project unless --project chooses another.
delete moves the document, with its history, comments, tags, and status, to Trash and prints its restore command.
restore accepts the restore ID from delete or trash, or the document ID when one copy is in Trash.`;

const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const describe = (entry: TrashEntry) => `${entry.restoreId}  ${entry.id.padEnd(24)}  ${time.format(new Date(entry.deletedAt)).padEnd(22)}  ${entry.name ?? ''}`.trimEnd();

/** The name a copy is based on when the original has no saved name: its authored title. */
async function authoredTitle(root: string, id: string) {
  try {
    const rendered = await renderOnce(root, id);
    try { return rendered.artifact.meta.title; }
    finally { await rm(rendered.directory, { recursive: true, force: true }); }
  } catch { return id; }
}

/** A restore ID as printed, or the ID of the one copy of a document in Trash. */
async function trashTarget(root: string, target: string) {
  const entries = await listTrash(root);
  if (entries.some(entry => entry.restoreId === target)) return target;
  if (!validId(target)) throw new Error('Provide a restore ID or document ID. List deleted documents with npx opendoc documents trash.');
  const matches = entries.filter(entry => entry.id === target);
  if (!matches.length) throw new Error(`No deleted document with the ID ${target} is in Trash. List deleted documents with npx opendoc documents trash.`);
  if (matches.length > 1) throw new Error(`Trash holds ${matches.length} copies of ${target}. Restore one by its restore ID:\n${matches.map(describe).join('\n')}`);
  return matches[0].restoreId;
}

export async function runDocumentsCli(args: string[], root = process.cwd()): Promise<void> {
  const { values, positionals } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, allowPositionals: true, options: {
    id: { type: 'string' }, title: { type: 'string' }, project: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) { console.log(values.json ? JSON.stringify({ usage }, null, 2) : usage); return; }
  const print = (value: unknown, text: string) => console.log(values.json ? JSON.stringify(value, null, 2) : text);
  const [action, id, ...words] = positionals;
  const options = values.id !== undefined || values.title !== undefined || values.project !== undefined;
  if (options && action !== 'duplicate') throw new Error(`--id, --title, and --project apply to duplicate only.\n${usage}`);
  if (action === 'trash' && (!id || id === 'list') && !words.length) {
    const trash = await listTrash(root);
    print({ trash }, trash.length ? ['Deleted documents, most recent first. Restore with npx opendoc documents restore <restore-id>:', ...trash.map(describe)].join('\n') : 'Trash is empty.');
    return;
  }
  if (!action || !id) throw new Error(usage);
  if (action === 'restore' && !words.length) {
    const restored = await restoreDocument(root, await trashTarget(root, id));
    await recordAgentChanges(root, [restored.id]);
    print(restored, `Restored ${restored.id}${restored.projectId ? ` to project ${restored.projectId}` : ''}\nEntry: documents/${restored.id}/index.tsx`);
    return;
  }
  if (!validId(id)) throw new Error('Invalid document ID.');
  // Versions the agent's latest edits before the document is renamed, copied, or moved to Trash.
  if (['rename', 'duplicate', 'delete'].includes(action)) await recordAgentChanges(root, [id]);
  if (action === 'rename' && words.length) {
    const renamed = await renameDocument(root, id, { name: words.join(' ') });
    print(renamed, `Renamed ${id} to “${renamed.name}”`);
  } else if (action === 'duplicate' && !words.length) {
    const manifest = await readProjects(root);
    const named = values.title !== undefined || Boolean(manifest.names && Object.hasOwn(manifest.names, id));
    const title = named ? id : await authoredTitle(root, id);
    const copy = await withCommentLock(root, id, () => duplicateDocument(root, id, title, { id: values.id, name: values.title, projectId: values.project }));
    // The copy's first version is the source it started from.
    await recordAgentChanges(root, [copy.id]);
    print({ ...copy, source: id, entry: `documents/${copy.id}/index.tsx` }, `Duplicated ${id} as ${copy.id} (“${copy.name}”) in project ${copy.projectId}\nEntry: documents/${copy.id}/index.tsx`);
  } else if (action === 'delete' && !words.length) {
    const removed = await withCommentLock(root, id, () => deleteDocument(root, id));
    const restore = `npx opendoc documents restore ${removed.restoreId}`;
    print({ ...removed, restore }, `Moved ${id} to Trash\nRestore with: ${restore}`);
  } else throw new Error(`Unknown documents command or missing arguments.\n${usage}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runDocumentsCli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
