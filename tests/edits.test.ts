import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, symlink, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TextEditService } from '../src/server/edits';
import { createTextSourceResolver } from '../src/server/text-source';
import { resolveJsonTextSource } from './text-source-helpers';
import { Conflict } from '../src/server/comments';
import type { DocumentState } from '../src/shared/types';
import type { TextSourceValue } from '../src/shared/selection';
import { fixture } from './helpers';

function state(value: TextSourceValue, revision = 1): DocumentState {
  return { id: 'proof', status: 'ready', revision, artifact: {
    hash: `render-${revision}`, renderedAt: '', blocks: { text: { id: 'text', kind: 'paragraph', text: value.value } },
    meta: { title: 'Proof', description: '', theme: 'neutral' }, pages: [],
    provenance: { entry: 'documents/proof/index.tsx', ...(value.kind === 'json-string' ? { dataFile: value.file } : {}) },
    textTargets: [{ id: 'text:children', blockId: 'text', slot: 'children', text: value.value, runs: [{ start: 0, end: value.value.length, source: value }], lines: [] }],
  } };
}
function input(current: DocumentState, replacement = 'Revised', start = 0, end = current.artifact!.textTargets![0].text.length) {
  return { targetId: 'text:children', start, end, replacement, revision: current.revision, hash: current.artifact!.hash };
}
function sourceState(source: string, revision = 1) {
  const offset = source.indexOf('<Paragraph');
  const before = source.slice(0, offset);
  return state(createTextSourceResolver('documents/proof/index.tsx', source).resolveAt(before.split('\n').length, before.length - before.lastIndexOf('\n'))!, revision);
}
function document(children: string, declarations = '') {
  return `import {Document,Pages,Paragraph,Heading,TextSlot} from '../../src/document';
export const meta={title:'Correction proof',description:'',theme:'neutral'};
${declarations}
export default () => <Document title="Proof"><Pages title="Proof">${children}</Pages></Document>;`;
}

test('corrections change one exact value, preserve surrounding source, and Undo restores it', async () => {
  const f = await fixture();
  try {
    const original = document('<Paragraph id="text">{title}</Paragraph><Heading id="heading">{title}</Heading>', `// Preserve this comment\nconst title='One café 🎉 today';`);
    await writeFile(f.entry, original);
    const current = sourceState(original);
    const service = new TextEditService(f.root);
    const result = await service.apply('proof', input(current, 'tomorrow', 'One café 🎉 '.length), current);
    assert.equal(result.before, 'today'); assert.equal(result.after, 'tomorrow');
    const updated = await readFile(f.entry, 'utf8');
    assert.ok(updated.includes('One café 🎉 tomorrow'));
    assert.ok(updated.endsWith('<Paragraph id="text">{title}</Paragraph><Heading id="heading">{title}</Heading></Pages></Document>;'));
    assert.deepEqual(service.changedFiles('proof'), ['documents/proof/index.tsx']);
    assert.equal((await service.summary('proof'))?.canUndo, true);
    assert.equal((await service.undo('proof', result.id)).canUndo, false);
    assert.equal(await readFile(f.entry, 'utf8'), original);
    assert.equal((await service.summary('proof'))?.canUndo, false);
  } finally { await f.cleanup(); }
});

test('concurrent corrections serialize, stale targets conflict, and stale Undo never undoes a newer edit', async () => {
  const f = await fixture();
  try {
    const original = document('<Paragraph id="text">First draft</Paragraph>');
    await writeFile(f.entry, original);
    const current = sourceState(original);
    const service = new TextEditService(f.root);
    const results = await Promise.allSettled([service.apply('proof', input(current, 'Second draft'), current), service.apply('proof', input(current, 'Third draft'), current)]);
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    const first = results[0].status === 'fulfilled' ? results[0].value : assert.fail();
    const secondState = sourceState(await readFile(f.entry, 'utf8'), 2);
    const second = await service.apply('proof', input(secondState, 'Newest draft'), secondState);
    await assert.rejects(service.undo('proof', first.id), Conflict);
    assert.ok((await readFile(f.entry, 'utf8')).includes('Newest draft'));
    await service.undo('proof', second.id);
    assert.ok((await readFile(f.entry, 'utf8')).includes('Second draft'));
  } finally { await f.cleanup(); }
});

test('external source changes invalidate Apply and Undo without overwriting work', async () => {
  const f = await fixture();
  try {
    const original = document('<Paragraph id="text">First draft</Paragraph>');
    await writeFile(f.entry, original);
    const current = sourceState(original);
    const service = new TextEditService(f.root);
    await assert.rejects(service.apply('proof', { ...input(current), revision: 0 }, current), Conflict);
    const correction = await service.apply('proof', input(current), current);
    const external = (await readFile(f.entry, 'utf8')) + '\n// A later agent change\n';
    await writeFile(f.entry, external);
    assert.equal((await service.summary('proof'))?.canUndo, false);
    await assert.rejects(service.undo('proof', correction.id), Conflict);
    await assert.rejects(service.apply('proof', input(current, 'Another correction'), current), Conflict);
    assert.equal(await readFile(f.entry, 'utf8'), external);
  } finally { await f.cleanup(); }
});

test('shared source, symlink escapes, mixed fields and protected content cannot be edited', async () => {
  const f = await fixture();
  try {
    const original = document('<Paragraph id="text">First draft</Paragraph>');
    await writeFile(f.entry, original);
    await mkdir(resolve(f.root, 'templates/shared'), { recursive: true });
    const shared = resolve(f.root, 'templates/shared/index.tsx');
    await writeFile(shared, original);
    const service = new TextEditService(f.root);
    const current = sourceState(original);
    const source = current.artifact!.textTargets![0].runs[0].source!;
    source.file = 'templates/shared/index.tsx';
    await assert.rejects(service.apply('proof', input(current), current), /outside/);
    await symlink(shared, resolve(f.root, 'documents/proof/escaped.tsx'));
    source.file = 'documents/proof/escaped.tsx';
    await assert.rejects(service.apply('proof', input(current), current), /outside/);
    source.file = 'documents/proof/index.tsx';
    current.artifact!.textTargets![0].runs[0].protected = true;
    await assert.rejects(service.apply('proof', input(current), current), /separate values or generated/);
    current.artifact!.textTargets![0].runs = [{ start: 0, end: 5, source }, { start: 5, end: source.value.length }];
    await assert.rejects(service.apply('proof', input(current), current), /separate values or generated/);
    assert.equal(await readFile(shared, 'utf8'), original);
    assert.equal(await readFile(f.entry, 'utf8'), original);
  } finally { await f.cleanup(); }
});

test('JSON edits run the bound parser before saving, preserve other values, and detect revisions changing during validation', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, `import {Document,Pages,Paragraph,TextSlot} from '../../src/document'; import {bindTemplate} from '../../src/template'; import data from './data.json';
export const provenance={dataFile:'documents/proof/data.json'};
const bound=bindTemplate({parse(input:any){if(!input.title.trim())throw new Error('Title is required.');return input},meta(input:any){return {title:input.title,description:'',theme:'neutral'}},render(input:any){return <Document title="Proof"><Pages title="Proof"><Paragraph id="text"><TextSlot slot="title" field={['title']}>{input.title}</TextSlot></Paragraph></Pages></Document>}},data); export const meta=bound.meta; export default bound.Document;`);
    const path = resolve(f.root, 'documents/proof/data.json');
    const original = '{\n  "title": "Current title",\n  "keep": 42\n}\n';
    await writeFile(path, original);
    const current = state(resolveJsonTextSource('documents/proof/data.json', original, ['title'])!);
    const service = new TextEditService(f.root);
    await assert.rejects(service.apply('proof', input(current, ''), current), /Title is required/);
    assert.equal(await readFile(path, 'utf8'), original);
    const pending = service.apply('proof', input(current, 'New title'), current);
    const timer = setTimeout(() => { current.revision++; }, 30);
    await assert.rejects(pending, Conflict);
    clearTimeout(timer);
    assert.equal(await readFile(path, 'utf8'), original);
    current.revision = 1;
    const result = await service.apply('proof', input(current, 'New title'), current);
    assert.equal(await readFile(path, 'utf8'), original.replace('Current title', 'New title'));
    await service.undo('proof', result.id);
    assert.equal(await readFile(path, 'utf8'), original);
  } finally { await f.cleanup(); }
});

test('a single correction must render successfully before its source is saved', async () => {
  const f = await fixture();
  const service = new TextEditService(f.root);
  try {
    const original = document('<Paragraph id="text">First draft</Paragraph>').replace('Paragraph,Heading', 'Paragraph as NativeParagraph,Heading')
      + `\nfunction Paragraph({children}: {children:string}) { if(children === 'Rejected') throw new Error('This wording cannot render.'); return <NativeParagraph id="text">{children}</NativeParagraph>; }`;
    await writeFile(f.entry, original);
    const current = sourceState(original);
    await assert.rejects(service.apply('proof', input(current, 'Rejected'), current), /This wording cannot render/);
    assert.equal(await readFile(f.entry, 'utf8'), original);
    assert.equal(await service.summary('proof'), undefined);
    await assert.rejects(service.apply('proof', 'invalid' as any, current), /Save between/);
  } finally { await service.close(); await f.cleanup(); }
});
