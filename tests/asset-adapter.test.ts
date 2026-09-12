import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cp, lstat, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';
import { ensureDocumentAssetAdapter } from '../src/assets/adapter';
import { assetHash } from '../src/assets/files';
import { createDocument } from '../src/server/create';
import { createFromTemplate } from '../src/server/templates';
import { renderOnce } from '../src/server/render';
import { fixture, projectRoot } from './helpers';

async function bindFixtureFont(root: string, id: string) {
  await unlink(resolve(root, 'assets'));
  await cp(resolve(projectRoot, 'assets/fonts'), resolve(root, 'assets/fonts'), { recursive: true });
  const family = resolve(root, 'assets/fonts/fixture-family');
  await mkdir(resolve(family, 'files'), { recursive: true }); await mkdir(resolve(family, 'revisions'));
  const faces = [];
  for (const [weight, face] of [[400, 'Regular'], [600, 'Semibold']] as const) {
    const bytes = await readFile(resolve(projectRoot, `assets/fonts/OpenDocSans-${face}.ttf`)), hash = assetHash(bytes), file = `files/${hash}.ttf`;
    await writeFile(resolve(family, file), bytes);
    faces.push({ id: `normal-${weight}`, family: 'OpenDoc Sans', weight, style: 'normal', file: { file, hash, mime: 'font/ttf', bytes: bytes.length } });
  }
  const content = { version: 1, kind: 'font', id: 'fixture-family', name: 'Fixture family', description: '', createdAt: '2026-09-10T00:00:00.000Z', compatibility: { status: 'ready', defaultEligible: true }, faces };
  const revision = assetHash(JSON.stringify(content));
  await writeFile(resolve(family, 'revisions', `${revision}.json`), JSON.stringify({ ...content, revision }));
  await writeFile(resolve(root, 'documents', id, 'assets.json'), JSON.stringify({ version: 1, bodyFont: { id: content.id, revision }, headingFont: { id: content.id, revision } }));
}

test('a legacy template gets the shared adapter before font binding and new adapters remain untouched', async () => {
  const f = await fixture();
  try {
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    const created = await createFromTemplate(f.root, 'executive-brief', { id: 'legacy-brief', projectId: 'test-project', title: 'A legacy brief', theme: 'opendoc-neutral' });
    const entry = resolve(f.root, created.entry), original = await readFile(entry, 'utf8');
    assert.match(await readFile(resolve(f.root, 'documents', created.id, 'theme.tsx'), 'utf8'), /from 'opendoc\/assets'/);
    assert.equal((await ensureDocumentAssetAdapter(f.root, created.id)).changed, false);
    assert.equal(await readFile(entry, 'utf8'), original);
    await writeFile(entry, original.replace('"./theme"', '"../../themes/opendoc-neutral"'));
    await unlink(resolve(f.root, 'documents', created.id, 'theme.tsx'));
    await unlink(resolve(f.root, 'documents', created.id, 'assets.json'));
    assert.deepEqual(await ensureDocumentAssetAdapter(f.root, created.id), { changed: true, theme: 'opendoc-neutral' });
    assert.match(await readFile(entry, 'utf8'), /from "\.\/theme"/);
    await bindFixtureFont(f.root, created.id);
    const rendered = await renderOnce(f.root, created.id);
    assert.ok(rendered.artifact.assets!.some(use => use.kind === 'font' && use.id === 'fixture-family'));
    assert.equal(rendered.artifact.meta.theme, 'opendoc-neutral');
    assert.equal((await ensureDocumentAssetAdapter(f.root, created.id)).changed, false);
  } finally { await f.cleanup(); }
});

test('legacy registry imports preserve aliases, types, body text, and independent base exports', async () => {
  const f = await fixture();
  try {
    const source = `import { Document, Pages, Paragraph } from '../../src/document';
import { neutral as selected, type DocTheme } from '../../themes';
export const meta={title:'Legacy aliases',description:'Do not replace ../../themes inside prose.',theme:'neutral'};
const useTheme:DocTheme=selected;
export default function Proof(){return <Document title={meta.title} theme={useTheme}><Pages title={meta.title}><Paragraph id="words">Keep all these words exactly.</Paragraph></Pages></Document>}`;
    await writeFile(f.entry, source);
    assert.equal((await ensureDocumentAssetAdapter(f.root, 'proof')).changed, true);
    const adapted = await readFile(f.entry, 'utf8');
    assert.match(adapted, /theme as selected/); assert.match(adapted, /type DocTheme.*from ['"]\.\.\/\.\.\/themes['"]/);
    assert.ok(adapted.includes(source.slice(source.indexOf('export const meta'))));
    await bindFixtureFont(f.root, 'proof');
    assert.ok((await renderOnce(f.root, 'proof')).artifact.assets!.some(use => use.id === 'fixture-family' && use.blockId === 'words'));
    const created = await createDocument(f.root, { id: 'direct', projectId: 'test-project', title: 'Direct exports', theme: 'opendoc-neutral' });
    const direct = resolve(f.root, created.entry);
    await writeFile(direct, (await readFile(direct, 'utf8')).replace("import { theme } from './theme';", "import { theme, colors } from '../../themes/opendoc-neutral';"));
    await unlink(resolve(f.root, 'documents/direct/theme.tsx'));
    await ensureDocumentAssetAdapter(f.root, 'direct');
    assert.match(await readFile(direct, 'utf8'), /import \{ colors \} from ['"]\.\.\/\.\.\/themes\/opendoc-neutral['"]/);
  } finally { await f.cleanup(); }
});

test('public authoring imports preserve aliases and recognize both current and legacy asset helpers', async () => {
  const f = await fixture();
  try {
    const source = `import { neutral as selected, themeType, type DocTheme } from 'opendoc/themes';
export const meta={title:'Public aliases',description:'Keep opendoc/themes inside prose.'};
const theme:DocTheme=selected;
export default themeType(theme,'h1');`;
    await writeFile(f.entry, source);
    assert.deepEqual(await ensureDocumentAssetAdapter(f.root, 'proof'), { changed: true, theme: 'neutral' });
    const adapted = await readFile(f.entry, 'utf8');
    assert.match(adapted, /theme as selected.*from ['"]\.\/theme['"]/);
    assert.match(adapted, /themeType, type DocTheme.*from ['"]opendoc\/themes['"]/);
    assert.ok(adapted.includes(source.slice(source.indexOf('export const meta'))));
    const adapter = resolve(f.root, 'documents/proof/theme.tsx');
    const current = await readFile(adapter, 'utf8');
    for (const helperSource of ['opendoc/assets', '../../src/assets']) {
      await writeFile(adapter, current.replaceAll('withDocumentAssets', 'applyAssets').replace('import { applyAssets,', 'import { withDocumentAssets as applyAssets,').replace('opendoc/assets', helperSource));
      assert.deepEqual(await ensureDocumentAssetAdapter(f.root, 'proof'), { changed: false });
      assert.equal(await readFile(f.entry, 'utf8'), adapted);
    }
    await writeFile(adapter, current.replace('withDocumentAssets,', 'type withDocumentAssets,'));
    await assert.rejects(ensureDocumentAssetAdapter(f.root, 'proof'), /custom or ambiguous theme import/);
    assert.equal(await readFile(f.entry, 'utf8'), adapted);
  } finally { await f.cleanup(); }
});

test('custom, ambiguous, or shadowed theme imports stay intact and ordinary Document needs no source migration', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await ensureDocumentAssetAdapter(f.root, 'proof'), { changed: false });
    for (const source of [
      "import {bindTemplate} from '../../src/template'; export default bindTemplate(customFactory,data);",
      "import {bindTemplate} from 'opendoc/template'; export default bindTemplate(customFactory,data);",
      "import {neutral} from '../../themes'; import {theme as other} from '../../themes/opendoc-neutral'; export default neutral;",
      "import {neutral} from 'opendoc/themes'; import {theme as other} from '../../themes/opendoc-neutral'; export default neutral;",
      "import * as design from '../../themes/neutral'; export default design;",
      "import * as design from 'opendoc/themes'; export default design;",
    ]) {
      await writeFile(f.entry, source);
      await assert.rejects(ensureDocumentAssetAdapter(f.root, 'proof'), /custom or ambiguous theme import/);
      assert.equal(await readFile(f.entry, 'utf8'), source);
      assert.deepEqual(await readdir(resolve(f.root, 'documents/proof')), ['index.tsx']);
    }
    const source = "import {theme} from '../../themes/neutral'; export default theme;";
    await writeFile(f.entry, source);
    for (const name of ['theme.tsx', 'theme.ts']) {
      await writeFile(resolve(f.root, 'documents/proof', name), 'Keep this authored adapter.');
      await assert.rejects(ensureDocumentAssetAdapter(f.root, 'proof'), /existing file was preserved/);
      assert.equal(await readFile(f.entry, 'utf8'), source);
      assert.equal(await readFile(resolve(f.root, 'documents/proof', name), 'utf8'), 'Keep this authored adapter.');
      assert.equal(await lstat(resolve(f.root, 'documents/proof/assets.json')).catch(() => null), null);
      await unlink(resolve(f.root, 'documents/proof', name));
    }
  } finally { await f.cleanup(); }
});

test('an edit arriving during adapter preparation wins and newly prepared companions are removed', async t => {
  const f = await fixture();
  try {
    const source = "import {theme} from '../../themes/neutral'; export default theme;";
    await writeFile(f.entry, source);
    const originalOpen = fs.promises.open;
    let intervened = false;
    t.mock.method(fs.promises, 'open', async (...args: Parameters<typeof fs.promises.open>) => {
      const handle = await originalOpen(...args);
      if (String(args[0]).endsWith('/theme.tsx') && !intervened) { intervened = true; await writeFile(f.entry, source + '\n// A newer authored change.\n'); }
      return handle;
    });
    syncBuiltinESMExports();
    await assert.rejects(ensureDocumentAssetAdapter(f.root, 'proof'), /changed while preparing/);
    assert.equal(await readFile(f.entry, 'utf8'), source + '\n// A newer authored change.\n');
    assert.deepEqual(await readdir(resolve(f.root, 'documents/proof')), ['index.tsx']);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await f.cleanup(); }
});
