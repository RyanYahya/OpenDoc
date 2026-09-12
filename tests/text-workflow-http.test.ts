import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, projectRoot, until } from './helpers';
import type { DocumentState, Comment } from '../src/shared/types';
import type { DocumentSelection } from '../src/shared/selection';

test('selection HTTP loop edits, reflows, anchors feedback, exposes context, and guards Undo', { timeout: 90_000 }, async () => {
  const f = await fixture();
  const child = spawn(process.execPath, ['--import', 'tsx', resolve(projectRoot, 'src/server/index.ts')], { cwd: f.root, env: { ...process.env, OPENDOC_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', data => logs += data); child.stderr.on('data', data => logs += data);
  try {
    let connection: { origin: string; token: string } | undefined;
    await until(async () => {
      try { connection = JSON.parse(await readFile(resolve(f.root, '.opendoc/server.json'), 'utf8')); return true; }
      catch { if (child.exitCode !== null) throw new Error(logs); return false; }
    });
    const { origin, token } = connection!;
    const headers = { 'Content-Type': 'application/json', 'X-OpenDoc-Token': token, Origin: origin };
    const post = (route: string, body: unknown) => fetch(`${origin}${route}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const current = async () => ((await fetch(`${origin}/api/documents`).then(response => response.json())) as DocumentState[]).find(state => state.id === 'proof')!;
    const ready = async (after = -1) => { await until(async () => { const state = await current(); return state?.status === 'ready' && state.revision > after; }, 30_000); return current(); };
    const selectionFor = (state: DocumentState, quote: string): DocumentSelection => {
      const target = state.artifact!.textTargets!.find(target => target.blockId === 'target' && target.text.includes(quote))!;
      assert.ok(target, 'The original paragraph must expose an exact text target.');
      const start = target.text.indexOf(quote);
      return { blockId: target.blockId, targetId: target.id, start, end: start + quote.length, quote, page: target.lines.find(line => line.start <= start && line.end > start)?.page ?? 1, renderHash: state.artifact!.hash, revision: state.revision };
    };
    const initial = await ready();
    const selection = selectionFor(initial, 'stable');
    const input = { targetId: selection.targetId, start: selection.start, end: selection.end, replacement: 'durable', revision: initial.revision, hash: initial.artifact!.hash };
    assert.equal((await fetch(`${origin}/api/documents/proof/edits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).status, 403);
    assert.equal((await post('/api/documents/proof/edits', { ...input, targetId: '../outside' })).status, 409);
    const response = await post('/api/documents/proof/edits', input);
    assert.equal(response.status, 200, await response.clone().text());
    const saved = await response.json() as DocumentState;
    assert.equal(saved.status, 'rendering');
    assert.equal(saved.manualEdit?.before, 'stable');
    assert.equal(saved.manualEdit?.after, 'durable');
    assert.equal(saved.manualEdit?.canUndo, true);
    assert.match(await readFile(f.entry, 'utf8'), /durable paragraph/);
    assert.equal((await post('/api/documents/proof/edits', input)).status, 409, 'A source revision cannot be edited twice through a stale selection.');
    const edited = await ready(initial.revision);
    assert.notEqual(edited.artifact!.hash, initial.artifact!.hash);
    const newSelection = selectionFor(edited, 'durable');
    const context = { documentId: 'proof', blockId: 'target', page: newSelection.page, selection: newSelection, editing: false };
    assert.equal((await post('/api/context', context)).status, 200);
    let observed = JSON.parse(await readFile(resolve(f.root, '.opendoc/current.json'), 'utf8'));
    assert.equal(observed.selection.quote, 'durable');
    assert.equal(observed.selectedText.source.file, 'documents/proof/index.tsx');
    assert.equal(observed.selectionCurrent, true);
    assert.equal(observed.manualEdit.lastCorrection.after, 'durable');
    const commented = await post('/api/documents/proof/comments', { blockId: 'target', text: 'Review this exact word.', hash: edited.artifact!.hash, selection: newSelection });
    assert.equal(commented.status, 200, await commented.clone().text());
    const comments = await commented.json() as Comment[];
    assert.equal(comments[0].quote, 'durable');
    assert.equal(comments[0].anchor?.targetId, newSelection.targetId);
    const commentUrl = `${origin}/api/documents/proof/comments/${comments[0].id}`;
    assert.equal((await fetch(commentUrl, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1 }) })).status, 403);
    const revisedComment = await fetch(commentUrl, { method: 'PATCH', headers, body: JSON.stringify({ text: 'Updated feedback.', version: 1 }) });
    assert.equal(revisedComment.status, 200);
    assert.equal((await revisedComment.json() as Comment[])[0].text, 'Updated feedback.');
    assert.equal((await fetch(commentUrl, { method: 'DELETE', headers, body: JSON.stringify({ version: 1 }) })).status, 409);
    assert.equal((await post(`/api/documents/proof/edits/not-the-latest-edit/undo`, {})).status, 409);
    assert.equal((await post(`/api/documents/proof/edits/${saved.manualEdit!.id}/undo`, {})).status, 200);
    const undone = await ready(edited.revision);
    assert.equal(undone.artifact!.hash, initial.artifact!.hash, 'Undo restores the original rendered output.');
    assert.equal(undone.manualEdit?.canUndo, false);
    assert.equal((await post('/api/context', { ...context, selection: selectionFor(undone, 'stable') })).status, 200);
    observed = JSON.parse(await readFile(resolve(f.root, '.opendoc/current.json'), 'utf8'));
    assert.equal(observed.pendingComments[0].anchorStatus, 'changed', 'Feedback retains its original wording after the selected text changes.');
    assert.equal(observed.pendingComments[0].quote, 'durable');
    const removedComment = await fetch(commentUrl, { method: 'DELETE', headers, body: JSON.stringify({ version: 2 }) });
    assert.equal(removedComment.status, 200);
    assert.deepEqual(await removedComment.json(), []);
    assert.deepEqual(await fetch(`${origin}/api/documents/proof/comments`).then(response => response.json()), []);

    const cli = (...args: string[]) => promisify(execFile)(process.execPath, ['--import', 'tsx', resolve(projectRoot, 'src/server/comments-cli.ts'), ...args], { cwd: f.root });
    assert.match((await cli('add', 'proof', 'target', 'Feedback from the authoring agent.')).stdout, /Added comment on target/);
    const cliComments = JSON.parse((await cli('list', 'proof')).stdout) as Comment[];
    const cliComment = cliComments.find(comment => comment.status === 'open')!;
    assert.equal(cliComment.text, 'Feedback from the authoring agent.');
    await cli('resolve', 'proof', cliComment.id);
    assert.equal((JSON.parse((await cli('list', 'proof')).stdout) as Comment[]).find(comment => comment.id === cliComment.id)!.status, 'resolved');
    await assert.rejects(cli('add', 'proof', 'missing-block', 'Unavailable feedback.'), /Target is unavailable/);

    const nextSelection = selectionFor(undone, 'stable');
    const next = await post('/api/documents/proof/edits', { targetId: nextSelection.targetId, start: nextSelection.start, end: nextSelection.end, replacement: 'steady', revision: undone.revision, hash: undone.artifact!.hash });
    assert.equal(next.status, 200);
    const nextSaved = await next.json() as DocumentState;
    const nextReady = await ready(undone.revision);
    const externalSource = `${await readFile(f.entry, 'utf8')}\n// A newer agent revision, with unchanged PDF text.\n`;
    await writeFile(f.entry, externalSource);
    const external = await ready(nextReady.revision);
    assert.equal(external.artifact!.hash, nextReady.artifact!.hash, 'Source revisions also matter when PDF bytes stay the same.');
    assert.equal(external.manualEdit?.canUndo, false);
    assert.equal((await post(`/api/documents/proof/edits/${nextSaved.manualEdit!.id}/undo`, {})).status, 409);
    assert.equal(await readFile(f.entry, 'utf8'), externalSource);
  } finally {
    child.kill('SIGTERM');
    await new Promise<void>(accept => { if (child.exitCode !== null) accept(); else child.once('exit', () => accept()); });
    await f.cleanup();
  }
});
