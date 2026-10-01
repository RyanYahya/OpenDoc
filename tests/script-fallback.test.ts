import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { create as createFont } from 'fontkit';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readZip } from '@shbernal/ts-pptx/zip';
import { fixture, projectRoot } from './helpers';
import { renderOnce } from '../src/server/render';
import { readPresentationBytes } from '../src/server/pptx';
import { missingGlyphs, pageList } from '../src/app/missingGlyphs';
import type { RenderArtifact } from '../src/shared/types';

const documentSource = (body: string, theme = '') => `import {Document,Pages,Paragraph,Strong} from '../../src/document';
import {Em} from '@formepdf/react';
import { neutral } from '../../src/themes';
${theme}
export const meta={title:'Fallback proof',description:'Script fallback fixture',kind:'report',theme:${theme ? `'arabic-proof'` : `'neutral'`}};
export default function Proof(){return <Document title="Fallback proof"${theme ? ' theme={theme}' : ''}><Pages title="Fallback proof">${body}</Pages></Document>}`;

/** Every embedded TrueType program's PostScript name. */
function embeddedFaces(pdf: Buffer): string[] {
  const source = pdf.toString('latin1');
  return [...source.matchAll(/\/FontFile2\s+(\d+)\s+(\d+)\s+R\b/g)].map(([, id, generation]) => {
    const object = new RegExp(`(?:^|[\\r\\n])${id} ${generation} obj\\s*([\\s\\S]*?)stream\\r?\\n`).exec(source)!;
    const start = object.index + object[0].length, length = Number(/\/Length\s+(\d+)/.exec(object[1])![1]);
    return (createFont(inflateSync(pdf.subarray(start, start + length))) as { postscriptName: string }).postscriptName;
  });
}

/** Extracted text, and whether pdf.js found every shown glyph in its font program. */
async function readPdf(bytes: Buffer) {
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  try {
    const document = await task.promise;
    let text = '', missing = 0;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const operators = await page.getOperatorList();
      for (const args of operators.argsArray) if (Array.isArray(args?.[0])) for (const glyph of args[0] as { isInFont?: boolean; unicode?: string }[]) {
        if (glyph && typeof glyph === 'object' && 'isInFont' in glyph && glyph.unicode?.trim() && !glyph.isInFont) missing++;
      }
      text += (await page.getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' ');
    }
    return { text, missing };
  } finally { await task.destroy(); }
}

async function render(root: string) {
  const { artifact, directory } = await renderOnce(root, 'proof');
  const pdf = await readFile(resolve(directory, 'document.pdf'));
  return { artifact, directory, pdf };
}

/**
 * Replace the fixture's symlinked assets with ordinary files, as in a workspace: the
 * bundled OpenDoc faces, plus the built-in Arabic family unless an older workspace lacks it.
 */
async function localAssets(root: string, arabic: boolean) {
  await rm(resolve(root, 'assets'));
  await mkdir(resolve(root, 'assets/fonts'), { recursive: true });
  for (const file of (await readdir(resolve(projectRoot, 'assets/fonts'))).filter(file => file.endsWith('.ttf')))
    await cp(resolve(projectRoot, 'assets/fonts', file), resolve(root, 'assets/fonts', file));
  if (arabic) await cp(resolve(projectRoot, 'assets/fonts/noto-naskh-arabic'), resolve(root, 'assets/fonts/noto-naskh-arabic'), { recursive: true });
}

const fallbackUses = (artifact: RenderArtifact) => (artifact.assets ?? []).filter(use => use.id === 'noto-naskh-arabic');

test('Arabic words in an English document use the built-in Arabic family by weight', async () => {
  const f = await fixture();
  try {
    await localAssets(f.root, true);
    await writeFile(f.entry, documentSource(`
<Paragraph id="mixed">Develop the يا اخي writing and design.</Paragraph>
<Paragraph id="strong">Read <Strong>مرحبا بكم</Strong> aloud.</Paragraph>
<Paragraph id="bold" style={{fontWeight:700}}>Bold مرحبا text.</Paragraph>
<Paragraph id="italic">Italic <Em>مرحبا</Em> text.</Paragraph>`));
    const { artifact, pdf } = await render(f.root);
    assert.deepEqual(artifact.issues?.filter(issue => issue.code === 'missing-glyphs'), []);
    const { text, missing } = await readPdf(pdf);
    assert.equal(missing, 0, 'no shown glyph is missing from its font');
    for (const words of ['يا', 'اخي', 'مرحبا', 'بكم']) assert.ok(text.includes(words), `${words} is extracted from the PDF`);
    assert.doesNotMatch(text, /\?/);
    // Regular for body text and the upright face for italics; Strong's semibold and bold each use their own face.
    const faces = embeddedFaces(pdf);
    for (const face of ['NotoNaskhArabic-Regular', 'NotoNaskhArabic-SemiBold', 'NotoNaskhArabic-Bold']) assert.ok(faces.includes(face), `${face} in ${faces}`);
    assert.ok(!faces.includes('NotoNaskhArabic-Medium'), 'unused faces are not embedded');
    assert.deepEqual(fallbackUses(artifact).map(use => `${use.blockId}:${use.face}`).sort(), ['bold:700-normal', 'italic:400-normal', 'mixed:400-normal', 'strong:600-normal']);
    assert.ok(artifact.assetDependencies?.some(file => file.startsWith('assets/fonts/noto-naskh-arabic/revisions/')));
  } finally { await f.cleanup(); }
});

test('documents without Arabic, or whose theme already covers it, are unchanged', async () => {
  const theme = `const theme = { ...neutral, id: 'arabic-proof', fontFallbacks: ['Test Arabic'],
  fonts: [{ family: 'Test Arabic', src: 'themes/arabic-proof/NotoNaskhArabic-Regular.ttf' }] };`;
  const cases = [
    { name: 'English only', source: documentSource('<Paragraph id="english">Develop the writing and design.</Paragraph>') },
    // The theme's own Arabic family comes first, so the built-in one is never registered.
    { name: 'theme fallback', source: documentSource('<Paragraph id="mixed">Develop the يا اخي writing.</Paragraph>', theme) },
  ];
  const withAsset = await fixture(), without = await fixture();
  try {
    await localAssets(withAsset.root, true);
    await localAssets(without.root, false);
    for (const f of [withAsset, without]) {
      await mkdir(resolve(f.root, 'themes/arabic-proof'), { recursive: true });
      await copyFile(resolve(projectRoot, 'tests/fixtures/fonts/NotoNaskhArabic-Regular.ttf'), resolve(f.root, 'themes/arabic-proof/NotoNaskhArabic-Regular.ttf'));
    }
    for (const { name, source } of cases) {
      await writeFile(withAsset.entry, source);
      await writeFile(without.entry, source);
      const [current, reference] = [await render(withAsset.root), await render(without.root)];
      assert.ok(current.pdf.equals(reference.pdf), `${name}: the PDF is byte for byte the same`);
      assert.deepEqual(fallbackUses(current.artifact), [], name);
      assert.deepEqual(current.artifact.assetDependencies, reference.artifact.assetDependencies, name);
      assert.deepEqual(current.artifact.issues, [], name);
    }
  } finally { await withAsset.cleanup(); await without.cleanup(); }
});

test('without the built-in family the missing glyphs are still reported, and other scripts always are', async () => {
  const f = await fixture();
  try {
    await localAssets(f.root, false);
    await writeFile(f.entry, documentSource('<Paragraph id="p">English with مرحبا here.</Paragraph>'));
    const old = await render(f.root);
    const arabic = old.artifact.issues?.find(issue => issue.code === 'missing-glyphs');
    assert.equal(arabic?.severity, 'warning');
    assert.equal(arabic?.page, 1);
    assert.equal(arabic?.blockId, 'p');
    assert.ok(arabic?.characters?.includes('م'));
    assert.match(arabic!.message, /U\+0645 م/);

    await cp(resolve(projectRoot, 'assets/fonts/noto-naskh-arabic'), resolve(f.root, 'assets/fonts/noto-naskh-arabic'), { recursive: true });
    await writeFile(f.entry, documentSource('<Paragraph id="intro">Opening.</Paragraph><Paragraph id="p">English with مرحبا and 漢字 here.</Paragraph>'));
    const { artifact } = await render(f.root);
    const issues = artifact.issues?.filter(issue => issue.code === 'missing-glyphs') ?? [];
    assert.equal(issues.length, 1);
    assert.deepEqual(issues[0].characters, ['漢', '字'], 'the Arabic is covered; the CJK is not');
    assert.equal(issues[0].page, 1);
    assert.equal(issues[0].blockId, 'p');
    assert.match(issues[0].message, /U\+6F22 漢, U\+5B57 字/);
    assert.deepEqual(missingGlyphs(artifact.issues ?? []), { characters: [{ character: '漢', code: 'U+6F22' }, { character: '字', code: 'U+5B57' }], more: 0, pages: [1], first: { page: 1, blockId: 'p' } });
  } finally { await f.cleanup(); }
});

test('the reader notice names pages in plain language', () => {
  assert.equal(pageList('Slide', [2]), 'slide 2');
  assert.equal(pageList('Page', [2, 5]), 'pages 2 and 5');
  assert.equal(pageList('Page', [1, 3, 4]), 'pages 1, 3, and 4');
  assert.equal(missingGlyphs([{ code: 'text-overlap', severity: 'warning', message: 'x' }]), null);
});

test('PowerPoint names the Arabic fallback for the Arabic words it drew', async () => {
  const f = await fixture();
  try {
    await localAssets(f.root, true);
    const manifest = JSON.parse(await readFile(resolve(f.root, 'projects.json'), 'utf8'));
    await writeFile(resolve(f.root, 'projects.json'), JSON.stringify({ ...manifest, formats: { proof: 'presentation' } }));
    await writeFile(f.entry, `import {Presentation,Slide,Paragraph} from '../../src/document';
export const meta={title:'Fallback deck',description:'Script fallback fixture',theme:'neutral'};
export default function Proof(){return <Presentation title={meta.title}><Slide id="one"><Paragraph id="lead">Develop the يا اخي writing and design.</Paragraph></Slide></Presentation>}`);
    const { artifact, directory } = await renderOnce(f.root, 'proof');
    const parts = await readZip(await readPresentationBytes(directory, artifact.hash));
    const slide = Buffer.from(parts.get('ppt/slides/slide1.xml')!).toString();
    const runs = [...slide.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)].map(([run]) => ({ text: /<a:t>([^<]*)<\/a:t>/.exec(run)![1], latin: /<a:latin typeface="([^"]+)"/.exec(run)![1], cs: /<a:cs typeface="([^"]+)"/.exec(run)![1] }));
    // As in the PDF, the space after the Arabic words stays in their font.
    assert.deepEqual(runs.map(run => [run.text, run.cs]), [['Develop the ', 'OpenDoc Sans'], ['يا اخي ', 'Noto Naskh Arabic'], ['writing and design.', 'OpenDoc Sans']]);
    assert.ok(runs.every(run => run.latin === run.cs));
    assert.match(Buffer.from(parts.get('ppt/presentation.xml')!).toString(), /<p:font typeface="Noto Naskh Arabic"\/>/);
  } finally { await f.cleanup(); }
});
