import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { renderOnce } from '../src/server/render';
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
    assert.equal(after.find(target => target.slot === 'row-stable-row-column-0')?.stable, false);
    assert.equal(after.find(target => target.slot === 'stable-row-description')?.stable, true);
    assert.equal(new Set(after.map(target => target.id)).size, after.length);
  } finally { await f.cleanup(); }
});
