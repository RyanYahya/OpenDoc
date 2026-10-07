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
  return `import {Document,Pages,Heading,Paragraph,Block,View,PageBreak,Callout,Strong} from '../../src/document';
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

const sentence = 'A concise statement of the decision, the supporting evidence, and the next step.';
const forme = `import * as F from '@formepdf/react';`;
const withoutFurniture = (source: string) => source.replace('<Pages title="Layout proof">', '<Pages title="Layout proof" header={false} footer={false}>');
/** Every text line with its block, whether it is running furniture, and how far it extends past its own text box. */
function textLines(layout: LayoutInfo) {
  const lines: { node: ElementInfo; blockId?: string; fixed: boolean; beyond: number }[] = [];
  const visit = (node: ElementInfo, parent?: ElementInfo, inherited?: string, fixed = false) => {
    const blockId = node.sourceLocation?.file.startsWith('opendoc:block:') ? node.sourceLocation.file.slice(14) : inherited;
    fixed ||= node.nodeType === 'FixedHeader' || node.nodeType === 'FixedFooter';
    if (node.nodeType === 'TextLine' && parent) lines.push({ node, blockId, fixed, beyond: Math.max(parent.x - node.x, node.x + node.width - (parent.x + parent.width)) });
    node.children.forEach(child => visit(child, node, blockId, fixed));
  };
  layout.pages.forEach(page => page.elements.forEach(node => visit(node)));
  return lines;
}
async function renderLayout(root: string) {
  const rendered = await renderOnce(root, 'proof');
  const layout: LayoutInfo = JSON.parse(await readFile(resolve(rendered.directory, 'layout.json'), 'utf8'));
  return { ...rendered, layout, lines: textLines(layout) };
}

test('text slightly wider than its box wraps instead of running past it, in the body and in running furniture', async () => {
  const f = await fixture();
  try {
    // Running furniture does not inherit the document's font, so it has its own natural width.
    await writeFile(f.entry, withoutFurniture(document(`<F.Fixed position="footer"><F.Text>${sentence}</F.Text></F.Fixed><Paragraph id="measure">${sentence}</Paragraph>`, forme)));
    const natural = await renderLayout(f.root);
    assert.equal(natural.lines.length, 2);
    const body = natural.lines.find(line => !line.fixed)!.node.width, furniture = natural.lines.find(line => line.fixed)!.node.width;
    // The smaller deficits are within the shrink that Forme's optimal breaker assumes but does not draw.
    const deficits = [2, 8, 14];
    const paragraph = `Set out the proposed change in plain language. Explain what would be recorded, who would review an exception, and how the result would inform the next action. <Strong>Replace every placeholder before circulation.</Strong>`;
    await writeFile(f.entry, withoutFurniture(document(
      `<F.Fixed position="footer"><F.View style={{width:${furniture - 8}}}><F.Text>${sentence}</F.Text></F.View></F.Fixed>`
      + deficits.map(deficit => `<View style={{width:${body - deficit}}}><Paragraph id="short-${deficit}">${sentence}</Paragraph></View>`).join('')
      + `<View style={{width:${body - 8}}}><Paragraph id="widows" style={{minWidowLines:0,minOrphanLines:0}}>${sentence}</Paragraph><F.Text>${sentence}</F.Text></View>`
      + [300, 330, 360, 390, 420].map(width => `<View style={{width:${width}}}><Paragraph id="flow-${width}">${paragraph}</Paragraph></View>`).join(''), forme)));
    const wrapped = await renderLayout(f.root);
    const beyond = wrapped.lines.filter(line => line.beyond > 0.75).map(line => `${line.blockId ?? (line.fixed ? 'furniture' : 'text')}: ${line.node.textContent} (+${line.beyond.toFixed(2)} pt)`);
    assert.deepEqual(beyond, []);
    for (const id of [...deficits.map(deficit => `short-${deficit}`), 'widows']) assert.equal(wrapped.lines.filter(line => line.blockId === id).length, 2, id);
    assert.equal(wrapped.lines.filter(line => line.fixed).length, 2);
    assert.equal(wrapped.artifact.issues?.some(issue => issue.code === 'line-overflow'), false);
  } finally { await f.cleanup(); }
});

test('a line drawn beyond its text box is reported with its block and geometry; page number placeholders are not', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document(`<Paragraph id="measure">${sentence}</Paragraph>`));
    const natural = (await renderLayout(f.root)).lines.find(line => line.blockId === 'measure')!.node.width;
    // An explicit choice of the optimal breaker still wins, and still draws this line at its full width.
    await writeFile(f.entry, document(`<View style={{width:${natural - 8}}}><Paragraph id="optimal" style={{lineBreaking:'optimal'}}>${sentence}</Paragraph></View><Paragraph id="ordinary">${sentence}</Paragraph>`));
    const { artifact, layout, lines } = await renderLayout(f.root);
    const reported = artifact.issues!.filter(issue => issue.code === 'line-overflow');
    assert.equal(reported.length, 1, 'only the optimal paragraph overruns');
    const [issue] = reported;
    assert.equal(issue.severity, 'warning');
    assert.equal(issue.blockId, 'optimal');
    assert.equal(issue.page, 1);
    assert.equal(issue.source?.file, 'documents/proof/index.tsx');
    assert.match(issue.message, /extends 8\.0 pt beyond its [\d.]+ pt text box on page 1/);
    assert.ok(issue.bounds && issue.parentBounds && issue.bounds.x + issue.bounds.width > issue.parentBounds.x + issue.parentBounds.width + 7);
    // Model an overrun on the leading edge, as centred and right-aligned lines have, and a wide page number.
    const ordinary = lines.find(line => line.blockId === 'ordinary')!.node, number = lines.find(line => line.fixed && /[\u0002\u0003]/.test(line.node.textContent!))!.node;
    ordinary.x -= 5;
    number.width += 40;
    number.x -= 40;
    const issues = inspectLayout(layout, artifact.blocks).issues.filter(issue => issue.code === 'line-overflow');
    assert.deepEqual(issues.map(issue => issue.blockId), ['optimal', 'ordinary']);
    assert.match(issues[1].message, /extends 5\.0 pt beyond/);
  } finally { await f.cleanup(); }
});

test('invalid provenance fails clearly instead of giving Codex a misleading data path', async () => {
  const f = await fixture();
  try {
    await writeFile(f.entry, document('<Paragraph id="body">A small report.</Paragraph>', 'export const provenance={dataFile:"../outside.json"};'));
    await assert.rejects(renderOnce(f.root, 'proof'), /provenance.dataFile must be a workspace-relative file path/);
  } finally { await f.cleanup(); }
});
