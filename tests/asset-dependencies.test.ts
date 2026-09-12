import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fixture, projectRoot, settled, source, until } from './helpers';
import { assetHash } from '../src/assets/files';
import type { AssetFile, LogoRevision } from '../src/shared/assets';
import { documentDependencies } from '../src/server/dependencies';
import { captureExportInputs, captureEntryExportInputs } from '../src/server/export-inputs';
import { Workspace } from '../src/server/workspace';
import { ThemeCatalog } from '../src/server/themes';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
async function assetsFixture() {
  const f = await fixture();
  // Fixtures use a symlink for legacy files. Managed records intentionally require ordinary local files.
  await rm(resolve(f.root, 'assets'));
  await mkdir(resolve(f.root, 'assets/fonts'), { recursive: true });
  for (const file of (await readdir(resolve(projectRoot, 'assets/fonts'))).filter(file => file.endsWith('.ttf')))
    await cp(resolve(projectRoot, 'assets/fonts', file), resolve(f.root, 'assets/fonts', file));
  return f;
}
async function logo(root: string, id = 'brand', name = 'Brand', description = 'Use on light backgrounds.') {
  const hash = assetHash(png);
  const file: AssetFile = { file: `files/${hash}.png`, hash, mime: 'image/png', bytes: png.length, width: 1, height: 1 };
  const contents = { version: 1 as const, kind: 'logo' as const, id, name, description, createdAt: new Date().toISOString(), defaultVariation: 'primary', variations: [{ id: 'primary', name: 'Primary', description, original: file, image: file }] };
  const record: LogoRevision = { ...contents, revision: assetHash(JSON.stringify(contents)) };
  const folder = resolve(root, 'assets/logos', id);
  await mkdir(resolve(folder, 'files'), { recursive: true }); await mkdir(resolve(folder, 'revisions'), { recursive: true });
  await writeFile(resolve(folder, file.file), png);
  await writeFile(resolve(folder, `revisions/${record.revision}.json`), JSON.stringify(record));
  await writeFile(resolve(folder, 'asset.json'), JSON.stringify({ version: 1, kind: 'logo', id, revision: record.revision }));
  return { record, path: resolve(folder, file.file), head: resolve(folder, 'asset.json'), manifest: resolve(folder, `revisions/${record.revision}.json`) };
}
async function bind(root: string, record: LogoRevision) {
  await writeFile(resolve(root, 'documents/proof/assets.json'), JSON.stringify({ version: 1, logo: { id: record.id, revision: record.revision } }));
}

test('pinned documents and export guards track immutable files while ignoring catalog publications and theme defaults', async () => {
  const f = await assetsFixture(); const workspace = new Workspace(f.root);
  try {
    const first = await logo(f.root); await bind(f.root, first.record);
    await workspace.refresh(); await settled(workspace);
    assert.equal(workspace.states.get('proof')?.status, 'ready', workspace.states.get('proof')?.error);
    const dependencies = await documentDependencies(f.root, f.entry);
    assert.equal(dependencies.readsFiles, false);
    assert.ok(dependencies.files.has(first.manifest)); assert.ok(dependencies.files.has(first.path));
    assert.equal(dependencies.files.has(first.head), false);
    const unchanged = await captureExportInputs(f.root, 'proof');
    const revision = workspace.states.get('proof')!.revision;
    const other = await logo(f.root, 'unrelated');
    assert.deepEqual(workspace.noteChange(other.head), []);
    const defaults = resolve(f.root, 'themes/neutral/assets.json');
    await writeFile(defaults, JSON.stringify({ version: 1, logo: { id: 'brand' } }));
    assert.deepEqual(workspace.noteChange(defaults), []);
    // Publishing revised guidance reuses bytes, as the real store does.
    const contents = { ...first.record, description: 'Use this identity in a light masthead.' };
    const { revision: _old, ...versioned } = contents;
    const next = { ...versioned, revision: assetHash(JSON.stringify(versioned)) };
    const nextPath = resolve(f.root, `assets/logos/brand/revisions/${next.revision}.json`);
    await writeFile(nextPath, JSON.stringify(next));
    await writeFile(first.head, JSON.stringify({ version: 1, kind: 'logo', id: 'brand', revision: next.revision }));
    assert.deepEqual(workspace.noteChange(nextPath), []); assert.deepEqual(workspace.noteChange(first.head), []);
    assert.equal(unchanged(), true); assert.equal(workspace.states.get('proof')!.revision, revision);
    await writeFile(first.path, png);
    assert.equal(unchanged(), false, 'Even a same-byte rewrite of a pinned file invalidates the in-flight snapshot.');
    assert.deepEqual(workspace.noteChange(first.path), ['proof']);
  } finally { await workspace.close(); await f.cleanup(); }
});

test('corrupt pins fail without replacing the last PDF and missing historical files recover through exact dependencies', async () => {
  const f = await assetsFixture(); const workspace = new Workspace(f.root);
  try {
    const asset = await logo(f.root); await bind(f.root, asset.record);
    await writeFile(f.entry, source('<Logo width={20}/>').replace('Cite,References}', 'Cite,References,Logo}'));
    await workspace.refresh(); await settled(workspace);
    const state = workspace.states.get('proof')!; assert.equal(state.status, 'ready', state.error);
    const hash = state.artifact!.hash;
    await writeFile(asset.path, 'externally changed historical logo');
    workspace.noteChange(asset.path); await workspace.flushChanges(); await settled(workspace);
    assert.equal(state.status, 'error'); assert.match(state.error!, /changed outside OpenDoc/); assert.equal(state.artifact!.hash, hash);
    await rm(asset.path); workspace.noteChange(asset.path); await workspace.flushChanges(); await settled(workspace);
    assert.equal(state.status, 'error');
    await writeFile(asset.path, png);
    assert.deepEqual(workspace.noteChange(asset.path), ['proof']); await workspace.flushChanges(); await settled(workspace);
    assert.equal(state.status, 'ready', state.error);
  } finally { await workspace.close(); await f.cleanup(); }
});

test('arbitrary author filesystem readers keep conservative asset and default freshness guards', async () => {
  const f = await assetsFixture();
  try {
    await writeFile(f.entry, "import {readFileSync} from 'node:fs'; const authored = readFileSync('package.json','utf8');\n" + source('<Paragraph id="authored">{authored}</Paragraph>'));
    assert.equal((await documentDependencies(f.root, f.entry)).readsFiles, true);
    const unchanged = await captureExportInputs(f.root, 'proof');
    await logo(f.root, 'new-brand');
    assert.equal(unchanged(), false);
  } finally { await f.cleanup(); }
});

test('the first managed logo preserves export freshness while loose legacy artwork stays watched', async () => {
  const f = await assetsFixture();
  try {
    const unchanged = await captureExportInputs(f.root, 'proof');
    await logo(f.root);
    assert.equal(unchanged(), true, 'Creating the logo catalog is not a document edit.');
    const artwork = resolve(f.root, 'assets/logos/legacy.png');
    await writeFile(artwork, png);
    assert.equal(unchanged(), false, 'Unmanaged shared artwork keeps the conservative export contract.');
    const legacy = await captureExportInputs(f.root, 'proof');
    await writeFile(artwork, 'changed legacy artwork');
    assert.equal(legacy(), false);
  } finally { await f.cleanup(); }
});

test('theme catalog and specimen guards follow current defaults without invalidating unrelated themes', async () => {
  const f = await assetsFixture(); const catalog = new ThemeCatalog(f.root);
  try {
    const initial = await catalog.list();
    const first = await logo(f.root);
    assert.deepEqual(await catalog.noteChange(first.head), []);
    assert.equal((await catalog.list()).find(item => item.id === 'neutral')!.revision, initial.find(item => item.id === 'neutral')!.revision);
    const defaults = resolve(f.root, 'themes/neutral/assets.json');
    await writeFile(defaults, JSON.stringify({ version: 1, logo: { id: 'brand' } }));
    assert.deepEqual(await catalog.noteChange(defaults), ['neutral']);
    const next = await catalog.list();
    assert.notEqual(next.find(item => item.id === 'neutral')!.revision, initial.find(item => item.id === 'neutral')!.revision);
    assert.equal(next.find(item => item.id === 'civic-spectrum')!.revision, initial.find(item => item.id === 'civic-spectrum')!.revision);
    assert.deepEqual(next.find(item => item.id === 'neutral')!.assetDefaults, { version: 1, logo: { id: 'brand' } });
    const unchanged = await captureEntryExportInputs(f.root, resolve(f.root, 'themes/neutral/preview.tsx'));
    await writeFile(first.head, JSON.stringify({ version: 1, kind: 'logo', id: 'brand', revision: first.record.revision, archived: true }));
    assert.equal(unchanged(), false, 'A transient specimen captures its current asset head.');
    assert.deepEqual(await catalog.noteChange(first.head), ['neutral']);
  } finally { await catalog.close(); await f.cleanup(); }
});

test('context distinguishes selected assets, saved pins, current defaults and stale rendered use, and clears selection on navigation', async () => {
  const f = await assetsFixture(); const workspace = new Workspace(f.root);
  try {
    const asset = await logo(f.root); await bind(f.root, asset.record);
    await writeFile(resolve(f.root, 'themes/neutral/assets.json'), JSON.stringify({ version: 1, logo: { id: 'brand' } }));
    await workspace.refresh(); await settled(workspace);
    await workspace.setContext({ documentId: null, blockId: null, page: 1, selectedAsset: { kind: 'logo', id: 'brand', variation: 'primary' } });
    let context = JSON.parse(await readFile(resolve(f.root, '.opendoc/current.json'), 'utf8'));
    assert.equal(context.selectedAsset.asset.revision, asset.record.revision); assert.equal(context.documentAssets, null);
    await workspace.setContext({ documentId: 'proof', blockId: null, page: 1 });
    context = JSON.parse(await readFile(resolve(f.root, '.opendoc/current.json'), 'utf8'));
    assert.equal(context.selectedAsset, null); assert.equal(context.documentAssets.saved, true);
    assert.equal(context.documentAssets.bindings.logo.revision, asset.record.revision);
    assert.equal(context.theme.assetDefaults.appliesTo, 'new-documents'); assert.equal(context.theme.assetDefaults.choices.logo.id, 'brand');
    assert.equal(context.renderedAssets.current, true); assert.deepEqual(context.renderedAssets.uses, [], 'A selected logo is not implicitly inserted.');
    workspace.states.get('proof')!.status = 'error'; await workspace.writeContext();
    context = JSON.parse(await readFile(resolve(f.root, '.opendoc/current.json'), 'utf8'));
    assert.equal(context.renderedAssets.current, false); assert.ok(context.renderedAssets.renderHash);
  } finally { await workspace.close(); await f.cleanup(); }
});

test('HTTP context validates selected assets and live catalog watching keeps pinned documents ready', { timeout: 60_000 }, async () => {
  const f = await assetsFixture();
  const first = await logo(f.root); await bind(f.root, first.record);
  const child = spawn(process.execPath, ['--import', 'tsx', resolve(projectRoot, 'src/server/index.ts')], { cwd: f.root, env: { ...process.env, OPENDOC_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', data => logs += data); child.stderr.on('data', data => logs += data);
  try {
    let connection: { origin: string; token: string } | undefined;
    await until(async () => { try { connection = JSON.parse(await readFile(resolve(f.root, '.opendoc/server.json'), 'utf8')); return true; } catch { if (child.exitCode !== null) throw new Error(logs); return false; } });
    const { origin, token } = connection!;
    const post = (value: unknown) => fetch(`${origin}/api/context`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OpenDoc-Token': token, Origin: origin }, body: JSON.stringify(value) });
    const context = () => readFile(resolve(f.root, '.opendoc/current.json'), 'utf8').then(JSON.parse);
    const document = () => fetch(`${origin}/api/documents`).then(response => response.json()).then(items => items.find((item: { id: string }) => item.id === 'proof'));
    await until(async () => (await document())?.status === 'ready', 30_000);
    const revision = (await document()).revision;
    const base = { documentId: null, blockId: null, page: 1 };
    for (const selectedAsset of [{ kind: 'image', id: 'brand' }, { kind: 'logo', id: '../brand' }, { kind: 'logo', id: 'brand', revision: 'latest' }, { kind: 'logo', id: 'brand', variation: 'missing' }])
      assert.equal((await post({ ...base, selectedAsset })).status, 400);
    assert.equal((await post({ ...base, selectedAsset: { kind: 'logo', id: 'brand' } })).status, 200);
    assert.equal((await context()).selectedAsset.asset.revision, first.record.revision);
    const { revision: _old, ...contents } = first.record;
    const nextContents = { ...contents, description: 'Revised usage guidance.' };
    const next = { ...nextContents, revision: assetHash(JSON.stringify(nextContents)) };
    await writeFile(resolve(f.root, `assets/logos/brand/revisions/${next.revision}.json`), JSON.stringify(next));
    await writeFile(first.head, JSON.stringify({ version: 1, kind: 'logo', id: 'brand', revision: next.revision }));
    await until(async () => (await context()).selectedAsset?.head.revision === next.revision);
    assert.equal((await document()).revision, revision);
    assert.equal((await document()).status, 'ready');
    assert.equal((await context()).selectedAsset.asset.revision, first.record.revision, 'Selection preserves the inspected revision while the head advances.');
    await writeFile(resolve(f.root, 'themes/neutral/assets.json'), JSON.stringify({ version: 1, logo: { id: 'brand' } }));
    await until(async () => (await fetch(`${origin}/api/themes`).then(response => response.json())).find((theme: { id: string }) => theme.id === 'neutral')?.assetDefaults?.logo?.id === 'brand');
    assert.equal((await document()).revision, revision);
    assert.equal((await post({ ...base, themeId: 'neutral' })).status, 200);
    assert.equal((await context()).selectedAsset, null);
    assert.equal((await post({ ...base, documentId: 'proof' })).status, 200);
    assert.equal((await context()).documentAssets.bindings.logo.revision, first.record.revision);
    assert.equal((await context()).selectedAsset, null);
  } finally {
    child.kill('SIGTERM');
    await new Promise<void>(accept => { if (child.exitCode !== null) accept(); else child.once('exit', () => accept()); });
    await f.cleanup();
  }
});
