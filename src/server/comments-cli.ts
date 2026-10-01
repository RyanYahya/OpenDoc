import { readComments, changeComment, addComment, deleteComment, restoreComment, recentlyDeletedComments } from './comments';
import { readJSON } from './files';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { rm } from 'node:fs/promises';
import { renderOnce, validId } from './render';
import { captureExportInputs } from './export-inputs';
import { getBlock, type Comment, type DocumentState, type RenderArtifact } from '../shared/types';
import { anchorForSelection, phraseSelection, resolveCommentAnchor } from '../shared/anchors';
import { recordAgentChanges } from './history-capture';

const usage = `Usage: npx opendoc comments list <doc> [--anchors | --deleted] [--json]
       npx opendoc comments resolve <doc> <comment-id> [--json]
       npx opendoc comments reopen <doc> <comment-id> [--json]
       npx opendoc comments delete <doc> <comment-id> [--json]
       npx opendoc comments restore <doc> <comment-id> [--json]
       npx opendoc comments add <doc> <block-id> "text" [--phrase "exact words" [--target <field-id>]] [--json]
list includes deleted comments with their status; --deleted lists only those deleted in the last
90 days, newest first, as Recently deleted does in the app. --anchors checks each comment against
the current render and adds anchorStatus (attached, changed, or missing) and targetAvailable.
add --phrase anchors the comment to one occurrence of those words in the block, such as one
table cell; --target names the text field when the words appear in more than one.`;

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

/** The render a comment target is checked against: the running service's ready preview, or a fresh render of saved source. */
type Live = { server: Session; state: DocumentState };
async function withCurrentRender<T>(root: string, doc: string, mode: 'auto' | 'direct' | undefined, use: (artifact: RenderArtifact, live: Live | null, unchanged?: () => boolean) => Promise<T>): Promise<T> {
  const session = mode === 'direct' ? null : await liveSession(root);
  if (session) {
    const state = session.docs.find(d => d.id === doc);
    if (state?.status !== 'ready' || !state.artifact) throw new Error('Target is unavailable or still rendering.');
    return use(state.artifact, { server: session.server, state });
  }
  // Inputs are captured before rendering, so a write during the render cannot pass as verified.
  const unchanged = await captureExportInputs(root, doc);
  const rendered = await renderOnce(root, doc);
  try { return await use(rendered.artifact, null, unchanged); }
  finally { await rm(rendered.directory, { recursive: true, force: true }); }
}

const shown = (comments: Comment[]) => comments.filter(comment => comment.status !== 'deleted');

export async function runCommentsCli(args: string[], root = process.cwd(), options: { mode?: 'auto' | 'direct' } = {}): Promise<void> {
  const { values, positionals } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, allowPositionals: true, options: {
    json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    phrase: { type: 'string' }, target: { type: 'string' }, anchors: { type: 'boolean' }, deleted: { type: 'boolean' },
  } });
  if (values.help) { console.log(values.json ? JSON.stringify({ usage }, null, 2) : usage); return; }
  const [action, doc, target, ...words] = positionals;
  if (!doc || !validId(doc)) throw new Error(usage);
  if ((values.phrase !== undefined || values.target !== undefined) && action !== 'add') throw new Error(`--phrase and --target belong to comments add.\n${usage}`);
  if (values.target !== undefined && values.phrase === undefined) throw new Error('Use --target with --phrase.');
  if ((values.anchors || values.deleted) && action !== 'list') throw new Error(`--anchors and --deleted belong to comments list.\n${usage}`);
  if (values.anchors && values.deleted) throw new Error('Choose --anchors or --deleted, not both.');
  // Agents read and resolve feedback around their edits; keep those edits as their own version.
  if (['list', 'resolve', 'reopen', 'delete', 'restore', 'add'].includes(action)) await recordAgentChanges(root, [doc]);
  if (action === 'list' && positionals.length === 2) {
    const comments = await readComments(root, doc);
    if (values.deleted) console.log(JSON.stringify(recentlyDeletedComments(comments), null, 2));
    else if (values.anchors) {
      // The same anchor check the app applies to pending comments, against the current render.
      const checked = await withCurrentRender(root, doc, options.mode, async artifact => comments.map(comment => {
        if (comment.status === 'deleted') return comment;
        const { status } = resolveCommentAnchor(artifact, comment);
        return { ...comment, targetAvailable: status !== 'missing', anchorStatus: status };
      }));
      console.log(JSON.stringify(checked, null, 2));
    } else console.log(JSON.stringify(comments, null, 2));
  }
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
    const text = words.join(' ');
    const comments = await withCurrentRender(root, doc, options.mode, async (artifact, live, unchanged) => {
      const block = getBlock(artifact, target);
      if (!block) throw new Error(live ? 'Target is unavailable or still rendering.' : 'The target block does not exist in the current document. Inspect its review output to find the block ID.');
      const selection = values.phrase === undefined ? undefined : phraseSelection(artifact, target, values.phrase, values.target);
      if (live) {
        const { server, state } = live;
        return request<Comment[]>(server.origin, `/api/documents/${doc}/comments`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Origin: server.origin, 'X-OpenDoc-Token': server.token },
          body: JSON.stringify({ blockId: target, text, hash: artifact.hash, ...(selection ? { selection: { ...selection, revision: state.revision } } : {}) }),
        });
      }
      // A phrase in a field without a durable identity stays block feedback that quotes it, as in the app.
      const anchor = selection && anchorForSelection(artifact, selection);
      return shown(await addComment(root, doc, { blockId: target, text, quote: selection?.quote ?? block.text, anchor, exactQuote: !!selection }, unchanged));
    });
    console.log(values.json ? JSON.stringify(comments, null, 2) : `Added comment on ${target}${values.phrase === undefined ? '' : ` at “${values.phrase}”`}`);
  } else throw new Error(`Unknown comments command or missing arguments.\n${usage}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCommentsCli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
