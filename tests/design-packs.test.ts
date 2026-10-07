import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { collectPack } from '../src/packs/collect';
import { writeArchive } from '../src/packs/archive';
import { digest, type PackManifest } from '../src/packs/manifest';
import { exportPack, installPack, planInstall, readPack } from '../src/packs/packs';
import { AssetStore } from '../src/assets/store';
import { readAssetHead } from '../src/assets/files';
import { createFromTemplate } from '../src/server/templates';
import { createProject } from '../src/server/projects';
import { renderEntry } from '../src/server/render';
import { projectRoot } from './helpers';

async function put(root: string, path: string, source: string | Buffer) { await mkdir(dirname(resolve(root, path)), { recursive: true }); await writeFile(resolve(root, path), source); }
async function fixture(t: TestContext) {
  const container = await mkdtemp(resolve(tmpdir(), 'opendoc-packs-'));
  t.after(() => rm(container, { recursive: true, force: true }));
  const source = resolve(container, 'sender'), recipient = resolve(container, 'recipient');
  await mkdir(source); await mkdir(recipient);
  await cp(resolve(projectRoot, 'assets/fonts'), resolve(source, 'assets/fonts'), { recursive: true });
  await cp(resolve(projectRoot, 'themes/neutral'), resolve(source, 'themes/neutral'), { recursive: true });
  for (const file of ['index.ts', 'Specimen.tsx']) await cp(resolve(projectRoot, 'themes', file), resolve(source, 'themes', file));
  await put(source, 'themes/acme/index.ts', `import { theme as base } from '../neutral'; export const theme = {...base, id:'acme',name:'Acme'};`);
  await put(source, 'themes/acme/design.md', '# Acme\nA portable design.\n');
  await put(source, 'themes/acme/preview.tsx', `import {Document,Pages,Paragraph} from 'opendoc'; import {theme} from './index'; export const meta={title:'Acme',description:'Pack proof',theme:'acme'}; export default function Preview(){ return <Document title="Acme specimen" theme={theme}><Pages title="Acme specimen"><Paragraph id="proof">A portable design.</Paragraph></Pages></Document> }`);
  await put(source, 'templates/_shared/title.ts', `export const specimenTitle = 'Portable template';`);
  await put(source, 'templates/portable/template.json', JSON.stringify({ name: 'Portable', description: 'A portable template', format: 'A4', structure: ['Flowing prose'] }));
  await put(source, 'templates/portable/AGENTS.md', '# Portable\nLet content lead.\n');
  await put(source, 'templates/portable/index.tsx', `import {Document,Pages,Paragraph} from 'opendoc'; import type {DocTheme} from 'opendoc/themes'; export function Layout({theme,title}: {theme:DocTheme,title:string}){return <Document title={title} theme={theme}><Pages title={title}><Paragraph id="title">{title}</Paragraph></Pages></Document>}`);
  await put(source, 'templates/portable/preview.tsx', `import {Layout} from './index'; import {theme} from '../../themes/neutral'; import {specimenTitle} from '../_shared/title'; export const meta={title:'Portable',description:'Specimen',theme:'neutral'}; export default function Preview(){return <Layout theme={theme} title={specimenTitle}/>}`);
  await put(source, 'templates/portable/starter.tsx', `import {Layout} from '../../templates/portable';\n// @ts-ignore Replaced on creation.\nimport {theme} from "__OPENDOC_THEME_MODULE__"; export const meta={title:"__OPENDOC_TITLE__",description:'A new document',theme:"__OPENDOC_THEME__"}; export default function Instance(){return <Layout theme={theme} title="__OPENDOC_TITLE__"/>}`);
  await put(source, 'documents/private/index.tsx', 'private client material');
  await put(source, 'themes/acme/.env', 'PRIVATE_TOKEN=not-for-sharing');
  await put(source, 'themes/acme/comments.json', '{"private":"feedback"}');
  const file = resolve(container, 'design.opendoc.zip');
  return { container, source, recipient, file };
}

async function syntheticPack(source: string, file: string) {
  const collected = await collectPack(source, [{ kind: 'theme', id: 'acme' }]);
  collected.files.set('previews/theme-acme.pdf', Buffer.from('%PDF-1.7\nA supplied preview placeholder.'));
  const manifest: PackManifest = { format: 'opendoc-pack', schemaVersion: 1, id: 'test-pack', name: 'Test pack', version: '1.0.0', opendocVersion: '0.6.0', items: collected.items, assets: collected.assets,
    files: [...collected.files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: digest(bytes) })) };
  collected.files.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
  await writeFile(file, writeArchive(collected.files));
}

async function snapshot(root: string) {
  const out: Record<string, string> = {};
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) if (entry.isFile()) {
    const path = resolve(entry.parentPath, entry.name); out[path.slice(root.length + 1)] = digest(await readFile(path));
  }
  return out;
}

test('theme and template export/install round trip remains editable after the sender is removed', { timeout: 90_000 }, async t => {
  const f = await fixture(t);
  const logo = new AssetStore(f.source);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#123456"/></svg>');
  await logo.createLogo({ id: 'acme', name: 'Acme', description: 'Test mark' }, { filename: 'acme.svg', bytes: svg });
  await put(f.source, 'assets/logos/acme/LICENSE.txt', 'Test artwork may be redistributed.');
  await put(f.source, 'themes/acme/assets.json', JSON.stringify({ version: 1, logo: { id: 'acme' }, bodyFont: 'inter' }));
  const exported = await exportPack(f.source, { themes: ['acme'], templates: ['portable'], output: f.file });
  assert.equal(exported.previews.length, 2);
  const pack = await readPack(f.file), paths = [...pack.files.keys()];
  assert.ok(paths.includes('templates/_shared/title.ts'));
  assert.ok(paths.includes('assets/logos/acme/LICENSE.txt'));
  assert.ok(paths.includes('assets/fonts/inter/OFL.txt'));
  assert.ok(!paths.some(path => /private|\.env|comments|node_modules|\.history/.test(path)));
  assert.ok(pack.manifest.assets.some(asset => asset.kind === 'logo' && asset.id === 'acme' && asset.revision === readAssetHead(f.source, 'logo', 'acme').revision));
  await assert.rejects(exportPack(f.source, { themes: ['acme'], output: f.file }), /EEXIST/);
  await rename(f.source, f.source + '-removed');
  const dry = await installPack(f.recipient, f.file, { dryRun: true });
  assert.equal(dry.plan.conflicts.length, 0);
  assert.deepEqual(await readdir(f.recipient), []);
  await assert.rejects(installPack(f.recipient, f.file), /--trust/);
  await put(f.recipient, 'projects.json', '{"version":1,"projects":[],"assignments":{}}');
  await put(f.recipient, 'documents/private/index.tsx', 'Recipient-owned content');
  const installed = await installPack(f.recipient, f.file, { trust: true });
  assert.equal(installed.installed, true);
  assert.equal(await readFile(resolve(f.recipient, 'documents/private/index.tsx'), 'utf8'), 'Recipient-owned content');
  const before = await snapshot(f.recipient);
  const repeated = await installPack(f.recipient, f.file, { trust: true });
  assert.equal(repeated.installed, false);
  assert.deepEqual(await snapshot(f.recipient), before);
  await createProject(f.recipient, { id: 'new-project', name: 'New project' });
  const created = await createFromTemplate(f.recipient, 'portable', { id: 'new-report', title: 'Made on another machine', projectId: 'new-project', theme: 'acme' });
  assert.ok(created);
  const result = await renderEntry(f.recipient, resolve(f.recipient, 'documents/new-report/index.tsx'), 'new-report');
  assert.ok(result.artifact);
  assert.ok(result.artifact?.textTargets?.some(target => target.text.includes('Made on another machine')));
  if (result.directory) await rm(result.directory, { recursive: true, force: true });
});

test('inspection and conflict planning do not execute source; failures leave the destination intact', { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  await put(f.source, 'themes/acme/index.ts', 'import {theme as base} from "../neutral"; throw new Error("MUST_NOT_EXECUTE_DURING_INSPECTION"); export const theme = {...base,id:"acme"};');
  await syntheticPack(f.source, f.file);
  const pack = await readPack(f.file);
  assert.equal((await planInstall(f.recipient, pack)).conflicts.length, 0);
  await put(f.recipient, 'themes/acme/index.ts', 'My existing theme');
  const before = await snapshot(f.recipient);
  assert.ok((await installPack(f.recipient, f.file, { dryRun: true })).plan.conflicts.length);
  await assert.rejects(installPack(f.recipient, f.file, { trust: true }), /conflicts/);
  assert.deepEqual(await snapshot(f.recipient), before);
  await rm(resolve(f.recipient, 'themes'), { recursive: true });
  await assert.rejects(installPack(f.recipient, f.file, { trust: true }), /MUST_NOT_EXECUTE_DURING_INSPECTION/);
  assert.deepEqual(await snapshot(f.recipient), {});
});

test('export rejects broken, external, dynamic, and linked dependencies instead of making a partial pack', { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  for (const [source, pattern] of [
    ["import './missing';", /missing portable import/],
    ["type Missing = import('./missing-type').Missing;", /missing portable import/],
    ["import x from 'another-package';", /unsupported import/],
    ["import x from 'node:fs';", /unsupported import/],
    ["const x = import('./lazy');", /dynamic imports/],
    ["const x = process.cwd();", /process-dependent/],
    ["const image = {src: 'https://example.com/image.png'};", /local and workspace-relative/],
    ["const image = new URL('/private/photo.png', import.meta.url);", /literal relative path/],
    ["import '../../../private';", /Invalid portable|outside|missing portable/],
  ] as const) {
    await put(f.source, 'themes/acme/components.tsx', source);
    await assert.rejects(collectPack(f.source, [{ kind: 'theme', id: 'acme' }]), pattern);
  }
  await rm(resolve(f.source, 'themes/acme/components.tsx'));
  await symlink(resolve(f.source, 'documents/private/index.tsx'), resolve(f.source, 'themes/acme/components.tsx'));
  await assert.rejects(collectPack(f.source, [{ kind: 'theme', id: 'acme' }]), /ordinary local/);
});

test('install refuses tampered bytes, extra entries, version mismatches, and destination symlinks', { timeout: 60_000 }, async t => {
  const f = await fixture(t); await syntheticPack(f.source, f.file);
  const pack = await readPack(f.file);
  const tampered = new Map(pack.files); tampered.set('themes/acme/index.ts', Buffer.from('altered'));
  const bad = resolve(f.container, 'bad.zip'); await writeFile(bad, writeArchive(tampered));
  await assert.rejects(readPack(bad), /integrity/);
  const extra = new Map(pack.files); extra.set('assets/images/unlisted.txt', Buffer.from('unlisted'));
  await writeFile(bad, writeArchive(extra)); await assert.rejects(readPack(bad), /unlisted/);
  const incompatible = new Map(pack.files), manifest = structuredClone(pack.manifest); manifest.opendocVersion = '9.0.0';
  incompatible.set('manifest.json', Buffer.from(JSON.stringify(manifest))); await writeFile(bad, writeArchive(incompatible));
  await assert.rejects(installPack(f.recipient, bad, { trust: true }), /requires OpenDoc/);
  const outside = resolve(f.container, 'outside'); await mkdir(outside); await symlink(outside, resolve(f.recipient, 'themes'));
  await assert.rejects(installPack(f.recipient, f.file, { trust: true }), /ordinary local/);
  assert.deepEqual(await readdir(outside), []);
});

test('publication failure rolls back only newly added files', { timeout: 60_000 }, async t => {
  const f = await fixture(t); await syntheticPack(f.source, f.file);
  await put(f.recipient, 'assets/keep.txt', 'Preserve me');
  const before = await snapshot(f.recipient), original = fs.promises.link;
  let calls = 0;
  t.mock.method(fs.promises, 'link', async (...args: Parameters<typeof original>) => {
    if (++calls === 3) throw new Error('Simulated disk failure');
    return original(...args);
  });
  syncBuiltinESMExports();
  try { await assert.rejects(installPack(f.recipient, f.file, { trust: true }), /Simulated disk failure/); }
  finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
  assert.equal(calls, 3);
  assert.deepEqual(await snapshot(f.recipient), before);
});

test('a live service blocks installation without touching catalog files', { timeout: 60_000 }, async t => {
  const f = await fixture(t); await syntheticPack(f.source, f.file);
  const server = createServer((_request, response) => { response.setHeader('Content-Type', 'application/json'); response.end('{"token":"test-token"}'); });
  await new Promise<void>(accept => server.listen(0, '127.0.0.1', accept));
  t.after(() => new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  await put(f.recipient, '.opendoc/server.json', JSON.stringify({ origin: `http://127.0.0.1:${address.port}`, pid: process.pid, token: 'test-token' }));
  const before = await snapshot(f.recipient);
  await assert.rejects(installPack(f.recipient, f.file, { trust: true }), /Stop OpenDoc/);
  assert.deepEqual(await snapshot(f.recipient), before);
});


test('a valid preview cannot hide a broken template starter', { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  await put(f.source, 'templates/portable/starter.tsx', 'export default function Starter(){ return <MissingComponent/>; }');
  await assert.rejects(exportPack(f.source, { templates: ['portable'], output: f.file }), /typecheck failed/);
  await assert.rejects(readFile(f.file), { code: 'ENOENT' });
});
