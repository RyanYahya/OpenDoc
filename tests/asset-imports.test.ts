import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { prepareLogo, prepareFonts, type UploadFile } from '../src/assets/imports';

const root = resolve(import.meta.dirname, '..');
const svg = (body: string, attributes = 'viewBox="0 0 200 100"') => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`);
const png = () => new Resvg(Buffer.from(svg('<rect x="10" y="10" width="30" height="20" fill="#112233"/>')), { font: { loadSystemFonts: false } }).render().asPng();
const bundled = async (face: string, family = 'Sans'): Promise<UploadFile> => ({ filename: `OpenDoc${family}-${face}.ttf`, bytes: await readFile(resolve(root, `assets/fonts/OpenDoc${family}-${face}.ttf`)) });

test('PNG import preserves the original bytes, transparency, and content-addressed identity', async () => {
  const bytes = png();
  const prepared = await prepareLogo({ filename: 'Brand.PNG', bytes });
  assert.deepEqual(Buffer.from(prepared.original.contents), bytes);
  assert.deepEqual(Buffer.from(prepared.image.contents), bytes);
  assert.deepEqual([prepared.image.width, prepared.image.height], [200, 100]);
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(prepared.original.file, `files/${hash}.png`);
  const renamed = await prepareLogo({ filename: 'A new display name.png', bytes });
  assert.equal(renamed.original.hash, hash);
});

test('SVG imports keep the full viewport and prepare transparent proportionate PNG artwork', async () => {
  const bytes = svg('<title>Logo metadata remains harmless</title><rect x="50" y="25" width="100" height="50" fill="#112233"/>');
  const prepared = await prepareLogo({ filename: 'logo.svg', bytes });
  assert.deepEqual(Buffer.from(prepared.original.contents), Buffer.from(bytes));
  assert.equal(prepared.original.mime, 'image/svg+xml');
  assert.deepEqual([prepared.original.width, prepared.original.height], [200, 100]);
  assert.deepEqual([prepared.image.width, prepared.image.height], [4096, 2048]);
  assert.equal(prepared.image.mime, 'image/png');
  // The prepared image itself must be a valid PNG and remains unchanged on reimport.
  const roundTrip = await prepareLogo({ filename: 'prepared.png', bytes: prepared.image.contents });
  assert.equal(roundTrip.image.hash, prepared.image.hash);
});

test('SVG rejects external images, styles, unresolved text, malformed XML, and active content', async () => {
  for (const [bytes, message] of [
    [svg('<image href="https://example.com/logo.png"/>'), /external image or file/],
    [svg('<image xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="file:///tmp/logo.png"/>'), /external image or file/],
    [svg('<style>@import "https://example.com/brand.css";</style>'), /external styles or fonts/],
    [svg('<rect fill="URL (https://example.com/paint.svg)"/>'), /external style resource/],
    [svg('<text font-family="Imaginary Font">Brand</text>'), /Convert text to paths/],
    [svg('<script>alert(1)</script>'), /static artwork/],
    [new TextEncoder().encode('<svg><rect></svg>'), /well-formed/],
    [new TextEncoder().encode('<!DOCTYPE svg [<!ENTITY brand "External">]><svg/>'), /XML entities/],
  ] as const) await assert.rejects(prepareLogo({ filename: 'logo.svg', bytes }), message);
});

test('SVG permits local fragment references and self-contained raster images', async () => {
  const bytes = svg(`<defs><linearGradient id="paint"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="200" height="100" fill="url(#paint)"/><image href="data:image/png;base64,${png().toString('base64')}" width="200" height="100"/>`);
  const result = await prepareLogo({ filename: 'embedded.svg', bytes });
  assert.equal(result.image.width, 4096);
});

test('invalid, damaged, excessive, and mislabeled logo files fail before publication', async () => {
  await assert.rejects(prepareLogo({ filename: 'logo.jpg', bytes: png() }), /SVG or PNG/);
  await assert.rejects(prepareLogo({ filename: 'logo.svg', bytes: new Uint8Array(5 * 1024 * 1024 + 1) }), /5 MB/);
  await assert.rejects(prepareLogo({ filename: 'empty.png', bytes: new Uint8Array() }), /nonempty/);
  await assert.rejects(prepareLogo({ filename: 'fake.png', bytes: svg('<rect/>') }), /valid PNG/);
  const damaged = png(); damaged[damaged.length - 1] ^= 1;
  await assert.rejects(prepareLogo({ filename: 'damaged.png', bytes: damaged }), /damaged image chunk/);
  await assert.rejects(prepareLogo({ filename: 'truncated.png', bytes: png().subarray(0, 40) }), /valid PNG/);
});

test('font import uses true metadata, preserves each face, and validates a real PDF specimen', async () => {
  const files = await Promise.all(['Regular', 'Semibold', 'Italic'].map(face => bundled(face)));
  const result = await prepareFonts(root, files);
  assert.equal(result.name, 'OpenDoc Sans');
  assert.deepEqual(result.faces.map(face => [face.id, face.weight, face.style]), [['400-normal', 400, 'normal'], ['600-normal', 600, 'normal'], ['400-italic', 400, 'italic']]);
  assert.equal(result.compatibility.status, 'ready');
  assert.equal(result.compatibility.defaultEligible, true);
  for (let index = 0; index < files.length; index++) assert.deepEqual(Buffer.from(result.faces[index].file.contents), files[index].bytes);
  assert.ok(result.specimen);
  const task = getDocument({ data: new Uint8Array(result.specimen.contents), standardFontDataUrl: resolve(root, 'node_modules/pdfjs-dist/standard_fonts') + '/', verbosity: 0 });
  try {
    const pdf = await task.promise;
    const text = (await (await pdf.getPage(1)).getTextContent()).items.map(item => 'str' in item ? item.str : '').join('');
    assert.match(text, /office efficiency finished/);
    assert.match(text, /AVATAR To Wa office after space/);
    assert.ok(Buffer.from(result.specimen.contents).includes(Buffer.from('/FontFile2')), 'The real font is embedded in the PDF.');
  } finally { await task.destroy(); }
});

test('single static font faces remain useful, but cannot become general theme defaults', async () => {
  const result = await prepareFonts(root, [await bundled('Regular')]);
  assert.equal(result.compatibility.status, 'ready');
  assert.equal(result.compatibility.defaultEligible, false);
  assert.match(result.compatibility.message!, /regular.*semibold.*bold/);
  assert.ok(result.specimen);
});

test('font import rejects duplicate face collisions, mixed families, and unsupported formats', async () => {
  const regular = await bundled('Regular');
  await assert.rejects(prepareFonts(root, [regular, { ...regular, filename: 'renamed.ttf' }]), /more than one 400 normal face/);
  await assert.rejects(prepareFonts(root, [regular, await bundled('Regular', 'Serif')]), /one family at a time/);
  await assert.rejects(prepareFonts(root, [{ filename: 'font.woff2', bytes: regular.bytes }]), /static TTF or OTF/);
  await assert.rejects(prepareFonts(root, [{ filename: 'collection.ttf', bytes: new TextEncoder().encode('ttcf0000') }]), /font collections/);
  await assert.rejects(prepareFonts(root, Array.from({ length: 25 }, () => regular)), /1 and 24/);
  await assert.rejects(prepareFonts(root, []), /1 and 24/);
});

const systemFonts = '/System/Library/Fonts/Supplemental';
test('original Georgia and Arial preserve real bold weights and pass PDF spacing checks', { skip: !existsSync(resolve(systemFonts, 'Georgia.ttf')) || !existsSync(resolve(systemFonts, 'Arial.ttf')) }, async () => {
  for (const family of ['Georgia', 'Arial']) {
    const files = await Promise.all(['', ' Bold', ' Italic'].map(async style => ({ filename: `${family}${style}.ttf`, bytes: await readFile(resolve(systemFonts, `${family}${style}.ttf`)) })));
    const result = await prepareFonts(root, files);
    assert.deepEqual(result.faces.map(face => face.weight), [400, 700, 400]);
    assert.ok(result.specimen);
    assert.deepEqual(result.compatibility, { status: 'ready', defaultEligible: true });
  }
});
