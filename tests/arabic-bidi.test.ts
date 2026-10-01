import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement as h, type ReactNode } from 'react';
import * as F from '@formepdf/react';
import { renderPdfWithLayout, type ElementInfo, type LayoutInfo } from '@formepdf/core';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { resolveAllSources } from '../src/rendering/resolve-sources';
import { renderOnce } from '../src/server/render';
import { fixture, projectRoot } from './helpers';

// Noto Naskh Arabic 2.021 (OFL, tests/fixtures/fonts/OFL.txt). This hinted
// build has no Latin letters or parentheses, so mixed text also exercises the
// font fallback list. It draws most letter dots as separate mark glyphs.
const naskhFile = resolve(projectRoot, 'tests/fixtures/fonts/NotoNaskhArabic-Regular.ttf');
const fonts = [
  { family: 'Noto Naskh Arabic', src: readFileSync(naskhFile) },
  { family: 'OpenDoc Sans', src: readFileSync(resolve(projectRoot, 'assets/fonts/OpenDocSans-Regular.ttf')) },
];
const family = 'Noto Naskh Arabic, OpenDoc Sans';
const margin = 40, contentRight = 595.28 - margin;

const S1 = 'قمنا بتحديث نظام Microsoft Office في المكتب الرئيسي يوم الأحد.';
const S2 = 'السعر 250 ريال لعام 2026 (شامل VAT).';
const LONG = 'يسعدنا أن نعلن أن فريق تقنية المعلومات قد أكمل ترحيل جميع الأجهزة إلى Windows 11 Enterprise بنجاح، كما تم تحديث خوادم SQL Server 2022 في مركز البيانات الرئيسي. '
  + 'بلغت التكلفة الإجمالية 125,000 ريال (شاملة ضريبة VAT بنسبة 15%) وتم الانتهاء من المشروع قبل الموعد المحدد بأسبوعين.';

type Glyph = { x: number; y: number; text: string; code: number };

async function render(...children: ReactNode[]) {
  const doc = F.serialize(h(F.Document, { fonts, lang: 'ar' }, h(F.Page, { size: 'A4', margin }, ...children)));
  await resolveAllSources(doc as unknown as Record<string, unknown>);
  return renderPdfWithLayout(JSON.stringify(doc));
}

function paragraph(text: string, style: F.Style = {}) {
  return h(F.Text, { style: { fontFamily: family, fontSize: 14, direction: 'rtl', ...style } }, text);
}

/** Every text-showing glyph with its absolute position, source text, and character code. */
async function readPdf(bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  try {
    const page = await (await task.promise).getPage(1);
    const operators = await page.getOperatorList();
    const glyphs: Glyph[] = [];
    let matrix: ArrayLike<number> = [1, 0, 0, 1, 0, 0];
    for (let index = 0; index < operators.fnArray.length; index++) {
      if (operators.fnArray[index] === OPS.setTextMatrix) matrix = operators.argsArray[index][0];
      if (operators.fnArray[index] === OPS.showText) {
        for (const glyph of operators.argsArray[index][0] as { unicode: string; originalCharCode: number }[]) {
          glyphs.push({ x: matrix[4], y: matrix[5], text: glyph.unicode, code: glyph.originalCharCode });
        }
      }
    }
    const content = await page.getTextContent();
    const text = content.items.map(item => 'str' in item ? item.str : '').join('');
    return { glyphs, text };
  } finally { await task.destroy(); }
}

function textLines(layout: LayoutInfo) {
  const lines: ElementInfo[] = [];
  const visit = (node: ElementInfo) => { if (node.nodeType === 'TextLine') lines.push(node); node.children.forEach(visit); };
  layout.pages.forEach(page => page.elements.forEach(visit));
  return lines;
}

const compact = (text: string) => text.replace(/\s+/g, '');
const xOf = (glyphs: Glyph[], text: string) => {
  const found = glyphs.filter(glyph => glyph.text === text);
  assert.equal(found.length, 1, `exactly one glyph for ${text}`);
  return found[0].x;
};

/** Poppler's default (physical layout) extraction, without its bidi embedding controls. */
function pdftotext(bytes: Uint8Array): string | undefined {
  try {
    return execFileSync('pdftotext', ['-', '-'], { input: bytes, encoding: 'utf8' })
      .replace(/[‪-‮⁦-⁩]/g, '').replace(/[ \t]+/g, ' ').trim();
  } catch { return undefined; }
}

test('a mixed Arabic and English sentence keeps its reading order', async () => {
  for (const direction of ['rtl', 'auto'] as const) {
    const result = await render(paragraph(S1, { direction }));
    const [line] = textLines(result.layout);
    // Logical text, once: no reversed or duplicated letters for exporters.
    assert.equal(line.textContent, S1);
    assert.equal(line.style.direction, 'rtl');
    assert.equal(line.style.textAlign, 'Right');
    assert.ok(Math.abs(line.x + line.width - contentRight) < 0.05, `${direction}: right aligned`);

    const { glyphs, text } = await readPdf(result.pdf);
    // Visual order: the first Arabic word at the right, the English phrase
    // left to right inside the line, and the closing period at the far left.
    const qaf = xOf(glyphs, 'ق'), m = xOf(glyphs, 'M'), fa = xOf(glyphs, 'ف'), period = xOf(glyphs, '.');
    assert.ok(period < fa && fa < m && m < qaf, `${direction}: ${period} < ${fa} < ${m} < ${qaf}`);
    const latin = glyphs.filter(glyph => /[A-Za-z]/.test(glyph.text));
    assert.equal(latin.map(glyph => glyph.text).join(''), 'MicrosoftOffice');
    assert.ok(latin.every((glyph, index) => index === 0 || glyph.x > latin[index - 1].x));
    // Content order follows reading order, so pdf.js joins runs correctly.
    assert.equal(compact(text), compact(S1));
    // Poppler reorders by itself and moves spaces at direction changes.
    const poppler = pdftotext(result.pdf);
    if (poppler !== undefined) assert.equal(compact(poppler), compact(S1));
  }
});

test('numbers and brackets are placed as in a right-to-left paragraph', async () => {
  const result = await render(paragraph(S2));
  assert.equal(textLines(result.layout)[0].textContent, S2);
  const { glyphs } = await readPdf(result.pdf);
  const digits = glyphs.filter(glyph => /\d/.test(glyph.text)).sort((a, b) => a.x - b.x);
  // Each number reads left to right; 2026 comes later, so it sits further left.
  assert.equal(digits.map(glyph => glyph.text).join(''), '2026250');
  const sin = xOf(glyphs, 'س'), ya = xOf(glyphs, 'ي'), shin = xOf(glyphs, 'ش');
  assert.ok(digits[3].x < ya && ya < digits[4].x && digits[6].x < sin, 'numbers stay between their words');
  // ". ) VAT شامل (" from left to right; the brackets are mirrored glyphs
  // whose text remains the source character.
  const period = xOf(glyphs, '.'), close = xOf(glyphs, ')'), v = xOf(glyphs, 'V'), open = xOf(glyphs, '(');
  assert.ok(period < close && close < v && v < shin && shin < open && open < digits[0].x);
  const poppler = pdftotext(result.pdf);
  if (poppler !== undefined) assert.equal(compact(poppler).replace(/[().]/g, ''), compact(S2).replace(/[().]/g, ''));
});

test('Arabic letters join with contextual forms', async () => {
  const result = await render(paragraph('ب'), paragraph('ببب'), paragraph('ل ا'), paragraph('لا'));
  const { glyphs } = await readPdf(result.pdf);
  const byLine = (y: number) => glyphs.filter(glyph => Math.round(glyph.y) === y);
  const rows = [...new Set(glyphs.map(glyph => Math.round(glyph.y)))].sort((a, b) => b - a);
  const [isolatedBeh] = byLine(rows[0]);
  const joined = byLine(rows[1]);
  // Final, medial, and initial forms in visual order, all distinct from the isolated form.
  assert.deepEqual(joined.map(glyph => glyph.text), ['ب', 'ب', 'ب']);
  assert.equal(new Set([isolatedBeh.code, ...joined.map(glyph => glyph.code)]).size, 4);
  const isolated = new Map(byLine(rows[2]).filter(glyph => glyph.text.trim()).map(glyph => [glyph.text, glyph.code]));
  const lamAlef = byLine(rows[3]);
  assert.deepEqual(lamAlef.map(glyph => glyph.text).sort(), ['ا', 'ل']);
  for (const glyph of lamAlef) assert.notEqual(glyph.code, isolated.get(glyph.text), `${glyph.text} takes its lam-alef form`);
  assert.deepEqual(textLines(result.layout).map(line => line.textContent), ['ب', 'ببب', 'ل ا', 'لا']);
});

test('a long mixed paragraph wraps, then each line is reordered on its own', async () => {
  for (const textAlign of [undefined, 'justify'] as const) {
    const result = await render(paragraph(LONG, { width: 300, ...(textAlign ? { textAlign } : {}) }));
    const lines = textLines(result.layout);
    assert.ok(lines.length >= 4, `expected at least four lines, got ${lines.length}`);
    assert.equal(lines.map(line => line.textContent).join(' ').replace(/\s+/g, ' '), LONG.replace(/\s+/g, ' ').trim());
    const right = margin + 300;
    for (const [index, line] of lines.entries()) {
      assert.ok(Math.abs(line.x + line.width - right) < 0.05, `line ${index + 1} ends at the right edge`);
      if (textAlign && index < lines.length - 1) assert.ok(Math.abs(line.x - margin) < 0.05, `line ${index + 1} is justified`);
    }
    const { glyphs } = await readPdf(result.pdf);
    const rows = [...new Set(glyphs.map(glyph => Math.round(glyph.y)))].sort((a, b) => b - a);
    assert.equal(rows.length, lines.length);
    for (const [index, y] of rows.entries()) {
      // The rightmost glyph of every line belongs to that line's first word.
      const rightmost = glyphs.filter(glyph => Math.round(glyph.y) === y).sort((a, b) => b.x - a.x)[0];
      const first = lines[index].textContent!.trim().split(/\s+/)[0];
      assert.ok(first.includes(rightmost.text), `line ${index + 1}: ${rightmost.text} in ${first}`);
    }
  }
});

test('left-to-right text renders byte for byte as before when direction is ltr or auto', async () => {
  const english = 'Office efficiency, AVATAR To Wa (fi) [2026] stays left to right.';
  const style = { fontFamily: 'OpenDoc Sans', fontSize: 14 };
  const plain = await render(h(F.Text, { style }, english), h(F.Text, { style: { ...style, textAlign: 'justify' } }, `${english} `.repeat(6)));
  for (const direction of ['ltr', 'auto'] as const) {
    const directed = await render(h(F.Text, { style: { ...style, direction } }, english), h(F.Text, { style: { ...style, direction, textAlign: 'justify' } }, `${english} `.repeat(6)));
    assert.deepEqual(Buffer.from(directed.pdf), Buffer.from(plain.pdf), direction);
  }
  const [line] = textLines(plain.layout);
  assert.equal(line.textContent, english);
  assert.equal(line.style.direction, 'ltr');
  assert.ok(Math.abs(line.x - margin) < 0.05);
});

test('OpenDoc documents and themes set the direction, language, and font fallbacks', async () => {
  const f = await fixture();
  try {
    await mkdir(resolve(f.root, 'themes/arabic-proof'), { recursive: true });
    await copyFile(naskhFile, resolve(f.root, 'themes/arabic-proof/NotoNaskhArabic-Regular.ttf'));
    await writeFile(f.entry, `import {Document,Pages,Heading,Paragraph,List,DataTable,Callout,CodeBlock} from '../../src/document';
import { neutral } from '../../src/themes';
export const meta={title:'Arabic proof',description:'Right-to-left fixture',kind:'report',theme:'arabic-proof'};
const theme = { ...neutral, id: 'arabic-proof', direction: 'rtl' as const, lang: 'ar', fontFallbacks: ['Noto Naskh Arabic'],
  fonts: [{ family: 'Noto Naskh Arabic', src: 'themes/arabic-proof/NotoNaskhArabic-Regular.ttf' }] };
export default function Proof(){return <Document title="تقرير" theme={theme}><Pages title="تقرير">
<Heading id="title" level={1}>تقرير الربع الثالث 2026</Heading>
<Paragraph id="mixed">${S1}</Paragraph>
<List id="items" items={[{ id: 'one', children: 'البند الأول: تحديث Microsoft 365' }, { id: 'two', children: 'البند الثاني: ميزانية 50,000 ريال' }]} />
<DataTable id="costs" columns={[{ label: 'البند' }, { label: 'القيمة' }]} rows={[['ترخيص Office 365', 1250]]} />
<Callout id="note" title="ملاحظة">يرجى مراجعة VPN قبل الأحد.</Callout>
<CodeBlock id="code">{"const total = 1250;"}</CodeBlock>
</Pages></Document>}`);
    const { artifact, directory } = await renderOnce(f.root, 'proof');
    assert.ok(!artifact.issues?.some(issue => issue.code === 'missing-glyphs'), JSON.stringify(artifact.issues));
    const pdf = await readFile(resolve(directory, 'document.pdf'));
    assert.match(pdf.toString('latin1'), /\/Lang \(ar\)/);
    const layout = JSON.parse(await readFile(resolve(directory, 'layout.json'), 'utf8')) as LayoutInfo;
    const lines = textLines(layout);
    const line = (text: string) => lines.find(candidate => candidate.textContent === text)!;
    assert.equal(line(S1).style.direction, 'rtl');
    assert.ok(Math.abs(line(S1).x + line(S1).width - (595.28 - 54)) < 0.05, 'the paragraph starts at the right margin');
    // Rows start at the right: bullets right of their items, first column right of the second.
    assert.ok(line('•').x > line('البند الأول: تحديث Microsoft 365').x);
    assert.ok(line('البند').x > line('القيمة').x);
    // Code stays left to right.
    assert.equal(line('const total = 1250;').style.direction, 'ltr');
    assert.ok(lines.every(candidate => candidate.style.direction === 'ltr' || candidate.style.direction === 'rtl'));
  } finally { await f.cleanup(); }
});
