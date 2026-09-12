import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, symlink, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture } from './helpers';
import { ExportStore, exportFilename } from '../src/server/exports';
import { ExportChangedError } from '../src/server/export-file';
import { suggestedPdfName } from '../src/shared/export';
import type { AssetUse, DocumentAssets } from '../src/shared/assets';

const pdf = Buffer.from('%PDF-1.7\nExact reviewed bytes');
const input = (filename = 'Reviewed.pdf') => ({ id: randomUUID(), documentId: 'proof', hash: 'reviewed-hash', filename });
const prepare = async () => ({ bytes: pdf, isCurrent: () => true });

test('concurrent exports preserve existing files and publish complete numbered copies', async () => {
  const f = await fixture();
  try {
    await mkdir(resolve(f.root, 'output'));
    await writeFile(resolve(f.root, 'output/Reviewed.pdf'), 'Previous output');
    const store = new ExportStore(f.root);
    const results = await Promise.all(Array.from({ length: 6 }, () => store.save(input(), prepare)));
    assert.equal(new Set(results.map(result => result.filename)).size, 6);
    assert.equal(await readFile(resolve(f.root, 'output/Reviewed.pdf'), 'utf8'), 'Previous output');
    for (const result of results) {
      assert.deepEqual(await readFile(result.path), pdf);
      assert.deepEqual(await store.get(result.id), result);
    }
    assert.equal((await readdir(resolve(f.root, 'output'))).length, 7);
  } finally { await f.cleanup(); }
});

test('duplicate requests and retries after restart return the same reviewed file', async () => {
  const f = await fixture();
  try {
    const store = new ExportStore(f.root), request = input('Café report.pdf');
    let renders = 0;
    const prepareOnce = async () => { renders++; return prepare(); };
    const [first, second] = await Promise.all([store.save(request, prepareOnce), store.save(request, prepareOnce)]);
    assert.deepEqual(first, second);
    assert.equal(renders, 1);
    const restarted = new ExportStore(f.root);
    assert.deepEqual(await restarted.save(request, () => { throw new Error('Must not rerender an already saved export'); }), first);
    assert.deepEqual((await restarted.bytes(request.id)).bytes, pdf);
    await assert.rejects(restarted.save({ ...request, filename: 'Other.pdf' }, prepare), /another file/);
    assert.equal((await readdir(resolve(f.root, 'output'))).length, 1);
  } finally { await f.cleanup(); }
});

test('stale, invalid, and failed exports leave previous output intact and allow retry', async () => {
  const f = await fixture();
  try {
    const store = new ExportStore(f.root), request = input();
    await assert.rejects(store.save(request, async () => ({ bytes: pdf, isCurrent: () => false })), ExportChangedError);
    assert.deepEqual(await readdir(resolve(f.root, 'output')), []);
    assert.deepEqual(await readdir(resolve(f.root, '.opendoc/exports')), []);
    await assert.rejects(store.save(request, async () => ({ bytes: Buffer.from('broken'), isCurrent: () => true })), /incomplete/);
    const saved = await store.save(request, prepare);
    assert.deepEqual(await readFile(saved.path), pdf);
    await writeFile(saved.path, 'User changed this exported file');
    await assert.rejects(store.bytes(request.id), /changed outside/);
    await assert.rejects(store.copy(request.id), /changed outside/);
    assert.equal(await readFile(saved.path, 'utf8'), 'User changed this exported file');
  } finally { await f.cleanup(); }
});

test('interrupted preparation can finish and a removed export can be recreated without overwriting', async () => {
  const f = await fixture();
  try {
    const store = new ExportStore(f.root), request = input();
    await mkdir(resolve(f.root, '.opendoc/exports'), { recursive: true });
    await writeFile(resolve(f.root, '.opendoc/exports', `${request.id}.pdf`), 'Interrupted snapshot');
    const saved = await store.save(request, prepare);
    await unlink(saved.path);
    assert.equal(await store.get(request.id), undefined);
    const restored = await new ExportStore(f.root).save(request, prepare);
    assert.deepEqual(await readFile(restored.path), pdf);
  } finally { await f.cleanup(); }
});

test('unsafe names, requests and symlinked export destinations are rejected', async () => {
  for (const name of ['', '../outside', 'a/b', 'a\\b', '.hidden', 'a\n.pdf', 'name.', 'CON.pdf', 'nul', 'x'.repeat(121)]) assert.throws(() => exportFilename(name));
  assert.equal(exportFilename('Report'), 'Report.pdf');
  assert.equal(exportFilename('Report.PDF'), 'Report.PDF');
  const f = await fixture();
  try {
    const store = new ExportStore(f.root);
    await assert.rejects(store.save({ ...input(), id: '../escape' }, prepare), /Invalid/);
    await mkdir(resolve(f.root, 'elsewhere'));
    await symlink(resolve(f.root, 'elsewhere'), resolve(f.root, 'output'));
    await assert.rejects(store.save(input(), prepare), /regular folder/);
    assert.deepEqual(await readdir(resolve(f.root, 'elsewhere')), []);
  } finally { await f.cleanup(); }
});

test('long and international filenames remain readable after collision numbering', async () => {
  const f = await fixture();
  try {
    const store = new ExportStore(f.root);
    for (const title of ['.A report', 'CON', 'Report.pdf', '📄'.repeat(100), 'Résumé '.repeat(30)]) assert.doesNotThrow(() => exportFilename(suggestedPdfName(title)));
    for (const name of [`${'a'.repeat(116)}.pdf`, `${'é'.repeat(108)}.pdf`]) {
      await store.save(input(name), prepare);
      const second = await store.save(input(name), prepare);
      assert.match(second.filename, / \(2\)\.pdf$/);
      assert.deepEqual(await new ExportStore(f.root).get(second.id), second);
      assert.deepEqual((await store.bytes(second.id)).bytes, pdf);
    }
  } finally { await f.cleanup(); }
});

test('history is scoped, newest first, persistent, and adopts the current CLI PDF once', async () => {
  const f = await fixture();
  try {
    const store = new ExportStore(f.root);
    const first = await store.save(input('First.pdf'), prepare);
    await new Promise(resolve => setTimeout(resolve, 5));
    const second = await store.save(input('Second.pdf'), prepare);
    await store.save({ ...input('Other document.pdf'), documentId: 'other' }, prepare);
    assert.deepEqual((await store.list('proof')).map(row => row.id), [second.id, first.id]);
    await writeFile(resolve(f.root, 'output/proof.pdf'), pdf);
    const rows = await store.list('proof');
    assert.equal(rows.length, 3);
    assert.equal(rows.filter(row => row.filename === 'proof.pdf').length, 1);
    assert(rows.every(row => row.available));
    assert.deepEqual(await new ExportStore(f.root).list('proof'), rows);
    await writeFile(resolve(f.root, '.opendoc/exports', `${randomUUID()}.json`), 'broken');
    assert.equal((await store.list('proof')).length, 3);
  } finally { await f.cleanup(); }
});

test('delete and Undo survive restart, refuse retry resurrection, and preserve filename collisions', async () => {
  const f = await fixture();
  try {
    const store = new ExportStore(f.root), request = input();
    const saved = await store.save(request, prepare);
    await Promise.all([store.remove(saved.id), store.remove(saved.id)]);
    assert.equal(await store.get(saved.id), undefined);
    assert.deepEqual(await store.list('proof'), []);
    await assert.rejects(readFile(saved.path), { code: 'ENOENT' });
    const restarted = new ExportStore(f.root);
    await assert.rejects(restarted.save(request, prepare), /deleted/);
    await writeFile(saved.path, 'An unrelated replacement');
    const restored = await restarted.restore(saved.id);
    assert.equal(restored.filename, 'Reviewed (2).pdf');
    assert.deepEqual(await readFile(restored.path), pdf);
    assert.equal(await readFile(saved.path, 'utf8'), 'An unrelated replacement');
    assert.deepEqual(await restarted.restore(saved.id), restored);
    assert.equal((await restarted.list('proof'))[0].available, true);
  } finally { await f.cleanup(); }
});

test('changed and replaced exports are unavailable; deleting their history leaves user files intact', async () => {
  const f = await fixture();
  try {
    const store = new ExportStore(f.root);
    for (const replace of [false, true]) {
      const saved = await store.save(input(replace ? 'Replaced.pdf' : 'Changed.pdf'), prepare);
      if (replace) await unlink(saved.path);
      await writeFile(saved.path, 'User file');
      assert.equal((await store.list('proof')).find(row => row.id === saved.id)?.available, false);
      await store.remove(saved.id);
      assert.equal(await readFile(saved.path, 'utf8'), 'User file');
      await store.restore(saved.id);
      assert.equal(await readFile(saved.path, 'utf8'), 'User file');
      assert.equal((await store.list('proof')).find(row => row.id === saved.id)?.available, false);
    }
  } finally { await f.cleanup(); }
});

test('a PDF named after another document cannot be claimed by legacy discovery', async () => {
  const f = await fixture();
  try {
    const store = new ExportStore(f.root);
    await store.save({ ...input('proof.pdf'), documentId: 'other' }, prepare);
    assert.deepEqual(await store.list('proof'), []);
  } finally { await f.cleanup(); }
});

test('export history preserves captured asset pins and actual usage across source changes, retries, and Undo', async () => {
  const f = await fixture();
  try {
    const store = new ExportStore(f.root), request = input();
    const revision = 'a'.repeat(64);
    const assetBindings: DocumentAssets = { version: 1, logo: { id: 'brand', revision }, logos: { partner: { id: 'partner', revision } } };
    const assets: AssetUse[] = [
      { kind: 'logo', id: 'brand', revision, variation: 'on-dark', blockId: 'cover' },
      { kind: 'logo', id: 'brand', revision, variation: 'on-dark', blockId: 'closing' },
    ];
    const saved = await store.save(request, async () => ({ ...await prepare(), assetBindings, assets }));
    assert.deepEqual(saved.assets, [{ kind: 'logo', id: 'brand', revision, variation: 'on-dark' }]);
    assert.equal(saved.assetBindings?.logos?.partner.id, 'partner', 'Available but unused logos remain distinguishable.');
    assetBindings.logo!.revision = 'b'.repeat(64); assets[0].variation = 'on-light';
    await writeFile(resolve(f.root, 'documents/proof/assets.json'), JSON.stringify(assetBindings));
    const restarted = new ExportStore(f.root);
    assert.deepEqual(await restarted.save(request, () => { throw new Error('Saved provenance must never be rebuilt from current source.'); }), saved);
    await restarted.remove(saved.id);
    assert.deepEqual((await restarted.restore(saved.id)).assetBindings, saved.assetBindings);
    assert.deepEqual((await restarted.list('proof'))[0].assets, saved.assets);
    await writeFile(resolve(f.root, 'output/proof.pdf'), pdf);
    const legacy = (await restarted.list('proof')).find(item => item.filename === 'proof.pdf')!;
    assert.equal(legacy.assetBindings, undefined); assert.equal(legacy.assets, undefined, 'Older PDFs have unknown asset provenance.');
  } finally { await f.cleanup(); }
});
