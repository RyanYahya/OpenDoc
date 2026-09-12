import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TextEditService } from '../src/server/edits';
import { renderOnce } from '../src/server/render';
import { Conflict } from '../src/server/comments';
import type { DocumentState } from '../src/shared/types';
import type { TextEditBatchInput, TextEditChange } from '../src/shared/selection';
import { fixture } from './helpers';

async function batchFixture() {
  const f = await fixture();
  const dataFile = resolve(f.root, 'documents/proof/data.json');
  await writeFile(dataFile, '{\n  "title": "Original title",\n  "unchanged": 42\n}\n');
  await writeFile(f.entry, `import {Document,Pages,Heading,Paragraph,TextSlot} from '../../src/document';
import {validateTemplateInput} from '../../src/template'; import input from './data.json';
const data = validateTemplateInput((value:any) => { if(!value.title.trim()) throw new Error('Title is required.'); return value; }, input);
const shared = 'Shared copy';
export const meta = {title:'Batch proof',description:'',theme:'neutral'};
export const provenance = {dataFile:'documents/proof/data.json'};
export default function Proof(){ return <Document title="Batch proof"><Pages title="Batch proof">
<Heading id="title"><TextSlot slot="title" field={['title']}>{data.title}</TextSlot></Heading>
<Paragraph id="target">An original paragraph for revision.</Paragraph>
<Paragraph id="linked-one">{shared}</Paragraph><Paragraph id="linked-two">{shared}</Paragraph>
<Paragraph id="later">Untouched later value.</Paragraph>
</Pages></Document>;}`);
  const result = await renderOnce(f.root, 'proof');
  const state: DocumentState = { id: 'proof', revision: 1, status: 'ready', artifact: result.artifact };
  const service = new TextEditService(f.root);
  return { ...f, dataFile, state, service, cleanup: async () => { await service.close(); await f.cleanup(); } };
}
function edit(state: DocumentState, blockId: string, replacement: string): TextEditChange {
  const target = state.artifact!.textTargets!.find(target => target.blockId === blockId)!;
  assert.ok(target, `Missing target ${blockId}`);
  return { targetId: target.id, start: 0, end: target.text.length, replacement };
}
function batch(state: DocumentState, edits: TextEditChange[]): TextEditBatchInput { return { revision: state.revision, hash: state.artifact!.hash, edits }; }

test('draft PDFs reflow with TSX and JSON edits while source and canonical state stay untouched', { timeout: 30_000 }, async () => {
  const f = await batchFixture();
  try {
    const original = await readFile(f.entry, 'utf8'), originalData = await readFile(f.dataFile, 'utf8');
    const stateBefore = structuredClone(f.state);
    const pending = batch(f.state, [edit(f.state, 'title', 'A revised title'), edit(f.state, 'target', 'A longer corrected paragraph. '.repeat(250)), edit(f.state, 'linked-one', 'Linked revised copy')]);
    const draft = await f.service.preview('proof', pending, f.state);
    assert.equal(await readFile(f.entry, 'utf8'), original);
    assert.equal(await readFile(f.dataFile, 'utf8'), originalData);
    assert.deepEqual(f.state, stateBefore);
    assert.equal(await f.service.summary('proof'), undefined);
    assert.ok(draft.artifact.pages.length > f.state.artifact!.pages.length);
    assert.match(draft.artifact.blocks.title.text, /A revised title/);
    assert.match(draft.artifact.blocks['linked-two'].text, /Linked revised copy/);
    for (const blockId of ['title', 'target', 'linked-one', 'linked-two', 'later']) {
      const before = f.state.artifact!.textTargets!.find(target => target.blockId === blockId)!.runs[0].source!;
      const after = draft.artifact.textTargets!.find(target => target.blockId === blockId)!.runs[0].source!;
      assert.ok(after, `${blockId} remains editable in a draft`);
      assert.equal(after.bindingId, before.bindingId, `${blockId} retains its original source identity`);
    }
    const key = draft.pdfUrl.split('/').at(-2)!;
    assert.match((await f.service.previewPDF('proof', key)).subarray(0, 8).toString(), /^%PDF/);
    await assert.rejects(f.service.previewPDF('another', key), Conflict);
  } finally { await f.cleanup(); }
});

test('one Save and Undo include all source files, preserve linked occurrences and surrounding data', { timeout: 30_000 }, async () => {
  const f = await batchFixture();
  try {
    const original = await readFile(f.entry, 'utf8'), originalData = await readFile(f.dataFile, 'utf8');
    const saved = await f.service.apply('proof', batch(f.state, [edit(f.state, 'title', 'New data title'), edit(f.state, 'target', 'New paragraph'), edit(f.state, 'linked-one', 'Shared revision'), edit(f.state, 'linked-two', 'Shared revision')]), f.state);
    assert.equal(saved.count, 3, 'Two linked rendered occurrences write one source token.');
    assert.equal(saved.canUndo, true);
    assert.equal(f.service.changedFiles('proof').length, 2);
    assert.equal(await readFile(f.dataFile, 'utf8'), originalData.replace('Original title', 'New data title'));
    const rendered = await renderOnce(f.root, 'proof');
    assert.match(rendered.artifact.blocks.target.text, /New paragraph/);
    assert.match(rendered.artifact.blocks['linked-two'].text, /Shared revision/);
    await f.service.undo('proof', saved.id);
    assert.equal(await readFile(f.entry, 'utf8'), original);
    assert.equal(await readFile(f.dataFile, 'utf8'), originalData);
  } finally { await f.cleanup(); }
});

test('the combined candidate validates before any file is saved; overlapping linked edits reject', { timeout: 30_000 }, async () => {
  const f = await batchFixture();
  try {
    const original = await readFile(f.entry, 'utf8'), originalData = await readFile(f.dataFile, 'utf8');
    await assert.rejects(f.service.apply('proof', batch(f.state, [edit(f.state, 'target', 'Must not persist'), edit(f.state, 'title', '')]), f.state), /Title is required/);
    await assert.rejects(f.service.apply('proof', batch(f.state, [edit(f.state, 'linked-one', 'First replacement'), edit(f.state, 'linked-two', 'Conflicting replacement')]), f.state), /overlap/);
    assert.equal(await readFile(f.entry, 'utf8'), original);
    assert.equal(await readFile(f.dataFile, 'utf8'), originalData);
  } finally { await f.cleanup(); }
});

test('disjoint ranges in one source value merge against original offsets', { timeout: 30_000 }, async () => {
  const f = await batchFixture();
  try {
    const target = f.state.artifact!.textTargets!.find(target => target.blockId === 'target')!;
    const first = target.text.indexOf('original'), second = target.text.indexOf('revision');
    const saved = await f.service.apply('proof', batch(f.state, [
      { targetId: target.id, start: first, end: first + 'original'.length, replacement: 'much longer corrected' },
      { targetId: target.id, start: second, end: second + 'revision'.length, replacement: 'publication' },
    ]), f.state);
    assert.equal(saved.count, 1);
    assert.match((await renderOnce(f.root, 'proof')).artifact.blocks.target.text, /An much longer corrected paragraph for publication\./);
  } finally { await f.cleanup(); }
});

test('stale renders and source changes during preview are rejected without losing authored work', { timeout: 30_000 }, async () => {
  const f = await batchFixture();
  try {
    const original = await readFile(f.entry, 'utf8');
    const pending = batch(f.state, [edit(f.state, 'target', 'Unsaved copy')]);
    const preview = f.service.preview('proof', pending, f.state);
    const timer = setTimeout(() => { f.state.revision++; }, 50);
    await assert.rejects(preview, Conflict); clearTimeout(timer);
    assert.equal(await readFile(f.entry, 'utf8'), original);
    f.state.revision = 1;
    const next = f.service.apply('proof', pending, f.state);
    const external = original + '\n// Independent authored change\n';
    const write = new Promise<void>((accept, reject) => setTimeout(() => { writeFile(f.entry, external).then(accept, reject); }, 50));
    await assert.rejects(next, Conflict); await write;
    assert.equal(await readFile(f.entry, 'utf8'), external);
  } finally { await f.cleanup(); }
});

test('a concurrent batch or external change in either file cannot overwrite a saved group', { timeout: 30_000 }, async () => {
  const f = await batchFixture();
  try {
    const pending = batch(f.state, [edit(f.state, 'title', 'Saved title'), edit(f.state, 'target', 'Saved paragraph')]);
    const results = await Promise.allSettled([f.service.apply('proof', pending, f.state), f.service.apply('proof', pending, f.state)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
    const saved = results[0].status === 'fulfilled' ? results[0].value : assert.fail();
    const entry = await readFile(f.entry, 'utf8');
    const external = (await readFile(f.dataFile, 'utf8')).replace('42', '43');
    await writeFile(f.dataFile, external);
    assert.equal((await f.service.summary('proof'))?.canUndo, false);
    await assert.rejects(f.service.undo('proof', saved.id), Conflict);
    assert.equal(await readFile(f.entry, 'utf8'), entry);
    assert.equal(await readFile(f.dataFile, 'utf8'), external);
  } finally { await f.cleanup(); }
});

test('a failed multi-file save restores every safe file while preserving intervening external work', { timeout: 30_000 }, async () => {
  const f = await batchFixture();
  const originalRename = fs.renameSync;
  try {
    const extraFile = resolve(f.root, 'documents/proof/extra.tsx');
    const extraSource = `import {Paragraph} from '../../src/document'; export function Extra(){return <Paragraph id="extra">Third source value.</Paragraph>;}`;
    await writeFile(extraFile, extraSource);
    await writeFile(f.entry, `import {Extra} from './extra';\n` + (await readFile(f.entry, 'utf8')).replace('</Pages>', '<Extra/></Pages>'));
    f.state.artifact = (await renderOnce(f.root, 'proof')).artifact;
    const original = await readFile(f.entry, 'utf8');
    const external = (await readFile(f.dataFile, 'utf8')).replace('42', '43');
    const actualExtra = await realpath(extraFile);
    let fail = true;
    fs.renameSync = (from, to) => {
      if (fail && String(to) === actualExtra) {
        fail = false;
        fs.writeFileSync(f.dataFile, external);
        throw new Error('Simulated failure replacing the third source file.');
      }
      originalRename(from, to);
    };
    syncBuiltinESMExports();
    await assert.rejects(f.service.apply('proof', batch(f.state, [edit(f.state, 'target', 'First saved value'), edit(f.state, 'title', 'Second saved value'), edit(f.state, 'extra', 'Third saved value')]), f.state), Conflict);
    assert.equal(await readFile(f.entry, 'utf8'), original, 'A later rollback conflict must not skip an earlier safe restoration.');
    assert.equal(await readFile(f.dataFile, 'utf8'), external, 'External work is preserved.');
    assert.equal(await readFile(extraFile, 'utf8'), extraSource);
    assert.equal(await f.service.summary('proof'), undefined);
  } finally {
    fs.renameSync = originalRename; syncBuiltinESMExports();
    await f.cleanup();
  }
});
