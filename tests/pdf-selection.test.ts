import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPdfTextSpans, pdfSpanRangeForSelection, type PdfTextSpan } from '../src/app/pdfSelection';
import type { TextTarget } from '../src/shared/selection';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderOnce } from '../src/server/render';
import { fixture } from './helpers';

function span(text: string, x: number, y = 10, page = 1): PdfTextSpan {
  return { text, page, x, y, width: text.length * 5, height: 12 };
}
function target(text: string, overrides: Partial<TextTarget> = {}): TextTarget {
  return { id: 'intro:content', blockId: 'intro', slot: 'content', text, runs: [],
    lines: [{ text, start: 0, end: text.length, page: 1, x: 10, y: 10, width: text.length * 5, height: 12 }], ...overrides };
}

test('PDF runs align in painting order while preserving original whitespace and Unicode offsets', () => {
  const value = target('Hello,  café 👋.');
  const spans = [span('Hello, ', 10), span('café 👋.', 45)];
  const mappings = mapPdfTextSpans(spans, [value]);
  assert.ok(mappings.every(Boolean));
  assert.equal(mappings[0]!.starts[6], 6);
  assert.equal(mappings[0]!.ends[6], 8, 'One painted space retains both authored spaces.');
  assert.deepEqual(mappings[1], { blockId: 'intro', targetId: 'intro:content', starts: [8, 9, 10, 11, 12, 13, 14, 15], ends: [9, 10, 11, 12, 13, 14, 15, 16] });
  assert.deepEqual(pdfSpanRangeForSelection(mappings[1], { blockId: 'intro', targetId: value.id, start: 13, end: 15, page: 1 }), { start: 5, end: 7 });
});

test('repeated words map to the occurrence located on their complete line', () => {
  const value = target('again again');
  const spans = [span('again ', 10), span('again', 40)];
  const mappings = mapPdfTextSpans(spans, [value]);
  assert.deepEqual(mappings[1]?.starts, [6, 7, 8, 9, 10]);
  assert.deepEqual(mappings[1]?.ends, [7, 8, 9, 10, 11]);
  const selection = { blockId: 'intro', targetId: value.id, start: 6, end: 11, page: 1 };
  assert.equal(pdfSpanRangeForSelection(mappings[0], selection), null);
  assert.deepEqual(pdfSpanRangeForSelection(mappings[1], selection), { start: 0, end: 5 });
});

test('persistent highlights invert only the selected phrase and retain normalized offsets', () => {
  const value = target('Hello,  café 👋.');
  const painted = span('Hello, café 👋.', 10);
  const mapping = mapPdfTextSpans([painted], [value])[0];
  const selection = { blockId: 'intro', targetId: 'intro:content', start: 8, end: 12, page: 1 };
  assert.deepEqual(pdfSpanRangeForSelection(mapping, selection), { start: 7, end: 11 });
  assert.equal(pdfSpanRangeForSelection(mapping, { ...selection, start: 30, end: 40 }), null);
  assert.equal(pdfSpanRangeForSelection(mapping, { ...selection, targetId: 'other:content' }), null);
  assert.equal(pdfSpanRangeForSelection(mapping, { blockId: 'intro', page: 1 }), null);
});

test('paragraph mappings and highlights keep logical offsets across page breaks', () => {
  const value = target('First line. Second line.', { lines: [
    { text: 'First line.', start: 0, end: 11, page: 1, x: 10, y: 10, width: 55, height: 12 },
    { text: 'Second line.', start: 12, end: 24, page: 2, x: 10, y: 10, width: 60, height: 12 },
  ] });
  const spans = [span('First line.', 10), span('Second line.', 10, 10, 2)];
  const mappings = mapPdfTextSpans(spans, [value]);
  assert.deepEqual(mappings.map(mapping => mapping?.targetId), [value.id, value.id]);
  assert.equal(mappings[0]?.starts[0], 0);
  assert.equal(mappings[0]?.ends.at(-1), 11);
  assert.equal(mappings[1]?.starts[0], 12);
  assert.equal(mappings[1]?.ends.at(-1), 24);
  const selection = { blockId: 'intro', targetId: value.id, start: 6, end: 18, page: 1 };
  assert.deepEqual(pdfSpanRangeForSelection(mappings[0], selection), { start: 6, end: 11 });
  assert.deepEqual(pdfSpanRangeForSelection(mappings[1], selection), { start: 0, end: 6 });
});

test('overlapping identical targets and incomplete lines remain unmapped', () => {
  const value = target('Duplicated text');
  const spans = [span(value.text, 10)];
  assert.equal(mapPdfTextSpans(spans, [value, { ...value, id: 'other:content', blockId: 'other' }])[0], undefined);
  assert.equal(mapPdfTextSpans([span('Duplicated', 10)], [value])[0], undefined);
});

test('highlighting one text slot never includes another slot', () => {
  const first = target('Title');
  const second = target('Caption', { id: 'figure:caption', blockId: 'figure', lines: [{ text: 'Caption', start: 0, end: 7, page: 1, x: 10, y: 40, width: 35, height: 12 }] });
  const spans = [span('Title', 10), span('Caption', 10, 40)];
  const mappings = mapPdfTextSpans(spans, [first, second]);
  assert.deepEqual(mappings.map(mapping => mapping?.targetId), [first.id, second.id]);
  const selection = { blockId: 'intro', targetId: first.id, start: 0, end: first.text.length, page: 1 };
  assert.deepEqual(pdfSpanRangeForSelection(mappings[0], selection), { start: 0, end: 5 });
  assert.equal(pdfSpanRangeForSelection(mappings[1], selection), null);
});

test('different punctuation or ligatures are an explicit fallback, never fuzzy alignment', () => {
  assert.equal(mapPdfTextSpans([span('ﬁne', 10)], [target('fine')])[0], undefined);
  assert.equal(mapPdfTextSpans([span('“Hello”', 10)], [target('"Hello"')])[0], undefined);
});

test('a proven discretionary line-end hyphen has no source range and joins the original word', () => {
  const value = target('\u2003Understanding', { runs: [{ start: 0, end: 1, protected: true }], lines: [
    { text: '\u2003Under-', start: 0, end: 6, page: 1, x: 10, y: 10, width: 35, height: 12 },
    { text: 'standing', start: 6, end: 14, page: 1, x: 10, y: 40, width: 40, height: 12 },
  ] });
  const spans = [span('\u2003Under', 10), span('-', 40), span('standing', 10, 40)];
  const mappings = mapPdfTextSpans(spans, [value]);
  assert.ok(mappings.every(Boolean));
  assert.deepEqual(mappings[1]?.starts, [6]);
  assert.deepEqual(mappings[1]?.ends, [6]);
  assert.deepEqual(mappings[1]?.synthetic, [true]);
  assert.deepEqual(pdfSpanRangeForSelection(mappings[1], { blockId: 'intro', targetId: value.id, start: 1, end: 14, page: 1 }), { start: 0, end: 1 });
  assert.equal(pdfSpanRangeForSelection(mappings[1], { blockId: 'intro', targetId: value.id, start: 1, end: 6, page: 1 }), null);
  assert.equal(mappings[0]?.ends.at(-1), 6);
  assert.equal(mappings[2]?.starts[0], 6);
  assert.equal(mappings[2]?.ends.at(-1), 14);
  const joined = span('\u2003Under-', 10);
  const joinedMapping = mapPdfTextSpans([joined, spans[2]], [value])[0];
  assert.deepEqual(joinedMapping?.starts, [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(joinedMapping?.ends, [1, 2, 3, 4, 5, 6, 6]);
  assert.deepEqual(pdfSpanRangeForSelection(joinedMapping, { blockId: 'intro', targetId: value.id, start: 1, end: 14, page: 1 }), { start: 1, end: 7 });
  assert.deepEqual(pdfSpanRangeForSelection(joinedMapping, { blockId: 'intro', targetId: value.id, start: 1, end: 6, page: 1 }), { start: 1, end: 6 });
});

test('authored hyphens remain editable and unproved punctuation changes remain unmapped', () => {
  const authored = target('Well-known');
  const painted = span('Well-known', 10);
  const mapping = mapPdfTextSpans([painted], [authored])[0];
  assert.ok(mapping);
  assert.equal(mapping.synthetic, undefined);
  assert.equal(mapping.starts[4], 4);
  assert.equal(mapping.ends[4], 5);
  assert.deepEqual(pdfSpanRangeForSelection(mapping, { blockId: 'intro', targetId: authored.id, start: 4, end: 5, page: 1 }), { start: 4, end: 5 });
  const changed = target('Wellknown', { lines: [{ text: 'Well-known', start: 0, end: 9, page: 1, x: 10, y: 10, width: 50, height: 12 }] });
  assert.equal(mapPdfTextSpans([painted], [changed])[0], undefined);
});

test('real Forme lines align with PDF.js text runs through inline formatting and pagination', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, `import {Document,Paragraph,Strong,Em} from '../../src/document';
import {neutral} from '../../themes';
import * as F from '@formepdf/react';
export const meta={title:'Selection proof',description:'Selection fixture',theme:'neutral'};
export default function Proof(){return <Document title="Selection proof" theme={neutral}><F.Page size={{width:300,height:260}} margin={30}>
<Paragraph id="mixed">Plain words, <Strong>bold words</Strong>, and <Em>italic words</Em> stay connected.</Paragraph>
<Paragraph id="long">${'Repeated words remain in their original reading order. '.repeat(22)}</Paragraph>
</F.Page></Document>}`);
    const result = await renderOnce(f.root, 'proof');
    const targets = result.artifact.textTargets!;
    const loading = getDocument({ data: new Uint8Array(await readFile(resolve(result.directory, 'document.pdf'))) });
    try {
      const pdf = await loading.promise;
      assert.ok(pdf.numPages > 1);
      const spans: PdfTextSpan[] = [];
      for (let number = 1; number <= pdf.numPages; number += 1) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        for (const item of content.items) {
          if (!('str' in item)) continue;
          spans.push({ text: item.str, page: number, x: item.transform[4],
            y: viewport.height - item.transform[5] - item.height * (content.styles[item.fontName]?.ascent ?? 0.8),
            width: item.width, height: item.height });
        }
      }
      const mappings = mapPdfTextSpans(spans, targets);
      const bold = spans.findIndex(span => span.text.includes('bold words'));
      assert.ok(bold >= 0 && mappings[bold], 'Inline bold text maps to its logical paragraph');
      const mixed = targets.find(target => target.blockId === 'mixed')!;
      const boldStart = mixed.text.indexOf('bold words');
      const boldRange = pdfSpanRangeForSelection(mappings[bold], { blockId: mixed.blockId, targetId: mixed.id, start: boldStart, end: boldStart + 10, page: 1 });
      assert.ok(boldRange);
      assert.equal(spans[bold].text.slice(boldRange.start, boldRange.end), 'bold words');
      const long = targets.find(target => target.blockId === 'long')!;
      const mappedLong = spans.flatMap((span, index) => mappings[index]?.blockId === 'long'
        ? [{ span, mapping: mappings[index]! }] : []);
      assert.ok(new Set(mappedLong.map(({ span }) => span.page)).size > 1);
      const coveredOffsets = mappedLong.flatMap(({ span, mapping }) => Array.from({ length: span.text.length }, (_, index) => index)
        .filter(index => !/\s/u.test(span.text[index]) && !mapping.synthetic?.[index])
        .map(index => mapping.starts[index]));
      const authoredOffsets = Array.from({ length: long.text.length }, (_, index) => index).filter(index => !/\s/u.test(long.text[index]));
      assert.deepEqual(coveredOffsets, authoredOffsets, 'Every authored character maps once, in reading order, across all pages.');
      for (const { span, mapping } of mappedLong) {
        assert.equal(mapping.targetId, long.id);
        const range = pdfSpanRangeForSelection(mapping, { blockId: long.blockId, targetId: long.id, start: 0, end: long.text.length, page: span.page });
        assert.ok(range);
        assert.equal(span.text.slice(range.start, range.end).trim(), span.text.trim());
      }
    } finally { await loading.destroy(); }
  } finally { await f.cleanup(); }
});
