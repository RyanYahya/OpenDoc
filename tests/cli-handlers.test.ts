import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { createServer, type AddressInfo } from 'node:net';
import { fixture, projectRoot, source } from './helpers';
import { runCreateCli } from '../src/server/create-cli';
import { runProjectsCli } from '../src/server/projects-cli';
import { runTemplatesCli } from '../src/server/templates-cli';
import { runThemesCli } from '../src/server/themes-cli';
import { runAssetsCli } from '../src/server/assets-cli';
import { runMediaCli } from '../src/server/media-cli';
import { runCommentsCli } from '../src/server/comments-cli';
import { runExportCli } from '../src/server/export';
import { addComment, readComments } from '../src/server/comments';

function output(t: TestContext) {
  const lines: string[] = [];
  t.mock.method(console, 'log', (line: string) => { lines.push(line); });
  return () => {
    assert.equal(lines.length, 1, 'A command returns one complete JSON value.');
    return JSON.parse(lines.splice(0)[0]);
  };
}

test('callable handlers provide JSON help without a workspace and reject bad arguments', async t => {
  const json = output(t);
  for (const run of [runCreateCli, runProjectsCli, runTemplatesCli, runThemesCli, runAssetsCli, runMediaCli, runCommentsCli, runExportCli]) {
    await run(['--help', '--json'], '/missing-opendoc-workspace');
    assert.equal(typeof json().usage, 'string');
  }
  for (const run of [runProjectsCli, runTemplatesCli, runThemesCli, runAssetsCli, runMediaCli, runCommentsCli, runExportCli]) {
    await assert.rejects(run(['--unknown', '--json'], '/missing-opendoc-workspace'));
  }
});

test('creation, projects, and comments use the supplied workspace and expose mutation results', async t => {
  const f = await fixture();
  const json = output(t);
  try {
    await runProjectsCli(['create', 'cli-project', '--name', 'CLI project', '--json'], f.root);
    json();
    await runCreateCli(['cli-document', '--project', 'cli-project', '--title', 'Scoped CLI document', '--json'], f.root);
    assert.equal(json().id, 'cli-document');
    const projects = JSON.parse(await readFile(resolve(f.root, 'projects.json'), 'utf8'));
    assert.equal(projects.assignments['cli-document'], 'cli-project');
    assert.match(await readFile(resolve(f.root, 'documents/cli-document/index.tsx'), 'utf8'), /Scoped CLI document/);
    const [comment] = await addComment(f.root, 'cli-document', { blockId: 'title', text: 'Please revise', quote: 'Scoped CLI document' });
    await runCommentsCli(['resolve', 'cli-document', comment.id, '--json'], f.root);
    assert.equal(json().status, 'resolved');
    await runCommentsCli(['reopen', 'cli-document', comment.id, '--json'], f.root);
    assert.equal(json().status, 'open');
    assert.deepEqual((await readComments(f.root, 'cli-document'))[0].history.map(event => event.action), ['created', 'resolved', 'reopened']);
  } finally { await f.cleanup(); }
});

test('project theme flags set one format or both, and creation follows the requested format', async t => {
  const f = await fixture();
  const json = output(t);
  const adapterTheme = async (id: string) => (await readFile(resolve(f.root, 'documents', id, 'theme.tsx'), 'utf8')).match(/themes\/([a-z0-9-]+)['"]/)?.[1];
  try {
    await cp(resolve(projectRoot, 'templates/pitch-deck'), resolve(f.root, 'templates/pitch-deck'), { recursive: true });
    await runProjectsCli(['create', 'paired', '--name', 'Paired', '--theme', 'civic-spectrum', '--presentation-theme', 'field-manual', '--json'], f.root);
    assert.deepEqual(json().themeDefaults, { document: 'civic-spectrum', presentation: 'field-manual' });
    await runProjectsCli(['update', 'paired', '--document-theme', 'neutral', '--json'], f.root);
    assert.deepEqual(json().themeDefaults, { document: 'neutral', presentation: 'field-manual' });
    await runProjectsCli(['list', '--json'], f.root);
    const listed = json().projects.find((project: { id: string }) => project.id === 'paired');
    assert.deepEqual(listed, { id: 'paired', name: 'Paired', defaultTheme: 'neutral', defaultPresentationTheme: 'field-manual', themeDefaults: { document: 'neutral', presentation: 'field-manual' } });
    for (const [id, args] of [['cli-report', []], ['cli-deck', ['--format', 'presentation']], ['cli-pitch', ['--template', 'pitch-deck']], ['cli-override', ['--format', 'presentation', '--theme', 'civic-spectrum']]] as const) {
      await runCreateCli([id, '--project', 'paired', '--title', id, ...args, '--json'], f.root);
      json();
    }
    assert.deepEqual(await Promise.all(['cli-report', 'cli-deck', 'cli-pitch', 'cli-override'].map(adapterTheme)), ['neutral', 'field-manual', 'field-manual', 'civic-spectrum']);
    await runProjectsCli(['update', 'paired', '--presentation-theme', 'none', '--json'], f.root);
    assert.deepEqual(json().themeDefaults, { document: 'neutral', presentation: null });
    await runProjectsCli(['update', 'paired', '--theme', 'none', '--json'], f.root);
    assert.deepEqual(json().themeDefaults, { document: null, presentation: null });
    await assert.rejects(runProjectsCli(['update', 'paired', '--presentation-theme', 'missing'], f.root), /available theme/);
  } finally { await f.cleanup(); }
});

test('template discovery and media listing read supplied workspace files without executing TSX', async t => {
  const f = await fixture();
  const json = output(t);
  try {
    const folder = resolve(f.root, 'templates/local-layout');
    await mkdir(folder, { recursive: true });
    await writeFile(resolve(folder, 'template.json'), JSON.stringify({ name: 'Local layout', description: 'Workspace template', format: 'A4', structure: ['One page'] }));
    for (const file of ['index.tsx', 'preview.tsx', 'starter.tsx']) await writeFile(resolve(folder, file), 'throw new Error("Do not execute discovery");');
    await writeFile(resolve(folder, 'AGENTS.md'), 'Use this local layout.');
    await runTemplatesCli(['list', '--json'], f.root);
    assert.deepEqual(json().map((item: { id: string }) => item.id), ['local-layout']);
    await runTemplatesCli(['inspect', 'local-layout', '--json'], f.root);
    assert.equal(json().guide, 'Use this local layout.');

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAIAAABwJOjsAAAAOUlEQVR4nO3NQQEAIAwDsVIzqMEF/jXw3QzcHjQGsvY9muCRVYlBJrMqMcZc1SXGmKu6xBhzlT6PH78GAQA/IUyuAAAAAElFTkSuQmCC', 'base64');
    const image = resolve(f.root, 'supplied.png');
    await writeFile(image, png);
    await runMediaCli(['import', 'proof', 'scoped-image', '--file', relative(process.cwd(), image), '--title', 'Scoped image', '--description', 'Supplied test image', '--json'], f.root);
    assert.equal(json().id, 'scoped-image');
    await writeFile(f.entry, 'throw new Error("Do not execute media listing");');
    for (const args of [['list', 'proof', '--json'], ['list', '--json']]) {
      await runMediaCli(args, f.root);
      const result = json();
      assert.equal(result.media.length, 1);
      assert.equal(result.media[0].id, 'scoped-image');
      assert.equal(result.media[0].usageKnown, false);
    }
    await assert.rejects(runMediaCli(['list', '', '--json'], f.root));
  } finally { await f.cleanup(); }
});

test('comment addition reads the supplied workspace session and keeps JSON stdout parseable', async t => {
  const f = await fixture();
  const json = output(t);
  try {
    await mkdir(resolve(f.root, '.opendoc'), { recursive: true });
    await writeFile(resolve(f.root, '.opendoc/server.json'), JSON.stringify({ origin: 'http://127.0.0.1:45678', token: 'test-token' }));
    let saved: unknown;
    t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
      assert.ok(url.startsWith('http://127.0.0.1:45678/'));
      if (url.endsWith('/api/documents')) return Response.json([{ id: 'proof', status: 'ready', artifact: { hash: 'current-hash', blocks: { target: { id: 'target', text: 'A current target' } } } }]);
      assert.equal((init!.headers as Record<string, string>)['X-OpenDoc-Token'], 'test-token');
      saved = JSON.parse(init!.body as string);
      return Response.json([{ id: 'new-comment', blockId: 'target', text: 'Needs revision' }]);
    });
    await runCommentsCli(['add', 'proof', 'target', 'Needs revision', '--json'], f.root);
    assert.equal(json()[0].id, 'new-comment');
    assert.deepEqual(saved, { blockId: 'target', text: 'Needs revision', hash: 'current-hash' });
  } finally { await f.cleanup(); }
});

test('headless comments verify the rendered block without consulting a server and preserve history', async t => {
  const f = await fixture();
  const json = output(t);
  try {
    await mkdir(resolve(f.root, '.opendoc'), { recursive: true });
    await writeFile(resolve(f.root, '.opendoc/server.json'), 'invalid session data');
    await runCommentsCli(['add', 'proof', 'target', 'Remote feedback', '--json'], f.root, { mode: 'direct' });
    const comment = json()[0];
    assert.equal(comment.blockId, 'target');
    assert.match(comment.quote, /A stable paragraph/);
    await runCommentsCli(['resolve', 'proof', comment.id, '--json'], f.root, { mode: 'direct' });
    assert.equal(json().status, 'resolved');
    const before = await readFile(resolve(f.root, 'documents/proof/comments.json'), 'utf8');
    await assert.rejects(addComment(f.root, 'proof', { blockId: 'target', text: 'A stale request', quote: comment.quote }, () => false), /document changed/);
    assert.equal(await readFile(resolve(f.root, 'documents/proof/comments.json'), 'utf8'), before);
    assert.deepEqual((await readComments(f.root, 'proof'))[0].history.map(item => item.action), ['created', 'resolved']);
  } finally { await f.cleanup(); }
});

test('without a running service, normal comment addition verifies the target directly', async t => {
  const f = await fixture();
  const json = output(t);
  try {
    await runCommentsCli(['add', 'proof', 'target', 'No service running', '--json'], f.root);
    assert.match(json()[0].quote, /A stable paragraph/);
    // A session file left by a stopped service does not block feedback.
    await mkdir(resolve(f.root, '.opendoc'), { recursive: true });
    const closed = createServer();
    await new Promise<void>(accept => closed.listen(0, '127.0.0.1', accept));
    const { port } = closed.address() as AddressInfo;
    await new Promise(accept => closed.close(accept));
    await writeFile(resolve(f.root, '.opendoc/server.json'), JSON.stringify({ origin: `http://127.0.0.1:${port}`, token: 'stale-token', pid: 2 ** 31 - 2 }));
    await runCommentsCli(['add', 'proof', 'title', 'After the service stopped', '--json'], f.root);
    assert.deepEqual(json().map((comment: { blockId: string }) => comment.blockId), ['target', 'title']);
    await assert.rejects(runCommentsCli(['add', 'proof', 'missing-block', 'Nowhere', '--json'], f.root), /does not exist/);
  } finally { await f.cleanup(); }
});

test('comments can be deleted and restored from the command line with their history', async t => {
  const f = await fixture();
  const json = output(t);
  try {
    await runCommentsCli(['add', 'proof', 'target', 'Remove this later', '--json'], f.root, { mode: 'direct' });
    const [comment] = json();
    await runCommentsCli(['resolve', 'proof', comment.id, '--json'], f.root);
    json();
    await runCommentsCli(['delete', 'proof', comment.id, '--json'], f.root);
    assert.equal(json().status, 'deleted');
    await assert.rejects(runCommentsCli(['delete', 'proof', comment.id, '--json'], f.root), /not found/);
    await runCommentsCli(['restore', 'proof', comment.id, '--json'], f.root);
    const restored = json();
    assert.equal(restored.status, 'resolved', 'Restoring returns the earlier resolved status.');
    assert.equal(restored.id, comment.id);
    assert.deepEqual((await readComments(f.root, 'proof'))[0].history.map(event => event.action), ['created', 'resolved', 'deleted', 'restored']);
  } finally { await f.cleanup(); }
});

test('comments add anchors a quoted phrase, including one table cell by row, and list checks anchors or recently deleted', async t => {
  const table = `<DataTable id="costs" columns={[{ id: 'item', label: 'Item' }, { id: 'amount', label: 'Amount' }]} rows={[['Office rent', 12], ['Travel', 4]]} rowIds={['office', 'travel']} />`;
  const f = await fixture();
  const json = output(t);
  try {
    await writeFile(f.entry, source(table));
    await runCommentsCli(['add', 'proof', 'target', 'Cite the figures', '--phrase', 'figures, confidence', '--json'], f.root, { mode: 'direct' });
    const [phrase] = json();
    assert.deepEqual([phrase.blockId, phrase.quote, phrase.anchor.targetId, phrase.anchor.quote], ['target', 'figures, confidence', 'target:children', 'figures, confidence']);
    assert.equal(phrase.anchor.prefix, 'A stable paragraph with ');
    // A table cell is reached through its block; the anchor keeps the row ID, not the row's position.
    await runCommentsCli(['add', 'proof', 'costs', 'Which trips?', '--phrase', 'Travel', '--json'], f.root, { mode: 'direct' });
    const cell = json()[1];
    assert.deepEqual([cell.blockId, cell.anchor.targetId, cell.quote], ['costs', 'costs:row-travel-column-item', 'Travel']);
    await assert.rejects(runCommentsCli(['add', 'proof', 'target', 'Which one?', '--phrase', 'a', '--json'], f.root, { mode: 'direct' }), /appears \d+ times in target/);
    await assert.rejects(runCommentsCli(['add', 'proof', 'costs', 'Missing', '--phrase', 'Catering', '--json'], f.root, { mode: 'direct' }), /does not appear in costs/);
    await assert.rejects(runCommentsCli(['add', 'proof', 'costs', 'Wrong field', '--phrase', 'Travel', '--target', 'costs:row-office-column-item', '--json'], f.root, { mode: 'direct' }), /does not appear in costs:row-office-column-item/);
    await assert.rejects(runCommentsCli(['add', 'proof', 'costs', 'Unknown field', '--phrase', 'Travel', '--target', 'costs:nowhere', '--json'], f.root, { mode: 'direct' }), /has no text field costs:nowhere\. Its fields are /);
    await assert.rejects(runCommentsCli(['list', 'proof', '--phrase', 'Travel'], f.root), /belong to comments add/);

    // Reordering rows keeps the cell anchor; removing the phrase marks the paragraph anchor changed.
    await writeFile(f.entry, source(table.replace(`[['Office rent', 12], ['Travel', 4]]`, `[['Travel', 4], ['Office rent', 12]]`).replace(`['office', 'travel']`, `['travel', 'office']`))
      .replace('figures, confidence', 'numbers, confidence'));
    await runCommentsCli(['list', 'proof', '--anchors', '--json'], f.root, { mode: 'direct' });
    assert.deepEqual(json().map((comment: { anchorStatus: string; targetAvailable: boolean }) => [comment.anchorStatus, comment.targetAvailable]), [['changed', true], ['attached', true]]);

    await runCommentsCli(['delete', 'proof', phrase.id, '--json'], f.root);
    json();
    await runCommentsCli(['add', 'proof', 'title', 'Shorter title', '--json'], f.root, { mode: 'direct' });
    assert.deepEqual(json().map((comment: { blockId: string }) => comment.blockId), ['costs', 'title'], 'Like the app, add lists the comments that are not deleted.');
    await runCommentsCli(['list', 'proof', '--deleted', '--json'], f.root);
    assert.deepEqual(json().map((comment: { id: string }) => comment.id), [phrase.id]);
    await runCommentsCli(['list', 'proof', '--json'], f.root);
    assert.equal(json().length, 3, 'Without a flag, list keeps every record with its status.');
  } finally { await f.cleanup(); }
});

test('with a running service, a phrase comment is sent as the same selection the reader sends', async t => {
  const f = await fixture();
  const json = output(t);
  try {
    await mkdir(resolve(f.root, '.opendoc'), { recursive: true });
    await writeFile(resolve(f.root, '.opendoc/server.json'), JSON.stringify({ origin: 'http://127.0.0.1:45678', token: 'test-token' }));
    const text = 'A current target with a phrase';
    const artifact = { hash: 'current-hash', blocks: { target: { id: 'target', kind: 'Paragraph', text } }, pages: [{ width: 1, height: 1, fragments: [{ id: 'target', x: 0, y: 0, width: 1, height: 1 }] }],
      textTargets: [{ id: 'target:children', blockId: 'target', slot: 'children', stable: true, text, runs: [], lines: [{ page: 2, x: 0, y: 0, width: 1, height: 1, text, start: 0, end: text.length }] }] };
    let saved: unknown;
    t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/documents')) return Response.json([{ id: 'proof', status: 'ready', revision: 7, artifact }]);
      saved = JSON.parse(init!.body as string);
      return Response.json([{ id: 'new-comment' }]);
    });
    await runCommentsCli(['add', 'proof', 'target', 'Reword this', '--phrase', 'a phrase', '--json'], f.root);
    json();
    assert.deepEqual(saved, { blockId: 'target', text: 'Reword this', hash: 'current-hash',
      selection: { blockId: 'target', targetId: 'target:children', start: 22, end: 30, quote: 'a phrase', page: 2, renderHash: 'current-hash', revision: 7 } });
  } finally { await f.cleanup(); }
});
