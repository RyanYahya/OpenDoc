import { readComments, changeComment, addComment } from './comments';
import { readJSON } from './files';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { rm } from 'node:fs/promises';
import { renderOnce, validId } from './render';
import { captureExportInputs } from './export-inputs';
import { getBlock, type DocumentState } from '../shared/types';

const usage = 'Usage: npx opendoc comments list <doc> [--json]\n       npx opendoc comments resolve <doc> <comment-id> [--json]\n       npx opendoc comments reopen <doc> <comment-id> [--json]\n       npx opendoc comments add <doc> <block-id> "text" [--json]';

async function request<T>(origin: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(5_000) }); }
  catch { throw new Error('OpenDoc is unavailable. Start or restart it before adding a comment.'); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'OpenDoc could not save this comment.');
  return result as T;
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
  } else if (action === 'add' && target && words.length) {
    if (options.mode === 'direct') {
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
    const server = await readJSON<{ origin: string; token: string } | null>(resolve(root, '.opendoc/server.json'), null);
    if (!server) throw new Error('Start OpenDoc before adding a comment, so the target can be verified.');
    if (typeof server.origin !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(server.origin) || typeof server.token !== 'string' || !server.token) throw new Error('The local OpenDoc session file is invalid. Restart OpenDoc before adding a comment.');
    const docs = await request<DocumentState[]>(server.origin, '/api/documents');
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
