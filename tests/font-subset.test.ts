import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { createElement as h } from 'react';
import * as F from '@formepdf/react';
import { renderDocument } from '@formepdf/core';
import { assetFile, readAssetHead, readAssetRevision } from '../src/assets/files';

const root = resolve(import.meta.dirname, '..');

interface FontTable {
  checksum: number;
  offset: number;
  length: number;
  bytes: Buffer;
}

function fontTables(font: Buffer): Map<string, FontTable> {
  assert.equal(font.readUInt32BE(0), 0x00010000, 'The embedded font must be TrueType.');
  const tables = new Map<string, FontTable>();
  const count = font.readUInt16BE(4);
  assert.ok(12 + count * 16 <= font.length, 'The table directory must fit in the font.');
  for (let index = 0; index < count; index++) {
    const record = 12 + index * 16;
    const tag = font.toString('ascii', record, record + 4);
    const checksum = font.readUInt32BE(record + 4);
    const offset = font.readUInt32BE(record + 8);
    const length = font.readUInt32BE(record + 12);
    assert.ok(offset + length <= font.length, `${tag} must fit in the font.`);
    assert.equal(offset % 4, 0, `${tag} must start at a four-byte boundary.`);
    assert.ok(!tables.has(tag), `${tag} must have one directory entry.`);
    tables.set(tag, { checksum, offset, length, bytes: font.subarray(offset, offset + length) });
  }
  return tables;
}

function requiredTable(tables: Map<string, FontTable>, tag: string): FontTable {
  const table = tables.get(tag);
  assert.ok(table, `Missing ${tag} table.`);
  return table;
}

// Follow FontFile2 to the exact original PDF stream bytes. Reading by /Length
// avoids mistaking binary font data for an endstream marker or rewriting the PDF.
function embeddedTrueType(pdf: Buffer): Buffer {
  const source = pdf.toString('latin1');
  const references = [...source.matchAll(/\/FontFile2\s+(\d+)\s+(\d+)\s+R\b/g)];
  assert.equal(references.length, 1, 'The fixture must embed exactly one TrueType font.');
  const [, objectId, generation] = references[0];
  const object = new RegExp(`(?:^|[\\r\\n])${objectId} ${generation} obj\\s*([\\s\\S]*?)stream\\r?\\n`).exec(source);
  assert.ok(object, 'The FontFile2 stream object must exist.');
  const dictionary = object[1];
  const length = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dictionary);
  assert.ok(length, 'The renderer must write a direct stream length.');
  assert.match(dictionary, /\/Filter\s*\/FlateDecode\b/);
  const start = object.index + object[0].length;
  const end = start + Number(length[1]);
  assert.match(source.slice(end, end + 24), /^\r?\nendstream\b/);
  return inflateSync(pdf.subarray(start, end));
}

function checksum(bytes: Buffer): number {
  let sum = 0;
  for (let offset = 0; offset < bytes.length; offset += 4) {
    let word = 0;
    for (let byte = 0; byte < 4; byte++) word = (word << 8) | (bytes[offset + byte] ?? 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}

function originalInter(): Buffer {
  const head = readAssetHead(root, 'font', 'inter');
  const font = readAssetRevision(root, 'font', 'inter', head.revision);
  if (font.kind !== 'font') throw new Error('Expected an Inter font.');
  const face = font.faces.find(face => face.style === 'normal' && face.weight === 400);
  assert.ok(face, 'Inter Regular must be available.');
  return readFileSync(assetFile(root, 'font', 'inter', face.file));
}

for (const [name, original] of [
  ['OpenDocSans', readFileSync(resolve(root, 'assets/fonts/OpenDocSans-Regular.ttf'))],
  ['Inter', originalInter()],
] as const) {
  test(`${name} embeds a conforming TrueType subset`, async t => {
    // A plus .notdef yields two glyphs: three short loca entries need two bytes
    // of storage padding, which must never be included in the table's length.
    const pdf = await renderDocument(h(F.Document, { fonts: [{ family: name, src: original }] },
      h(F.Page, { size: 'A4', margin: 45 }, h(F.Text, { style: { fontFamily: name, fontSize: 14 } }, 'A'))));
    const embedded = embeddedTrueType(Buffer.from(pdf));
    const sourceTables = fontTables(original);
    const tables = fontTables(embedded);
    const head = requiredTable(tables, 'head');
    const maxp = requiredTable(tables, 'maxp');
    const numGlyphs = maxp.bytes.readUInt16BE(4);

    await t.test('table lengths exclude alignment padding', () => {
      assert.equal(numGlyphs, 2, 'The fixture must keep only A and .notdef.');
      assert.equal(head.bytes.readInt16BE(50), 0, 'This small subset must use short loca entries.');
      const entrySize = head.bytes.readInt16BE(50) === 0 ? 2 : 4;
      const locaLength = (numGlyphs + 1) * entrySize;
      assert.equal(locaLength % 4, 2, 'The fixture must require loca alignment padding.');
      assert.equal(requiredTable(tables, 'loca').length, locaLength, 'loca length must describe only glyph offsets.');
      for (const tag of ['head', 'hhea', 'maxp', 'name', 'OS/2', 'fpgm', 'prep', 'cvt ', 'gasp']) {
        const source = sourceTables.get(tag);
        if (source && tables.has(tag)) assert.equal(requiredTable(tables, tag).length, source.length, `${tag} must retain its unpadded length.`);
      }
      assert.equal(head.length, 54, 'head is 54 bytes, regardless of storage alignment.');
    });

    await t.test('table checksums match the embedded bytes with head adjustment zeroed', () => {
      for (const [tag, table] of tables) {
        const bytes = Buffer.from(table.bytes);
        if (tag === 'head') bytes.writeUInt32BE(0, 8);
        assert.equal(table.checksum, checksum(bytes), `${tag} checksum must use unpadded data and a zeroed head adjustment.`);
      }
    });

    await t.test('whole-font adjustment produces the required checksum', () => {
      assert.equal(checksum(embedded), 0xb1b0afba, 'The complete font checksum must include a valid head.checkSumAdjustment.');
    });

    await t.test('maxp interpreter limits and hinting programs survive subsetting', () => {
      const sourceMaxp = requiredTable(sourceTables, 'maxp');
      assert.equal(sourceMaxp.bytes.readUInt32BE(0), 0x00010000, 'The fixture must have TrueType interpreter limits.');
      assert.ok(sourceMaxp.bytes.subarray(6).some(byte => byte !== 0), 'The fixture must exercise nonzero maxp limits.');
      const expectedMaxp = Buffer.from(sourceMaxp.bytes);
      expectedMaxp.writeUInt16BE(numGlyphs, 4);
      assert.deepEqual(maxp.bytes, expectedMaxp, 'Only maxp.numGlyphs may change.');
      for (const tag of ['fpgm', 'prep', 'cvt ']) {
        const source = sourceTables.get(tag);
        if (name === 'OpenDocSans') assert.ok(source, `OpenDocSans must exercise ${tag} preservation.`);
        if (source) assert.deepEqual(requiredTable(tables, tag).bytes, source.bytes, `${tag} bytes must remain unchanged.`);
      }
    });
  });
}
