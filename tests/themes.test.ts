import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, readFile, readdir, realpath, writeFile, rm, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fixture, projectRoot, until } from './helpers';
import { ThemeCatalog, readTheme, readThemeGuide, readThemePaths } from '../src/server/themes';
import { renderOnce } from '../src/server/render';
import { neutral, validateTheme } from '../themes';

const exec = promisify(execFile);

async function custom(root: string, id = 'custom') {
  const folder = resolve(root, 'themes', id);
  await mkdir(folder, { recursive: true });
  await writeFile(resolve(folder, 'index.ts'), `import { neutral } from '../index'; export const theme = { ...neutral, id: '${id}', name: 'Custom proof', description: 'A runtime discovery proof.' };`);
  await writeFile(resolve(folder, 'design.md'), '# Custom proof\n\nA restrained system for a local integration specimen.\n');
  await writeFile(resolve(folder, 'preview.tsx'), `import { Document, Pages, TitleBlock } from '../../src/document'; import {theme} from './index'; export const meta = {title:'Custom specimen',description:'Integration proof',theme:theme.id}; export default function Preview(){ return <Document title={meta.title} theme={theme}><Pages title={meta.title}><TitleBlock id="opening" title={meta.title}/></Pages></Document> }`);
  return folder;
}

test('theme discovery is lightweight, current, isolated from malformed neighbors, and path-contained', async () => {
  const f = await fixture(); const catalog = new ThemeCatalog(f.root);
  try {
    const initial = await catalog.list();
    for (const id of ['civic-spectrum', 'field-manual', 'mckinsey-consulting', 'neutral', 'opendoc-neutral']) {
      assert.ok(initial.some(item => item.id === id), `Bundled theme ${id} is discoverable alongside custom themes.`);
    }
    assert.ok(initial.every(item => !item.error));
    const baseline = initial.length;
    await mkdir(resolve(f.root, 'themes/incomplete'));
    await assert.rejects(readFile(resolve(f.root, '.opendoc/renders')), /ENOENT/);
    const folder = await custom(f.root);
    catalog.invalidate();
    assert.equal((await catalog.list()).find(item => item.id === 'custom')?.name, 'Custom proof');
    assert.match((await catalog.list()).find(item => item.id === 'incomplete')?.error ?? '', /index\.ts/);
    await writeFile(resolve(folder, 'index.ts'), 'export const theme = {id:"wrong"}'); catalog.invalidate();
    const broken = await catalog.list(); assert.ok(broken.find(item => item.id === 'custom')?.error); assert.equal(broken.filter(item => !item.error).length, baseline);
    await writeFile(resolve(folder, 'index.ts'), 'throw null; export const theme = {};'); catalog.invalidate();
    const thrown = await catalog.list(); assert.equal(thrown.find(item => item.id === 'custom')?.error, 'null'); assert.equal(thrown.filter(item => !item.error).length, baseline);
    await assert.rejects(readTheme(f.root, '../neutral'), /Invalid theme ID/);
    await rm(resolve(folder, 'design.md')); await symlink(resolve(f.root, 'package.json'), resolve(folder, 'design.md'));
    await assert.rejects(readThemeGuide(f.root, 'custom'), /outside/);
  } finally { await catalog.close(); await f.cleanup(); }
});

test('catalog preserves authored palettes and geometry while component discovery remains lazy and contained', async () => {
  const f = await fixture(); const catalog = new ThemeCatalog(f.root);
  try {
    const folder = await custom(f.root, 'design-proof');
    const palette = [
      { name: 'Ink', value: '#163038', role: 'Reading text and fine dividing rules.' },
      { name: 'Signal', value: '#D98324', role: 'One decisive marker on a page.' },
    ];
    const geometry = ['Align marginal labels to one fixed rail.', 'Use circular markers only for navigational steps.'];
    await writeFile(resolve(folder, 'index.ts'), `import {neutral} from '../index'; export const theme={...neutral,id:'design-proof',palette:${JSON.stringify(palette)},geometry:${JSON.stringify(geometry)}};`);
    assert.equal((await readThemePaths(f.root, 'design-proof')).components, undefined);
    await writeFile(resolve(folder, 'components.tsx'), `throw new Error('Catalog must not execute components'); export function Opening(){return null}`);
    const theme = await readTheme(f.root, 'design-proof');
    assert.deepEqual(theme.palette, palette);
    assert.deepEqual(theme.geometry, geometry);
    assert.equal((await readThemePaths(f.root, 'design-proof')).components, 'themes/design-proof/components.tsx');
    const summary = (await catalog.list()).find(item => item.id === 'design-proof');
    assert.ok(summary && !summary.error);
    assert.deepEqual(summary.palette, palette);
    assert.deepEqual(summary.geometry, geometry);
    await assert.rejects(readFile(resolve(f.root, '.opendoc/renders')), /ENOENT/);
    await rm(resolve(folder, 'components.tsx'));
    await symlink(resolve(f.root, 'package.json'), resolve(folder, 'components.tsx'));
    await assert.rejects(readTheme(f.root, 'design-proof'), /outside/);
    await assert.rejects(readThemePaths(f.root, 'design-proof'), /outside/);
  } finally { await catalog.close(); await f.cleanup(); }
});

test('palette and geometry metadata reject ambiguous colors and excessive context', () => {
  const color = { name: 'Ink', value: '#163038', role: 'Primary reading text.' };
  assert.doesNotThrow(() => validateTheme({ ...neutral, palette: [color], geometry: ['Keep one shared edge.'] }));
  assert.throws(() => validateTheme({ ...neutral, palette: [{ ...color, value: '#123' }] }), /#RRGGBB/);
  assert.throws(() => validateTheme({ ...neutral, palette: [color, { ...color, name: ' ink ' }] }), /unique/);
  assert.throws(() => validateTheme({ ...neutral, palette: Array.from({ length: 17 }, (_, i) => ({ ...color, name: `Color ${i}` })) }), /sixteen/);
  assert.throws(() => validateTheme({ ...neutral, geometry: Array(9).fill('A geometry rule.') }), /eight/);
  assert.throws(() => validateTheme({ ...neutral, geometry: [' '.repeat(30)] }), /short descriptions/);
});

test('specimens render on demand, serve only matching bytes, and recover after edits', async () => {
  const f = await fixture(); const catalog = new ThemeCatalog(f.root);
  try {
    const folder = await custom(f.root);
    const first = await catalog.preview('custom'); assert.ok(first.artifact, first.error);
    const bytes = await catalog.pdf('custom', first.artifact.hash); assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
    await assert.rejects(catalog.pdf('custom', 'stale'), /changed/);
    const path = resolve(folder, 'preview.tsx'); const source = await readFile(path, 'utf8');
    await writeFile(path, source.replace('Custom specimen', 'A changed specimen')); catalog.invalidate();
    const next = await catalog.preview('custom'); assert.ok(next.artifact, next.error); assert.notEqual(next.artifact.hash, first.artifact.hash);
    await assert.rejects(catalog.pdf('custom', first.artifact.hash), /changed/);
    await writeFile(path, source.replace('theme:theme.id', 'theme:"neutral"')); catalog.invalidate();
    assert.match((await catalog.preview('custom')).error ?? '', /meta.theme must match/);
    await writeFile(path, source); catalog.invalidate(); assert.ok((await catalog.preview('custom')).artifact);
  } finally { await catalog.close(); await f.cleanup(); }
});

test('document metadata cannot misidentify the executable theme', async () => {
  const f = await fixture();
  try { const source = await readFile(f.entry, 'utf8'); await writeFile(f.entry, source.replace("theme:'neutral'", "theme:'field-manual'")); await assert.rejects(renderOnce(f.root, 'proof'), /meta.theme must match/); }
  finally { await f.cleanup(); }
});


test('theme CLI exports its reported PDF bytes and retains them when inputs change during a check or preview', { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    const folder = await custom(f.root);
    const cli = resolve(projectRoot, 'src/server/themes-cli.ts');
    const args = ['--import', 'tsx', cli];
    const first = await exec(process.execPath, [...args, 'preview', 'custom', '--json'], { cwd: f.root, timeout: 10_000 });
    const result = JSON.parse(first.stdout);
    assert.equal(result.status, 'ready');
    assert.equal(await realpath(result.output), await realpath(resolve(f.root, 'output/themes/custom.pdf')));
    const reviewed = await readFile(result.output);
    assert.equal(reviewed.subarray(0, 4).toString(), '%PDF');
    assert.equal(createHash('sha256').update(reviewed).digest('hex'), result.hash);
    const previewFile = resolve(folder, 'preview.tsx');
    const original = await readFile(previewFile, 'utf8');
    const marker = resolve(f.root, '.opendoc/theme-render-started');
    const delayed = `import { writeFileSync } from 'node:fs'; import { resolve } from 'node:path';\n` + original.replace('function Preview(){', 'function Preview(){writeFileSync(resolve(process.cwd(), ".opendoc/theme-render-started"), "started"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 450);');
    for (const command of ['check', 'preview']) {
      await rm(marker, { force: true });
      await writeFile(previewFile, delayed);
      const pending = exec(process.execPath, [...args, command, 'custom', '--json'], { cwd: f.root, timeout: 10_000 })
        .then(value => ({ failed: false, ...value }), error => ({ failed: true, stdout: String(error.stdout), stderr: String(error.stderr) }));
      await until(async () => { try { await access(marker); return true; } catch { return false; } });
      if (command === 'check') await writeFile(previewFile, original.replace('Custom specimen', 'A newer specimen'));
      else await writeFile(resolve(folder, 'design.md'), '# A revised design\n\nThe design changed during the preview.\n');
      const failed = await pending;
      assert.equal(failed.failed, true, `${command} must reject changed inputs.`);
      assert.match(failed.stderr, /The theme changed/);
      assert.match(failed.stderr, /no theme PDF was replaced/);
      assert.equal(failed.stdout.trim(), '', 'A stale render never reports ready.');
      assert.deepEqual(await readFile(result.output), reviewed);
      assert.deepEqual(await readdir(resolve(f.root, 'output/themes')), ['custom.pdf']);
      assert.deepEqual(await readdir(resolve(f.root, '.opendoc/renders')), []);
    }
  } finally { await f.cleanup(); }
});


test('theme source changes retain unrelated specimens and follow shared imports', async () => {
  const f = await fixture(); const catalog = new ThemeCatalog(f.root);
  try {
    const folder = await custom(f.root);
    await catalog.list();
    const first = await catalog.preview('custom');
    const neutral = await catalog.preview('neutral');
    const before = await catalog.list();
    const file = resolve(folder, 'index.ts');
    await writeFile(file, (await readFile(file, 'utf8')).replace('Custom proof', 'Updated custom proof'));
    assert.deepEqual(await catalog.noteChange(file), ['custom']);
    const next = await catalog.list();
    assert.equal(next.find(item => item.id === 'neutral')!.revision, before.find(item => item.id === 'neutral')!.revision);
    assert.equal(next.find(item => item.id === 'custom')!.name, 'Updated custom proof');
    assert.strictEqual((await catalog.preview('neutral')).artifact, neutral.artifact);
    const updated = await catalog.preview('custom');
    assert.notStrictEqual(updated.artifact, first.artifact);
    await catalog.noteChange(resolve(f.root, 'themes/neutral/index.ts'));
    assert.notStrictEqual((await catalog.preview('custom')).artifact, updated.artifact);
  } finally { await catalog.close(); await f.cleanup(); }
});
