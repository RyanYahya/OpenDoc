import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderOnce } from '../src/server/render';
import { fixture } from './helpers';

async function runs(directory: string) {
  const loading = getDocument({ data: new Uint8Array(await readFile(resolve(directory, 'document.pdf'))) });
  const pdf = await loading.promise;
  const result: { text: string; x: number; y: number; width: number; page: number }[] = [];
  try {
    for (let page = 1; page <= pdf.numPages; page++) {
      for (const item of (await (await pdf.getPage(page)).getTextContent()).items) {
        if ('str' in item) result.push({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, page });
      }
    }
    return result;
  } finally { await loading.destroy(); }
}

function source(body: string, content: string) {
  return `import {Document,Paragraph,Heading,Section,Figure,Prose,Cite,References,Strong,Em} from '../../src/document';
import * as F from '@formepdf/react'; import {neutral} from '../../themes';
export const meta={title:'Prose proof',description:'Synthetic typesetting proof',kind:'article',theme:'neutral'};
function Nested(){return <Paragraph id="nested">Nested component paragraphs retain their author source and participate in the same reading sequence.</Paragraph>}
export default function Proof(){return <Document title="Prose proof" theme={{...neutral,body:'${body}',fontSize:11,lineHeight:1.42}} references={{local:{title:'Illustrative reference fixture'}}}>
<F.Page size={{width:360,height:420}} margin={40}>${content}</F.Page></Document>}`;
}

test('prose uses measured first-line indents, resets after headings and figures, and preserves inline citations', async () => {
  const f = await fixture();
  try {
    for (const body of ['OpenDoc Sans', 'OpenDoc Serif']) {
      await writeFile(f.entry, source(body, `<Prose>
        <Paragraph id="opening">Opening paragraphs begin flush with the reading column, and remain clearly separated from the title.</Paragraph>
        <Paragraph id="continuing">Continuing paragraphs indent once, including <Strong>emphasis</Strong>, <Em>italic words</Em>, and a citation <Cite source="local"/>.</Paragraph>
        <Nested/>
        <Heading id="turn">A section turn</Heading>
        <Paragraph id="reset">Reset paragraphs begin flush again after a heading.</Paragraph>
        <Paragraph id="following">Following paragraphs resume the measured first-line indent.</Paragraph>
        <Figure id="visual" caption="An illustrative fixture."><F.View style={{height:30}}/></Figure>
        <Paragraph id="after-visual">Aftervisual paragraphs start a new reading sequence.</Paragraph>
        <Section id="section" title="A structured section" lead="Sectionlead text also starts flush."><Paragraph id="section-body">Sectionbody paragraphs continue after the lead.</Paragraph></Section>
      </Prose><References/>`));
      const rendered = await renderOnce(f.root, 'proof');
      assert.deepEqual(rendered.artifact.issues, []);
      const text = await runs(rendered.directory);
      for (const [word, expected] of [['Opening', 40], ['Continuing', 56.5], ['Nested', 56.5], ['Reset', 40], ['Following', 56.5], ['Aftervisual', 40], ['Sectionlead', 40], ['Sectionbody', 56.5]] as const) {
        const first = text.find(run => run.text.startsWith(word));
        assert.ok(first, `${body}: ${word} remains selectable`);
        assert.ok(Math.abs(first.x - expected) < 0.02, `${body}: ${word} starts at ${first.x}, expected ${expected}`);
      }
      assert.ok(text.some(run => run.text.includes('Illustrative reference fixture')));
      assert.ok(text.some(run => run.text.includes('[1]')));
      assert.ok(text.every(run => !/[\u200b\u2060\ufeff]/u.test(run.text)), 'No invisible joining characters enter copied text');
      assert.ok(rendered.artifact.blocks.nested.source?.file.endsWith('documents/proof/index.tsx'));
      assert.ok(rendered.artifact.blocks.continuing.text.startsWith('Continuing'));
    }
  } finally { await f.cleanup(); }
});

test('a long paragraph carries only its original indent across pages, with constant leading and clean column edges', async () => {
  const f = await fixture();
  try {
    const body = 'Flowing text continues through the column with enough material to test a natural page break. '.repeat(38);
    await writeFile(f.entry, source('OpenDoc Sans', `<Prose><Paragraph id="first">Opening text.</Paragraph><Paragraph id="flow">Continuing ${body}</Paragraph></Prose>`));
    const rendered = await renderOnce(f.root, 'proof');
    assert.ok(rendered.artifact.pages.length >= 3);
    assert.deepEqual(rendered.artifact.issues, []);
    const text = (await runs(rendered.directory)).filter(run => run.text.trim());
    assert.equal(text.find(run => run.text.startsWith('Continuing'))!.x, 56.5);
    for (let page = 2; page <= rendered.artifact.pages.length; page++) assert.equal(text.find(run => run.page === page)!.x, 40, `Continuation on page ${page} is flush`);
    assert.ok(text.every(run => run.x + run.width <= 320.5), 'Text stays within the actual column width');
    const layout = JSON.parse(await readFile(resolve(rendered.directory, 'layout.json'), 'utf8'));
    const heights: number[] = [];
    function visit(node: any) { if (node.nodeType === 'TextLine') heights.push(node.height); for (const child of node.children ?? []) visit(child); }
    for (const page of layout.pages) for (const node of page.elements) visit(node);
    assert.ok(heights.every(height => Math.abs(height - 15.62) < 0.01), 'The spacer does not enlarge the first line');
  } finally { await f.cleanup(); }
});

test('plain paragraphs outside Prose retain their existing spacing and nested regions fail clearly', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, source('OpenDoc Sans', '<Paragraph id="one">Outside one.</Paragraph><Paragraph id="two">Outside two.</Paragraph>'));
    const text = await runs((await renderOnce(f.root, 'proof')).directory);
    const plain = text.filter(run => run.text.startsWith('Outside'));
    assert.equal(plain[0].x, 40); assert.equal(plain[1].x, 40);
    assert.ok(plain[0].y - plain[1].y > 25, 'Existing paragraph gaps remain in effect');
    await writeFile(f.entry, source('OpenDoc Sans', '<Prose><Prose><Paragraph id="one">Nested.</Paragraph></Prose></Prose>'));
    await assert.rejects(renderOnce(f.root, 'proof'), /cannot nest/);
  } finally { await f.cleanup(); }
});
