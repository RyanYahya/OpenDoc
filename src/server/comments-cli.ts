import { readComments, changeComment, addComment, deleteComment, restoreComment } from './comments';
import { readJSON } from './files';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { rm } from 'node:fs/promises';
import { renderOnce, validId } from './render';
import { captureExportInputs } from './export-inputs';
import { getBlock, type DocumentState } from '../shared/types';

const usage = 'Usage: npx opendoc comments list <doc> [--json]\n       npx opendoc comments resolve <doc> <comment-id> [--json]\n       npx opendoc comments reopen <doc> <comment-id> [--json]\n       npx opendoc comments delete <doc> <comment-id> [--json]\n       npx opendoc comments restore <doc> <comment-id> [--json]\n       npx opendoc comments add <doc> <block-id> "text" [--json]';

async function request<T>(origin: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(5_000) }); }
  catch (error) { throw new Error('OpenDoc is unavailable. Start or restart it before adding a comment.', { cause: error }); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'OpenDoc could not save this comment.');
  return result as T;
}

type Session = { origin: string; token: string };

/** The running service, when there is one; it verifies the target against its current preview. */
async function liveSession(root: string): Promise<{ server: Session; docs: DocumentState[] } | null> {
  const server = await readJSON<Session | null>(resolve(root, '.opendoc/server.json'), null);
  if (!server) return null;
  if (typeof server.origin !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(server.origin) || typeof server.token !== 'string' || !server.token) throw new Error('The local OpenDoc session file is invalid. Restart OpenDoc before adding a comment.');
  try { return { server, docs: await request<DocumentState[]>(server.origin, '/api/documents') }; }
  catch (error) {
    // A session left by a stopped service falls back to verifying the target directly.
    if (((error as Error).cause as { cause?: { code?: string } } | undefined)?.cause?.code === 'ECONNREFUSED') return null;
    throw error;
  }
}

export async function runCommentsCli(args: string[], root = process.cwd(), options: { mode?: 'auto' | 'direct' } = {}): Promise<void> {
  const { values, positionals } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, allowPositionals: true, options: {
    json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) { console.log(values.json ? JSON.stringify({ usage }, null, 2) : usage); return; }
  const [action, doc, target, ...words] = positionals;
  if (!doc || !validId(doc)) throw new Error(usage);
  else if (action === 'list' && positionals.length === 2) console.log(JSON.stringify(await readComments(root, doc), null, 2));
  else if ((action === 'resolve' || action === 'reopen') && target && positionals.length === 3) {
    const comment = (await readComments(root, doc)).find(c => c.id === target);
    if (!comment) throw new Error('Comment not found.');
    const comments = await changeComment(root, doc, target, action === 'resolve' ? 'resolved' : 'open', comment.version);
    console.log(values.json ? JSON.stringify(comments.find(c => c.id === target), null, 2) : `${action === 'resolve' ? 'Resolved' : 'Reopened'} ${target}`);
  } else if (action === 'delete' && target && positionals.length === 3) {
    // Deletion keeps the record and its history, so the comment stays restorable for 90 days.
    const comment = (await readComments(root, doc)).find(c => c.id === target && c.status !== 'deleted');
    if (!comment) throw new Error('Comment not found.');
    const comments = await deleteComment(root, doc, target, comment.version);
    console.log(values.json ? JSON.stringify(comments.find(c => c.id === target), null, 2) : `Deleted ${target}\nRestore with: npx opendoc comments restore ${doc} ${target}`);
  } else if (action === 'restore' && target && positionals.length === 3) {
    // Deleted feedback keeps its record; restoring returns it with its identity, anchor, and history.
    const comment = (await readComments(root, doc)).find(c => c.id === target);
    if (!comment) throw new Error('Comment not found.');
    if (comment.status !== 'deleted') throw new Error('That comment is not deleted.');
    const comments = await restoreComment(root, doc, target, comment.version);
    console.log(values.json ? JSON.stringify(comments.find(c => c.id === target), null, 2) : `Restored ${target}`);
  } else if (action === 'add' && target && words.length) {
    // Headless, or normal OpenDoc while its service is stopped, verifies the target by rendering saved source.
    const session = options.mode === 'direct' ? null : await liveSession(root);
    if (!session) {
      const unchanged = await captureExportInputs(root, doc);
      const rendered = await renderOnce(root, doc);
      try {
        const block = getBlock(rendered.artifact, target);
        if (!block) throw new Error('The target block does not exist in the current document. Inspect its review output to find the block ID.');
        const comments = await addComment(root, doc, { blockId: target, text: words.join(' '), quote: block.text }, unchanged);
        console.log(values.json ? JSON.stringify(comments, null, 2) : `Added comment on ${target}`);
      } finally { await rm(rendered.directory, { recursive: true, force: true }); }
      return;
    }
    const { server, docs } = session;
    const state = docs.find(d => d.id === doc);
    const block = getBlock(state?.artifact, target);
    if (state?.status !== 'ready' || !block) throw new Error('Target is unavailable or still rendering.');
    const comments = await request(server.origin, `/api/documents/${doc}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: server.origin, 'X-OpenDoc-Token': server.token },
      body: JSON.stringify({ blockId: target, text: words.join(' '), hash: state.artifact!.hash }),
    });
    console.log(values.json ? JSON.stringify(comments, null, 2) : `Added comment on ${target}`);
  } else throw new Error(`Unknown comments command or missing arguments.\n${usage}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCommentsCli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
