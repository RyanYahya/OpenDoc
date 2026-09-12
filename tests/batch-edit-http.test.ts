import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, projectRoot, until } from './helpers';
import type { DocumentState, TextEditPreview } from '../src/shared/types';

test('batch HTTP preview keeps canonical output, observes draft pages, saves once and undoes the group', { timeout: 45_000 }, async () => {
  const f = await fixture();
  const child = spawn(process.execPath, ['--import', 'tsx', resolve(projectRoot, 'src/server/index.ts')], { cwd: f.root, env: { ...process.env, OPENDOC_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', data => logs += data); child.stderr.on('data', data => logs += data);
  try {
    let connection: { origin: string; token: string } | undefined;
    await until(async () => { try { connection = JSON.parse(await readFile(resolve(f.root, '.opendoc/server.json'), 'utf8')); return true; } catch { if (child.exitCode !== null) throw new Error(logs); return false; } });
    const { origin, token } = connection!;
    const headers = { 'Content-Type': 'application/json', 'X-OpenDoc-Token': token, Origin: origin };
    const post = (route: string, body: unknown) => fetch(`${origin}${route}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const current = async () => ((await fetch(`${origin}/api/documents`).then(response => response.json())) as DocumentState[]).find(state => state.id === 'proof')!;
    const ready = async (after = -1) => { await until(async () => { const state = await current(); return state?.status === 'ready' && state.revision > after; }, 30_000); return current(); };
    const initial = await ready();
    const original = await readFile(f.entry, 'utf8');
    const edits = ['title', 'target'].map(blockId => {
      const target = initial.artifact!.textTargets!.find(target => target.blockId === blockId)!;
      const run = target.runs.find(run => run.source)!;
      return { targetId: target.id, start: run.start, end: run.end, replacement: blockId === 'title' ? 'A pending title' : 'Pending text reflows across pages. '.repeat(200) };
    });
    const input = { revision: initial.revision, hash: initial.artifact!.hash, edits };
    assert.equal((await fetch(`${origin}/api/documents/proof/edits/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).status, 403);
    const response = await post('/api/documents/proof/edits/preview', input);
    assert.equal(response.status, 200, await response.clone().text());
    const draft = await response.json() as TextEditPreview;
    assert.ok(draft.artifact.pages.length > initial.artifact!.pages.length);
    assert.equal((await fetch(`${origin}${draft.pdfUrl}`)).headers.get('content-type'), 'application/pdf');
    assert.equal((await fetch(`${origin}${draft.pdfUrl.replace('/proof/', '/another/')}`)).status, 409);
    assert.equal((await fetch(`${origin}/api/documents/proof/pdf?hash=${initial.artifact!.hash}`)).status, 200);
    assert.equal(await readFile(f.entry, 'utf8'), original);
    assert.deepEqual(await current(), initial);
    const context = { documentId: 'proof', blockId: null, page: draft.artifact.pages.length, editing: true, pendingEdits: 2, draftPreview: true };
    assert.equal((await post('/api/context', context)).status, 200);
    const observed = JSON.parse(await readFile(resolve(f.root, '.opendoc/current.json'), 'utf8'));
    assert.equal(observed.manualEdit.pendingEdits, 2);
    assert.equal(observed.manualEdit.draftPreview, true);
    assert.equal(JSON.stringify(observed).includes('Pending text reflows'), false);
    assert.equal((await post('/api/context', { ...context, draftPreview: false })).status, 400);
    const savedResponse = await post('/api/documents/proof/edits', input);
    assert.equal(savedResponse.status, 200, await savedResponse.clone().text());
    const saved = await savedResponse.json() as DocumentState;
    assert.equal(saved.status, 'rendering'); assert.equal(saved.manualEdit?.count, 2);
    const settled = await ready(initial.revision);
    assert.match(settled.artifact!.blocks.title.text, /A pending title/);
    assert.equal((await post('/api/documents/proof/edits/preview', input)).status, 409);
    assert.equal((await post(`/api/documents/proof/edits/${saved.manualEdit!.id}/undo`, {})).status, 200);
    const undone = await ready(settled.revision);
    assert.equal(undone.artifact!.hash, initial.artifact!.hash);
    assert.equal(await readFile(f.entry, 'utf8'), original);
  } finally {
    child.kill('SIGTERM');
    await new Promise<void>(accept => { if (child.exitCode !== null) accept(); else child.once('exit', () => accept()); });
    await f.cleanup();
  }
});
