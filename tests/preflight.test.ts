import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ElementInfo, LayoutInfo } from '@formepdf/core';
import { renderOnce } from '../src/server/render';
import { fixture } from './helpers';
import { RenderFailure } from '../src/server/render-error';
import { inspectLayout } from '../src/server/preflight';
import { inspectElements } from '../src/server/layout-inspection';

function document(content: string, extra = '') {
  return `import {Document,Pages,Heading,Paragraph,Block,View,PageBreak,Callout} from '../../src/document';
export const meta={title:'Layout proof',description:'Synthetic layout fixture',kind:'report',theme:'neutral'};
${extra}
export default function Proof(){return <Document title="Layout proof"><Pages title="Layout proof">${content}</Pages></Document>}`;
}

test('preflight produces a navigable outline and identifies an actual stranded heading', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document('<Heading id="title" level={1}>Layout proof</Heading><Paragraph id="intro">The opening stays readable.</Paragraph><View style={{height:490}}/><Heading id="stranded">A stranded heading</Heading><PageBreak/><Paragraph id="next">Its body begins on the following page.</Paragraph>'));
    const { artifact } = await renderOnce(f.root, 'proof');
    assert.deepEqual(artifact.outline?.map(({ id, page }) => ({ id, page })), [{ id: 'title', page: 1 }, { id: 'stranded', page: 1 }]);
    assert.ok(artifact.issues?.some(issue => issue.code === 'stranded-heading' && issue.blockId === 'stranded' && issue.page === 1));
    assert.equal(artifact.provenance?.entry, 'documents/proof/index.tsx');
  } finally { await f.cleanup(); }
});

test('explicit line limits and distinct overlapping text report source and geometry without truncating content', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document('<Paragraph id="chip" maxLines={1} style={{width:85}}>A label that wraps into several lines</Paragraph><Block id="panel" style={{height:100}}><Paragraph id="one" style={{position:"absolute",top:0,left:0}}>Overlapping first label</Paragraph><Paragraph id="two" style={{position:"absolute",top:3,left:0}}>Overlapping second label</Paragraph></Block>'));
    const { artifact } = await renderOnce(f.root, 'proof');
    const wrapped = artifact.issues!.find(issue => issue.code === 'line-limit-exceeded');
    assert.equal(wrapped?.blockId, 'chip');
    assert.equal(wrapped?.source?.file, 'documents/proof/index.tsx');
    assert.ok(wrapped?.bounds && wrapped.bounds.height > 0);
    assert.match(artifact.blocks.chip.text, /several lines/);
    const overlap = artifact.issues!.find(issue => issue.code === 'text-overlap' && issue.blockId === 'one');
    assert.equal(overlap?.blockId, 'one');
    assert.equal(overlap?.relatedBlockId, 'two');
    assert.ok(overlap?.parentBounds);
    await writeFile(f.entry, document('<Paragraph id="chip" maxLines={0}>Invalid contract</Paragraph>'));
    await assert.rejects(renderOnce(f.root, 'proof'), /maxLines must be a positive integer/);
  } finally { await f.cleanup(); }
});

test('callouts can opt into keeping together and oversized groups explain why they cannot fit', async () => {
  const f = await fixture();
  try {
    const content = '<View style={{height:535}}/><Callout id="decision" KEEP><Paragraph id="decision-body">' + 'Keep this decision with its explanation. '.repeat(30) + '</Paragraph></Callout>';
    await writeFile(f.entry, document(content.replace('KEEP', '')));
    const split = await renderOnce(f.root, 'proof');
    assert.ok(split.artifact.issues?.some(issue => issue.code === 'split-callout' && issue.blockId === 'decision'));
    for (const contract of ['keepTogether', 'style={{wrap:false}}']) {
      await writeFile(f.entry, document(content.replace('KEEP', contract)));
      const kept = await renderOnce(f.root, 'proof');
      assert.equal(kept.artifact.pages.filter(page => page.fragments.some(fragment => fragment.id === 'decision')).length, 1, contract);
      assert.equal(kept.artifact.issues?.some(issue => issue.code === 'split-callout'), false);
    }
    await writeFile(f.entry, document('<Block id="oversized" keepTogether style={{height:1000}}><Paragraph id="inside">Too tall for any page.</Paragraph></Block>'));
    try {
      const oversized = await renderOnce(f.root, 'proof');
      assert.ok(oversized.artifact.issues?.some(issue => issue.code === 'unbreakable-too-tall' && issue.blockId === 'oversized'));
    } catch (error) {
      assert.ok(error instanceof RenderFailure);
      assert.ok(error.issues.some(issue => issue.code === 'unbreakable-too-tall' && issue.blockId === 'oversized'));
    }
  } finally { await f.cleanup(); }
});

test('off-page text and clipped content cannot become exportable artifacts', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document('<Paragraph id="off-page" style={{marginLeft:-100}}>This text falls outside the paper.</Paragraph>'));
    await assert.rejects(renderOnce(f.root, 'proof'), /Layout check failed:[\s\S]*off-page/);
    await writeFile(f.entry, document('<Block id="clip" style={{height:12,overflow:"hidden"}}><Paragraph id="clipped-text">This paragraph needs multiple lines. This paragraph needs multiple lines. This paragraph needs multiple lines. This paragraph needs multiple lines.</Paragraph></Block>'));
    await assert.rejects(renderOnce(f.root, 'proof'), /Layout check failed:[\s\S]*clipped/);
  } finally { await f.cleanup(); }
});

test('footer whitespace is reserved and inspection retains parent coordinates and hidden clipping ancestors', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document('<Block id="frame" style={{height:100,overflow:"hidden"}}><Paragraph id="body">A short caption.</Paragraph></Block>').replace('<Pages title="Layout proof">', '<Pages title="Layout proof" footer="Footer">'));
    const rendered = await renderOnce(f.root, 'proof');
    const layout: LayoutInfo = JSON.parse(await readFile(resolve(rendered.directory, 'layout.json'), 'utf8'));
    const flatten = (nodes: ElementInfo[]): ElementInfo[] => nodes.flatMap(node => [node, ...flatten(node.children)]);
    const nodes = flatten(layout.pages[0].elements);
    const frame = nodes.find(node => node.sourceLocation?.file === 'opendoc:block:frame')!;
    const body = nodes.find(node => node.sourceLocation?.file === 'opendoc:block:body' && node.nodeType === 'Text')!;
    const footer = nodes.find(node => node.nodeType === 'FixedFooter')!;
    assert.ok(frame && body && footer);
    const inspected = inspectElements(layout, rendered.artifact.blocks)[0].find(node => node.nodeType === 'TextLine' && node.blockId === 'body')!;
    assert.ok(inspected.clippingAncestors.some(clip => clip.bounds.height === frame.height));
    assert.equal(inspected.parentBounds.x, body.x);
    assert.equal(inspected.localBounds.y, inspected.bounds.y - body.y);
    // Model a caption in unused horizontal space within the footer band.
    frame.style.overflow = 'Visible';
    Object.assign(body.children[0], { x: 280, y: footer.y + 2, width: 30, height: 10 });
    const issues = inspectLayout(layout, rendered.artifact.blocks).issues;
    assert.ok(issues.some(issue => issue.code === 'footer-area-intrusion' && issue.blockId === 'body' && issue.page === 1));
    assert.equal(issues.some(issue => issue.code === 'page-furniture-overlap'), false);
    frame.style.opacity = 0;
    assert.equal(inspectLayout(layout, rendered.artifact.blocks).issues.some(issue => issue.blockId === 'body'), false);
    assert.equal(inspectElements(layout, rendered.artifact.blocks)[0].find(node => node.nodeType === 'TextLine' && node.blockId === 'body')!.hidden, true);
  } finally { await f.cleanup(); }
});

test('deliberate page backgrounds and ordinary flowing prose pass geometry checks', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document(`<Heading id="title" level={1}>A long but ordinary document</Heading><Paragraph id="body">${'A careful layout lets the text flow over page boundaries. '.repeat(220)}</Paragraph>`));
    const { artifact } = await renderOnce(f.root, 'proof');
    assert.ok(artifact.pages.length > 1);
    assert.deepEqual(artifact.issues, []);
  } finally { await f.cleanup(); }
});

test('invalid provenance fails clearly instead of giving Codex a misleading data path', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document('<Paragraph id="body">A small report.</Paragraph>', 'export const provenance={dataFile:"../outside.json"};'));
    await assert.rejects(renderOnce(f.root, 'proof'), /provenance.dataFile must be a workspace-relative file path/);
  } finally { await f.cleanup(); }
});
