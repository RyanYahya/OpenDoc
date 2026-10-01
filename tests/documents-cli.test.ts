import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture } from './helpers';
import { runDocumentsCli } from '../src/server/documents-cli';
import { readProjects, createProject } from '../src/server/projects';
import { changeItemTags, readTags, setDocumentStatus } from '../src/server/tags';
import { HistoryStore } from '../src/server/history';
import { main } from '../src/cli/main';

function output(t: TestContext) {
  const lines: string[] = [];
  t.mock.method(console, 'log', (line: string) => { lines.push(line); });
  return () => {
    assert.equal(lines.length, 1, 'A command returns one complete JSON value.');
    return JSON.parse(lines.splice(0)[0]);
  };
}

test('documents commands provide help and reject unknown or misplaced arguments', async t => {
  const json = output(t);
  await runDocumentsCli(['--help', '--json'], '/missing-opendoc-workspace');
  assert.match(json().usage, /documents duplicate <id>/);
  await assert.rejects(runDocumentsCli(['--unknown', '--json'], '/missing-opendoc-workspace'));
  const f = await fixture();
  try {
    await assert.rejects(runDocumentsCli(['rename', 'proof', '--json'], f.root), /Unknown documents command/);
    await assert.rejects(runDocumentsCli(['delete', 'proof', '--title', 'X', '--json'], f.root), /duplicate only/);
    await assert.rejects(runDocumentsCli(['rename', 'Bad ID', 'Name', '--json'], f.root), /Invalid document ID/);
    await assert.rejects(runDocumentsCli(['restore', 'proof', '--json'], f.root), /No deleted document/);
  } finally { await f.cleanup(); }
});

test('rename, duplicate, delete, list Trash, and restore by restore ID or document ID', async t => {
  const f = await fixture();
  const json = output(t);
  try {
    // An unnamed original lends the copy its authored title.
    await runDocumentsCli(['duplicate', 'proof', '--id', 'unnamed', '--json'], f.root);
    assert.equal(json().name, 'Copy of Proof document');
    await changeItemTags(f.root, 'documents', 'proof', { add: ['report', 'Client Acme'] });
    await setDocumentStatus(f.root, 'proof', 'final');
    await runDocumentsCli(['rename', 'proof', 'Board', 'review', '--json'], f.root);
    assert.deepEqual(json(), { id: 'proof', name: 'Board review' });
    assert.equal((await readProjects(f.root)).names?.proof, 'Board review');

    // A copy keeps saved content and tags, starts its own history, and has no status.
    await runDocumentsCli(['duplicate', 'proof', '--json'], f.root);
    const copy = json();
    assert.deepEqual(copy, { id: 'proof-copy', projectId: 'test-project', name: 'Copy of Board review', source: 'proof', entry: 'documents/proof-copy/index.tsx' });
    assert.deepEqual(await readFile(resolve(f.root, 'documents/proof-copy/index.tsx')), await readFile(f.entry));
    const tags = await readTags(f.root);
    assert.deepEqual(tags.documents['proof-copy'], tags.documents.proof);
    assert.equal(tags.status['proof-copy'], undefined);
    assert.equal(tags.status.proof, 'final');
    const store = new HistoryStore(f.root);
    assert.equal((await store.list('proof-copy')).length, 1, 'The copy starts its own history.');

    await createProject(f.root, { id: 'archive', name: 'Archive' });
    await runDocumentsCli(['duplicate', 'proof', '--id', 'proof-2027', '--title', 'Plan 2027', '--project', 'archive', '--json'], f.root);
    assert.deepEqual(json(), { id: 'proof-2027', projectId: 'archive', name: 'Plan 2027', source: 'proof', entry: 'documents/proof-2027/index.tsx' });
    const before = await readFile(resolve(f.root, 'projects.json'), 'utf8');
    await assert.rejects(runDocumentsCli(['duplicate', 'proof', '--id', 'proof-copy', '--json'], f.root), /already uses the ID proof-copy/);
    await assert.rejects(runDocumentsCli(['duplicate', 'proof', '--project', 'missing', '--json'], f.root), /no longer exists/);
    assert.equal(await readFile(resolve(f.root, 'projects.json'), 'utf8'), before);

    await runDocumentsCli(['delete', 'proof-2027', '--json'], f.root);
    json();
    await runDocumentsCli(['restore', 'proof-2027', '--json'], f.root);
    assert.deepEqual(json(), { id: 'proof-2027', projectId: 'archive', name: 'Plan 2027' });

    await runDocumentsCli(['delete', 'proof', '--json'], f.root);
    const removed = json();
    assert.equal(removed.id, 'proof');
    assert.equal(removed.restore, `npx opendoc documents restore ${removed.restoreId}`);
    assert.ok(!(await readdir(resolve(f.root, 'documents'))).includes('proof'));
    await runDocumentsCli(['trash', '--json'], f.root);
    assert.deepEqual(json().trash.map((entry: { restoreId: string; id: string; name: string; projectId: string }) => [entry.restoreId, entry.id, entry.name, entry.projectId]), [[removed.restoreId, 'proof', 'Board review', 'test-project']]);

    await runDocumentsCli(['restore', removed.restoreId, '--json'], f.root);
    assert.deepEqual(json(), { id: 'proof', projectId: 'test-project', name: 'Board review' });
    const restored = await readTags(f.root);
    assert.equal(restored.status.proof, 'final', 'Status follows the document through Trash.');
    assert.deepEqual(restored.documents.proof, tags.documents.proof);

    await runDocumentsCli(['delete', 'proof', '--json'], f.root);
    json();
    await runDocumentsCli(['restore', 'proof', '--json'], f.root);
    assert.equal(json().id, 'proof');
    await runDocumentsCli(['trash', 'list', '--json'], f.root);
    assert.deepEqual(json(), { trash: [] });
  } finally { await f.cleanup(); }
});

test('restoring by document ID asks for a restore ID when Trash holds several copies', async t => {
  const f = await fixture();
  const json = output(t);
  try {
    await runDocumentsCli(['delete', 'proof', '--json'], f.root);
    const first = json();
    await runDocumentsCli(['restore', first.restoreId, '--json'], f.root);
    json();
    await runDocumentsCli(['delete', 'proof', '--json'], f.root);
    json();
    // A second deleted copy of the same document, as left by an earlier session.
    await runDocumentsCli(['trash', '--json'], f.root);
    const [entry] = json().trash;
    const other = '0f0e0d0c-0b0a-4908-8706-050403020100';
    await mkdir(resolve(f.root, '.opendoc/trash', other));
    await cp(resolve(f.root, '.opendoc/trash', entry.restoreId), resolve(f.root, '.opendoc/trash', other), { recursive: true });
    await assert.rejects(runDocumentsCli(['restore', 'proof', '--json'], f.root), /2 copies of proof/);
    await runDocumentsCli(['restore', other, '--json'], f.root);
    assert.equal(json().id, 'proof');
  } finally { await f.cleanup(); }
});

test('the documents command is listed in the main command line help', async t => {
  const lines: string[] = [];
  t.mock.method(console, 'log', (line: string) => { lines.push(line); });
  await main(['--help']);
  assert.match(lines.join('\n'), /npx opendoc documents +Rename, duplicate, delete, and restore documents/);
});
