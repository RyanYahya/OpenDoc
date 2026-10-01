import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HistoryRecorder, HistoryStore } from '../src/server/history';
import { compareVersion, restoreVersion, blockHistory, RestoreRefusal } from '../src/server/history-restore';
import { addComment, deleteComment, readComments, recentlyDeletedComments, restoreComment } from '../src/server/comments';
import { ignoredByWatcher } from '../src/server/watch';
import { duplicateDocument } from '../src/server/documents';
import { Workspace } from '../src/server/workspace';
import { fixture, projectRoot, settled, source, until } from './helpers';

const day = 86_400_000;
// The fixture imports only the primitives its default source uses.
const doc = (extra = '', trailing = '') => source(extra, trailing).replace('{Document,Pages,Heading,Paragraph,', '{Document,Pages,Heading,Paragraph,Section,');
const section = (title: string, inner: string, extra = '') => `<Section id="plan" title="${title}" lead="A short lead."><Paragraph id="inner">${inner}</Paragraph>${extra}</Section>`;

function clock(start = Date.parse('2026-06-01T09:00:00.000Z')) {
  let now = start;
  return { now: () => now, advance(ms: number) { now += ms; } };
}

test('capture records a deduplicated baseline, origins, and per-version change summaries', async () => {
  const f = await fixture();
  try {
    const time = clock();
    const store = new HistoryStore(f.root, { now: time.now });
    await mkdir(resolve(f.root, 'documents/proof/media/photo'), { recursive: true });
    await writeFile(resolve(f.root, 'documents/proof/media/photo/image.png'), Buffer.from([137, 80, 78, 71, 1, 2, 3]));
    await writeFile(resolve(f.root, 'documents/proof/data.json'), '{"rows":[1,2]}\n');
    const first = await store.capture('proof', 'edit');
    assert.equal(first.version?.origin, 'baseline', 'The first recorded state is the baseline, whatever prompted it.');
    assert.deepEqual(Object.keys(first.version!.files).sort(), ['data.json', 'index.tsx']);
    assert.match(first.version!.recorded['media/photo/image.png'], /^[a-f0-9]{64}$/, 'Media is identified by hash only.');
    time.advance(1000);
    assert.equal((await store.capture('proof', 'external')).version, null, 'An unchanged source does not create a version.');
    await writeFile(f.entry, source('', '').replace('A stable paragraph', 'A revised paragraph'));
    time.advance(1000);
    const second = (await store.capture('proof', 'edit')).version!;
    assert.equal(second.origin, 'edit');
    assert.deepEqual(second.summary, { blocks: 1, ids: ['target'], files: ['index.tsx'] });
    const blobs = await readdir(resolve(f.root, 'documents/proof/.history/blobs'));
    assert.equal(blobs.length, 3, 'Unchanged files share one compressed blob; media is never copied.');
    const listed = await store.list('proof');
    assert.deepEqual(listed.map(item => item.label), ['Your edit', 'Earliest saved state']);
  } finally { await f.cleanup(); }
});

test('history tolerates sync conflict copies and damaged manifests, and prunes after 90 days', async () => {
  const f = await fixture();
  try {
    const time = clock();
    const store = new HistoryStore(f.root, { now: time.now });
    const first = (await store.capture('proof', 'external')).version!;
    time.advance(day);
    await writeFile(f.entry, source('<Paragraph id="added">Added later.</Paragraph>'));
    const second = (await store.capture('proof', 'external')).version!;
    const versions = resolve(f.root, 'documents/proof/.history/versions');
    await copyFile(resolve(versions, `${second.id}.json`), resolve(versions, `${second.id}-LAPTOP.json`));
    assert.equal((await store.list('proof')).length, 2, 'A conflict copy of a manifest is the same version.');
    await writeFile(resolve(versions, '20260101T000000000Z-0000abcd.json'), '{ partial');
    assert.equal((await store.list('proof')).length, 2, 'A damaged or partially synced manifest is skipped, not trusted.');
    // Make every blob look old relative to the injected clock.
    const blobs = resolve(f.root, 'documents/proof/.history/blobs');
    for (const name of await readdir(blobs)) await utimes(resolve(blobs, name), new Date(time.now()), new Date(time.now()));
    time.advance(95 * day);
    let pruned = await store.prune('proof');
    assert.equal(pruned.removed, 1, 'Versions older than 90 days are removed, but the latest always stays.');
    assert.equal(pruned.blobs, 0, 'Blob collection waits while a damaged manifest might still reference blobs.');
    await rm(resolve(versions, '20260101T000000000Z-0000abcd.json'));
    pruned = await store.prune('proof');
    assert.equal(pruned.blobs, 1, 'The pruned version’s unreferenced blob is collected.');
    const left = await store.list('proof');
    assert.deepEqual(left.map(item => item.id), [second.id]);
    assert.notEqual(left[0].id, first.id);
    await assert.rejects(store.version('proof', first.id), /no longer/);
  } finally { await f.cleanup(); }
});

test('the recorder debounces bursts into one version and ignores feedback, media, and history paths', async () => {
  const f = await fixture();
  try {
    const store = new HistoryStore(f.root);
    const recorder = new HistoryRecorder(store, error => { throw error; }, 150, 2_000);
    await recorder.record('proof', 'external');
    assert.equal(recorder.noteChange('documents/proof/comments.json'), undefined);
    assert.equal(recorder.noteChange('documents/proof/.history/versions/x.json'), undefined);
    assert.equal(recorder.noteChange('documents/proof/media/photo/image.png'), undefined);
    for (const word of ['one', 'two', 'three']) {
      await writeFile(f.entry, source(`<Paragraph id="burst">${word}</Paragraph>`));
      assert.equal(recorder.noteChange(resolve(f.root, 'documents/proof/index.tsx')), 'proof');
      await new Promise(accept => setTimeout(accept, 40));
    }
    await until(async () => !recorder.pending('proof') && (await store.list('proof')).length === 2, 5_000);
    const [latest] = await store.list('proof');
    assert.equal(latest.origin, 'external');
    assert.equal(latest.label, 'Agent change');
    assert.match(await store.readBlob('proof', (await store.version('proof', latest.id)).files['index.tsx'].hash), /three/);
    await recorder.close();
  } finally { await f.cleanup(); }
});

test('block and section restores replace only their element, refuse unsafe targets, and are recorded', { timeout: 120_000 }, async () => {
  const f = await fixture();
  try {
    const time = clock();
    const store = new HistoryStore(f.root, { now: time.now });
    const generated = `{['x'].map(key => <Paragraph id={\`gen-\${key}\`} key={key}>Generated {key}</Paragraph>)}`;
    const duplicate = (word: string) => `{false ? <Paragraph id="dup">${word} one</Paragraph> : <Paragraph id="dup">${word} two</Paragraph>}`;
    await writeFile(f.entry, doc(section('Old title', 'Old inner words.') + duplicate('Old') + generated));
    const original = (await store.capture('proof', 'external')).version!;
    time.advance(1000);
    await writeFile(f.entry, doc(section('New title', 'New inner words.', '<Paragraph id="later">Added later.</Paragraph>') + duplicate('New') + generated).replace('A stable paragraph', 'An edited paragraph'));
    const edited = (await store.capture('proof', 'external')).version!;

    const comparison = await compareVersion(store, 'proof', original.id);
    const plan = comparison.blocks.find(block => block.id === 'plan')!;
    assert.equal(plan.container, true);
    assert.equal(plan.block.ok, false, 'Own-content restore needs the same nested blocks.');
    assert.equal(plan.section.ok, true);
    assert.equal(comparison.blocks.find(block => block.id === 'later')?.status, 'added');
    assert.equal(comparison.blocks.find(block => block.id === 'dup')?.status, 'ambiguous');
    assert.equal(comparison.blocks.find(block => block.id === 'inner')?.before, 'Old inner words.');

    time.advance(1000);
    const restored = await restoreVersion(store, 'proof', original.id, { scope: 'block', blockId: 'inner', base: comparison.base });
    let text = await readFile(f.entry, 'utf8');
    assert.match(text, /Old inner words\./);
    assert.match(text, /New title/, 'Other blocks keep their current wording.');
    assert.match(text, /An edited paragraph/);
    assert.equal(restored.previous, edited.id, 'Restoring the previous version undoes this restore.');
    assert.equal(restored.version?.origin, 'restore');
    assert.deepEqual(restored.version?.restore, { from: original.id, scope: 'block', blockId: 'inner' });

    await assert.rejects(restoreVersion(store, 'proof', original.id, { scope: 'block', blockId: 'dup' }), /more than once/);
    await assert.rejects(restoreVersion(store, 'proof', original.id, { scope: 'block', blockId: 'gen-x' }), (error: Error) => error instanceof RestoreRefusal && /generated by code/.test(error.message));
    await assert.rejects(restoreVersion(store, 'proof', original.id, { scope: 'block', blockId: 'inner', base: comparison.base }), /changed after you opened/);

    time.advance(1000);
    await restoreVersion(store, 'proof', original.id, { scope: 'section', blockId: 'plan' });
    text = await readFile(f.entry, 'utf8');
    assert.match(text, /Old title/);
    assert.doesNotMatch(text, /Added later/, 'A section restore brings back its recorded contents.');
    assert.match(text, /An edited paragraph/, 'Blocks outside the section are untouched.');

    // A recorded state that cannot render is refused before anything is written.
    await writeFile(f.entry, doc(section('Old title', 'Broken <Cite source="missing" />')));
    time.advance(1000);
    const broken = (await store.capture('proof', 'external')).version!;
    await writeFile(f.entry, doc(section('Old title', 'Working words.')));
    const before = await readFile(f.entry, 'utf8');
    await assert.rejects(restoreVersion(store, 'proof', broken.id, { scope: 'block', blockId: 'inner' }), /does not render/);
    assert.equal(await readFile(f.entry, 'utf8'), before, 'A refused restore leaves the file untouched.');

    time.advance(1000);
    const whole = await restoreVersion(store, 'proof', original.id, { scope: 'version' });
    assert.equal(await readFile(f.entry, 'utf8'), await store.readBlob('proof', original.files['index.tsx'].hash));
    assert.deepEqual(whole.files, ['index.tsx']);
    const history = await blockHistory(store, 'proof', 'inner');
    assert.ok(history.entries.some(entry => entry.text === 'Working words.'), 'Block history lists earlier distinct forms.');
    assert.equal((await blockHistory(store, 'proof', 'plan-heading')).id, 'plan', 'Derived IDs resolve to their authored block.');
  } finally { await f.cleanup(); }
});

test('recently deleted comments stay restorable for 90 days with their history', async () => {
  const f = await fixture();
  try {
    let rows = await addComment(f.root, 'proof', { blockId: 'target', text: 'Remove this?', quote: 'stable' });
    rows = await deleteComment(f.root, 'proof', rows[0].id, 1);
    const deleted = recentlyDeletedComments(rows);
    assert.deepEqual(deleted.map(row => row.id), [rows[0].id]);
    assert.deepEqual(recentlyDeletedComments(rows, Date.now() + 91 * day), [], 'Older deletions are no longer offered, but the record remains.');
    rows = await restoreComment(f.root, 'proof', rows[0].id, 2);
    assert.equal(rows[0].status, 'open');
    assert.deepEqual((await readComments(f.root, 'proof'))[0].history.map(event => event.action), ['created', 'deleted', 'restored']);
  } finally { await f.cleanup(); }
});

test('history folders never trigger rendering, copying, or packaging', async () => {
  const f = await fixture();
  const workspace = new Workspace(f.root);
  try {
    assert.equal(ignoredByWatcher(projectRoot, f.root, resolve(f.root, 'documents/proof/.history/versions/x.json')), true);
    assert.equal(ignoredByWatcher(projectRoot, f.root, resolve(f.root, 'documents/proof/.history')), true);
    assert.equal(ignoredByWatcher(projectRoot, f.root, resolve(f.root, 'documents/proof/index.tsx')), false);
    await workspace.refresh(); await settled(workspace);
    const revision = workspace.states.get('proof')!.revision;
    assert.deepEqual(workspace.noteChange('documents/proof/.history/blobs/abc.gz'), []);
    assert.equal(workspace.states.get('proof')!.revision, revision);
    await new HistoryStore(f.root).capture('proof', 'external');
    const copy = await duplicateDocument(f.root, 'proof', 'Proof');
    assert.deepEqual((await readdir(resolve(f.root, 'documents', copy.id))).sort(), ['index.tsx'], 'A duplicate starts its own history.');
    const packaging = await import(resolve(projectRoot, 'scripts/package-files.mjs')) as { excludedFromPackage: (path: string) => boolean; forbiddenPackagePath: (path: string) => boolean };
    assert.equal(packaging.excludedFromPackage(resolve(projectRoot, 'documents/welcome/.history')), true);
    assert.equal(packaging.forbiddenPackagePath('starter/documents/welcome/.history/blobs/a.gz'), true);
    assert.equal(packaging.forbiddenPackagePath('starter/documents/welcome/index.tsx'), false);
  } finally { await workspace.close(); await f.cleanup(); }
});

test('the history CLI lists, compares, and restores with structured output', { timeout: 60_000 }, async () => {
  const f = await fixture();
  const output: string[] = [];
  const log = console.log;
  console.log = (value: unknown) => { output.push(String(value)); };
  try {
    const store = new HistoryStore(f.root);
    const first = (await store.capture('proof', 'external')).version!;
    await writeFile(f.entry, source().replace('A stable paragraph', 'An agent paragraph'));
    const { runHistoryCli } = await import('../src/server/history-cli');
    await runHistoryCli(['list', 'proof', '--json'], f.root);
    assert.deepEqual(JSON.parse(output.pop()!).versions.map((version: { label: string }) => version.label), ['Agent change', 'Earliest saved state'], 'Without a running service, listing first records the pending agent change.');
    await runHistoryCli(['show', 'proof', first.id, '--json'], f.root);
    assert.deepEqual(JSON.parse(output.pop()!).blocks.map((block: { id: string }) => block.id), ['target']);
    await runHistoryCli(['restore', 'proof', first.id, '--block', 'target', '--json'], f.root);
    const result = JSON.parse(output.pop()!);
    assert.equal(result.scope, 'block');
    assert.match(await readFile(f.entry, 'utf8'), /A stable paragraph/);
    assert.deepEqual((await store.list('proof')).map(version => version.origin), ['restore', 'external', 'baseline'], 'The replaced state was recorded before restoring.');
    await assert.rejects(runHistoryCli(['restore', 'proof', first.id, '--block', 'title-x', '--section', 'title'], f.root), /not both/);
  } finally { console.log = log; await f.cleanup(); }
});
