import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, projectRoot, until } from './helpers';
import type { Comment, DocumentState } from '../src/shared/types';
import type { HistoryComparison, HistoryList, RestoreResult } from '../src/shared/history';

test('the service records UI edits and debounced outside changes, restores blocks, and lists deleted feedback', { timeout: 120_000 }, async () => {
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
    const history = async () => (await fetch(`${origin}/api/documents/proof/history`).then(response => response.json())) as HistoryList;

    const initial = await ready();
    await until(async () => (await history()).versions.length === 1, 15_000);
    const [baseline] = (await history()).versions;
    assert.equal(baseline.origin, 'baseline');

    const target = initial.artifact!.textTargets!.find(item => item.blockId === 'target')!;
    const start = target.text.indexOf('stable');
    const saved = await post('/api/documents/proof/edits', { targetId: target.id, start, end: start + 6, replacement: 'durable', revision: initial.revision, hash: initial.artifact!.hash });
    assert.equal(saved.status, 200, await saved.clone().text());
    let versions = (await history()).versions;
    assert.equal(versions[0].origin, 'edit', 'A saved correction is recorded immediately as the user’s edit.');
    assert.deepEqual(versions[0].summary.ids, ['target']);
    const edited = await ready(initial.revision);

    // An agent writes the file directly; the watcher records one debounced version.
    await writeFile(f.entry, (await readFile(f.entry, 'utf8')).replace('A first draft', 'An agent draft'));
    await until(async () => (await history()).versions[0].origin === 'external', 20_000);
    versions = (await history()).versions;
    assert.equal(versions.length, 3);
    assert.deepEqual(versions[0].summary.ids, ['title']);
    await ready(edited.revision);

    const comparison = await fetch(`${origin}/api/documents/proof/history/${baseline.id}`).then(response => response.json()) as HistoryComparison;
    assert.deepEqual(comparison.blocks.map(block => block.id).sort(), ['target', 'title']);

    assert.equal((await post('/api/context', { documentId: 'proof', blockId: null, page: 1, pendingEdits: 1, editing: true })).status, 200);
    const blocked = await post(`/api/documents/proof/history/${baseline.id}/restore`, { scope: 'block', blockId: 'target', base: comparison.base });
    assert.equal(blocked.status, 409, 'Unsaved drafts must be saved or discarded before a restore.');
    assert.equal((await post('/api/context', { documentId: 'proof', blockId: null, page: 1, pendingEdits: 0 })).status, 200);
    assert.equal((await post(`/api/documents/proof/history/${baseline.id}/restore`, { scope: 'block', blockId: 'missing-block' })).status, 422);

    const restored = await post(`/api/documents/proof/history/${baseline.id}/restore`, { scope: 'block', blockId: 'target', base: comparison.base });
    assert.equal(restored.status, 200, await restored.clone().text());
    const result = await restored.json() as RestoreResult;
    assert.equal(result.previous, versions[0].id);
    const text = await readFile(f.entry, 'utf8');
    assert.match(text, /A stable paragraph/);
    assert.match(text, /An agent draft/, 'Only the chosen block is restored.');
    assert.equal((await history()).versions[0].origin, 'restore');
    assert.equal((await fetch(`${origin}/api/documents/proof/history/blocks/target`).then(response => response.json())).id, 'target');

    const posted = await post('/api/documents/proof/comments', { blockId: 'target', text: 'Delete me.', hash: (await ready()).artifact!.hash });
    assert.equal(posted.status, 200, await posted.clone().text());
    const [comment] = await posted.json() as Comment[];
    assert.equal((await fetch(`${origin}/api/documents/proof/comments/${comment.id}`, { method: 'DELETE', headers, body: JSON.stringify({ version: 1 }) })).status, 200);
    const deleted = await fetch(`${origin}/api/documents/proof/comments?status=deleted`).then(response => response.json()) as Comment[];
    assert.deepEqual(deleted.map(item => item.id), [comment.id]);
    assert.equal((await post(`/api/documents/proof/comments/${comment.id}/restore`, { version: 2 })).status, 200);
    assert.deepEqual(await fetch(`${origin}/api/documents/proof/comments?status=deleted`).then(response => response.json()), []);
  } finally {
    child.kill('SIGTERM');
    await new Promise(accept => child.once('exit', accept));
    await f.cleanup();
  }
});
