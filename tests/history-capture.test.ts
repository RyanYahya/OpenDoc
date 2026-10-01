import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HistoryStore } from '../src/server/history';
import { historyService, recordAgentChanges } from '../src/server/history-capture';
import { historyDisabledVariable } from '../src/server/history-paths';
import { runCreateCli } from '../src/server/create-cli';
import { runCommentsCli } from '../src/server/comments-cli';
import { runExportCli } from '../src/server/export';
import { runHistoryCli } from '../src/server/history-cli';
import { runReviewCli } from '../src/server/review-cli';
import { fixture, projectRoot, source } from './helpers';

const exists = (path: string) => access(path).then(() => true, () => false);

function output(t: TestContext) {
  const lines: string[] = [];
  t.mock.method(console, 'log', (line: string) => { lines.push(line); });
  t.mock.method(console, 'error', () => {});
  return () => JSON.parse(lines.splice(0).at(-1)!);
}

async function marker(root: string, edition: 'normal' | 'headless', session?: { pid: number }) {
  await mkdir(resolve(root, '.opendoc'), { recursive: true });
  await writeFile(resolve(root, '.opendoc/workspace.json'), JSON.stringify({ formatVersion: 1, createdWith: '0.5.0', edition }));
  if (session) await writeFile(resolve(root, '.opendoc/server.json'), JSON.stringify({ origin: 'http://127.0.0.1:45678', token: 'test-token', ...session }));
}

test('without a running service, the commands an agent runs after editing record each change once', { timeout: 120_000 }, async t => {
  const f = await fixture();
  const json = output(t);
  // A copied session file whose process is alive must not suppress Headless recording.
  await marker(f.root, 'headless', { pid: process.pid });
  const checkout = await readdir(resolve(projectRoot, 'documents'), { recursive: true });
  try {
    await runCreateCli(['agent-draft', '--project', 'test-project', '--title', 'Agent draft', '--json'], f.root);
    assert.equal(json().id, 'agent-draft');
    const store = new HistoryStore(f.root);
    assert.deepEqual((await store.list('agent-draft')).map(version => version.origin), ['baseline'], 'The scaffold is the earliest version.');

    await writeFile(f.entry, source().replace('A stable paragraph', 'An agent paragraph'));
    await runHistoryCli(['list', 'proof', '--json'], f.root);
    const listed = json().versions;
    assert.deepEqual(listed.map((version: { label: string }) => version.label), ['Earliest saved state'], 'A document first seen by a command starts with its current state.');

    await writeFile(f.entry, source().replace('A stable paragraph', 'A second agent paragraph'));
    await runCommentsCli(['list', 'proof', '--json'], f.root);
    json();
    await runCommentsCli(['list', 'proof', '--json'], f.root);
    json();
    const afterComments = await store.list('proof');
    assert.deepEqual(afterComments.map(version => version.label), ['Agent change', 'Earliest saved state'], 'An unchanged source adds nothing.');
    assert.deepEqual(afterComments[0].summary.ids, ['target']);

    await writeFile(f.entry, source().replace('A stable paragraph', 'A reviewed paragraph'));
    await runReviewCli(['proof', '--json'], f.root);
    assert.equal(json().status, 'ready');
    await writeFile(f.entry, source().replace('A stable paragraph', 'An exported paragraph'));
    await runExportCli(['proof', '--json'], f.root, { mode: 'direct' });
    assert.equal(json().results[0].status, 'success');
    const versions = await store.list('proof');
    assert.deepEqual(versions.map(version => version.origin), ['external', 'external', 'external', 'baseline']);
    const restored = (await store.versionFiles('proof', await store.version('proof', versions[1].id))).get('index.tsx');
    assert.match(restored!, /A reviewed paragraph/, 'Each version holds the source the command saw.');

    // History stays beside the workspace's documents, never in the process's checkout or package.
    assert.ok(await exists(resolve(f.root, 'documents/proof/.history/history.json')));
    assert.deepEqual(await readdir(resolve(projectRoot, 'documents'), { recursive: true }), checkout);
  } finally { await f.cleanup(); }
});

test('a running service records history itself; disabled or missing documents record nothing', async () => {
  const f = await fixture();
  try {
    const warnings: string[] = [];
    const warn = (message: string) => { warnings.push(message); };
    await marker(f.root, 'normal', { pid: process.pid });
    assert.equal(await historyService(f.root), true);
    assert.deepEqual(await recordAgentChanges(f.root, ['proof'], warn), [], 'The service watcher owns recording while it runs.');
    assert.equal(await exists(resolve(f.root, 'documents/proof/.history')), false);

    // A session left by a stopped service no longer suppresses recording.
    await marker(f.root, 'normal', { pid: 2 ** 31 - 2 });
    assert.equal(await historyService(f.root), false);
    process.env[historyDisabledVariable] = 'off';
    try { assert.deepEqual(await recordAgentChanges(f.root, ['proof'], warn), []); }
    finally { delete process.env[historyDisabledVariable]; }
    assert.equal(await exists(resolve(f.root, 'documents/proof/.history')), false, 'Initialization validates without recording history.');

    const recorded = await recordAgentChanges(f.root, ['proof', 'missing-document', '../outside', 'proof'], warn);
    assert.deepEqual(recorded.map(version => version.origin), ['baseline']);
    assert.deepEqual(warnings, [], 'A document the command cannot find is left for the command to report.');
  } finally { await f.cleanup(); }
});
