import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fixture } from './helpers';
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
