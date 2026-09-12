import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, projectRoot, until } from './helpers';
import type { DocumentState } from '../src/shared/types';
import type { ThemePreview, ThemeSummary } from '../src/shared/themes';

const exec = promisify(execFile);
const themeId = 'component-brand';
const palette = [{ name: 'Ink', value: '#15384B', role: 'Reading text' }, { name: 'Signal', value: '#BA5537', role: 'Important details' }];
const geometry = ['A generous opening followed by a narrow reading column.'];
const componentSource = `import { Document, Pages, TitleBlock, Paragraph } from '../../src/document';
import { theme } from './index';
export function BrandDocument({ title }: { title: string }) {
  return <Document title={title} theme={theme}><Pages title={title}>
    <TitleBlock id="brand-opening" title={title} />
    <Paragraph id="brand-copy">Brand component first revision</Paragraph>
  </Pages></Document>;
}
`;

async function addComponentTheme(root: string) {
  const folder = resolve(root, 'themes', themeId);
  await mkdir(folder, { recursive: true });
  await writeFile(resolve(folder, 'index.ts'), `import { theme as base } from '../neutral';
export const theme = { ...base, id: '${themeId}', name: 'Component brand', description: 'A theme with its own reusable composition.', palette: ${JSON.stringify(palette)}, geometry: ${JSON.stringify(geometry)} };
`);
  await writeFile(resolve(folder, 'design.md'), '# Component brand\n\nPRIVATE-DESIGN-GUIDE-TEXT: use the shared BrandDocument composition.\n');
  await writeFile(resolve(folder, 'components.tsx'), componentSource);
  await writeFile(resolve(folder, 'preview.tsx'), `import { BrandDocument } from './components'; import { theme } from './index';
export const meta = { title: 'Component specimen', description: 'A shared composition preview.', theme: theme.id };
export default function Preview() { return <BrandDocument title={meta.title} />; }
`);
  return folder;
}

function inspectTheme(root: string) {
  return exec(process.execPath, ['--import', 'tsx', resolve(projectRoot, 'src/server/themes-cli.ts'), 'inspect', themeId, '--json'], { cwd: root, timeout: 10_000 });
}

test('theme compositions are discovered live, linked compactly, and shared by previews and documents', { timeout: 45_000 }, async () => {
  const f = await fixture();
  const registry = await readFile(resolve(f.root, 'themes/index.ts'), 'utf8');
  const child = spawn(process.execPath, ['--import', 'tsx', resolve(projectRoot, 'src/server/index.ts')], { cwd: f.root, env: { ...process.env, OPENDOC_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', data => logs += data); child.stderr.on('data', data => logs += data);
  try {
    let connection: { origin: string; token: string } | undefined;
    await until(async () => { try { connection = JSON.parse(await readFile(resolve(f.root, '.opendoc/server.json'), 'utf8')); return true; } catch { if (child.exitCode !== null) throw new Error(logs); return false; } });
    const { origin, token } = connection!;
    const headers = { 'Content-Type': 'application/json', 'X-OpenDoc-Token': token, Origin: origin };
    const listThemes = () => fetch(`${origin}/api/themes`).then(response => response.json()) as Promise<ThemeSummary[]>;
    const state = async () => ((await fetch(`${origin}/api/documents`).then(response => response.json())) as DocumentState[]).find(document => document.id === 'proof')!;
    const preview = () => fetch(`${origin}/api/themes/${themeId}/preview`).then(response => response.json()) as Promise<ThemePreview>;
    const exportDocument = (hash: string) => fetch(`${origin}/api/documents/proof/export`, { method: 'POST', headers, body: JSON.stringify({ hash }) });
    const context = () => readFile(resolve(f.root, '.opendoc/current.json'), 'utf8').then(JSON.parse);
    await until(async () => (await state())?.status === 'ready');
    assert.ok(!(await listThemes()).some(theme => theme.id === themeId));
    const folder = await addComponentTheme(f.root);
    await until(async () => (await listThemes()).some(theme => theme.id === themeId && !theme.error));
    const summary = (await listThemes()).find(theme => theme.id === themeId)!;
    assert.deepEqual(summary.palette, palette); assert.deepEqual(summary.geometry, geometry);
    const inspected = JSON.parse((await inspectTheme(f.root)).stdout);
    assert.deepEqual(inspected.palette, palette); assert.deepEqual(inspected.geometry, geometry);
    assert.equal(inspected.paths.components, `themes/${themeId}/components.tsx`);
    assert.ok(!JSON.stringify(inspected).includes('PRIVATE-DESIGN-GUIDE-TEXT'));
    assert.ok(!JSON.stringify(inspected).includes('export function BrandDocument'));
    const selection = await fetch(`${origin}/api/context`, { method: 'POST', headers, body: JSON.stringify({ documentId: null, blockId: null, page: 1, themeId }) });
    assert.equal(selection.status, 200);
    const selected = await context();
    assert.equal(selected.theme.components, `themes/${themeId}/components.tsx`);
    assert.equal(selected.theme.guide, `themes/${themeId}/design.md`);
    assert.ok(!JSON.stringify(selected).includes('PRIVATE-DESIGN-GUIDE-TEXT'));
    assert.ok(!JSON.stringify(selected).includes('Brand component first revision'));
    await writeFile(f.entry, `import { BrandDocument } from '../../themes/${themeId}/components'; import { theme } from '../../themes/${themeId}';
export const meta = { title: 'A branded document', description: 'Uses a theme composition.', theme: theme.id };
export default function Draft() { return <BrandDocument title={meta.title} />; }
`);
    await until(async () => { const document = await state(); return document.status === 'ready' && document.artifact?.meta.theme === themeId; });
    const firstDocument = await state();
    const firstPreview = await preview(); assert.ok(firstPreview.artifact, firstPreview.error);
    assert.match(firstDocument.artifact!.blocks['brand-copy'].text, /first revision/);
    assert.match(firstPreview.artifact.blocks['brand-copy'].text, /first revision/);
    const firstExport = await exportDocument(firstDocument.artifact!.hash); assert.equal(firstExport.status, 200);
    const reviewed = new Uint8Array(await firstExport.arrayBuffer());
    const components = resolve(folder, 'components.tsx');
    await writeFile(components, componentSource.replace('first revision', 'second revision'));
    await until(async () => { const document = await state(); return document.status === 'ready' && document.revision > firstDocument.revision && /second revision/.test(document.artifact?.blocks['brand-copy'].text ?? ''); });
    const nextPreview = await preview(); assert.ok(nextPreview.artifact, nextPreview.error);
    assert.notEqual(nextPreview.artifact.hash, firstPreview.artifact.hash);
    assert.match(nextPreview.artifact.blocks['brand-copy'].text, /second revision/);
    assert.equal((await exportDocument(firstDocument.artifact!.hash)).status, 409);
    assert.deepEqual(new Uint8Array(await readFile(resolve(f.root, 'output/proof.pdf'))), reviewed);
    const oldThemePDF = await fetch(`${origin}/api/themes/${themeId}/pdf?hash=${firstPreview.artifact.hash}`);
    assert.notEqual(oldThemePDF.status, 200);
    assert.match((await oldThemePDF.json()).error, /changed/);
    assert.equal(await readFile(resolve(f.root, 'themes/index.ts'), 'utf8'), registry, 'The theme and its components need no registry edits.');
    await rm(components);
    await until(async () => (await state()).status === 'error');
    await until(async () => !(await context()).theme.components);
    const withoutComponents = JSON.parse((await inspectTheme(f.root)).stdout);
    assert.ok(!Object.hasOwn(withoutComponents.paths, 'components'), 'Only an existing component module gets a context pointer.');
    await writeFile(components, componentSource);
    await until(async () => (await state()).status === 'ready');
    await until(async () => (await context()).theme.components === `themes/${themeId}/components.tsx`);
  } finally {
    child.kill('SIGTERM');
    await Promise.race([new Promise(accept => child.once('exit', accept)), new Promise(accept => setTimeout(accept, 5000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await f.cleanup();
  }
});

test('editing a theme composition during CLI rendering retains its reviewed export', { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    const folder = await addComponentTheme(f.root);
    const cli = ['--import', 'tsx', resolve(projectRoot, 'src/server/themes-cli.ts'), 'preview', themeId, '--json'];
    const initial = JSON.parse((await exec(process.execPath, cli, { cwd: f.root, timeout: 10_000 })).stdout);
    const reviewed = await readFile(initial.output);
    const components = resolve(folder, 'components.tsx');
    const delayed = `import { writeFileSync } from 'node:fs'; import { resolve } from 'node:path';\n` + componentSource.replace('  return <Document', '  writeFileSync(resolve(process.cwd(), ".opendoc/component-render-started"), "started"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 450);\n  return <Document');
    await writeFile(components, delayed);
    const pending = exec(process.execPath, cli, { cwd: f.root, timeout: 10_000 })
      .then(value => ({ failed: false, ...value }), error => ({ failed: true, stdout: String(error.stdout), stderr: String(error.stderr) }));
    await until(async () => { try { await access(resolve(f.root, '.opendoc/component-render-started')); return true; } catch { return false; } });
    await writeFile(components, componentSource.replace('first revision', 'newer revision'));
    const stale = await pending;
    assert.equal(stale.failed, true); assert.match(stale.stderr, /The theme changed/); assert.equal(stale.stdout.trim(), '');
    assert.deepEqual(await readFile(initial.output), reviewed);
    assert.deepEqual(await readdir(resolve(f.root, 'output/themes')), [`${themeId}.pdf`]);
    assert.deepEqual(await readdir(resolve(f.root, '.opendoc/renders')), []);
  } finally { await f.cleanup(); }
});
