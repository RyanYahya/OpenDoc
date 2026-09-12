import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm, unlink, utimes, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { AssetError, AssetStore } from '../src/assets/store';
import { assetDirectory, assetFile, assetRevisionPath, readAssetHead, readAssetRevision, readDocumentAssets, resolveThemeAssets } from '../src/assets/files';
import type { AssetInspection, LogoRevision, ThemeAssetDefaults } from '../src/shared/assets';
import { createDocument } from '../src/server/create';
import { fixture, projectRoot } from './helpers';

async function storeFixture() {
  const f = await fixture();
  // The common fixture links production assets. Service writes need their own folder.
  await unlink(resolve(f.root, 'assets'));
  await mkdir(resolve(f.root, 'assets'));
  return { ...f, store: new AssetStore(f.root) };
}
const svg = (fill = '#ffffff') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><rect x="10" y="10" width="80" height="20" fill="${fill}"/></svg>`);
const png = (fill = '#142331') => ({ filename: 'studio.png', bytes: new Resvg(svg(fill), { font: { loadSystemFonts: false } }).render().asPng() });
function logo(inspection: AssetInspection): LogoRevision {
  assert.equal(inspection.asset.kind, 'logo');
  return inspection.asset as LogoRevision;
}
const pin = (asset: LogoRevision) => ({ id: asset.id, revision: asset.revision });
const conflict = (error: unknown) => error instanceof AssetError && error.status === 409;
async function setDefaults(store: AssetStore, theme: string, defaults: ThemeAssetDefaults) {
  return store.setDefaults(theme, defaults, (await store.defaults(theme)).revision);
}
async function createLogo(store: AssetStore, id = 'studio') {
  return logo(await store.createLogo({ id, name: 'Studio', description: 'Preserve the supplied colors.' }, png()));
}

test('asset changes recover old incomplete locks and locks left by terminated owners', async () => {
  const f = await storeFixture();
  try {
    await mkdir(resolve(f.root, '.opendoc'), { recursive: true });
    const lock = resolve(f.root, '.opendoc/assets.lock');
    for (const owner of ['', '{ interrupted', 'null', JSON.stringify({ pid: 2_147_483_647 })]) {
      await writeFile(lock, owner);
      const old = new Date(Date.now() - 60_000);
      await utimes(lock, old, old);
      assert.deepEqual((await setDefaults(f.store, 'neutral', { version: 1 })).defaults, { version: 1 });
      await assert.rejects(readFile(lock), { code: 'ENOENT' });
    }
  } finally { await f.cleanup(); }
});

test('asset changes preserve fresh incomplete reservations and old locks owned by a live process', async () => {
  const f = await storeFixture();
  try {
    await mkdir(resolve(f.root, '.opendoc'), { recursive: true });
    const lock = resolve(f.root, '.opendoc/assets.lock');
    for (const owner of ['', '{ interrupted', JSON.stringify({ pid: process.pid })]) {
      await writeFile(lock, owner);
      if (owner.includes('pid')) {
        const old = new Date(Date.now() - 60_000);
        await utimes(lock, old, old);
      }
      let completed = false;
      const waiting = setDefaults(f.store, 'neutral', { version: 1 }).then(() => { completed = true; });
      try {
        await new Promise(accept => setTimeout(accept, 100));
        assert.equal(completed, false);
        assert.equal(await readFile(lock, 'utf8'), owner);
      } finally {
        await rm(lock, { force: true });
        await waiting;
      }
    }
  } finally { await f.cleanup(); }
});

test('logo lifecycle preserves PNG and SVG originals, stable variations, guidance, and immutable revisions', async () => {
  const f = await storeFixture();
  try {
    const uploaded = png();
    const first = logo(await f.store.createLogo({ id: 'studio', name: 'Studio', description: 'Do not recolor.', variationName: 'On light backgrounds', variationDescription: 'Use on white paper.' }, uploaded));
    assert.equal(first.defaultVariation, 'default');
    assert.equal(first.variations[0].name, 'On light backgrounds');
    assert.equal(first.variations[0].description, 'Use on white paper.');
    const originalManifest = await readFile(assetRevisionPath(f.root, 'logo', first.id, first.revision));
    assert.deepEqual(await readFile(assetFile(f.root, 'logo', first.id, first.variations[0].original)), uploaded.bytes);

    const inverseOriginal = svg();
    const added = logo(await f.store.addVariation(first.id, { expectedRevision: first.revision, id: 'on-dark', name: 'On dark backgrounds', description: 'Use on black or navy surfaces.' }, { filename: 'inverse.svg', bytes: inverseOriginal }));
    assert.notEqual(added.revision, first.revision);
    assert.equal(added.defaultVariation, 'default');
    assert.deepEqual(added.variations.map(item => item.id), ['default', 'on-dark']);
    const inverse = added.variations[1];
    assert.equal(inverse.original.mime, 'image/svg+xml');
    assert.equal(inverse.image.mime, 'image/png');
    assert.deepEqual(await readFile(assetFile(f.root, 'logo', first.id, inverse.original)), inverseOriginal);

    const selected = logo(await f.store.revise('logo', first.id, { expectedRevision: added.revision, defaultVariation: 'on-dark', variation: { id: 'on-dark', name: 'Inverse wordmark', description: 'Reserve for solid dark backgrounds.' } }));
    assert.equal(selected.defaultVariation, 'on-dark');
    assert.equal(selected.variations[1].description, 'Reserve for solid dark backgrounds.');
    assert.equal(logo(await f.store.inspect('logo', first.id, added.revision)).variations[1].description, 'Use on black or navy surfaces.');

    const replacementBytes = svg('#f8f0dc');
    const replaced = logo(await f.store.addVariation(first.id, { expectedRevision: selected.revision, replaceId: 'on-dark', name: 'Inverse wordmark' }, { filename: 'inverse-revised.svg', bytes: replacementBytes }));
    assert.equal(replaced.defaultVariation, 'on-dark');
    assert.equal(replaced.variations.length, 2);
    assert.equal(replaced.variations[1].id, inverse.id);
    assert.equal(replaced.variations[1].description, selected.variations[1].description);
    assert.notEqual(replaced.variations[1].original.hash, inverse.original.hash);
    assert.deepEqual(await readFile(assetFile(f.root, 'logo', first.id, inverse.original)), inverseOriginal);
    assert.deepEqual(await readFile(assetFile(f.root, 'logo', first.id, replaced.variations[1].original)), replacementBytes);
    assert.deepEqual(await readFile(assetRevisionPath(f.root, 'logo', first.id, first.revision)), originalManifest);
    const inspection = await f.store.inspect('logo', first.id);
    assert.deepEqual(new Set(inspection.versions.map(item => item.revision)), new Set([first.revision, added.revision, selected.revision, replaced.revision]));
  } finally { await f.cleanup(); }
});

test('invalid variation changes and failed imports leave the published logo intact', async () => {
  const f = await storeFixture();
  try {
    const first = await createLogo(f.store);
    const headFile = resolve(assetDirectory(f.root, 'logo', first.id), 'asset.json');
    const unchanged = await readFile(headFile);
    await assert.rejects(f.store.revise('logo', first.id, { expectedRevision: first.revision, removeVariation: 'default' }), /Choose another default/);
    await assert.rejects(f.store.revise('logo', first.id, { expectedRevision: first.revision, defaultVariation: 'absent' }), /Choose another default/);
    await assert.rejects(f.store.addVariation(first.id, { expectedRevision: first.revision, id: 'default', name: 'Duplicate' }, png()), conflict);
    await assert.rejects(f.store.addVariation(first.id, { expectedRevision: first.revision, replaceId: 'absent', name: 'Absent' }, png()), /variation to replace was not found/);
    await assert.rejects(f.store.addVariation(first.id, { expectedRevision: first.revision, name: 'Damaged' }, { filename: 'damaged.png', bytes: Buffer.from('not a PNG') }), /PNG/);
    await assert.rejects(f.store.createLogo({ id: first.id, name: 'Overwrite attempt' }, png()), conflict);
    await assert.rejects(f.store.createLogo({ id: 'broken-import', name: 'Broken' }, { filename: 'broken.svg', bytes: Buffer.from('<svg><rect></svg>') }), /well-formed/);
    assert.deepEqual(await readFile(headFile), unchanged);
    assert.deepEqual((await f.store.list('logo')).items.map(item => item.id), [first.id]);
    assert.deepEqual((await f.store.inspect('logo', first.id)).versions.map(item => item.revision), [first.revision]);
  } finally { await f.cleanup(); }
});

test('asset compare-and-swap serializes competing edits and rejects stale mutations', async () => {
  const f = await storeFixture();
  try {
    const first = await createLogo(f.store);
    const contenders = await Promise.allSettled([
      f.store.revise('logo', first.id, { expectedRevision: first.revision, name: 'Editor one' }),
      new AssetStore(f.root).revise('logo', first.id, { expectedRevision: first.revision, name: 'Editor two' }),
    ]);
    assert.equal(contenders.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = contenders.find(result => result.status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected' && conflict(rejected.reason));
    const current = await f.store.inspect('logo', first.id);
    assert.notEqual(current.head.revision, first.revision);
    assert.equal(current.versions.length, 2);
    await assert.rejects(f.store.revise('logo', first.id, { expectedRevision: first.revision, description: 'Stale guidance' }), conflict);
    await assert.rejects(f.store.archive('logo', first.id, first.revision), conflict);
    await assert.rejects(f.store.addVariation(first.id, { expectedRevision: first.revision, name: 'Stale variation' }, png()), conflict);
    assert.equal(readAssetHead(f.root, 'logo', first.id).revision, current.head.revision);
  } finally { await f.cleanup(); }
});

test('theme defaults use their own conflict token and validate a selected variation before saving', async () => {
  const f = await storeFixture();
  try {
    const first = await createLogo(f.store);
    const empty = await f.store.defaults('neutral');
    assert.deepEqual(empty.defaults, { version: 1 });
    const saved = await f.store.setDefaults('neutral', { version: 1, logo: { id: first.id, variation: 'default' } }, empty.revision);
    assert.notEqual(saved.revision, empty.revision);
    await assert.rejects(f.store.setDefaults('neutral', { version: 1 }, empty.revision), conflict);
    await assert.rejects(f.store.setDefaults('neutral', { version: 1, logo: { id: first.id, variation: 'unknown' } }, saved.revision), /available logo variation/);
    assert.deepEqual(await f.store.defaults('neutral'), saved);
  } finally { await f.cleanup(); }
});

test('archiving a theme default requires explicit clearing and Undo restores untouched relationships', async () => {
  const f = await storeFixture();
  try {
    const first = await createLogo(f.store);
    const defaults = await setDefaults(f.store, 'neutral', { version: 1, logo: { id: first.id, variation: 'default' } });
    const binding = await f.store.bind('proof', 'logo', first.id);
    await assert.rejects(f.store.archive('logo', first.id, first.revision), conflict);
    assert.deepEqual(await f.store.defaults('neutral'), defaults);
    assert.equal(readAssetHead(f.root, 'logo', first.id).archived, undefined);

    const archived = await f.store.archive('logo', first.id, first.revision, true);
    assert.equal(archived.head.archived, true);
    assert.deepEqual((await f.store.defaults('neutral')).defaults, { version: 1 });
    assert.equal((await f.store.list('logo')).items.length, 0);
    assert.equal((await f.store.list('logo', true)).items[0].archived, true);
    assert.deepEqual(readDocumentAssets(f.root, 'proof'), binding);
    assert.equal(readAssetRevision(f.root, 'logo', first.id, first.revision).revision, first.revision);
    assert.ok(await readFile(assetFile(f.root, 'logo', first.id, first.variations[0].image)));
    await assert.rejects(f.store.bind('proof', 'logo', first.id), /Restore this asset/);

    const restored = await f.store.restore('logo', first.id, first.revision);
    assert.equal(restored.head.archived, undefined);
    assert.deepEqual(await f.store.defaults('neutral'), defaults);
    assert.deepEqual(readDocumentAssets(f.root, 'proof'), binding);
    assert.equal((await f.store.list('logo')).items[0].revision, first.revision);
  } finally { await f.cleanup(); }
});

test('archive Undo preserves a later defaults edit while restoring other untouched themes', async () => {
  const f = await storeFixture();
  try {
    const original = await createLogo(f.store), replacement = await createLogo(f.store, 'partner');
    await setDefaults(f.store, 'neutral', { version: 1, logo: { id: original.id } });
    const otherDefaults = await setDefaults(f.store, 'civic-spectrum', { version: 1, logo: { id: original.id, variation: 'default' } });
    await f.store.archive('logo', original.id, original.revision, true);
    const edited = await setDefaults(f.store, 'neutral', { version: 1, logo: { id: replacement.id } });
    await f.store.restore('logo', original.id, original.revision);
    assert.deepEqual(await f.store.defaults('neutral'), edited);
    assert.deepEqual(await f.store.defaults('civic-spectrum'), otherDefaults);
  } finally { await f.cleanup(); }
});

test('document bindings keep exact revisions, named choices, and existing choices when defaults change', async () => {
  const f = await storeFixture();
  try {
    const first = await createLogo(f.store);
    const initial = await f.store.bind('proof', 'logo', first.id);
    assert.deepEqual(initial, { version: 1, logo: pin(first) });
    const later = logo(await f.store.addVariation(first.id, { expectedRevision: first.revision, id: 'on-dark', name: 'Inverse', description: 'Use on dark backgrounds.' }, { filename: 'inverse.svg', bytes: svg() }));
    await setDefaults(f.store, 'neutral', { version: 1, logo: { id: first.id, variation: 'on-dark' } });
    assert.deepEqual(readDocumentAssets(f.root, 'proof'), initial);
    const created = await createDocument(f.root, { id: 'new-report', title: 'New report', projectId: 'test-project' });
    assert.deepEqual(readDocumentAssets(f.root, created.id).logo, { ...pin(later), variation: 'on-dark' });
    await setDefaults(f.store, 'neutral', { version: 1 });
    assert.deepEqual(readDocumentAssets(f.root, created.id).logo, { ...pin(later), variation: 'on-dark' });

    const named = await f.store.bind('proof', 'logo', first.id, { name: 'partner', revision: later.revision, variation: 'on-dark' });
    assert.deepEqual(named.logo, pin(first));
    assert.deepEqual(named.logos?.partner, { ...pin(later), variation: 'on-dark' });
    await assert.rejects(f.store.bind('proof', 'logo', first.id, { revision: first.revision, variation: 'on-dark' }), /existing logo variation/);
    assert.deepEqual(readDocumentAssets(f.root, 'proof'), named);
    const usage = await f.store.usage('logo', first.id);
    const actualUsage = usage.documents.filter(item => item.id === 'proof').map(item => ({ revision: item.revision, roles: [...item.roles].sort() }));
    const expectedUsage = [{ revision: first.revision, roles: ['logo'] }, { revision: later.revision, roles: ['logo:partner'] }];
    const byRevision = (a: { revision: string }, b: { revision: string }) => a.revision.localeCompare(b.revision);
    assert.deepEqual(actualUsage.sort(byRevision), expectedUsage.sort(byRevision));

    const withoutDefault = await f.store.unbind('proof', 'logo');
    assert.equal(withoutDefault.logo, undefined);
    assert.deepEqual(withoutDefault.logos?.partner, named.logos?.partner);
    const cleared = await f.store.unbind('proof', 'logo', 'partner');
    assert.equal(Object.keys(cleared.logos ?? {}).length, 0);
    assert.equal(cleared.logo, undefined);
    assert.ok((await readdir(resolve(assetDirectory(f.root, 'logo', first.id), 'revisions'))).includes(`${first.revision}.json`));
  } finally { await f.cleanup(); }
});

test('malformed asset and historical neighbors remain isolated from valid catalog items', async () => {
  const f = await storeFixture();
  try {
    const first = await createLogo(f.store);
    await mkdir(assetDirectory(f.root, 'logo', 'broken'), { recursive: true });
    await writeFile(resolve(assetDirectory(f.root, 'logo', 'broken'), 'asset.json'), '{broken json');
    const invalidHistorical = 'e'.repeat(64);
    await writeFile(assetRevisionPath(f.root, 'logo', first.id, invalidHistorical), '{broken historical json');
    const catalog = await f.store.list('logo');
    assert.equal(catalog.items.length, 2);
    assert.equal(catalog.items.find(item => item.id === first.id)?.revision, first.revision);
    assert.equal(catalog.items.find(item => item.id === first.id)?.error, undefined);
    assert.match(catalog.items.find(item => item.id === 'broken')!.error!, /Cannot read asset metadata/);
    assert.deepEqual((await f.store.inspect('logo', first.id)).versions.map(item => item.revision), [first.revision]);
  } finally { await f.cleanup(); }
});

test('missing historical artwork does not hide the current asset and cannot become a silent replacement binding', async () => {
  const f = await storeFixture();
  try {
    const first = await createLogo(f.store);
    const current = logo(await f.store.addVariation(first.id, { expectedRevision: first.revision, replaceId: 'default', name: 'Updated mark' }, png('#805522')));
    await f.store.bind('proof', 'logo', first.id);
    const existing = readDocumentAssets(f.root, 'proof');
    const oldFile = assetFile(f.root, 'logo', first.id, first.variations[0].image);
    await unlink(oldFile);
    const catalog = await f.store.list('logo');
    assert.equal(catalog.items[0].revision, current.revision);
    assert.equal(catalog.items[0].error, undefined);
    await assert.rejects(f.store.bind('proof', 'logo', first.id, { revision: first.revision }), (error: unknown) => {
      assert.ok(error instanceof AssetError, 'A missing saved file needs a user-facing asset error.');
      assert.match(error.message, /studio/);
      assert.match(error.message, /missing|unavailable/i);
      assert.match(error.message, /restore|import/i);
      return true;
    });
    assert.deepEqual(readDocumentAssets(f.root, 'proof'), existing);
  } finally { await f.cleanup(); }
});

test('theme defaults reject missing themes and damaged assets before saving or creating a document', async () => {
  const f = await storeFixture();
  try {
    await assert.rejects(f.store.defaults('missing-theme'), /Theme missing-theme was not found/);
    const first = await createLogo(f.store);
    const before = await f.store.defaults('neutral');
    const defaults: ThemeAssetDefaults = { version: 1, logo: { id: first.id } };
    await unlink(assetFile(f.root, 'logo', first.id, first.variations[0].image));
    await assert.rejects(f.store.setDefaults('neutral', defaults, before.revision), /saved file.*missing/);
    assert.deepEqual(await f.store.defaults('neutral'), before);
    await writeFile(resolve(f.root, 'themes/neutral/assets.json'), JSON.stringify(defaults));
    assert.throws(() => resolveThemeAssets(f.root, 'neutral'), /saved file.*missing/);
  } finally { await f.cleanup(); }
});

test('archive undo validates saved relationships and skips a theme deleted after archiving', async () => {
  const f = await storeFixture();
  try {
    const first = await createLogo(f.store);
    await setDefaults(f.store, 'neutral', { version: 1, logo: { id: first.id } });
    await f.store.archive('logo', first.id, first.revision, true);
    const headFile = resolve(assetDirectory(f.root, 'logo', first.id), 'asset.json');
    const head = JSON.parse(await readFile(headFile, 'utf8'));
    for (const archivedDefaults of [[{ ...head.archivedDefaults[0], id: '../outside' }], [null], {}]) {
      await writeFile(headFile, JSON.stringify({ ...head, archivedDefaults }));
      await assert.rejects(f.store.restore('logo', first.id, first.revision), /archived theme defaults are invalid/);
    }
    await writeFile(headFile, JSON.stringify(head));
    await rm(resolve(f.root, 'themes/neutral'), { recursive: true });
    const restored = await f.store.restore('logo', first.id, first.revision);
    assert.equal(restored.head.archived, undefined);
    assert.ok(!(await readdir(resolve(f.root, 'themes'))).includes('neutral'));
  } finally { await f.cleanup(); }
});

test('adding a complete replacement set cannot silently turn a saved font into another family', async () => {
  const f = await storeFixture();
  try {
    const faces = (family: string) => Promise.all(['Regular', 'Semibold'].map(async face => ({
      filename: `${family}-${face}.ttf`, bytes: await readFile(resolve(projectRoot, `assets/fonts/OpenDoc${family}-${face}.ttf`)),
    })));
    const first = await f.store.createFont({ id: 'reading' }, await faces('Sans'));
    await assert.rejects(f.store.addFaces(first.asset.id, { expectedRevision: first.asset.revision }, await faces('Serif')), /same font family/);
    assert.equal(readAssetHead(f.root, 'font', first.asset.id).revision, first.asset.revision);
    assert.deepEqual((await f.store.inspect('font', first.asset.id)).versions.map(version => version.revision), [first.asset.revision]);
  } finally { await f.cleanup(); }
});
