import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderOnce } from '../src/server/render';
import { Workspace } from '../src/server/workspace';
import { addComment, readComments, changeComment } from '../src/server/comments';
import { fixture, source, settled, projectRoot } from './helpers';

test('PDF retains exact text, citation order, source locations, and IDs across page fragments', async () => {
  const f = await fixture();
  try {
    const long = 'A long paragraph remains readable across page boundaries. '.repeat(160);
    await writeFile(f.entry, source('', `<Paragraph id="long">${long}</Paragraph><DataTable id="table" columns={[{label:'Item'},{label:'Value'}]} rows={Array.from({length:75},(_,i)=>['Row '+i,'value '+i])}/>`));
    const result = await renderOnce(f.root, 'proof');
    assert.ok(result.artifact.pages.length >= 4);
    assert.ok(result.artifact.pages.filter(p => p.fragments.some(b => b.id === 'long')).length > 1);
    assert.ok(result.artifact.pages.filter(p => p.fragments.some(b => b.id === 'table')).length > 1);
    assert.equal(result.artifact.blocks.target.source?.file, 'documents/proof/index.tsx');
    assert.match(result.artifact.blocks.target.text, /\[1\] Then \[2\] Again \[1\]/);
    assert.match(result.artifact.blocks['reference-one'].text, /\[1\].*First source/);
    assert.match((await readFile(resolve(result.directory, 'document.pdf'))).toString('latin1'), /\/BaseFont \/OpenDocSans/, 'The report must embed the registered Sans font');
    const loading = getDocument({ data: new Uint8Array(await readFile(resolve(result.directory, 'document.pdf'))), standardFontDataUrl: resolve(projectRoot, 'node_modules/pdfjs-dist/standard_fonts') + '/' });
    const pdf = await loading.promise;
    const pageTexts: string[] = [];
    const links: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      pageTexts.push((await page.getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' '));
      links.push(...(await page.getAnnotations()).map(a => a.url));
    }
    const text = pageTexts.join(' ');
    for (const phrase of ['first draft', 'office efficiency', 'figures, confidence, and finished drafts', 'Row 74', 'Second source']) assert.ok(text.includes(phrase), `PDF lost text: ${phrase}`);
    for (let i = 0; i < result.artifact.pages.length; i++) {
      if (result.artifact.pages[i].fragments.some(b => b.id === 'table')) assert.match(pageTexts[i], /Item.*Value/, 'Missing repeated table header');
      for (const block of result.artifact.pages[i].fragments) {
        assert.ok(block.x >= 0 && block.y >= 0 && block.width > 0 && block.height > 0);
        assert.ok(block.x + block.width <= result.artifact.pages[i].width + 0.1);
        assert.ok(block.y + block.height <= result.artifact.pages[i].height + 0.1);
      }
    }
    assert.ok(links.includes('https://example.com/one'));
    assert.ok(links.includes('https://example.com/two'));
    await loading.destroy();
  } finally { await f.cleanup(); }
});

test('comments survive reflow, reorder, removal, and resolve/reopen', async () => {
  const f = await fixture();
  try {
    const first = await renderOnce(f.root, 'proof');
    const rows = await addComment(f.root, 'proof', { blockId: 'target', text: 'Clarify this paragraph.', quote: first.artifact.blocks.target.text });
    await writeFile(f.entry, source(`<Paragraph id="inserted">${'Added prose for pagination. '.repeat(600)}</Paragraph>`));
    const second = await renderOnce(f.root, 'proof');
    assert.ok(second.artifact.pages.findIndex(p => p.fragments.some(b => b.id === 'target')) > first.artifact.pages.findIndex(p => p.fragments.some(b => b.id === 'target')));
    assert.equal((await readComments(f.root, 'proof'))[0].blockId, 'target');
    await writeFile(f.entry, source('', '<Paragraph id="inserted">Reordered section.</Paragraph>'));
    assert.ok((await renderOnce(f.root, 'proof')).artifact.blocks.target);
    await writeFile(f.entry, source().replace(/<Paragraph id="target">.*?<\/Paragraph>/, ''));
    const third = await renderOnce(f.root, 'proof');
    assert.equal(third.artifact.blocks.target, undefined);
    assert.equal((await readComments(f.root, 'proof')).length, 1);
    await changeComment(f.root, 'proof', rows[0].id, 'resolved', 1);
    await changeComment(f.root, 'proof', rows[0].id, 'open', 2);
    assert.deepEqual((await readComments(f.root, 'proof'))[0].history.map(h => h.action), ['created', 'resolved', 'reopened']);
  } finally { await f.cleanup(); }
});

test('source errors are useful and the worker times out without taking down the caller', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, source('<Paragraph id="target">Duplicate</Paragraph>'));
    await assert.rejects(renderOnce(f.root, 'proof'), /Duplicate block id: target/);
    await writeFile(f.entry, source('<Paragraph id="missing"><Cite source="missing"/></Paragraph>'));
    await assert.rejects(renderOnce(f.root, 'proof'), /Unknown citation source: missing/);
    await writeFile(f.entry, 'export default <>broken syntax');
    await assert.rejects(renderOnce(f.root, 'proof'), /Build error/);
    await writeFile(f.entry, source().replace("export default function Proof(){", "export default function Proof(){while(true){};"));
    await assert.rejects(renderOnce(f.root, 'proof', 900), /timed out/);
    await writeFile(f.entry, source());
    assert.ok((await renderOnce(f.root, 'proof')).artifact.pages.length);
  } finally { await f.cleanup(); }
});

test('workspace retains successful preview on failure and publishes only the newest render', async () => {
  const f = await fixture(); const w = new Workspace(f.root);
  try {
    await w.refresh(); await settled(w);
    const initial = w.states.get('proof')!.artifact!;
    await writeFile(f.entry, 'export default =');
    await w.refresh(); await settled(w);
    assert.equal(w.states.get('proof')!.status, 'error');
    assert.equal(w.states.get('proof')!.artifact!.hash, initial.hash);
    await writeFile(f.entry, source().replace('Proof document', 'Older revision'));
    await w.refresh();
    await writeFile(f.entry, source().replace('Proof document', 'Newest revision'));
    await w.refresh(); await settled(w);
    assert.equal(w.states.get('proof')!.artifact!.meta.title, 'Newest revision');
    await w.setContext({ documentId: 'proof', blockId: 'target', page: 1 });
    const context = JSON.parse(await readFile(resolve(f.root, '.opendoc/current.json'), 'utf8'));
    assert.equal(context.source.file, 'documents/proof/index.tsx');
    await rm(resolve(f.root, 'documents/proof'), { recursive: true });
    await w.refresh();
    assert.equal(w.states.size, 0);
  } finally { await w.close(); await f.cleanup(); }
});
