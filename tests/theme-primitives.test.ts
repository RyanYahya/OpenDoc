import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFile, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderOnce } from '../src/server/render';
import { captureExportInputs } from '../src/server/export-inputs';
import { Workspace } from '../src/server/workspace';
import { neutral, validateTheme } from '../themes';
import { fixture, projectRoot, settled, source } from './helpers';

const design = {
  typography: { h1: { fontSize: 36 }, h2: { fontSize: 17 }, caption: { fontSize: 8 }, code: { fontSize: 8 } },
  page: { margin: { top: 42, bottom: 42, left: 60, right: 60 } },
  title: { heading: { fontSize: 39 }, block: { borderBottomWidth: 0 }, uppercaseEyebrow: false },
  furniture: { uppercaseHeader: false, pageNumber: 'page' },
  table: { header: { backgroundColor: '#ffffff' }, headerText: { color: '#242424', fontSize: 8 }, cell: { padding: 5 }, text: { fontSize: 9 }, alternate: false },
  callout: { block: { padding: 10 }, title: { fontSize: 12 } },
  list: { gap: 12, item: { marginBottom: 9 } },
};

function proof(extra: string) {
  return `import {Document,Pages,TitleBlock,Heading,Paragraph,Callout,List,Figure,DataTable,CodeBlock,View} from '../../src/document';
import {neutral} from '../../themes';
const theme={...neutral,id:'proof-theme',runningHeader:true,...${extra}};
export const meta={title:'Theme proof',description:'Synthetic design fixture',theme:theme.id};
export default function Proof(){return <Document title={meta.title} theme={theme}><Pages title="Mixed Case Header">
<TitleBlock id="opening" eyebrow="Mixed case label" title="Theme hierarchy" subtitle="A reusable design system" byline="Illustrative author"/>
<Heading id="section">A section heading</Heading><Paragraph id="body">Readable office efficiency remains selectable.</Paragraph>
<Callout id="aside" title="A designed aside">An ordinary supporting observation.</Callout>
<List id="list" items={[{id:'first',children:'A first stable item.'},{id:'second',children:'A second stable item.'}]}/>
<Figure id="figure" caption="A synthetic visual."><View style={{height:24,backgroundColor:'#cccccc'}}/></Figure>
<CodeBlock id="code" language="Text">{'code specimen'}</CodeBlock>
<DataTable id="table" columns={[{label:'Record'},{label:'Value'}]} rows={Array.from({length:55},(_,i)=>['Stable row '+i,i])} caption="Synthetic records."/>
<Paragraph id="end">END OF RECORDS</Paragraph></Pages></Document>}`;
}

async function pdfContent(directory: string) {
  const loading = getDocument({ data: new Uint8Array(await readFile(resolve(directory, 'document.pdf'))), standardFontDataUrl: resolve(projectRoot, 'node_modules/pdfjs-dist/standard_fonts') + '/' });
  try {
    const pdf = await loading.promise;
    const pages: string[] = [], runs: { text: string; size: number }[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i), content = await page.getTextContent();
      const items = content.items.filter(item => 'str' in item);
      pages.push(items.map(item => item.str).join(' '));
      runs.push(...items.map(item => ({ text: item.str, size: Math.abs(item.transform[0]) })));
    }
    return { pages, runs, text: pages.join(' ') };
  } finally { await loading.destroy(); }
}

test('complete theme rules reach real PDF type, geometry, furniture and table flow while block IDs stay stable', async () => {
  const f = await fixture();
  const results: Awaited<ReturnType<typeof renderOnce>>[] = [];
  try {
    for (const extra of ['{}', JSON.stringify({ design })]) {
      await writeFile(f.entry, proof(extra));
      results.push(await renderOnce(f.root, 'proof'));
    }
    const [plain, designed] = results;
    const before = await pdfContent(plain.directory), after = await pdfContent(designed.directory);
    assert.deepEqual(Object.keys(designed.artifact.blocks), Object.keys(plain.artifact.blocks));
    assert.equal(before.runs.find(run => run.text === 'Theme hierarchy')?.size, 32);
    assert.equal(after.runs.find(run => run.text === 'Theme hierarchy')?.size, 39);
    assert.equal(before.runs.find(run => run.text === 'A section heading')?.size, 21);
    assert.equal(after.runs.find(run => run.text === 'A section heading')?.size, 17);
    assert.match(before.text, /MIXED CASE HEADER/);
    assert.match(after.text, /Mixed Case Header/);
    assert.ok(after.text.replace(/\s/g, '').includes('Mixedcaselabel'), 'Eyebrow casing survives tracked text extraction.');
    assert.match(after.text, /Readable office efficiency remains selectable/);
    assert.ok(after.pages.length > 1);
    for (let i = 0; i < 55; i++) assert.match(after.text, new RegExp(`Stable row ${i}\\b`));
    assert.match(after.pages.at(-1)!, /END OF RECORDS/);
    for (const [index, page] of designed.artifact.pages.entries()) {
      if (page.fragments.some(block => block.id === 'table')) assert.match(after.pages[index], /Record.*Value/);
    }
    const plainTitle = plain.artifact.pages[0].fragments.find(block => block.id === 'opening-title')!;
    const designedTitle = designed.artifact.pages[0].fragments.find(block => block.id === 'opening-title')!;
    assert.notDeepEqual(designedTitle, plainTitle, 'Theme geometry must reach actual PDF feedback targets.');
  } finally { await Promise.all(results.map(result => rm(result.directory, { recursive: true, force: true }))); await f.cleanup(); }
});

test('brand fonts embed from local theme assets and missing or unknown families fail explicitly', async () => {
  const f = await fixture();
  let directory: string | undefined;
  try {
    const folder = resolve(f.root, 'themes/proof-theme');
    await mkdir(folder);
    await copyFile(resolve(projectRoot, 'assets/fonts/OpenDocSans-Regular.ttf'), resolve(folder, 'regular.ttf'));
    await copyFile(resolve(projectRoot, 'assets/fonts/OpenDocSans-Semibold.ttf'), resolve(folder, 'semibold.ttf'));
    const custom = { body: 'Brand Sans', heading: 'Brand Sans', fonts: [
      { family: 'Brand Sans', src: 'themes/proof-theme/regular.ttf', fontWeight: 400 },
      { family: 'Brand Sans', src: 'themes/proof-theme/semibold.ttf', fontWeight: 600 },
    ] };
    await writeFile(f.entry, proof(JSON.stringify(custom)));
    const result = await renderOnce(f.root, 'proof'); directory = result.directory;
    assert.match((await pdfContent(directory)).text, /Readable office efficiency remains selectable/);
    const layout = await readFile(resolve(directory, 'layout.json'), 'utf8');
    assert.match(layout, /Brand Sans/);
    await writeFile(f.entry, proof(JSON.stringify({ ...custom, design: { typography: { caption: { fontFamily: 'Missing family' } } } })));
    await assert.rejects(renderOnce(f.root, 'proof'), /register local font family Missing family/);
    await writeFile(f.entry, proof(JSON.stringify({ ...custom, fonts: [{ family: 'Brand Sans', src: 'themes/proof-theme/absent.ttf' }] })));
    await assert.rejects(renderOnce(f.root, 'proof'), /font file themes\/proof-theme\/absent.ttf was not found/);
    await copyFile(resolve(folder, 'regular.ttf'), resolve(f.root, 'documents/proof/untracked.ttf'));
    await symlink(resolve(f.root, 'documents/proof/untracked.ttf'), resolve(folder, 'escaped.ttf'));
    await writeFile(f.entry, proof(JSON.stringify({ ...custom, fonts: [{ family: 'Brand Sans', src: 'themes/proof-theme/escaped.ttf' }] })));
    await assert.rejects(renderOnce(f.root, 'proof'), /must stay inside its theme or shared assets folder/);
  } finally { if (directory) await rm(directory, { recursive: true, force: true }); await f.cleanup(); }
});

test('theme validation rejects broken geometry and remote fonts before rendering', () => {
  assert.doesNotThrow(() => validateTheme(neutral));
  assert.throws(() => validateTheme({ ...neutral, fontSize: 0 }), /fontSize/);
  assert.throws(() => validateTheme({ ...neutral, design: { typography: { h1: { fontSize: Number.NaN } } } }), /finite/);
  assert.throws(() => validateTheme({ ...neutral, fonts: [{ family: 'Remote', src: 'https://example.com/font.ttf' }] }), /workspace-relative/);
  assert.throws(() => validateTheme({ ...neutral, fonts: [{ family: 'Untracked', src: 'documents/other/font.ttf' }] }), /so edits are tracked/);
});

test('managed font reads keep unrelated documents ready while font edits invalidate previews and export snapshots', async () => {
  const f = await fixture();
  const workspace = new Workspace(f.root);
  try {
    const folder = resolve(f.root, 'themes/proof-theme');
    await mkdir(folder);
    const font = resolve(folder, 'regular.ttf');
    await copyFile(resolve(projectRoot, 'assets/fonts/OpenDocSans-Regular.ttf'), font);
    await copyFile(resolve(projectRoot, 'assets/fonts/OpenDocSans-Semibold.ttf'), resolve(folder, 'semibold.ttf'));
    await writeFile(f.entry, proof(JSON.stringify({ body: 'Brand Sans', heading: 'Brand Sans', fonts: [
      { family: 'Brand Sans', src: 'themes/proof-theme/regular.ttf', fontWeight: 400 },
      { family: 'Brand Sans', src: 'themes/proof-theme/semibold.ttf', fontWeight: 600 },
    ] })));
    const other = resolve(f.root, 'documents/unrelated/index.tsx');
    await mkdir(resolve(f.root, 'documents/unrelated'));
    await writeFile(other, source());
    await workspace.refresh(); await settled(workspace);
    assert.equal(workspace.states.get('proof')!.status, 'ready');
    const revision = workspace.states.get('proof')!.revision;
    await writeFile(other, source().replace('Proof document', 'Unrelated edit'));
    assert.deepEqual(workspace.noteChange(other), ['unrelated']);
    assert.equal(workspace.states.get('proof')!.status, 'ready');
    await workspace.flushChanges(); await settled(workspace);
    assert.equal(workspace.states.get('proof')!.revision, revision);
    const unchanged = await captureExportInputs(f.root, 'proof');
    const bytes = await readFile(font);
    await writeFile(font, bytes);
    assert.equal(unchanged(), false, 'Font asset replacement invalidates an in-flight export.');
    assert.ok(workspace.noteChange(font).includes('proof'));
    assert.equal(workspace.states.get('proof')!.status, 'rendering');
    await workspace.flushChanges(); await settled(workspace);
    assert.equal(workspace.states.get('proof')!.status, 'ready');
  } finally { await workspace.close(); await f.cleanup(); }
});
