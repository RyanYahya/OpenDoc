import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement as h } from 'react';
import * as F from '@formepdf/react';
import { renderDocument } from '@formepdf/core';
import { create as createFont } from 'fontkit';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { assetFile, readAssetHead, readAssetRevision } from '../src/assets/files';

const root = resolve(import.meta.dirname, '..');
for (const [id, mixed] of [['roboto', false], ['inter', true]] as const) {
  test(`original ${id} preserves ${mixed ? 'spaces at styled boundaries' : 'ligature text'} in the PDF`, async () => {
    const head = readAssetHead(root, 'font', id), font = readAssetRevision(root, 'font', id, head.revision);
    if (font.kind !== 'font') throw new Error('Expected font.');
    const fonts = font.faces.filter(face => face.style === 'normal' && [400, 700].includes(face.weight)).map(face => ({ family: font.name, src: readFileSync(assetFile(root, 'font', id, face.file)), fontWeight: face.weight }));
    const expected = mixed ? 'AVATAR To Wa office after space' : 'office efficiency finished';
    const text = mixed ? h(F.Text, { style: { fontFamily: font.name, fontSize: 14 } }, 'AVATAR ', h(F.Text, { style: { fontWeight: 700 } }, 'To Wa'), ' office after space') : h(F.Text, { style: { fontFamily: font.name, fontSize: 14 } }, expected);
    const bytes = await renderDocument(h(F.Document, { fonts }, h(F.Page, { size: 'A4', margin: 45 }, text)));
    const task = getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: resolve(root, 'node_modules/pdfjs-dist/standard_fonts') + '/', verbosity: 0 });
    try {
      const pdf = await task.promise;
      const content = await (await pdf.getPage(1)).getTextContent();
      const actual = content.items.map(item => 'str' in item ? item.str : '').join('').normalize('NFKC');
      assert.equal(actual, expected);
    } finally { await task.destroy(); }
  });
}

// Read actual PDF drawing operators and compare them with an independent
// OpenType shaper. Correct extraction alone would miss misplaced glyphs.
test('PDF glyph positions preserve kerning, ligatures, fractional sizes, and letter spacing', async () => {
  const head = readAssetHead(root, 'font', 'roboto');
  const font = readAssetRevision(root, 'font', 'roboto', head.revision);
  if (font.kind !== 'font') throw new Error('Expected font.');
  const face = font.faces.find(face => face.weight === 400 && face.style === 'normal')!;
  const bytes = readFileSync(assetFile(root, 'font', 'roboto', face.file));
  const opened = createFont(bytes);
  if ('fonts' in opened) throw new Error('Expected a single font.');
  const text = 'AVATAR To Wa office fi ﬁ ffi ﬃ';
  const fontSize = 14.125, letterSpacing = 0.35;
  const shaped = opened.layout(text);
  assert.ok(shaped.glyphs.length < [...text].length, 'The original font must still shape ligatures.');
  assert.ok(shaped.positions.some((position, index) => position.xAdvance !== shaped.glyphs[index].advanceWidth), 'The original font must still kern.');
  const pdfBytes = await renderDocument(h(F.Document, { fonts: [{ family: font.name, src: bytes }] },
    h(F.Page, { size: 'A4', margin: 45 }, h(F.Text, { style: { fontFamily: font.name, fontSize, letterSpacing } }, text))));
  const task = getDocument({ data: new Uint8Array(pdfBytes), verbosity: 0 });
  try {
    const page = await (await task.promise).getPage(1);
    const content = await page.getTextContent({ disableNormalization: true });
    assert.equal(content.items.map(item => 'str' in item ? item.str : '').join(''), text,
      'Source sequences and literal presentation characters must remain distinct.');
    const operators = await page.getOperatorList();
    const drawn: { x: number; y: number; text: string }[] = [];
    let matrix: ArrayLike<number> = [1, 0, 0, 1, 0, 0];
    for (let index = 0; index < operators.fnArray.length; index++) {
      if (operators.fnArray[index] === OPS.setTextMatrix) matrix = operators.argsArray[index][0];
      if (operators.fnArray[index] === OPS.showText) {
        const glyphs = operators.argsArray[index][0] as { unicode: string }[];
        drawn.push({ x: matrix[4], y: matrix[5], text: glyphs.map(glyph => glyph.unicode).join('') });
      }
    }
    assert.equal(drawn.length, shaped.glyphs.length);
    assert.equal(drawn.map(glyph => glyph.text).join(''), text);
    let cursor = 45;
    for (const [index, position] of shaped.positions.entries()) {
      const expectedX = cursor + position.xOffset * fontSize / opened.unitsPerEm;
      assert.ok(Math.abs(drawn[index].x - expectedX) < 0.002, `Glyph ${index}: ${drawn[index].x} vs ${expectedX}`);
      cursor += position.xAdvance * fontSize / opened.unitsPerEm + letterSpacing;
    }
  } finally { await task.destroy(); }
});
