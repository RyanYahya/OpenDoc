import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { AssetFile, AssetRevision, DocumentAssets, FontFace, FontRevision, LogoRevision } from '../src/shared/assets';
import { assetHash, assetDirectory, assetRevisionPath, readDocumentAssets } from '../src/assets/files';
import { assetFontFamily, withDocumentAssets } from '../src/assets';
import { prepareLogo } from '../src/assets/imports';
import { createDocument } from '../src/server/create';
import { createFromTemplate } from '../src/server/templates';
import { renderEntry, renderOnce } from '../src/server/render';
import { fixture, projectRoot } from './helpers';

async function assetsFixture() {
  const f = await fixture();
  // The shared test fixture links bundled assets; managed writes must be isolated.
  await unlink(resolve(f.root, 'assets'));
  await cp(resolve(projectRoot, 'assets/fonts'), resolve(f.root, 'assets/fonts'), { recursive: true });
  return f;
}
async function publish<T extends AssetRevision>(root: string, content: Omit<T, 'revision'>): Promise<T> {
  const revision = assetHash(JSON.stringify(content));
  const asset = { ...content, revision } as T;
  await mkdir(resolve(assetDirectory(root, asset.kind, asset.id), 'revisions'), { recursive: true });
  await writeFile(assetRevisionPath(root, asset.kind, asset.id, revision), JSON.stringify(asset));
  await writeFile(resolve(assetDirectory(root, asset.kind, asset.id), 'asset.json'), JSON.stringify({ version: 1, kind: asset.kind, id: asset.id, revision }));
  return asset;
}
async function saveFile(root: string, kind: 'logo' | 'font', id: string, bytes: Uint8Array, extension: string, mime: string, dimensions = {}): Promise<AssetFile> {
  const hash = assetHash(bytes), file = `files/${hash}.${extension}`;
  await mkdir(resolve(assetDirectory(root, kind, id), 'files'), { recursive: true });
  await writeFile(resolve(assetDirectory(root, kind, id), file), bytes);
  return { file, hash, mime, bytes: bytes.byteLength, ...dimensions };
}
async function logo(root: string, name = 'Studio mark', reversed = false) {
  const make = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" rx="12" fill="${fill}"/></svg>`;
  const png = new Resvg(make('#224488')).render().asPng();
  const inputs = [await prepareLogo({ filename: 'primary.png', bytes: png }), await prepareLogo({ filename: 'inverse.svg', bytes: Buffer.from(make('#ffffff')) })];
  const variations: LogoRevision['variations'] = [];
  for (const [index, input] of inputs.entries()) {
    for (const file of [input.original, input.image]) {
      await mkdir(resolve(assetDirectory(root, 'logo', 'studio'), 'files'), { recursive: true });
      await writeFile(resolve(assetDirectory(root, 'logo', 'studio'), file.file), file.contents);
    }
    const { contents: _original, ...original } = input.original, { contents: _image, ...image } = input.image;
    variations.push({ id: index ? 'inverse' : 'primary', name: index ? 'On dark backgrounds' : 'On light backgrounds', description: index ? 'Use on dark ink backgrounds.' : 'Use on white or pale backgrounds.', original, image });
  }
  return publish<LogoRevision>(root, { version: 1, kind: 'logo', id: 'studio', name, description: 'Do not recolor.', createdAt: '2026-09-10T00:00:00.000Z', defaultVariation: reversed ? 'inverse' : 'primary', variations });
}
async function font(root: string, id = 'text-family', weights: number[] = [400, 600], family = 'Sans', italic = false) {
  const faces: FontFace[] = [];
  for (const style of (italic ? ['normal', 'italic'] : ['normal']) as ('normal' | 'italic')[]) for (const weight of weights) faces.push({ id: `${style}-${weight}`, family: `OpenDoc ${family}`, weight, style, file: await saveFile(root, 'font', id,
    await readFile(resolve(projectRoot, `assets/fonts/OpenDoc${family}-${weight === 400 ? style === 'normal' ? 'Regular' : 'Italic' : style === 'normal' ? 'Semibold' : 'SemiboldItalic'}.ttf`)), 'ttf', 'font/ttf') });
  return publish<FontRevision>(root, { version: 1, kind: 'font', id, name: id, description: 'A fixture family with original bundled faces.', createdAt: '2026-09-10T00:00:00.000Z', compatibility: { status: 'ready', defaultEligible: true }, faces });
}
async function extracted(file: string) {
  const loading = getDocument({ data: new Uint8Array(await readFile(file)), standardFontDataUrl: resolve(projectRoot, 'node_modules/pdfjs-dist/standard_fonts') + '/' });
  try {
    const pdf = await loading.promise;
    let text = '';
    const fonts = new Set<string>();
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n), content = await page.getTextContent();
      for (const item of content.items) if ('str' in item) { text += item.str + ' '; fonts.add(item.fontName); }
    }
    return { text, fonts };
  } finally { await loading.destroy(); }
}
const ref = (value: AssetRevision) => ({ id: value.id, revision: value.revision });

// Creation is the policy boundary: changing a shared head must never change an old PDF's choices.
test('new documents capture theme assets before publication and keep exact versions through replacements', async () => {
  const f = await assetsFixture();
  try {
    const first = await logo(f.root), face = await font(f.root);
    await writeFile(resolve(f.root, 'themes/neutral/assets.json'), JSON.stringify({ version: 1, logo: { id: first.id }, bodyFont: face.id, headingFont: face.id }));
    const document = await createDocument(f.root, { id: 'original', title: 'Original branding', projectId: 'test-project' });
    assert.deepEqual(readDocumentAssets(f.root, document.id), { version: 1, logo: ref(first), bodyFont: ref(face), headingFont: ref(face) });
    const entry = resolve(f.root, document.entry);
    let source = await readFile(entry, 'utf8');
    assert.match(source, /from '\.\/theme'/);
    source = source.replace('TitleBlock, type', 'TitleBlock, Logo, Block, type').replace('<TitleBlock', '<Block id="brand"><Logo width={120} /></Block><TitleBlock');
    await writeFile(entry, source);
    const before = await renderOnce(f.root, document.id);
    const used = before.artifact.assets!.find(use => use.kind === 'logo')!;
    assert.deepEqual(used, { kind: 'logo', ...ref(first), variation: 'primary', blockId: 'brand' });
    assert.equal(before.artifact.pages[0].fragments.find(fragment => fragment.id === 'brand')!.height, 48);
    assert.ok(before.artifact.assetDependencies!.some(path => path.endsWith(`${first.revision}.json`)));
    assert.ok(before.artifact.assetDependencies!.every(path => !path.endsWith('asset.json')));
    const newer = await logo(f.root, 'Studio mark revised', true);
    const { revision: _fontRevision, ...fontContents } = face;
    const newerFont = await publish<FontRevision>(f.root, { ...fontContents, description: 'Updated usage guidance.' });
    const after = await renderOnce(f.root, document.id);
    assert.deepEqual(after.artifact.assets, before.artifact.assets);
    assert.equal(after.artifact.hash, before.artifact.hash);
    const next = await createDocument(f.root, { id: 'latest', title: 'Latest branding', projectId: 'test-project' });
    assert.equal(readDocumentAssets(f.root, next.id).logo!.revision, newer.revision);
    assert.equal(readDocumentAssets(f.root, next.id).bodyFont!.revision, newerFont.revision);
    await writeFile(resolve(f.root, 'themes/neutral/assets.json'), '{"version":1}');
    const empty = await createDocument(f.root, { id: 'unbranded', title: 'Unbranded', projectId: 'test-project' });
    assert.deepEqual(readDocumentAssets(f.root, empty.id), { version: 1 });
    assert.equal(readDocumentAssets(f.root, document.id).logo!.revision, first.revision);
  } finally { await f.cleanup(); }
});

test('semibold emphasis resolves to a real bold face without changing regular runs or missing styles', async t => {
  const installed = [
    ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'],
    ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
  ];
  let files: Buffer[] | undefined;
  for (const paths of installed) { try { files = await Promise.all(paths.map(path => readFile(path))); break; } catch { /* Try the other platform's static family. */ } }
  if (!files) { t.skip('No installed regular/bold test family is available.'); return; }
  const f = await assetsFixture();
  try {
    const id = 'true-bold', faces: FontFace[] = [];
    for (const [index, bytes] of files.entries()) faces.push({ id: index ? 'bold' : 'regular', family: 'True bold fixture', weight: index ? 700 : 400, style: 'normal', file: await saveFile(f.root, 'font', id, bytes, 'ttf', 'font/ttf') });
    const family = await publish<FontRevision>(f.root, { version: 1, kind: 'font', id, name: 'True bold family', description: 'Original system font files.', createdAt: '2026-09-10T00:00:00.000Z', compatibility: { status: 'ready', defaultEligible: true }, faces });
    await writeFile(resolve(f.root, 'documents/proof/assets.json'), JSON.stringify({ version: 1, bodyFont: ref(family), headingFont: ref(family) }));
    await writeFile(f.entry, `import {Document,Pages,Heading,Paragraph,Strong,Em} from '../../src/document';
export const meta={title:'Bold proof',description:'True face weight',theme:'neutral'};
export default function Proof(){return <Document title="Bold proof"><Pages title="Bold proof"><Heading id="heading">Office efficiency</Heading><Paragraph id="body">Before <Strong>office efficiency</Strong> after the emphasis.</Paragraph></Pages></Document>}`);
    const result = await renderOnce(f.root, 'proof');
    assert.ok(result.artifact.assets!.some(use => use.blockId === 'heading' && use.face === 'bold'));
    assert.ok(result.artifact.assets!.some(use => use.blockId === 'body' && use.face === 'bold'));
    assert.ok(result.artifact.assets!.some(use => use.blockId === 'body' && use.face === 'regular'));
    assert.match((await extracted(resolve(result.directory, 'document.pdf'))).text.replace(/\s+/g, ' '), /Before office efficiency after the emphasis/);
  } finally { await f.cleanup(); }
});

test('Logo uses explicit and named variations, preserves dimensions, and rejects missing or tampered references', async () => {
  const f = await assetsFixture();
  try {
    const mark = await logo(f.root);
    const bindings: DocumentAssets = { version: 1, logo: ref(mark), logos: { partner: { ...ref(mark), variation: 'inverse' } } };
    await writeFile(resolve(f.root, 'documents/proof/assets.json'), JSON.stringify(bindings));
    const source = `import {Document,Pages,Logo,Block} from '../../src/document';
export const meta={title:'Logo proof',description:'Artwork proportions',theme:'neutral'};
export default function Proof(){return <Document title="Logo proof"><Pages title="Logo proof"><Block id="primary"><Logo width={120}/></Block><Block id="inverse"><Logo name="partner" width={120} height={24}/></Block></Pages></Document>}`;
    await writeFile(f.entry, source);
    const rendered = await renderOnce(f.root, 'proof');
    assert.deepEqual(rendered.artifact.assets!.map(use => use.variation), ['primary', 'inverse']);
    assert.equal(rendered.artifact.pages[0].fragments.find(fragment => fragment.id === 'inverse')!.height, 24);
    await writeFile(f.entry, source.replace('name="partner"', 'variation="unknown"'));
    await assert.rejects(renderOnce(f.root, 'proof'), /has no variation.*unknown.*Available variations: primary, inverse/);
    await writeFile(f.entry, source.replace('name="partner"', 'name="missing"'));
    await assert.rejects(renderOnce(f.root, 'proof'), /No logo is bound as.*missing/);
    await writeFile(f.entry, source);
    await writeFile(resolve(assetDirectory(f.root, 'logo', mark.id), mark.variations[0].image.file), 'Changed outside OpenDoc');
    await assert.rejects(renderOnce(f.root, 'proof'), /saved file.*was changed outside OpenDoc/);
  } finally { await f.cleanup(); }
});

test('managed fonts reach templates and theme components while specialist and authored families remain explicit', async () => {
  const f = await assetsFixture();
  try {
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    const body = await font(f.root), heading = await font(f.root, 'display-family', [400, 600], 'Serif');
    await writeFile(resolve(f.root, 'themes/opendoc-neutral/assets.json'), JSON.stringify({ version: 1, bodyFont: body.id, headingFont: heading.id }));
    const created = await createFromTemplate(f.root, 'executive-brief', { id: 'branded-brief', title: 'Office efficiency', projectId: 'test-project', theme: 'opendoc-neutral' });
    const result = await renderOnce(f.root, created.id);
    assert.ok(result.artifact.assets!.some(use => use.id === heading.id));
    assert.ok(result.artifact.assets!.some(use => use.id === body.id));
    const pdf = await extracted(resolve(result.directory, 'document.pdf'));
    assert.match(pdf.text, /Office efficiency/);
    assert.ok(pdf.fonts.size >= 3, 'Body, display, and specialist fonts must stay distinct.');
    const bindings = { version: 1, bodyFont: ref(body), headingFont: ref(heading) };
    await writeFile(resolve(f.root, 'documents/proof/assets.json'), JSON.stringify(bindings));
    await writeFile(f.entry, `import {Document,Pages,Paragraph,Heading,Strong,Em,Text} from '../../src/document';
import {NeutralOpening} from '../../themes/opendoc-neutral/components'; import {theme} from '../../themes/opendoc-neutral';
export const meta={title:'Type proof',description:'Typography integration',theme:'opendoc-neutral'};
export default function Proof(){return <Document title="Type proof" theme={theme}><Pages title="Type proof"><NeutralOpening id="signal" eyebrow="TYPE" title="A font signal"/><Heading id="heading">Office efficiency</Heading><Paragraph id="body">A regular start <Strong>with bold words</Strong> and a regular finish.</Paragraph><Paragraph id="specialist" style={{fontFamily:'OpenDoc Mono'}}>Explicit code family</Paragraph></Pages></Document>}`);
    const proof = await renderOnce(f.root, 'proof');
    assert.ok(proof.artifact.assets!.some(use => use.blockId === 'signal-title' && use.id === heading.id));
    assert.ok(proof.artifact.assets!.some(use => use.blockId === 'body' && use.id === body.id && use.face === 'normal-600'));
    assert.ok(!proof.artifact.assets!.some(use => use.blockId === 'specialist'));
    const original = await readFile(f.entry, 'utf8');
    await writeFile(f.entry, original.replace('A regular start', '<Em>Missing italic</Em> A regular start'));
    await assert.rejects(renderOnce(f.root, 'proof'), /does not include 400 italic.*block body/);
    await writeFile(f.entry, original.replace('A regular start', '<Text style={{fontWeight:500}}>Missing medium</Text> A regular start'));
    await assert.rejects(renderOnce(f.root, 'proof'), /does not include 500 normal.*block body/);
  } finally { await f.cleanup(); }
});

test('theme and template specimens receive current defaults before factory evaluation without changing source', async () => {
  const f = await assetsFixture();
  try {
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    const family = await font(f.root, 'text-family', [400, 600], 'Sans', true);
    const themeFile = resolve(f.root, 'themes/neutral/index.ts'), original = await readFile(themeFile, 'utf8');
    await writeFile(resolve(f.root, 'themes/neutral/assets.json'), JSON.stringify({ version: 1, bodyFont: family.id, headingFont: family.id }));
    for (const entry of ['themes/neutral/preview.tsx', 'templates/executive-brief/preview.tsx']) {
      const result = await renderEntry(f.root, resolve(f.root, entry), 'asset-specimen');
      assert.ok(result.artifact.assets!.some(use => use.id === family.id), entry);
      assert.equal(result.artifact.meta.theme, 'neutral');
      assert.deepEqual(result.artifact.assetBindings?.bodyFont, ref(family));
    }
    assert.equal(await readFile(themeFile, 'utf8'), original);
  } finally { await f.cleanup(); }
});

test('the public theme adapter keeps base geometry live and isolates aliases by revision', async () => {
  const f = await assetsFixture();
  const globals = globalThis as { __opendocRoot?: string };
  const previous = globals.__opendocRoot;
  try {
    globals.__opendocRoot = f.root;
    const family = await font(f.root);
    const base = (await import('../themes/neutral')).theme;
    const customized = { ...base, margin: 72, design: { typography: { h1: { fontFamily: 'OpenDoc Serif' }, caption: { fontFamily: 'OpenDoc Sans' } } } };
    const adapted = withDocumentAssets(customized, { version: 1, headingFont: ref(family) });
    assert.equal(adapted.id, base.id); assert.equal(adapted.margin, 72);
    assert.equal(adapted.heading, assetFontFamily(ref(family)));
    assert.equal(adapted.design!.typography!.h1!.fontFamily, adapted.heading);
    assert.equal(adapted.design!.typography!.caption!.fontFamily, 'OpenDoc Sans');
    assert.equal(customized.heading, base.heading);
  } finally { globals.__opendocRoot = previous; await f.cleanup(); }
});
