import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AssetStore } from '../src/assets/store';
import { prepareFonts } from '../src/assets/imports';
import { assetFile, readAssetHead, readAssetRevision } from '../src/assets/files';
import { fixture, projectRoot } from './helpers';

const families = { inter: 'Inter', roboto: 'Roboto', 'open-sans': 'Open Sans', lato: 'Lato', merriweather: 'Merriweather' };

test('five Google Fonts families ship with all six original faces, licenses, provenance, and specimens', async () => {
  for (const [id, name] of Object.entries(families)) {
    const head = readAssetHead(projectRoot, 'font', id);
    assert.equal(head.builtIn, true);
    const font = readAssetRevision(projectRoot, 'font', id, head.revision);
    assert.equal(font.kind, 'font');
    if (font.kind !== 'font') throw new Error('Expected font.');
    assert.equal(font.name, name);
    assert.deepEqual(font.faces.map(face => `${face.weight}-${face.style}`).sort(), ['400-italic', '400-normal', '600-italic', '600-normal', '700-italic', '700-normal']);
    const folder = resolve(projectRoot, 'assets/fonts', id);
    assert.match(await readFile(resolve(folder, 'OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
    const source = JSON.parse(await readFile(resolve(folder, 'source.json'), 'utf8'));
    for (const face of font.faces) {
      assetFile(projectRoot, 'font', id, face.file); // Verifies the saved bytes and hash.
      const original = source.files.find((file: { sha256: string }) => file.sha256 === face.file.hash);
      assert.ok(original);
      assert.equal(original.assetFile, face.file.file);
      assert.match(original.url, /^https:\/\/(?:fonts\.gstatic\.com\/|raw\.githubusercontent\.com\/google\/fonts\/)/);
    }
    assert.ok(font.specimen);
    assetFile(projectRoot, 'font', id, font.specimen);
    // Keep the existing compatibility gate honest when bundling standard fonts.
    assert.equal(font.compatibility.status, 'ready');
    assert.equal(font.compatibility.defaultEligible, true);
    const checked = await prepareFonts(projectRoot, await Promise.all(font.faces.map(async face => ({
      filename: face.file.file, bytes: await readFile(assetFile(projectRoot, 'font', id, face.file)),
    }))));
    assert.deepEqual(checked.compatibility, { status: 'ready', defaultEligible: true }, `${name} must pass with the installed PDF engine.`);
  }
});

test('file-only import reads embedded family and description even when the upload is renamed', async () => {
  const head = readAssetHead(projectRoot, 'font', 'lato');
  const font = readAssetRevision(projectRoot, 'font', 'lato', head.revision);
  if (font.kind !== 'font') throw new Error('Expected font.');
  const regular = font.faces.find(face => face.weight === 400 && face.style === 'normal')!;
  const bytes = await readFile(assetFile(projectRoot, 'font', 'lato', regular.file));
  const f = await fixture();
  try {
    // The fixture's assets link is replaced before creating any new asset.
    const { rm, mkdir } = await import('node:fs/promises');
    await rm(resolve(f.root, 'assets'));
    await mkdir(resolve(f.root, 'assets'));
    const result = await new AssetStore(f.root).createFont({}, [{ filename: 'download.ttf', bytes }]);
    assert.equal(result.asset.id, 'lato');
    assert.equal(result.asset.name, 'Lato');
    assert.match(result.asset.description, /^Lato is a sanserif typeface family designed in the Summer 2010/);
    assert.equal(result.head.builtIn, undefined);
  } finally { await f.cleanup(); }
});
