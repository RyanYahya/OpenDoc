import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createFromTemplate } from '../src/server/templates';
import { renderOnce } from '../src/server/render';
import { Workspace } from '../src/server/workspace';
import { assertInstanceTitle, fixture, source, settled, until, projectRoot } from './helpers';

async function monthlyFixture() {
  const f = await fixture();
  await cp(resolve(projectRoot, 'templates/monthly-report'), resolve(f.root, 'templates/monthly-report'), { recursive: true });
  await createFromTemplate(f.root, 'monthly-report', { projectId: 'test-project', id: 'monthly-operations', title: 'Monthly operations' });
  return { ...f, dataFile: resolve(f.root, 'documents/monthly-operations/data.json') };
}

async function pdfText(file: string) {
  const loading = getDocument({ data: new Uint8Array(await readFile(file)), standardFontDataUrl: resolve(projectRoot, 'node_modules/pdfjs-dist/standard_fonts') + '/' });
  try {
    const pdf = await loading.promise;
    const pages: string[] = [];
    for (let page = 1; page <= pdf.numPages; page++) {
      pages.push((await (await pdf.getPage(page)).getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' '));
    }
    return pages;
  } finally { await loading.destroy(); }
}

test('one monthly template renders sparse, typical, and long data into complete PDFs', async () => {
  const f = await monthlyFixture();
  try {
    const counts: Record<string, number> = {};
    for (const example of ['sparse', 'typical', 'long']) {
      const json = await readFile(resolve(f.root, `templates/monthly-report/examples/${example}.json`), 'utf8');
      await writeFile(f.dataFile, json);
      const data = JSON.parse(json);
      const result = await renderOnce(f.root, 'monthly-operations');
      counts[example] = result.artifact.pages.length;
      const pages = await pdfText(resolve(result.directory, 'document.pdf'));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      assert.ok(text.includes(data.title));
      assert.match(text, /synthetic/);
      assert.ok(text.includes(data.sourceNote), 'The report must retain its evidence boundary');
      for (const key of ['highlights', 'notes']) for (const item of data[key] ?? []) {
        assert.ok(text.includes(item.title), `${example} lost ${key} title ${item.id}`);
        assert.ok(result.artifact.blocks[`${key === 'highlights' ? 'highlight' : 'note'}-${item.id.length}-${item.id}-heading`], 'Record IDs must survive in comment targets');
      }
      for (const action of data.actions ?? []) assert.ok(text.includes(action.title), `${example} lost action ${action.id}`);
      for (const [group, prefix] of [['highlights', 'highlight'], ['risks', 'risk'], ['notes', 'note']]) {
        const first = data[group]?.[0];
        if (!first) continue;
        const page = result.artifact.pages.find(page => page.fragments.some(fragment => fragment.id === `${group}-heading`));
        assert.ok(page, `${example} exposes the ${group} heading`);
        for (const part of ['heading', 'lead']) assert.ok(page.fragments.some(fragment => fragment.id === `${prefix}-${first.id.length}-${first.id}-${part}`), `${example} keeps ${group} with its first record's ${part}`);
        assert.equal(result.artifact.blocks[`${group}-lead`], undefined, 'Section introductions use actual record text instead of boilerplate.');
      }
      for (const page of result.artifact.pages) for (const fragment of page.fragments) {
        assert.ok(fragment.x >= -0.1 && fragment.y >= -0.1);
        assert.ok(fragment.x + fragment.width <= page.width + 0.1, `${example} overflowed horizontally`);
        assert.ok(fragment.y + fragment.height <= page.height + 0.1, `${example} overflowed vertically`);
      }
      for (let index = 0; index < result.artifact.pages.length; index++) {
        if (result.artifact.pages[index].fragments.some(fragment => fragment.id === 'actions-table')) assert.match(pages[index], /Commitment.*Owner.*Due.*Status/);
      }
      if (example === 'sparse') {
        assert.equal(result.artifact.blocks['risks-heading'], undefined);
        assert.equal(result.artifact.blocks['notes-heading'], undefined);
      }
    }
    assert.ok(counts.sparse < counts.typical);
    assert.ok(counts.long > counts.typical + 2);
  } finally { await f.cleanup(); }
});

test('data-only changes refresh their instance, retain the last preview on bad data, and expose provenance', async () => {
  const f = await monthlyFixture(); const w = new Workspace(f.root);
  try {
    await w.refresh(); await settled(w);
    const initial = w.states.get('monthly-operations')!;
    assert.equal(initial.status, 'ready', initial.error);
    assertInstanceTitle(initial.artifact!, 'monthly-operations', 'Monthly operations', 'data.json');
    const starterFile = resolve(f.root, 'templates/monthly-report/data.json');
    const starter = await readFile(starterFile, 'utf8');
    const initialHash = initial.artifact!.hash;
    const unrelatedRevision = w.states.get('proof')!.revision;
    const data = JSON.parse(await readFile(f.dataFile, 'utf8'));
    data.title = 'A revised monthly review';
    await writeFile(f.dataFile, JSON.stringify(data));
    assert.deepEqual(w.noteChange(f.dataFile), ['monthly-operations']);
    assert.equal(w.states.get('monthly-operations')!.status, 'rendering');
    assert.equal(w.states.get('proof')!.status, 'ready');
    await w.flushChanges(); await settled(w);
    const latest = w.states.get('monthly-operations')!;
    assert.equal(latest.status, 'ready', latest.error);
    assert.equal(latest.artifact!.meta.title, data.title);
    assert.equal(await readFile(starterFile, 'utf8'), starter, 'Editing an instance preserves the shared starter data');
    assert.notEqual(latest.artifact!.hash, initialHash);
    assert.equal(w.states.get('proof')!.revision, unrelatedRevision);
    await w.setContext({ documentId: 'monthly-operations', blockId: 'report-title-title', page: 1 });
    const context = JSON.parse(await readFile(resolve(f.root, '.opendoc/current.json'), 'utf8'));
    assert.equal(context.provenance.entry, 'documents/monthly-operations/index.tsx');
    assert.equal(context.provenance.template, 'templates/monthly-report/index.tsx');
    assert.equal(context.provenance.dataFile, 'documents/monthly-operations/data.json');
    const latestHash = latest.artifact!.hash;
    await writeFile(f.dataFile, '{');
    w.noteChange(f.dataFile); await w.flushChanges(); await settled(w);
    assert.equal(w.states.get('monthly-operations')!.status, 'error');
    assert.equal(w.states.get('monthly-operations')!.artifact!.hash, latestHash);
    await writeFile(f.dataFile, JSON.stringify({ ...data, metrics: [{ id: 'bad', label: 'Broken', value: null }] }));
    w.noteChange(f.dataFile); await w.flushChanges(); await settled(w);
    assert.match(w.states.get('monthly-operations')!.error!, /report\.metrics\[0\]\.value: expected a finite number/);
    await writeFile(f.dataFile, JSON.stringify(data));
    w.noteChange(f.dataFile); await w.flushChanges(); await settled(w);
    assert.equal(w.states.get('monthly-operations')!.status, 'ready');
  } finally { await w.close(); await f.cleanup(); }
});

test('scoped changes follow cross-document imports and preserve unrelated ready documents', async () => {
  const f = await fixture(); const w = new Workspace(f.root);
  try {
    await writeFile(resolve(f.root, 'documents/proof/content.ts'), "export const message = 'Original shared content';");
    await writeFile(f.entry, "import { message } from './content';\n" + source('<Paragraph id="shared">{message}</Paragraph>'));
    for (const id of ['consumer', 'unrelated']) {
      await mkdir(resolve(f.root, 'documents', id), { recursive: true });
      await writeFile(resolve(f.root, 'documents', id, 'index.tsx'), id === 'consumer'
        ? "import { message } from '../proof/content';\n" + source('<Paragraph id="shared">{message}</Paragraph>')
        : source());
    }
    await w.refresh(); await settled(w);
    const unchanged = w.states.get('unrelated')!.revision;
    const file = resolve(f.root, 'documents/proof/content.ts');
    await writeFile(file, "export const message = 'Updated shared content';");
    assert.deepEqual(w.noteChange(file).sort(), ['consumer', 'proof']);
    assert.equal(w.states.get('unrelated')!.status, 'ready');
    await w.flushChanges(); await settled(w);
    for (const id of ['consumer', 'proof']) assert.match(w.states.get(id)!.artifact!.blocks.shared.text, /Updated shared content/);
    assert.equal(w.states.get('unrelated')!.revision, unchanged);
    const prose = resolve(f.root, 'planning-notes.txt');
    await writeFile(prose, 'Unrelated workspace notes');
    assert.deepEqual(w.noteChange(prose), []);
    assert.ok(w.list().every(state => state.status === 'ready'));
  } finally { await w.close(); await f.cleanup(); }
});

test('an entry changing its imports stays invalidatable while its new render runs', async () => {
  const f = await fixture(); const w = new Workspace(f.root);
  try {
    await mkdir(resolve(f.root, 'documents/consumer'));
    const shared = resolve(f.root, 'documents/consumer/content.ts');
    await writeFile(shared, "export const message = 'Original shared data';");
    await writeFile(resolve(f.root, 'documents/consumer/index.tsx'), "import { message } from './content';\n" + source('<Paragraph id="shared">{message}</Paragraph>'));
    await w.refresh(); await settled(w);
    const marker = resolve(f.root, '.opendoc/started');
    const edited = "import { message } from '../consumer/content';\nimport { writeFileSync } from 'node:fs';\n" + source('<Paragraph id="shared">{message}</Paragraph>').replace('function Proof(){', `function Proof(){writeFileSync(${JSON.stringify(marker)},'started');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,450);`);
    await writeFile(f.entry, edited);
    w.noteChange(f.entry); await w.flushChanges();
    await until(async () => { try { await readFile(marker); return true; } catch { return false; } });
    await writeFile(shared, "export const message = 'Newest shared data';");
    assert.ok(w.noteChange(shared).includes('proof'), 'An old dependency graph must not exclude an entry being recompiled');
    await w.flushChanges(); await settled(w);
    assert.match(w.states.get('proof')!.artifact!.blocks.shared.text, /Newest shared data/);
  } finally { await w.close(); await f.cleanup(); }
});

test('a newer edit arriving during old-output cleanup never exposes an obsolete ready preview', async () => {
  const f = await fixture(); const w = new Workspace(f.root);
  try {
    await w.refresh(); await settled(w);
    await writeFile(f.entry, source().replace('Proof document', 'Second revision'));
    w.invalidate('proof'); await settled(w);
    const staleReady: string[] = [];
    let invalidated = false;
    w.on('change', () => {
      const state = w.states.get('proof')!;
      if (invalidated && state.status === 'ready' && state.artifact?.meta.title === 'Third revision') staleReady.push(state.artifact.hash);
    });
    const set = w.outputs.set.bind(w.outputs);
    w.outputs.set = (id, value) => {
      const result = set(id, value);
      if (value[0]?.artifact.meta.title === 'Third revision') queueMicrotask(() => {
        writeFileSync(f.entry, source().replace('Proof document', 'Newest revision'));
        invalidated = true;
        w.noteChange(f.entry);
      });
      return result;
    };
    await writeFile(f.entry, source().replace('Proof document', 'Third revision'));
    w.invalidate('proof');
    await until(() => w.states.get('proof')?.status === 'ready' && w.states.get('proof')?.artifact?.meta.title === 'Newest revision');
    assert.equal(invalidated, true);
    assert.deepEqual(staleReady, [], 'Export must remain disabled after a newer source edit');
  } finally { await w.close(); await f.cleanup(); }
});

test('long summaries flow and record IDs remain unique and stable after reordering', async () => {
  const f = await monthlyFixture();
  try {
    const data = JSON.parse(await readFile(f.dataFile, 'utf8'));
    data.summary = 'A short opening stays with the heading. ' + 'The rest of a data-driven narrative must remain free to flow across pages. '.repeat(65) + 'The final sentence remains present.';
    data.highlights = [
      { id: 'foo', title: 'First stable record', body: 'A short lead. This remains the same record when it moves.' },
      { id: 'foo-heading', title: 'Second stable record', body: 'Another short lead. A suffix in an ID must not collide with generated headings.' },
    ];
    data.risks = [
      { id: 'foo', title: 'A first concern', level: 'low', owner: 'Example owner', mitigation: 'A clear response.' },
      { id: 'foo-owner', title: 'A second concern', level: 'low', owner: 'Another owner', mitigation: 'A clear response.' },
    ];
    await writeFile(f.dataFile, JSON.stringify(data));
    const first = await renderOnce(f.root, 'monthly-operations');
    const text = (await pdfText(resolve(first.directory, 'document.pdf'))).join(' ').replace(/\s+/g, ' ');
    assert.match(text, /The final sentence remains present/);
    assert.ok(first.artifact.pages.filter(page => page.fragments.some(fragment => fragment.id === 'summary-body')).length > 1);
    const ids = Object.keys(first.artifact.blocks).filter(id => /^(highlight|risk)-/.test(id)).sort();
    data.highlights.reverse(); data.risks.reverse();
    await writeFile(f.dataFile, JSON.stringify(data));
    const reordered = await renderOnce(f.root, 'monthly-operations');
    assert.deepEqual(Object.keys(reordered.artifact.blocks).filter(id => /^(highlight|risk)-/.test(id)).sort(), ids);
  } finally { await f.cleanup(); }
});

test('theme edits invalidate their documents without disturbing an unrelated theme', async () => {
  const f = await fixture(); const workspace = new Workspace(f.root);
  try {
    await workspace.refresh(); await settled(workspace);
    const revision = workspace.states.get('proof')!.revision;
    assert.deepEqual(workspace.noteChange(resolve(f.root, 'themes/civic-spectrum/index.ts')), []);
    assert.equal(workspace.states.get('proof')!.revision, revision);
    assert.deepEqual(workspace.noteChange(resolve(f.root, 'themes/neutral/index.ts')), ['proof']);
    assert.equal(workspace.states.get('proof')!.status, 'rendering', 'The affected document cannot export its old preview.');
    await workspace.flushChanges(); await settled(workspace);
    assert.equal(workspace.states.get('proof')!.status, 'ready');
  } finally { await workspace.close(); await f.cleanup(); }
});
