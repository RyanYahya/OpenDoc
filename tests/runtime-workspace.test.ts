import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { documentDependencies, isRenderRuntimePath, renderRuntimeInputs } from '../src/server/dependencies';
import { renderOnce } from '../src/server/render';
import { readTheme, ThemeCatalog } from '../src/server/themes';
import { prepareFonts } from '../src/assets/imports';
import { applicationRoot, runtimeSource } from '../src/runtime/paths';
import { fixture, source } from './helpers';

async function independentWorkspace() {
  const f = await fixture();
  await rm(resolve(f.root, 'src'));
  await rm(resolve(f.root, 'node_modules'));
  await writeFile(resolve(f.root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'opendoc' } }));
  await writeFile(f.entry, source().replace("'../../src/document'", "'opendoc'"));
  return f;
}

test('installed runtime renders and drafts a workspace without source or dependencies, preserving authored ownership', async () => {
  const f = await independentWorkspace();
  try {
    const dependencies = await documentDependencies(f.root, f.entry);
    assert.equal(dependencies.readsFiles, false);
    assert.ok(dependencies.files.has(runtimeSource('document/index.tsx')));
    for (const file of ['package.json', 'package-lock.json', 'tsconfig.json']) {
      assert.ok(dependencies.files.has(resolve(f.root, file)));
      assert.equal(isRenderRuntimePath(f.root, resolve(f.root, file)), true);
    }
    for (const file of renderRuntimeInputs) {
      assert.ok(dependencies.files.has(file));
      assert.equal(isRenderRuntimePath(f.root, file), true);
    }
    const initial = await renderOnce(f.root, 'proof');
    assert.equal(initial.artifact.blocks.title.source?.file, 'documents/proof/index.tsx');
    const binding = initial.artifact.textTargets!.find(target => target.blockId === 'title')!.runs.find(run => run.source)!.source!;
    assert.equal(binding.file, 'documents/proof/index.tsx');
    const original = await readFile(f.entry, 'utf8');
    const value = 'An edited title from the installed runtime';
    const draft = await renderOnce(f.root, 'proof', 30_000, [{
      file: realpathSync(f.entry), originalDigest: binding.digest,
      contents: original.slice(0, binding.start) + value + original.slice(binding.end),
      replacements: [{ start: binding.start, end: binding.end, tokenLength: value.length, value }],
    }]);
    assert.equal(draft.artifact.blocks.title.text.trim().replace(/\s+/g, ' '), value);
    const corrected = draft.artifact.textTargets!.find(target => target.blockId === 'title')!.runs.find(run => run.source)!.source!;
    assert.equal(corrected.file, binding.file);
    assert.equal(corrected.value, value);
    assert.equal(corrected.bindingId, binding.bindingId);
    assert.equal(await readFile(f.entry, 'utf8'), original, 'Draft bundling leaves the source untouched.');
    assert.ok(draft.artifact.textTargets!.every(target => target.runs.every(run => !run.source || run.source.file.startsWith('documents/proof/'))));
  } finally { await f.cleanup(); }
});

test('workspace theme definitions resolve packaged APIs and packages while local imports stay fresh', async () => {
  const f = await independentWorkspace();
  const catalog = new ThemeCatalog(f.root);
  try {
    const folder = resolve(f.root, 'themes/custom');
    await mkdir(folder);
    await writeFile(resolve(folder, 'index.ts'), `import { validateTheme } from 'opendoc/themes';
import { version } from 'react';
import { neutral } from '../index';
import { label } from './label';
export const theme = {...neutral, id: 'custom', name: label, description: 'React ' + version};
validateTheme(theme);`);
    await writeFile(resolve(folder, 'label.ts'), "export const label = 'Initial theme';");
    await writeFile(resolve(folder, 'design.md'), '# Custom theme');
    await writeFile(resolve(folder, 'preview.tsx'), '// This definition test does not render a custom preview.');
    assert.equal((await readTheme(f.root, 'custom')).name, 'Initial theme');
    assert.match((await readTheme(f.root, 'custom')).description, /^React \d/);
    const dependencies = await documentDependencies(f.root, resolve(folder, 'index.ts'));
    assert.ok(dependencies.files.has(resolve(folder, 'label.ts')));
    await writeFile(resolve(folder, 'label.ts'), "export const label = 'Revised theme';");
    assert.equal((await readTheme(f.root, 'custom')).name, 'Revised theme');
    const preview = await catalog.preview('neutral');
    assert.equal(preview.error, undefined);
    assert.equal(preview.artifact?.meta.theme, 'neutral');
  } finally { await catalog.close(); await f.cleanup(); }
});

test('font preparation uses the installed worker and PDF standard fonts from an independent workspace', async () => {
  const f = await independentWorkspace();
  try {
    const result = await prepareFonts(f.root, [{ filename: 'OpenDocSans-Regular.ttf', bytes: await readFile(resolve(applicationRoot, 'assets/fonts/OpenDocSans-Regular.ttf')) }]);
    assert.equal(result.compatibility.status, 'ready', result.compatibility.message);
    assert.ok(result.specimen?.bytes);
  } finally { await f.cleanup(); }
});
