import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderOnce } from '../src/server/render';
import { fixture, projectRoot } from './helpers';

const imports = `import {Document,Pages,Cover,Heading,Paragraph,Section,TitleBlock,Callout,List,CodeBlock,Figure,DataTable,Cite,References,CrossReference,Note,Notes,Strong,Em,Svg} from '../../src/document';\nimport {neutral} from '../../themes';\nconst publicationTheme = {...neutral, body:'OpenDoc Serif', fontSize:10.5, paragraphGap:11, runningHeader:true};`;
function document(body: string, props = '') {
  return `${imports}\nexport const meta={title:'Publication proof',description:'Synthetic publication test',kind:'technical',theme:'neutral'};\nexport default function Proof(){return <Document title="Publication proof" theme={publicationTheme} ${props}><Pages title="Publication proof">${body}</Pages></Document>}`;
}
async function extracted(path: string) {
  const bytes = await readFile(path);
  const loading = getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: resolve(projectRoot, 'node_modules/pdfjs-dist/standard_fonts') + '/' });
  const pdf = await loading.promise;
  try {
    const pages = [];
    const runs: { text: string; x: number; y: number; width: number }[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => 'str' in item ? item.str : '').join(' '));
      // Read actual PDF drawing runs: text extraction may combine them and hide overlap.
      const operators = await page.getOperatorList();
      let x = 0, y = 0, size = 0, charSpacing = 0;
      let font = '', previousFont = '';
      let previous: (typeof runs)[number] | undefined;
      operators.fnArray.forEach((operation, index) => {
        const args = operators.argsArray[index];
        if (operation === OPS.beginText) { x = 0; y = 0; previous = undefined; }
        if (operation === OPS.setFont) { font = args[0]; size = args[1]; }
        if (operation === OPS.setCharSpacing) charSpacing = args[0];
        if (operation === OPS.moveText) { x += args[0]; y += args[1]; }
        if (operation === OPS.setTextMatrix) { const matrix = args.length === 1 ? args[0] : args; x = matrix[4]; y = matrix[5]; }
        if (operation === OPS.showText) {
          const glyphs = args[0] as ({ unicode: string; width: number } | number)[];
          const text = glyphs.map(glyph => typeof glyph === 'number' ? '' : glyph.unicode).join('');
          const width = glyphs.reduce<number>((sum, glyph) => sum + (typeof glyph === 'number' ? -glyph * size / 1000 : glyph.width * size / 1000 + charSpacing), 0);
          // The engine may emit one positioned glyph at a time. Combine only
          // the same font on the same baseline, keeping the painted end point.
          if (previous && font === previousFont && Math.abs(previous.y - y) < 0.001 && x >= previous.x) {
            previous.text += text;
            previous.width = Math.max(previous.width, x + width - previous.x);
          } else {
            previous = { text, x, y, width };
            runs.push(previous);
          }
          previousFont = font;
          x += width;
        }
      });
    }
    return { text: pages.join(' '), pages, runs, outline: await pdf.getOutline(), raw: bytes.toString('latin1') };
  } finally { await loading.destroy(); }
}

test('publication primitives preserve flowing prose, lists, real italic/mono fonts, notes, and bookmarks', async () => {
  const f = await fixture();
  try {
    const prose = 'Long technical prose explains a decision in context and remains searchable after a page break. '.repeat(85);
    await writeFile(f.entry, document(`
      <TitleBlock id="opening" eyebrow="Synthetic test" title="A careful account of a deliberately complex decision" subtitle="Readable, inspectable, and complete." byline="OpenDoc / sample author" />
      <Section id="methods" title="Methods with an italic word" lead={<>A brief opening with <Em>office efficiency</Em> and <Strong><Em>finished figures</Em></Strong>.</>}>
        <Paragraph id="long-prose">${prose}</Paragraph>
      </Section>
      <Heading id="semantic-heading">An <Em>italic heading</Em></Heading>
      <List id="steps" ordered items={[{id:'observe',children:'Observe the first condition.'},{id:'record',children:'Record the second condition.'}]} />
      <Callout id="decision" title="Decision"><Paragraph id="decision-prose">Prefer a result that a reader can inspect.</Paragraph><Paragraph id="decision-proof">Retain the second paragraph's identity.</Paragraph></Callout>
      <CodeBlock id="specimen" language="TypeScript" caption="A source specimen">{'function office(value: number) {\\n    return value >= 0 ? value : 0;\\n}'}</CodeBlock>
      <Paragraph id="noted">A bounded assumption.<Note id="scope">This is an endnote with <Em>faithful italic text</Em>.</Note></Paragraph>
      <Paragraph id="symbols">Symbols: α β γ Δ ± × ≤ ≥ →.</Paragraph>
      <Paragraph id="spacing"><Strong>AVATAR first draft.</Strong> Every reviewer gets a readable word boundary.</Paragraph>
      <Notes />
    `));
    const result = await renderOnce(f.root, 'proof');
    const pdf = await extracted(resolve(result.directory, 'document.pdf'));
    assert.ok(result.artifact.pages.filter(page => page.fragments.some(block => block.id === 'long-prose')).length > 1);
    assert.ok(result.artifact.blocks['steps-observe']);
    assert.ok(result.artifact.blocks['steps-record']);
    assert.ok(result.artifact.blocks['note-scope']);
    assert.ok(result.artifact.blocks['decision-prose']);
    assert.ok(result.artifact.blocks['decision-proof']);
    for (const symbol of ['α', 'β', 'γ', 'Δ', '±', '×', '≤', '≥', '→']) assert.ok(pdf.text.includes(symbol), `Missing scientific symbol: ${symbol}`);
    for (const phrase of ['office efficiency', 'finished figures', 'function office(value: number)', 'return value >= 0 ? value : 0;', 'faithful italic text', '[note 1]']) assert.ok(pdf.text.replace(/\s+/g, ' ').includes(phrase), `Missing extracted text: ${phrase}`);
    for (const font of ['OpenDocSerif-Italic', 'OpenDocSans-Italic', 'OpenDocMono']) assert.ok(pdf.raw.includes(font), `Missing embedded font: ${font}`);
    const bold = pdf.runs.find(item => item.text === 'AVATAR first draft.')!;
    const next = pdf.runs.find(item => item.text.includes('Every reviewer'))!;
    assert.ok(bold && next && Math.abs(bold.y - next.y) < 0.1);
    assert.ok(next.x >= bold.x + bold.width - 0.2, 'The drawn width of a styled run must not overlap the next run or consume its space.');
    const layout = JSON.parse(await readFile(resolve(result.directory, 'layout.json'), 'utf8'));
    const monoLines: { textContent: string }[] = [];
    function findCode(node: { style?: { fontFamily?: string }; nodeType?: string; textContent?: string; children?: any[] }) {
      if (node.style?.fontFamily === 'OpenDoc Mono' && node.nodeType === 'TextLine') monoLines.push(node as { textContent: string });
      node.children?.forEach(findCode);
    }
    layout.pages.forEach((page: { elements: any[] }) => page.elements.forEach(findCode));
    assert.ok(monoLines.some(line => line.textContent === '    return value >= 0 ? value : 0;'), 'Code indentation must survive typesetting.');
    assert.ok(pdf.outline?.some(item => item.title.includes('A careful account')));
    assert.ok(pdf.outline?.some(item => item.title.includes('Methods')));
    assert.match(pdf.text.replace(/\s+/g, ' '), /1\. Observe the first condition.*2\. Record the second condition/);
    const methodPage = result.artifact.pages.find(page => page.fragments.some(block => block.id === 'methods-heading'));
    assert.ok(methodPage?.fragments.some(block => block.id === 'methods-lead'), 'Short lead must share its heading page.');
    await rm(result.directory, { recursive: true, force: true });
  } finally { await f.cleanup(); }
});

test('lists flow between stable items across page boundaries without a renderer panic', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document(`<TitleBlock id="list-title" title="A long decision checklist" /><Paragraph id="list-preface">${'A preceding paragraph makes the first list start near a page boundary. '.repeat(20)}</Paragraph><List id="checklist" ordered start={3} items={Array.from({length:65},(_,i)=>({id:'condition-'+i,children:'Condition '+i+': '+ 'Confirm the responsible person and the evidence needed to finish the work. '.repeat(2)}))}/>`));
    const result = await renderOnce(f.root, 'proof');
    const pdf = await extracted(resolve(result.directory, 'document.pdf'));
    assert.ok(pdf.pages.length >= 4);
    assert.ok(pdf.text.includes('Condition 64:'));
    assert.match(pdf.text, /67\./);
    assert.ok(result.artifact.blocks['checklist-condition-64']);
    for (let i = 0; i < 65; i++) assert.equal(result.artifact.pages.filter(page => page.fragments.some(block => block.id === `checklist-condition-${i}`)).length, 1, `List item ${i} should stay intact.`);
    await rm(result.directory, { recursive: true, force: true });
  } finally { await f.cleanup(); }
});

test('wrapped list items reserve their full height before the next item and heading', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document(`<Section id="method" title="Proposed method" lead="Keep the handling and surroundings consistent."><List id="method-steps" ordered items={[
      {id:'prepare',children:<><Strong>Prepare the setup.</Strong> Label the cups A and B. Record their dimensions and construction if known. Place them on the same level surface, away from direct sunlight and draughts, in a room targeted at 22 °C. Use both cups uncovered. Measure 250 mL of water for each cup with the same graduated vessel.</>},
      {id:'sensors',children:<><Strong>Set the measurement conditions.</Strong> Use two thermometers checked together in the same water bath. Record their resolution and stated accuracy. Keep the probes in place and do not stir during the timed run.</>},
      {id:'record',children:'Record both readings.'}
    ]}/></Section><Section id="observations" title="Observations" lead="Record all observations, including incomplete measurements." />`));
    const result = await renderOnce(f.root, 'proof');
    const fragments = result.artifact.pages[0].fragments;
    const blocks = ['method-steps-prepare', 'method-steps-sensors', 'method-steps-record', 'observations-heading'].map(id => fragments.find(block => block.id === id)!);
    assert.ok(blocks.every(Boolean));
    assert.ok(blocks[0].height >= 4 * 10.5 * 1.5, 'The wrapped item should occupy at least four lines.');
    for (let i = 1; i < blocks.length; i++) assert.ok(blocks[i].y >= blocks[i - 1].y + blocks[i - 1].height + 3, `Content after ${blocks[i - 1].id} must clear every rendered line.`);
    const pdf = await extracted(resolve(result.directory, 'document.pdf'));
    assert.ok(pdf.text.includes('graduated vessel.'));
    assert.match(pdf.text.replace(/\s+/g, ' '), /3\. Record both readings/);
    await rm(result.directory, { recursive: true, force: true });
  } finally { await f.cleanup(); }
});

test('code can continue across pages without losing indentation or its final line', async () => {
  const f = await fixture();
  try {
    const code = Array.from({ length: 110 }, (_, i) => `    record(${i}, "two  spaces");`).join('\n') + '\nfinish();';
    await writeFile(f.entry, document(`<TitleBlock id="code-title" title="A long source specimen" /><CodeBlock id="long-code" language="TypeScript">{${JSON.stringify(code)}}</CodeBlock>`));
    const result = await renderOnce(f.root, 'proof');
    const pdf = await extracted(resolve(result.directory, 'document.pdf'));
    assert.ok(result.artifact.pages.filter(page => page.fragments.some(block => block.id === 'long-code')).length >= 2);
    assert.match(pdf.text.replace(/\s+/g, ' '), /record\(109, "two spaces"\);/);
    assert.ok(pdf.text.includes('finish();'));
    await rm(result.directory, { recursive: true, force: true });
  } finally { await f.cleanup(); }
});

test('a long endnote flows across pages instead of becoming an oversized unbreakable block', async () => {
  const f = await fixture();
  try {
    const note = 'This detailed note explains a limitation and preserves the context required to understand it. '.repeat(95) + 'Final endnote sentence.';
    await writeFile(f.entry, document(`<Paragraph id="noted">An observation.<Note id="long">${note}</Note></Paragraph><Notes />`));
    const result = await renderOnce(f.root, 'proof');
    const pdf = await extracted(resolve(result.directory, 'document.pdf'));
    assert.ok(result.artifact.pages.filter(page => page.fragments.some(block => block.id === 'note-long')).length > 1);
    assert.ok(pdf.text.includes('Final endnote sentence.'));
    await rm(result.directory, { recursive: true, force: true });
  } finally { await f.cleanup(); }
});

test('references can precede citations and forward cross-references use real labels', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document(`
      <References />
      <Paragraph id="forward">See <CrossReference target="result-table" /> and <CrossReference target="result-figure" />, then <CrossReference target="discussion" />. <Cite source="alpha" /> <Cite source="beta" locator="p. 12" /> Again <Cite source="alpha" />.</Paragraph>
      <DataTable id="result-table" caption="Synthetic observations" columns={[{label:'Condition'},{label:'Count'}]} rows={[["A",4],["B",9]]}/>
      <Figure id="result-figure" caption="A synthetic comparison"><Svg width={100} height={30} content={'<rect width="80" height="20" fill="#315e7f" />'} /></Figure>
      <Section id="discussion" title="Interpretation" lead="The reader can trace the labels without relying on a page number."><Paragraph id="meaning">Every observed value is illustrative.</Paragraph></Section>
    `, `references={{alpha:{title:'First source',author:'Sample Organization',year:'2026',url:'https://example.com/alpha'},beta:{title:'Second source',author:'Sample Organization',year:'2026'}}} citationStyle="author-date"`));
    const result = await renderOnce(f.root, 'proof');
    const pdf = await extracted(resolve(result.directory, 'document.pdf'));
    assert.match(pdf.text, /First source.*Second source.*See Table 1 and Figure 1, then Interpretation/);
    assert.match(pdf.text, /Sample Organization, 2026a/);
    assert.match(pdf.text, /Sample Organization, 2026b/);
    assert.match(pdf.text.replace(/\s+/g, ' '), /2026b, p. 12/);
    assert.ok(result.artifact.blocks['reference-alpha']);
    assert.ok(result.artifact.blocks['reference-beta']);
    await rm(result.directory, { recursive: true, force: true });
    const many = Object.fromEntries(Array.from({ length: 28 }, (_, i) => [`source-${i}`, { title: `Synthetic source ${i}`, author: 'Sample Author', year: '2026' }]));
    await writeFile(f.entry, document(`<Paragraph id="many-citations">${Object.keys(many).map(key => `<Cite source="${key}" /> `).join('')}</Paragraph><References />`, `references={${JSON.stringify(many)}} citationStyle="author-date"`));
    const extended = await renderOnce(f.root, 'proof');
    const extendedPdf = await extracted(resolve(extended.directory, 'document.pdf'));
    assert.match(extendedPdf.text, /2026aa/);
    assert.match(extendedPdf.text, /2026ab/);
    await rm(extended.directory, { recursive: true, force: true });
  } finally { await f.cleanup(); }
});

test('long tables repeat their captions and headers; empty tables are explicit', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document(`
      <TitleBlock id="table-title" title="Synthetic observations over a long sequence" />
      <DataTable id="empty" caption="Pending observations" columns={[{label:'Item'},{label:'Value'}]} rows={[]} emptyMessage="No observations recorded yet." />
      <DataTable id="long-table" caption="Measured values (illustrative)" sourceNote="Synthetic data generated for this pagination test." columns={[{label:'Identifier',width:3},{label:'Value',width:1}]} rows={Array.from({length:90},(_,i)=>['Observation '+i, i * 10])} />
    `));
    const result = await renderOnce(f.root, 'proof');
    const pdf = await extracted(resolve(result.directory, 'document.pdf'));
    assert.match(pdf.text, /No observations recorded yet/);
    assert.match(pdf.text, /Observation 89/);
    assert.match(pdf.text, /Synthetic data generated/);
    const tablePages = result.artifact.pages.map((page, index) => page.fragments.some(block => block.id === 'long-table') ? index : -1).filter(index => index >= 0);
    assert.ok(tablePages.length >= 3);
    for (const index of tablePages) {
      assert.match(pdf.pages[index], /Table 2. Measured values/);
      assert.match(pdf.pages[index], /Identifier.*Value/);
    }
    await rm(result.directory, { recursive: true, force: true });
  } finally { await f.cleanup(); }
});

test('long cover titles grow naturally and prefixes support distinct covers', async () => {
  const f = await fixture();
  try {
    const title = 'Designing a dependable observation system for a community learning centre';
    await writeFile(f.entry, `${imports}\nexport const meta={title:'Cover proof',description:'Long title',kind:'proposal',theme:'neutral'};\nexport default function Proof(){return <Document title="Cover proof" theme={publicationTheme}><Cover idPrefix="proposal" eyebrow="Synthetic proposal" title="${title}" subtitle="A scoped and reviewable plan with a clear decision at every stage." footer="EXAMPLE / NO CLIENT ENGAGEMENT" /><Cover idPrefix="appendix" eyebrow="Appendix" title="The working assumptions" subtitle="A second cover keeps distinct feedback targets." footer="SYNTHETIC APPENDIX" /></Document>}`);
    const result = await renderOnce(f.root, 'proof');
    const pdf = await extracted(resolve(result.directory, 'document.pdf'));
    assert.equal(pdf.pages.length, 2);
    assert.ok(pdf.pages[0].replace(/\s+/g, ' ').includes(title));
    assert.ok(result.artifact.blocks['proposal-title']);
    assert.ok(result.artifact.blocks['appendix-title']);
    await rm(result.directory, { recursive: true, force: true });
  } finally { await f.cleanup(); }
});

test('source mistakes fail with actionable errors instead of disappearing from the publication', async () => {
  const f = await fixture();
  try {
    const cases = [
      { body: '<Paragraph id="x"><CrossReference target="missing" /></Paragraph>', error: /Unknown cross-reference target: missing/ },
      { body: '<Paragraph id="x"><Cite source="a" /></Paragraph>', props: `references={{a:{title:'Source',url:'https://example.com'}}}`, error: /Add <References/ },
      { body: '<Paragraph id="x"><Note id="missing">Body</Note></Paragraph>', error: /Add <Notes/ },
      { body: '<References />', props: `references={{'bad key':{title:'Source',url:'https://example.com'}}}`, error: /Reference key needs a stable id/ },
      { body: '<References />', props: `references={{a:{title:'Source',url:'javascript:alert(1)'}}}`, error: /valid http or https URL/ },
      { body: '<Paragraph id="x"><Cite source="a" /></Paragraph><References />', props: `citationStyle="author-date" references={{a:{title:'Source',url:'https://example.com'}}}`, error: /needs author and year/ },
      { body: '<DataTable id="bad-number" columns={[{label:"Value"}]} rows={[[NaN]]}/>', error: /row 1, column 1 must be text or a finite number/ },
      { body: '<DataTable id="bad-number" columns={[{label:"Value"}]} rows={[[Infinity]]}/>', error: /finite number/ },
      { body: '<DataTable id="bad-column" columns={[null]} rows={[]}/>', error: /columns must be objects/ },
      { body: '<DataTable id="bad-caption" caption="Table 9. Wrong number" columns={[{label:"Value"}]} rows={[[1]]}/>', error: /caption numbering does not match Table 1/ },
      { body: '<Paragraph id="x"><CrossReference target="no-caption" /></Paragraph><DataTable id="no-caption" columns={[{label:"Value"}]} rows={[[1]]}/>', error: /needs a table caption/ },
      { body: '<List id="list" items={[{id:"same",children:"One"},{id:"same",children:"Two"}]}/>', error: /Duplicate block id: list-same/ },
      { body: `<Section id="overlong" title="Long lead" lead={${JSON.stringify('Long prose. '.repeat(80))}}/>`, error: /lead is too long/ },
    ];
    for (const { body, props, error } of cases) {
      await writeFile(f.entry, document(body, props));
      await assert.rejects(renderOnce(f.root, 'proof'), error);
    }
  } finally { await f.cleanup(); }
});

test('native charts fail clearly before producing corrupt labels and a corrected ordinary figure renders', async () => {
  const f = await fixture();
  try {
    const charts = [
      ['BarChart', `data={[{label:'Baseline',value:12},{label:'Revised',value:18}]}`],
      ['LineChart', `series={[{name:'Observed',data:[12,18]}]} labels={['Week 1','Week 2']}`],
      ['PieChart', `data={[{label:'Complete',value:12},{label:'Pending',value:18}]}`],
      ['AreaChart', `series={[{name:'Observed',data:[12,18]}]} labels={['Week 1','Week 2']}`],
      ['DotPlot', `groups={[{name:'Observed',data:[{x:1,y:12},{x:2,y:18}]}]}`],
    ];
    for (const [name, props] of charts) {
      await writeFile(f.entry, `import {${name}} from '@formepdf/react';\n` + document(`<Paragraph id="before">Ordinary surrounding text.</Paragraph><Figure id="chart" caption="Synthetic observations"><${name} width={300} height={180} ${props}/></Figure><Paragraph id="after">The final paragraph.</Paragraph>`));
      await assert.rejects(renderOnce(f.root, 'proof'), new RegExp(`chart: ${name} is not supported.*chart labels are encoded incorrectly.*local chart asset inside Figure`));
    }
    await writeFile(f.entry, document(`<Paragraph id="before">Ordinary surrounding text.</Paragraph><Figure id="chart" caption="Synthetic observations"><Svg width={120} height={60} content={'<rect x="10" y="20" width="20" height="40" fill="#315e7f"/><rect x="50" y="5" width="20" height="55" fill="#315e7f"/>'} alt="Two illustrative bars."/></Figure><Paragraph id="after">The final paragraph.</Paragraph>`));
    const result = await renderOnce(f.root, 'proof');
    const pdf = await extracted(resolve(result.directory, 'document.pdf'));
    assert.match(pdf.text, /Ordinary surrounding text.*Figure 1. Synthetic observations.*The final paragraph/);
    assert.ok(result.artifact.blocks.chart);
    await rm(result.directory, { recursive: true, force: true });
  } finally { await f.cleanup(); }
});
