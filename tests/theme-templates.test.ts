import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderEntry } from '../src/server/render';
import { fixture, projectRoot } from './helpers';

type LayoutNode = {
  nodeType: string; sourceLocation?: { file: string }; children?: LayoutNode[];
  style: { fontFamily?: string; fontSize?: number; margin?: { bottom: number }; padding?: { top: number } };
};
const flatten = (nodes: LayoutNode[]): LayoutNode[] => nodes.flatMap(node => [node, ...flatten(node.children ?? [])]);

test('complete themes reach every publication template while preserving their content and native structure', async () => {
  const f = await fixture();
  await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
  const custom = `import {neutral,type DocTheme} from '../../themes';
    const theme:DocTheme={...neutral,id:'contrast',name:'Contrast',body:'OpenDoc Serif',fontSize:12,lineHeight:1.5,paragraphGap:14,pageSize:'Letter',runningHeader:false,runningFooter:false,
      design:{page:{margin:60},typography:{h1:{fontSize:31},h2:{fontSize:19},lead:{fontSize:16},small:{fontSize:9.5},caption:{fontSize:10}},
      title:{heading:{fontSize:33},block:{borderBottomWidth:1,borderColor:'#963b34',paddingBottom:8,marginBottom:12}},
      table:{cell:{padding:7},header:{backgroundColor:'#963b34'},headerText:{color:'#ffffff',fontSize:10},text:{fontSize:10}}}};`;
  const layouts = [
    ['business-proposal', 'proposal-title', 'specimen-opening'],
    ['consulting-report', 'report-title', 'specimen-first-paragraph'],
    ['editorial-essay', 'essay-title', 'specimen-paragraph-1'],
    ['executive-brief', 'brief-title', 'specimen-opening'],
    ['invoice', 'invoice-title', 'invoice-introduction'],
    ['literary-text', 'literary-title', 'specimen-paragraph-1'],
    ['magazine-feature', 'feature-title', 'specimen-opening'],
    ['monthly-report', 'report-title-title', 'summary-lead'],
    ['quotation', 'quote-title', 'quote-introduction'],
    ['scientific-paper', 'paper-title', 'specimen-opening'],
  ];
  try {
    for (const [id, titleId, bodyId] of layouts) {
      const entry = resolve(f.root, `documents/proof/${id}.tsx`);
      const specimen = id === 'invoice'
        ? `import{Invoice,parseInvoice}from'../../templates/invoice';import raw from'../../templates/invoice/examples/typical.json';function Specimen(){return <Invoice data={parseInvoice({...raw,introduction:'This supplied introduction remains ordinary body prose in the invoice.'})} theme={theme}/>}`
        : `import{Specimen}from'../../templates/${id}/preview';`;
      await writeFile(entry, `${custom}\n${specimen}export const meta={title:'Theme integration proof',description:'Illustrative theme test',kind:'report',theme:theme.id};export default function Proof(){return <Specimen theme={theme}/>}`);
      const result = await renderEntry(f.root, entry, id);
      assert.deepEqual(result.artifact.issues, [], id);
      assert.equal(result.artifact.pages[0].width, 612, `${id}: theme page size`);
      const layout = JSON.parse(await readFile(resolve(result.directory, 'layout.json'), 'utf8'));
      const nodes = flatten(layout.pages.flatMap((page: { elements: LayoutNode[] }) => page.elements));
      const block = (blockId: string) => nodes.find(node => node.sourceLocation?.file === `opendoc:block:${blockId}`);
      assert.equal(block(titleId)?.style.fontSize, 33, `${id}: theme title overrides template fallback`);
      assert.equal(block(bodyId)?.style.fontSize, 12, `${id}: body size remains theme-owned`);
      assert.equal(block(bodyId)?.style.fontFamily, 'OpenDoc Serif', `${id}: body font remains theme-owned`);
      assert.equal(block(bodyId)?.style.margin?.bottom, 14, `${id}: paragraph rhythm remains theme-owned`);
      assert.ok(!nodes.some(node => ['FixedHeader', 'FixedFooter'].includes(node.nodeType)), `${id}: theme can remove furniture`);
      const body = result.artifact.pages.flatMap(page => page.fragments).find(fragment => fragment.id === bodyId)!;
      assert.equal(body.x, id === 'magazine-feature' ? 156 : 60, `${id}: theme margin with retained reading-column offset`);
      if (id === 'quotation') {
        const acceptancePage = result.artifact.pages.find(page => page.fragments.some(fragment => fragment.id === 'quote-acceptance'))!;
        assert.ok(acceptancePage.fragments.some(fragment => fragment.id === 'quote-signature-fields'), 'Short acceptance text stays with its signature fields');
      }
      const tableCell = nodes.find(node => node.nodeType === 'TableCell');
      if (tableCell) assert.ok(nodes.some(node => node.nodeType === 'TableCell' && node.style.padding?.top === 7), `${id}: themed data-cell spacing`);
      const loading = getDocument({ data: new Uint8Array(await readFile(resolve(result.directory, 'document.pdf'))), standardFontDataUrl: resolve(projectRoot, 'node_modules/pdfjs-dist/standard_fonts') + '/' });
      try {
        const pdf = await loading.promise;
        const text: string[] = [];
        for (let page = 1; page <= pdf.numPages; page++) text.push((await (await pdf.getPage(page)).getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' '));
        assert.ok(text.join(' ').includes(result.artifact.blocks[bodyId].text.slice(0, 30)), `${id}: source prose survives PDF rendering`);
      } finally { await loading.destroy(); }
    }
  } finally { await f.cleanup(); }
});

test('a local title override stays authoritative and a styled invoice keeps calculated amounts', async () => {
  const f = await fixture();
  await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
  try {
    await writeFile(f.entry, `import{Invoice,parseInvoice}from'../../templates/invoice';import data from'../../templates/invoice/examples/typical.json';import{neutral}from'../../themes';const theme={...neutral,design:{typography:{h1:{fontSize:40}},table:{text:{fontSize:10.5},headerText:{fontSize:11}}}};export const meta={title:'Invoice style proof',description:'Illustrative invoice',kind:'report',theme:theme.id};export default function Proof(){return <Invoice data={parseInvoice(data)} theme={theme} titleStyle={{fontSize:24}}/>}`);
    const result = await renderEntry(f.root, f.entry, 'styled-invoice');
    assert.deepEqual(result.artifact.issues, []);
    const layout = JSON.parse(await readFile(resolve(result.directory, 'layout.json'), 'utf8'));
    const nodes = flatten(layout.pages.flatMap((page: { elements: LayoutNode[] }) => page.elements));
    assert.equal(nodes.find(node => node.sourceLocation?.file === 'opendoc:block:invoice-title')?.style.fontSize, 24);
    assert.ok(result.artifact.blocks['pricing-items']);
    assert.match(result.artifact.blocks['pricing-totals'].text, /Payments received.*Amount due/);
  } finally { await f.cleanup(); }
});
