import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderOnce } from '../src/server/render';
import { TextEditService } from '../src/server/edits';
import { canCorrectComponent } from '../src/app/componentCorrection';
import { generatedTextReason } from '../src/shared/selection';
import { anchorForSelection, resolveCommentAnchor } from '../src/shared/anchors';
import { fixture } from './helpers';
import { attachTextLines } from '../src/server/text-layout';
import type { LayoutInfo } from '@formepdf/core';
import type { TextTarget } from '../src/shared/selection';

function document(content: string, declarations = '') {
  return `import {Document,Pages,Heading,Paragraph,TitleBlock,Section,Figure,Strong,Em,Cite,References,CrossReference,Note,Notes,Prose,TextSlot,Block,Callout,CodeBlock,DataTable} from '../../src/document';
import * as F from '@formepdf/react';
export const meta={title:'Target proof',description:'Synthetic selection fixture',theme:'neutral'};
${declarations}
export default function Proof(){return <Document title={meta.title} references={{one:{title:'Fixture source'}}}><F.Page size={{width:360,height:420}} margin={40}>${content}</F.Page></Document>}`;
}

test('text targets resolve literal leaves, local values and builtin named props without changing inline structure', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document(`<TitleBlock id="intro" title={title} subtitle="A subtitle"/>
      <Heading id="linked">{title}</Heading>
      <Paragraph id="mixed">Before <Strong>bold words</Strong> and <Em>italic words</Em> <Cite source="one"/> after <CrossReference target="linked"/>.</Paragraph>
      <Section id="section" title="Named section" lead="Named lead."/>
      <Figure id="figure" caption="Original caption" sourceNote="Illustrative source"><F.View style={{height:10}}/></Figure>
      <Callout id="callout" title="Callout title">First <Strong>emphasis</Strong> second.</Callout>
      <CodeBlock id="code">{'const sample = 1;'}</CodeBlock>
      <References/>`, `const title='Shared title';`));
    const artifact = (await renderOnce(f.root, 'proof')).artifact;
    const targets = artifact.textTargets!;
    const target = (blockId: string) => targets.find(value => value.blockId === blockId)!;
    assert.equal(target('intro-title').runs[0].source?.value, 'Shared title');
    assert.equal(target('intro-title').runs[0].source?.start, target('linked').runs[0].source?.start);
    assert.ok((target('linked').runs[0].source?.linkedOccurrences ?? 0) >= 2);
    assert.equal(target('intro-subtitle').runs[0].source?.value, 'A subtitle');
    assert.equal(target('section-heading').runs[0].source?.value, 'Named section');
    assert.equal(target('section-lead').runs[0].source?.value, 'Named lead.');
    assert.equal(target('code').runs[0].source?.value, 'const sample = 1;');
    assert.equal(target('callout').runs[0].source?.value, 'Callout title');
    const callout = targets.find(value => value.blockId === 'callout' && value.text.startsWith('First'))!;
    assert.deepEqual(callout.runs.filter(run => run.source).map(run => run.source!.value), ['First ', 'emphasis', ' second.']);
    const mixed = target('mixed');
    assert.equal(mixed.text, 'Before bold words and italic words [1] after Shared title.');
    assert.deepEqual(mixed.runs.filter(run => run.source).map(run => run.source!.value), ['Before ', 'bold words', ' and ', 'italic words', ' ', ' after ', '.']);
    assert.deepEqual(mixed.runs.filter(run => run.protected).map(run => mixed.text.slice(run.start, run.end)), ['[1]', 'Shared title']);
    const caption = targets.find(value => value.blockId === 'figure' && value.slot === 'caption')!;
    assert.equal(caption.text, 'Figure 1. Original caption');
    assert.equal(caption.runs[0].protected, true);
    assert.equal(caption.runs.at(-1)!.source?.value, 'Original caption');
    assert.ok(targets.every(value => value.lines.length > 0), 'Every rendered text target retains line geometry');
    for (const value of targets) for (const run of value.runs) if (run.source) assert.equal(value.text.slice(run.start, run.end), run.source.value);
  } finally { await f.cleanup(); }
});

test('flowing logical text and offsets survive page breaks and prose indents', async () => {
  const f = await fixture();
  try {
    const body = 'Repeated prose with Unicode café and useful punctuation. '.repeat(80);
    await writeFile(f.entry, document(`<Prose><Paragraph id="start">An opening.</Paragraph><Paragraph id="flow">${body}</Paragraph></Prose>`));
    const artifact = (await renderOnce(f.root, 'proof')).artifact;
    const flow = artifact.textTargets!.find(target => target.blockId === 'flow')!;
    assert.equal(flow.text, `\u2003${body}`);
    assert.equal(flow.runs.find(run => run.source)?.source?.value, body);
    assert.ok(new Set(flow.lines.map(line => line.page)).size >= 3);
    assert.ok(flow.lines.every((line, index) => index === 0 || line.start >= flow.lines[index - 1].end), 'Continued pages never reset logical offsets');
    assert.equal(flow.lines.at(-1)!.end, flow.text.trimEnd().length);
    assert.ok(flow.lines.every(line => flow.text.slice(line.start, line.end).replace(/\s/g, '') === line.text.replace(/\s/g, '')));
  } finally { await f.cleanup(); }
});

test('unbound computations stay readable, including a transformation that happens to preserve the value', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document(`<Paragraph id="computed">{already.toUpperCase()}</Paragraph>
      <Wrapper>Same text</Wrapper>
      <Paragraph id="literal">Same text</Paragraph>
      <Shell title="Same"><Inner title={Other()}/></Shell>`, `function Shell({title,children}){return children} function Inner({title}){return <Paragraph id="inner"><TextSlot slot="title" from="title">{title}</TextSlot></Paragraph>} function Other(){return 'Same'} const already='ALREADY'; function Wrapper({children}){return <Paragraph id="custom">{children.toUpperCase().toLowerCase().replace('same','Same')}</Paragraph>}`));
    const targets = (await renderOnce(f.root, 'proof')).artifact.textTargets!;
    for (const id of ['computed', 'custom', 'inner']) {
      const target = targets.find(value => value.blockId === id)!;
      assert.ok(target.text && target.lines.length);
      assert.ok(target.runs.every(run => !run.source));
    }
    assert.equal(targets.find(value => value.blockId === 'literal')!.runs[0].source?.value, 'Same text');
  } finally { await f.cleanup(); }
});

test('line alignment never resumes at repeated words after an unknown rendered line', () => {
  const target: TextTarget = { id: 'body:children', blockId: 'body', slot: 'children', text: 'same words middle same words', runs: [], lines: [] };
  const line = (textContent: string, y: number) => ({ nodeType: 'TextLine', textContent, x: 0, y, width: 100, height: 12, children: [] });
  const layout = { pages: [{ elements: [{ nodeType: 'Text', sourceLocation: { file: 'opendoc:block:body', line: 1, column: 1 }, children: [line('unexpected glyphs', 0), line('same words', 12)] }] }] } as unknown as LayoutInfo;
  attachTextLines(layout, [target]);
  assert.deepEqual(target.lines, []);
});

test('positional and colliding text identities cannot become durable phrase anchors', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document('<Block id="plain"><F.Text>Same</F.Text></Block>'));
    const before = (await renderOnce(f.root, 'proof')).artifact.textTargets!;
    assert.equal(before[0].stable, true);
    await writeFile(f.entry, document(`<Block id="plain"><F.Text>Same</F.Text><F.Text>Same</F.Text></Block>
      <Block id="duplicate"><F.Text><TextSlot slot="label">Same</TextSlot></F.Text><F.Text><TextSlot slot="label">Same</TextSlot></F.Text></Block>
      <Block id="named"><F.Text><TextSlot slot="first">Same</TextSlot></F.Text><F.Text><TextSlot slot="second">Same</TextSlot></F.Text></Block>
      <DataTable id="table" rowIds={['stable-row']} columns={[{label:'A'},{label:'B'}]} rows={[["Same", <TextSlot slot="stable-row-description">Same</TextSlot>]]}/>`));
    const after = (await renderOnce(f.root, 'proof')).artifact.textTargets!;
    assert.ok(after.filter(target => target.blockId === 'plain').every(target => target.stable === false));
    assert.ok(after.filter(target => target.blockId === 'duplicate').every(target => target.stable === false));
    assert.ok(after.filter(target => target.blockId === 'named').every(target => target.stable === true));
    assert.equal(after.find(target => target.slot === 'row-stable-row-column-0')?.stable, true, 'A row ID gives a plain cell a durable identity');
    assert.equal(after.find(target => target.slot === 'stable-row-description')?.stable, true);
    assert.equal(new Set(after.map(target => target.id)).size, after.length);
  } finally { await f.cleanup(); }
});

test('text passed through local helper components is editable per instance and saves to its own call site', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document(`<Item id="alpha" heading={['history-title', 'History']} title="Alpha role" when="2020 to 2022">
        <Points id="alpha-points" items={['First point.', 'Second point.']}/>
      </Item>
      <Item id="beta" title="Beta role" when="2020 to 2022"/>
      <Points id="same" items={['Same point.', 'Same point.']}/>
      <Paragraph id="computed">{shout('generated')}</Paragraph>`, `function Title({ id, children }: { id: string; children: string }) { return <F.View><Heading id={id} level={2}>{children}</Heading></F.View>; }
function Item({ id, title, when, heading, children }: { id: string; title: string; when?: string; heading?: [string, string]; children?: any }) {
  return <Block id={id}>{heading && <Title id={heading[0]}>{heading[1]}</Title>}<Paragraph id={\`\${id}-title\`}>{title}</Paragraph>{when && <Paragraph id={\`\${id}-when\`}>{when}</Paragraph>}{children}</Block>;
}
function Points({ id, items }: { id: string; items: string[] }) {
  const row = (text: string, i: number) => <Paragraph key={i} id={\`\${id}-\${i + 1}\`}>{text}</Paragraph>;
  return <F.View>{items.length > 0 && row(items[0], 0)}{items.slice(1).map((text, i) => row(text, i + 1))}</F.View>;
}
function shout(text: string) { return text.toUpperCase(); }`));
    const artifact = (await renderOnce(f.root, 'proof')).artifact;
    const target = (blockId: string) => artifact.textTargets!.find(value => value.blockId === blockId)!;
    for (const id of ['history-title', 'alpha-title', 'alpha-when', 'alpha-points-1', 'alpha-points-2', 'beta-title', 'beta-when']) assert.ok(canCorrectComponent(target(id)), id);
    assert.notEqual(target('alpha-when').runs[0].source!.start, target('beta-when').runs[0].source!.start);
    for (const id of ['same-1', 'same-2', 'computed']) {
      assert.equal(canCorrectComponent(target(id)), false, id);
      assert.equal(target(id).reason, generatedTextReason);
    }
    const beta = target('beta-when');
    const state = { id: 'proof', status: 'ready' as const, revision: 1, artifact };
    const edit = { targetId: beta.id, start: 0, end: beta.text.length, replacement: '2021 to 2023', revision: 1, hash: artifact.hash };
    const service = new TextEditService(f.root);
    const preview = await service.preview('proof', { edits: [edit], revision: 1, hash: artifact.hash }, state);
    const previewed = preview.artifact.textTargets!.find(value => value.blockId === 'beta-when')!;
    assert.equal(previewed.text, '2021 to 2023');
    assert.equal(previewed.runs[0].source?.bindingId, beta.runs[0].source?.bindingId, 'A draft keeps the authored identity of the edited prop.');
    const before = await readFile(f.entry, 'utf8');
    await service.apply('proof', edit, state);
    const after = await readFile(f.entry, 'utf8');
    assert.equal(after, before.replace('<Item id="beta" title="Beta role" when="2020 to 2022"/>', '<Item id="beta" title="Beta role" when="2021 to 2023"/>'));
    const saved = (await renderOnce(f.root, 'proof')).artifact.textTargets!;
    assert.equal(saved.find(value => value.blockId === 'alpha-when')!.text, '2020 to 2022');
    assert.ok(canCorrectComponent(saved.find(value => value.blockId === 'beta-when')));
  } finally { await f.cleanup(); }
});

test('list items are editable at their own records, while markers are never text targets', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document(`<List id="plain" items={[{ id: 'one', children: 'First item' }, { id: 'two', children: 'First item' }]}/>
      <List id="steps" ordered start={3} items={[{ id: 'mixed', children: <>Mixed <Strong>bold</Strong> ending</> }, { id: 'plain', children: 'Ordered item' }]}/>
      <List id="mapped" items={rows.map(row => ({ id: row.id, children: row.text }))}/>
      <List id="code" items={[{ id: 'computed', children: shout('loud') }]}/>`,
    `import { List } from '../../src/document';
const rows = [{ id: 'alpha', text: 'Mapped alpha' }, { id: 'twice-a', text: 'Twice' }, { id: 'twice-b', text: 'Twice' }];
function shout(text: string) { return text.toUpperCase(); }`));
    const artifact = (await renderOnce(f.root, 'proof')).artifact;
    const targets = artifact.textTargets!;
    const target = (blockId: string) => targets.find(value => value.blockId === blockId)!;
    const items = ['plain-one', 'plain-two', 'steps-mixed', 'steps-plain', 'mapped-alpha', 'mapped-twice-a', 'mapped-twice-b', 'code-computed'];
    for (const id of items) {
      const own = targets.filter(value => value.blockId === id);
      assert.deepEqual(own.map(value => [value.slot, value.stable]), [['children', true]], `${id}: one stable text target, without its marker`);
    }
    assert.ok(targets.every(value => !/^(•|\d+\.)$/.test(value.text.trim())), 'Bullets and generated numbers are not text targets');
    assert.ok(targets.every(value => !value.text.startsWith('•') && !/^\d+\./.test(value.text)), 'Markers are not part of item text');
    for (const id of ['plain-one', 'plain-two', 'steps-plain', 'mapped-alpha']) assert.ok(canCorrectComponent(target(id)), id);
    assert.notEqual(target('plain-one').runs[0].source!.start, target('plain-two').runs[0].source!.start, 'Equal literal wording keeps each record separate');
    const mixed = target('steps-mixed');
    assert.equal(mixed.text, 'Mixed bold ending');
    assert.deepEqual(mixed.runs.map(run => run.source?.value), ['Mixed ', 'bold', ' ending']);
    for (const id of ['mapped-twice-a', 'mapped-twice-b', 'code-computed']) {
      assert.equal(canCorrectComponent(target(id)), false, id);
      assert.match(target(id).reason!, /list item's text is produced by the document's code/, id);
    }
    assert.ok(artifact.pages.some(page => page.fragments.some(fragment => fragment.id === 'steps-plain')), 'The item remains a selectable component');

    const state = { id: 'proof', status: 'ready' as const, revision: 1, artifact };
    const service = new TextEditService(f.root);
    const before = await readFile(f.entry, 'utf8');
    const second = target('plain-two');
    await service.apply('proof', { targetId: second.id, start: 0, end: second.text.length, replacement: 'Second item', revision: 1, hash: artifact.hash }, state);
    const afterLiteral = await readFile(f.entry, 'utf8');
    assert.equal(afterLiteral, before.replace(`{ id: 'two', children: 'First item' }`, `{ id: 'two', children: "Second item" }`));
    const saved = (await renderOnce(f.root, 'proof')).artifact;
    const alpha = saved.textTargets!.find(value => value.blockId === 'mapped-alpha')!;
    await service.apply('proof', { targetId: alpha.id, start: 0, end: alpha.text.length, replacement: 'Revised alpha', revision: 2, hash: saved.hash }, { ...state, revision: 2, artifact: saved });
    assert.equal(await readFile(f.entry, 'utf8'), afterLiteral.replace(`text: 'Mapped alpha'`, `text: "Revised alpha"`));
    const final = (await renderOnce(f.root, 'proof')).artifact.textTargets!;
    assert.deepEqual(['plain-one', 'plain-two', 'mapped-alpha'].map(id => final.find(value => value.blockId === id)!.text), ['First item', 'Second item', 'Revised alpha']);
  } finally { await f.cleanup(); }
});

test('DataTable column headings save to their own column records, and unbound headings say why', async () => {
  const f = await fixture();
  try {
    await writeFile(resolve(f.root, 'themes/shared-table.tsx'), `import { DataTable } from '../src/document';
export function SharedTable() { return <DataTable id="shared" columns={[{ label: 'Shared heading' }]} rows={[['Cell']]}/>; }`);
    await writeFile(f.entry, document(`<DataTable id="plain" columns={[{ label: 'Item', width: 2 }, { label: 'Value' }]} rows={[['First', 1]]}/>
      <DataTable id="keyed" columns={[{ id: 'low', label: 'Bound' }, { id: 'high', label: 'Bound' }]} rows={[['a', 'b']]}/>
      <DataTable id="same" columns={[{ label: 'Twice' }, { label: 'Twice' }]} rows={[['a', 'b']]}/>
      <DataTable id="computed" columns={[{ label: shout('loud') }]} rows={[['a']]}/>
      <SharedTable/>`, `import { SharedTable } from '../../themes/shared-table';
function shout(text: string) { return text.toUpperCase(); }`));
    const artifact = (await renderOnce(f.root, 'proof')).artifact;
    const targets = artifact.textTargets!;
    const heading = (blockId: string, slot: string) => targets.find(value => value.blockId === blockId && value.slot === slot)!;
    for (const [blockId, slot] of [['plain', 'column-0'], ['plain', 'column-1'], ['keyed', 'column-low'], ['keyed', 'column-high']]) {
      assert.ok(canCorrectComponent(heading(blockId, slot)), `${blockId} ${slot}`);
      assert.ok(heading(blockId, slot).lines.length, `${blockId} ${slot} keeps its PDF geometry`);
    }
    assert.equal(heading('plain', 'column-0').stable, false, 'A heading without a column ID has a positional identity');
    assert.equal(heading('keyed', 'column-low').stable, true, 'A column ID gives its heading a durable identity');
    assert.notEqual(heading('keyed', 'column-low').runs[0].source!.start, heading('keyed', 'column-high').runs[0].source!.start, 'Equal wording stays separate by column ID');
    for (const [blockId, slot] of [['same', 'column-0'], ['same', 'column-1'], ['computed', 'column-0']]) {
      assert.equal(canCorrectComponent(heading(blockId, slot)), false, `${blockId} ${slot}`);
      assert.match(heading(blockId, slot).reason!, /column heading is produced by the document's code, or repeats another column's wording/);
    }
    assert.match(heading('shared', 'column-0').reason!, /placed by themes\/shared-table\.tsx/, 'An imported heading names the file that holds it');

    const service = new TextEditService(f.root);
    const before = await readFile(f.entry, 'utf8');
    const value = heading('plain', 'column-1');
    await service.apply('proof', { targetId: value.id, start: 0, end: value.text.length, replacement: 'Amount', revision: 1, hash: artifact.hash }, { id: 'proof', status: 'ready', revision: 1, artifact });
    const saved = await readFile(f.entry, 'utf8');
    assert.equal(saved, before.replace(`{ label: 'Value' }`, `{ label: "Amount" }`));
    const next = (await renderOnce(f.root, 'proof')).artifact;
    const high = next.textTargets!.find(target => target.blockId === 'keyed' && target.slot === 'column-high')!;
    await service.apply('proof', { targetId: high.id, start: 0, end: high.text.length, replacement: 'Raised', revision: 2, hash: next.hash }, { id: 'proof', status: 'ready', revision: 2, artifact: next });
    assert.equal(await readFile(f.entry, 'utf8'), saved.replace(`{ id: 'high', label: 'Bound' }`, `{ id: 'high', label: "Raised" }`));
  } finally { await f.cleanup(); }
});

test('plain DataTable cells save to their own row and column, and cells that cannot say why', async () => {
  const f = await fixture();
  try {
    await writeFile(resolve(f.root, 'themes/shared-table.tsx'), `import { DataTable } from '../src/document';
export function SharedTable() { return <DataTable id="shared" columns={[{ label: 'Heading' }]} rows={[['Shared cell']]}/>; }`);
    const columns = `columns={[{ label: 'Item' }, { label: 'Hours' }]}`;
    await writeFile(f.entry, document(`<DataTable id="keyed" ${columns} rows={[['Same', 4], ['Same', 4]]} rowIds={['first', 'second']}/>
      <DataTable id="unique" ${columns} rows={[['Draft', 'Done'], ['Review', 'Done']]}/>
      <DataTable id="twins" ${columns} rows={[['Twin', 'x'], ['Twin', 'x']]}/>
      <DataTable id="computed" ${columns} rows={[['Total', total], ['Share', \`\${total}%\`]]}/>
      <DataTable id="constant" ${columns} rows={rows} rowIds={['one', 'two']}/>
      <DataTable id="mapped" ${columns} rows={stages.map(stage => [stage.name, stage.hours])} rowIds={stages.map(stage => stage.key)}/>
      <Block id="primitive"><F.View><F.Text>Primitive cell</F.Text></F.View></Block>
      <SharedTable/>`, `import { SharedTable } from '../../themes/shared-table';
const parts = [2, 3];
const total = parts.reduce((sum, part) => sum + part, 0);
const rows = [['Constant', 'One'], ['Other', 'Two']];
const stages = [{ key: 'draft', name: 'Drafting', hours: 3 }, { key: 'review', name: 'Reviewing', hours: 3 }];`));
    // A primitive Forme table cell is ordinary literal text inside a block.
    await writeFile(f.entry, (await readFile(f.entry, 'utf8')).replace('<F.View><F.Text>Primitive cell</F.Text></F.View>', '<F.Table columns={[{ width: { fraction: 1 } }]}><F.Row><F.Cell><F.Text>Primitive cell</F.Text></F.Cell></F.Row></F.Table>'));
    const artifact = (await renderOnce(f.root, 'proof')).artifact;
    const cell = (blockId: string, slot: string) => artifact.textTargets!.find(value => value.blockId === blockId && value.slot === slot)!;
    const editable = [['keyed', 'row-first-column-0'], ['keyed', 'row-second-column-0'], ['keyed', 'row-first-column-1'], ['unique', 'row-0-column-1'], ['unique', 'row-1-column-1'],
      ['constant', 'row-one-column-0'], ['mapped', 'row-review-column-0'], ['primitive', 'children']];
    for (const [blockId, slot] of editable) {
      assert.ok(canCorrectComponent(cell(blockId, slot)), `${blockId} ${slot}`);
      assert.ok(cell(blockId, slot).lines.length, `${blockId} ${slot} keeps its PDF geometry`);
    }
    assert.notEqual(cell('keyed', 'row-first-column-0').runs[0].source!.start, cell('keyed', 'row-second-column-0').runs[0].source!.start, 'Row IDs separate rows with equal wording');
    assert.notEqual(cell('unique', 'row-0-column-1').runs[0].source!.start, cell('unique', 'row-1-column-1').runs[0].source!.start, 'Rows with unique wording separate equal cells');
    assert.equal(cell('keyed', 'row-first-column-1').runs[0].source!.kind, 'number');
    assert.deepEqual([cell('keyed', 'row-first-column-0').stable, cell('unique', 'row-0-column-0').stable], [true, false], 'Only a row ID makes a cell durable');
    for (const [blockId, slot] of [['twins', 'row-0-column-0'], ['twins', 'row-1-column-1']]) assert.match(cell(blockId, slot).reason!, /repeats another row's wording.*rowIds/, `${blockId} ${slot}`);
    for (const [blockId, slot] of [['computed', 'row-0-column-1'], ['computed', 'row-1-column-1'], ['mapped', 'row-draft-column-1']]) {
      assert.equal(canCorrectComponent(cell(blockId, slot)), false, `${blockId} ${slot}`);
      assert.match(cell(blockId, slot).reason!, /table cell is computed by the document's code/, `${blockId} ${slot}`);
    }
    assert.match(cell('shared', 'row-0-column-0').reason!, /placed by themes\/shared-table\.tsx/, 'A cell placed by a shared file names it');

    const service = new TextEditService(f.root);
    let current = artifact, revision = 1, expected = await readFile(f.entry, 'utf8');
    const save = async (blockId: string, slot: string, replacement: string, from: string, to: string) => {
      const value = current.textTargets!.find(target => target.blockId === blockId && target.slot === slot)!;
      await service.apply('proof', { targetId: value.id, start: 0, end: value.text.length, replacement, revision, hash: current.hash }, { id: 'proof', status: 'ready', revision, artifact: current });
      const at = expected.indexOf(from);
      assert.ok(at >= 0 && expected.indexOf(from, at + 1) < 0, from);
      expected = expected.slice(0, at) + to + expected.slice(at + from.length);
      assert.equal(await readFile(f.entry, 'utf8'), expected, `${blockId} ${slot}`);
      current = (await renderOnce(f.root, 'proof')).artifact; revision++;
      assert.equal(current.textTargets!.find(target => target.blockId === blockId && target.slot === slot)!.text, replacement);
    };
    await save('keyed', 'row-second-column-0', 'Changed', `['Same', 4]]`, `["Changed", 4]]`);
    await save('keyed', 'row-first-column-1', '12.5', `['Same', 4], ["Changed"`, `['Same', 12.5], ["Changed"`);
    await save('unique', 'row-1-column-1', 'Pending', `['Review', 'Done']`, `['Review', "Pending"]`);
    await save('constant', 'row-two-column-1', 'Second', `['Other', 'Two']`, `['Other', "Second"]`);
    await save('mapped', 'row-review-column-0', 'Approving', `name: 'Reviewing'`, `name: "Approving"`);
    await save('primitive', 'children', 'Primitive text', `<F.Text>Primitive cell</F.Text>`, `<F.Text>Primitive text</F.Text>`);
    const number = current.textTargets!.find(target => target.blockId === 'keyed' && target.slot === 'row-second-column-1')!;
    await assert.rejects(service.apply('proof', { targetId: number.id, start: 0, end: number.text.length, replacement: '1,250', revision, hash: current.hash }, { id: 'proof', status: 'ready', revision, artifact: current }), /holds a number/);
    assert.equal(await readFile(f.entry, 'utf8'), expected, 'A rejected number leaves the source unchanged');
  } finally { await f.cleanup(); }
});

test('phrase comments anchor in cells of rows with IDs and follow them when rows reorder', async () => {
  const f = await fixture();
  try {
    const table = (rows: string) => document(`<DataTable id="plan" columns={[{ label: 'Task' }, { id: 'note', label: 'Note' }]} rows={${rows}} rowIds={['a', 'b']}/>
      <DataTable id="loose" columns={[{ label: 'Task' }]} rows={[['Write the brief']]}/>`);
    await writeFile(f.entry, table(`[['Draft', 'Write the opening section'], ['Review', 'Check every figure']]`));
    const artifact = (await renderOnce(f.root, 'proof')).artifact;
    const target = (value: typeof artifact, blockId: string, slot: string) => value.textTargets!.find(item => item.blockId === blockId && item.slot === slot)!;
    const note = target(artifact, 'plan', 'row-b-column-note');
    const anchor = anchorForSelection(artifact, { blockId: 'plan', targetId: note.id, start: 6, end: 18, quote: 'every figure', page: 1 });
    assert.equal(anchor?.quote, 'every figure');
    const loose = target(artifact, 'loose', 'row-0-column-0');
    assert.equal(anchorForSelection(artifact, { blockId: 'loose', targetId: loose.id, start: 0, end: 5, quote: 'Write', page: 1 }), undefined, 'A positional cell keeps block-level feedback');

    await writeFile(f.entry, table(`[['Review', 'Check every figure'], ['Draft', 'Write the opening section']]`).replace(`rowIds={['a', 'b']}`, `rowIds={['b', 'a']}`));
    const reordered = (await renderOnce(f.root, 'proof')).artifact;
    const resolved = resolveCommentAnchor(reordered, { blockId: 'plan', anchor, quote: 'every figure' });
    assert.equal(resolved.status, 'attached');
    assert.equal(resolved.selection?.targetId, note.id);
    assert.equal(target(reordered, 'plan', 'row-b-column-note').text.slice(resolved.selection!.start, resolved.selection!.end), 'every figure');
  } finally { await f.cleanup(); }
});
