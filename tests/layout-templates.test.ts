import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { TemplateCatalog, createFromTemplate } from '../src/server/templates';
import { renderEntry, renderOnce } from '../src/server/render';
import { assertInstanceTitle, fixture, projectRoot } from './helpers';

async function layoutFixture() {
  const f = await fixture();
  await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
  return f;
}

test('layout catalog renders neutral PDFs independently from documents and discovers local additions', async () => {
  const f = await layoutFixture();
  const catalog = new TemplateCatalog(f.root);
  try {
    const initial = await catalog.list();
    assert.ok(initial.every(item => !('artifact' in item)), 'Discovery does not render PDFs');
    await assert.rejects(readdir(resolve(f.root, '.opendoc/renders')), /ENOENT/);
    const item = { id: 'editorial-essay', ...await catalog.preview('editorial-essay') };
    assert.equal(item.id, 'editorial-essay');
    assert.equal(item.error, undefined);
    assert.equal(item.artifact?.meta.theme, 'neutral');
    assert.equal(item.artifact?.pages.length, 2);
    // Layout content is exercised in the template and theme integration tests.
    assert.equal((await catalog.pdf(item.id, item.artifact!.hash)).subarray(0, 4).toString(), '%PDF');
    assert.deepEqual(await readdir(resolve(f.root, 'documents')), ['proof']);
    assert.equal((await catalog.preview(item.id)).artifact?.hash, item.artifact?.hash);
    // A malformed local addition remains visible and does not break the working template.
    await mkdir(resolve(f.root, 'templates/custom-layout'));
    await mkdir(resolve(f.root, 'templates/incomplete-layout'));
    await writeFile(resolve(f.root, 'templates/custom-layout/template.json'), '{"name":"Custom"}');
    catalog.invalidate();
    const next = await catalog.list();
    assert.equal(next.length, initial.length + 2);
    assert.match(next.find(item => item.id === 'custom-layout')!.error!, /description/);
    assert.match(next.find(item => item.id === 'incomplete-layout')!.error!, /template\.json/);
    assert.ok((await catalog.preview('editorial-essay')).artifact);
    await rm(resolve(f.root, 'templates/editorial-essay'), { recursive: true });
    catalog.invalidate();
    await assert.rejects(catalog.pdf(item.id, item.artifact!.hash), /changed/);
  } finally { await catalog.close(); await f.cleanup(); }
});

test('scientific manuscripts create with either theme and retain long abstracts, symbols, and both citation formats', async () => {
  const f = await layoutFixture();
  try {
    for (const theme of ['neutral', 'opendoc-neutral']) {
      const created = await createFromTemplate(f.root, 'scientific-paper', { projectId: 'test-project', title: `A manuscript in ${theme}`, theme });
      const result = await renderOnce(f.root, created.id);
      assertInstanceTitle(result.artifact, created.id, `A manuscript in ${theme}`);
      assert.deepEqual(result.artifact.issues, []);
      assert.equal(result.artifact.meta.theme, theme);
      assert.equal(result.artifact.provenance?.template, 'templates/scientific-paper/index.tsx');
      assert.equal(result.artifact.pages[0].fragments.find(block => block.id === 'paper-opening')?.x, theme === 'neutral' ? 72 : 48, 'An explicit theme page margin overrides the template default.');
    }
    for (const citationStyle of ['numeric', 'author-date']) {
      const entry = resolve(f.root, `templates/scientific-paper/${citationStyle}-proof.tsx`);
      await writeFile(entry, `import {ScientificPaper} from './index';import{Paragraph,Cite,Strong,Em}from'../../src/document';import{neutral}from'../../themes';export const meta={title:'Illustrative manuscript proof',description:'Synthetic layout test',kind:'research',theme:'neutral'};export default function Proof(){return <ScientificPaper title={meta.title} theme={neutral} citationStyle="${citationStyle}" abstract={<>Illustrative symbols: α ± 1. <Strong>Bold</Strong> and <Em>italic</Em> words. <Cite source="example"/> {'This is illustrative abstract text used to check continuous native pagination. '.repeat(100)}ABSTRACT END</>} references={{example:{title:'Illustrative reference record',author:'Example Author',year:'2026'}}}><Paragraph id="body-end">BODY END</Paragraph></ScientificPaper>}`);
      const result = await renderEntry(f.root, entry, citationStyle);
      assert.deepEqual(result.artifact.issues, []);
      assert.ok(result.artifact.pages.length > 1);
      const fragments = result.artifact.pages.flatMap(page => page.fragments.filter(block => block.id === 'paper-abstract'));
      assert.ok(fragments.length > 1);
      assert.ok(fragments.every(fragment => fragment.x === 96), 'Abstract continuation retains its inset');
      const loading = getDocument({ data: new Uint8Array(await readFile(resolve(result.directory, 'document.pdf'))), standardFontDataUrl: resolve(projectRoot, 'node_modules/pdfjs-dist/standard_fonts') + '/' });
      try {
        const pdf = await loading.promise;
        const texts: string[] = [];
        for (let n = 1; n <= pdf.numPages; n++) texts.push((await (await pdf.getPage(n)).getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' '));
        const text = texts.join(' ');
        assert.match(text, /α ± 1/);
        assert.match(text, /Bold and italic words/);
        assert.match(text, citationStyle === 'numeric' ? /\[1\]/ : /\(Example Author, 2026\)/);
        assert.match(text, /ABSTRACT END.*BODY END.*References.*Illustrative reference record/);
        assert.equal((text.match(/Abstract\./g) ?? []).length, 1);
      } finally { await loading.destroy(); }
    }
  } finally { await f.cleanup(); }
});

test('consulting reports preserve themes and cover order, and native table continuations retain every row', async () => {
  const f = await layoutFixture();
  try {
    for (const theme of ['neutral', 'opendoc-neutral']) {
      const created = await createFromTemplate(f.root, 'consulting-report', { projectId: 'test-project', title: `A consulting report in ${theme}`, theme });
      const result = await renderOnce(f.root, created.id);
      assertInstanceTitle(result.artifact, created.id, `A consulting report in ${theme}`);
      assert.deepEqual(result.artifact.issues, []);
      assert.equal(result.artifact.meta.theme, theme);
      assert.equal(result.artifact.provenance?.template, 'templates/consulting-report/index.tsx');
      assert.equal(result.artifact.pages.length, 2);
      assert.ok(result.artifact.pages[0].fragments.some(block => block.id === 'report-title'));
      assert.equal(result.artifact.pages[1].fragments.find(block => block.id === 'report-opening')?.x, theme === 'neutral' ? 54 : 48, 'An explicit theme page margin overrides the template default.');
    }
    const entry = resolve(f.root, 'templates/consulting-report/long-proof.tsx');
    await writeFile(entry, `import {Specimen} from './preview';export {meta} from './preview';export default function Proof(){return <Specimen length="long"/>}`);
    const result = await renderEntry(f.root, entry, 'long-consulting-report');
    assert.deepEqual(result.artifact.issues, []);
    const loading = getDocument({ data: new Uint8Array(await readFile(resolve(result.directory, 'document.pdf'))), standardFontDataUrl: resolve(projectRoot, 'node_modules/pdfjs-dist/standard_fonts') + '/' });
    try {
      const pdf = await loading.promise;
      const texts: string[] = [];
      for (let n = 1; n <= pdf.numPages; n++) texts.push((await (await pdf.getPage(n)).getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' '));
      const tablePages = result.artifact.pages.flatMap((page, i) => page.fragments.some(block => block.id === 'specimen-table') ? [i] : []);
      assert.ok(tablePages.length >= 2);
      for (const i of tablePages) assert.match(texts[i], /Item.*Description.*Note/, 'Native column headers repeat on each table page');
      for (let n = 1; n <= 30; n++) assert.ok(texts.join(' ').includes(`Example ${n}`), `Table row ${n} survived pagination`);
      assert.match(texts.at(-1)!, /Synthetic table.*The report continues.*References/);
      for (let i = 1; i < texts.length; i++) assert.ok(texts[i].endsWith(String(i + 1)), 'Body footers match physical PDF page numbers');
      const firstTablePage = result.artifact.pages[tablePages[0]];
      assert.ok(firstTablePage.fragments.some(block => block.id === 'specimen-comparison-heading'), 'Comparison introduction starts with its table');
    } finally { await loading.destroy(); }
  } finally { await f.cleanup(); }
});

test('magazine starter preserves its reading column across themes and long text flows across pages', async () => {
  const f = await layoutFixture();
  try {
    for (const theme of ['neutral', 'opendoc-neutral']) {
      const created = await createFromTemplate(f.root, 'magazine-feature', { projectId: 'test-project', title: `A feature in ${theme}`, theme });
      const result = await renderOnce(f.root, created.id);
      assertInstanceTitle(result.artifact, created.id, `A feature in ${theme}`);
      assert.deepEqual(result.artifact.issues, []);
      assert.equal(result.artifact.meta.theme, theme);
      assert.equal(result.artifact.provenance?.template, 'templates/magazine-feature/index.tsx');
      assert.equal(result.artifact.pages[0].fragments.find(block => block.id === 'feature-opening')?.x, 144);
    }
    const entry = resolve(f.root, 'templates/magazine-feature/long-proof.tsx');
    await writeFile(entry, `import {Specimen} from './preview';export {meta} from './preview';export default function Proof(){return <Specimen length="long"/>}`);
    const result = await renderEntry(f.root, entry, 'long-feature');
    assert.deepEqual(result.artifact.issues, []);
    assert.ok(result.artifact.pages.length > 2);
    assert.ok(result.artifact.blocks['specimen-body-16'].text.includes('placeholder'));
    assert.ok(result.artifact.blocks['specimen-reference'].text.includes('no source'));
    for (const page of result.artifact.pages) {
      for (const fragment of page.fragments.filter(block => block.id.startsWith('specimen-body-'))) {
        assert.equal(fragment.x, 144, 'Continuation pages retain the offset column');
        assert.ok(fragment.x + fragment.width <= page.width - 48 + 0.1);
      }
    }
  } finally { await f.cleanup(); }
});

test('template creation preserves literal titles, chosen appearance, layout geometry, and existing files', async () => {
  const f = await layoutFixture();
  try {
    const title = 'A "quoted" ${title} & <essay>';
    const created = await createFromTemplate(f.root, 'editorial-essay', { projectId: 'test-project', id: 'new-essay', title, theme: 'opendoc-neutral' });
    const rendered = await renderOnce(f.root, created.id);
    assertInstanceTitle(rendered.artifact, created.id, title);
    assert.equal(rendered.artifact.meta.title, title);
    assert.equal(rendered.artifact.meta.theme, 'opendoc-neutral');
    assert.equal(rendered.artifact.provenance?.template, 'templates/editorial-essay/index.tsx');
    assert.equal(rendered.artifact.pages[0].fragments.find(block => block.id === 'essay-opening')?.x, 48, 'The selected theme supplies its own page margin.');
    assert.ok(rendered.artifact.blocks['essay-opening'].text.includes('placeholder'));
    const original = await readFile(resolve(f.root, created.entry), 'utf8');
    await assert.rejects(createFromTemplate(f.root, 'editorial-essay', { projectId: 'test-project', id: created.id, title: 'Replacement', theme: 'neutral' }), /already exists/);
    assert.equal(await readFile(resolve(f.root, created.entry), 'utf8'), original);
    for (const input of [{ title: 'No', theme: 'missing' }, { title: 'No', theme: 'neutral', unknown: true }, { title: 'No', theme: 'neutral', id: '../escape' }]) await assert.rejects(createFromTemplate(f.root, 'editorial-essay', input));
    await assert.rejects(createFromTemplate(f.root, '../escape', { projectId: 'test-project', title: 'No', theme: 'neutral' }), /Invalid template/);
    const second = await createFromTemplate(f.root, 'editorial-essay', { projectId: 'test-project', title: 'Neutral geometry', theme: 'neutral' });
    const plain = await renderOnce(f.root, second.id);
    assert.equal(plain.artifact.pages[0].width, rendered.artifact.pages[0].width);
    assert.equal(plain.artifact.pages[0].fragments.find(block => block.id === 'essay-opening')?.x, 105);
  } finally { await f.cleanup(); }
});

test('editorial layout flows through sparse and long specimens without layout warnings', async () => {
  const f = await layoutFixture();
  try {
    for (const length of ['sparse', 'long']) {
      const entry = resolve(f.root, `templates/editorial-essay/${length}.tsx`);
      await writeFile(entry, `import { Specimen } from './preview'; export { meta } from './preview'; export default function Proof() { return <Specimen length="${length}"/>; }`);
      const result = await renderEntry(f.root, entry, length);
      assert.deepEqual(result.artifact.issues, []);
      const layout = JSON.parse(await readFile(resolve(result.directory, 'layout.json'), 'utf8'));
      assert.ok(layout.pages.every((page: { elements: { nodeType: string }[] }) => page.elements.some(node => node.nodeType === 'FixedFooter')), 'Page numbers repeat from the first page onward');
      if (length === 'sparse') assert.equal(result.artifact.pages.length, 1);
      else {
        assert.ok(result.artifact.pages.length >= 4);
        assert.ok(result.artifact.blocks['specimen-paragraph-28'].text.includes('placeholder'));
        assert.ok(result.artifact.blocks['specimen-reference'].text.includes('no source'));
      }
    }
  } finally { await f.cleanup(); }
});


test('preview invalidation follows template imports and preserves unrelated cached PDFs', async () => {
  const f = await layoutFixture(); const catalog = new TemplateCatalog(f.root);
  try {
    const first = await catalog.preview('editorial-essay');
    const neighbor = await catalog.preview('monthly-report');
    const before = await catalog.list();
    const path = resolve(f.root, 'templates/editorial-essay/preview.tsx');
    const original = await readFile(path, 'utf8');
    await writeFile(path, original.replace('export const meta', '// A source change\nexport const meta'));
    await catalog.noteChange(path);
    const next = await catalog.list();
    assert.notEqual(next.find(item => item.id === 'editorial-essay')!.revision, before.find(item => item.id === 'editorial-essay')!.revision);
    assert.equal(next.find(item => item.id === 'monthly-report')!.revision, before.find(item => item.id === 'monthly-report')!.revision);
    assert.strictEqual((await catalog.preview('monthly-report')).artifact, neighbor.artifact);
    assert.equal((await catalog.pdf('monthly-report', neighbor.artifact!.hash)).subarray(0, 4).toString(), '%PDF');
    assert.notStrictEqual((await catalog.preview('editorial-essay')).artifact, first.artifact);
    await catalog.noteChange(resolve(f.root, 'src/app/main.tsx'));
    assert.strictEqual((await catalog.preview('monthly-report')).artifact, neighbor.artifact);
    await catalog.noteChange(resolve(f.root, 'themes/neutral/index.ts'));
    assert.notStrictEqual((await catalog.preview('monthly-report')).artifact, neighbor.artifact);
  } finally { await catalog.close(); await f.cleanup(); }
});
