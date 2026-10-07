import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import type { ElementInfo } from '@formepdf/core';
import type { FormeNode } from '@formepdf/react';
import { resolve } from 'node:path';
import { readZip } from '@shbernal/ts-pptx/zip';
import { setDiagnosticHandler } from '@shbernal/ts-pptx';
import { fixture, projectRoot, until } from './helpers';
import { renderOnce } from '../src/server/render';
import { presentationBytes, readPresentationBytes, presentationTextRuns, firstStrongCharacter, paragraphDirection, rtlParagraphAlignment, slideObjectNames, type PresentationCapture } from '../src/server/pptx';
import { ExportStore } from '../src/server/exports';
import { exportDocuments, parseExportArgs } from '../src/server/export-batch';
import type { SavedExport } from '../src/shared/export';
import type { DocumentState } from '../src/shared/types';
import { reviewTarget } from '../src/server/review';
import { recordMedia } from '../src/server/media-cli';

async function presentationFixture() {
  const f = await fixture();
  const manifest = JSON.parse(await readFile(resolve(f.root, 'projects.json'), 'utf8'));
  await writeFile(resolve(f.root, 'projects.json'), JSON.stringify({ ...manifest, formats: { proof: 'presentation' } }));
  await writeFile(f.entry, `import {Presentation,Slide,Heading,Paragraph,Block,Image} from '../../src/document';
import {Strong,Em,Link} from '@formepdf/react';
export const meta={title:'Editable proof',description:'Synthetic export test',theme:'neutral'};
export default function Proof(){return <Presentation title={meta.title}>
<Slide id="first"><Heading id="title">Editable proof</Heading><Paragraph id="body">A <Strong>bold</Strong> and <Em>italic</Em> choice. <Link href="https://example.com/evidence">Evidence</Link></Paragraph><Block id="logo"><Image src={${JSON.stringify(resolve(f.root, 'assets/brand/wordmark.png'))}} style={{width:120,height:40}}/></Block></Slide>
<Slide id="last"><Block id="panel" style={{width:300,height:100,borderRadius:12,borderWidth:1,borderColor:'#123456',backgroundColor:'#eef2ff',padding:16}}><Paragraph id="ending">The final slide.</Paragraph></Block><Paragraph id="number">{'{{pageNumber}} / {{totalPages}}'}</Paragraph></Slide></Presentation>}`);
  return f;
}
const xml = (parts: Map<string, Uint8Array>, path: string) => Buffer.from(parts.get(path)!).toString();

test('PowerPoint uses the exact captured preview, native rich text, images, and full EOT font faces', async () => {
  const f = await presentationFixture();
  try {
    const render = await renderOnce(f.root, 'proof');
    const capture: PresentationCapture = JSON.parse(await readFile(resolve(render.directory, 'presentation.json'), 'utf8'));
    await writeFile(f.entry, 'This later source must not be executed by the exporter.');
    const parts = await readZip(await readPresentationBytes(render.directory, render.artifact.hash));
    const first = xml(parts, 'ppt/slides/slide1.xml');
    assert.match(first, /Editable proof/); assert.match(first, /<p:pic>/); assert.match(first, /b="1"/); assert.match(first, /i="1"/);
    assert.match(xml(parts, 'ppt/slides/_rels/slide1.xml.rels'), /https:\/\/example.com\/evidence/);
    assert.match(xml(parts, 'ppt/slides/slide2.xml'), /The final slide/);
    assert.match(xml(parts, 'ppt/slides/slide2.xml'), /2 \/ 2/);
    assert.match(xml(parts, 'ppt/slides/slide2.xml'), /prst="roundRect"/);
    assert.match(xml(parts, 'ppt/slides/slide2.xml'), /name="adj" fmla="val 12000"/);
    assert.equal(render.artifact.issues?.some(issue => issue.format === 'pptx'), false);
    assert.equal([...parts.keys()].filter(path => /^ppt\/slides\/slide\d+.xml$/.test(path)).length, 2);
    const embedded = [...parts].filter(([path]) => path.startsWith('ppt/fonts/'));
    assert.equal(embedded.length, 3);
    for (const [, value] of embedded) {
      const eot = Buffer.from(value), length = eot.readUInt32LE(4);
      assert.equal(eot.readUInt16LE(34), 0x504c);
      assert.equal(eot.readUInt32LE(0), eot.length);
      assert.ok(capture.doc.fonts!.some(font => typeof font.src === 'string' && Buffer.from(font.src, 'base64').equals(eot.subarray(-length))));
    }
    await assert.rejects(readPresentationBytes(render.directory, 'stale'), /preview changed/);
    // Right-to-left paragraphs: reuse this render, with Arabic text in the title's source and line.
    const rtl = structuredClone(capture), arabic = 'عرض Microsoft Office التجريبي';
    const sourceNode = (node: FormeNode, content: string): FormeNode | undefined => 'content' in node.kind && node.kind.content === content ? node : node.children.map(child => sourceNode(child, content)).find(Boolean);
    const layoutNode = (node: ElementInfo, text: string): ElementInfo | undefined => node.children.some(line => line.textContent === text) ? node : node.children.map(child => layoutNode(child, text)).find(Boolean);
    const title = sourceNode(rtl.doc.children[0], 'Editable proof')!, titleBox = layoutNode(rtl.layout.pages[0].elements[0], 'Editable proof')!, titleLine = titleBox.children[0];
    if (title.kind.type !== 'Heading') throw new Error('Expected the title heading.');
    title.kind.content = arabic; titleLine.textContent = arabic;
    sourceNode(rtl.doc.children[1], 'The final slide.')!.style = { ...sourceNode(rtl.doc.children[1], 'The final slide.')!.style, direction: 'rtl' } as never;
    const withDirection = (node: ElementInfo, direction?: string) => { const style = { ...node.style } as Record<string, unknown>; if (direction) style.direction = direction; else delete style.direction; node.style = style as never; };
    // The engine reports each line's resolved direction; the deck follows it so it matches the PDF.
    withDirection(titleLine, 'ltr');
    assert.doesNotMatch(xml(await readZip(await presentationBytes(rtl)), 'ppt/slides/slide1.xml').split('<a:p>').find(paragraph => paragraph.includes('التجريبي'))!, /rtl="1"/, 'A line resolved left to right stays left to right.');
    withDirection(titleLine, 'rtl');
    // Without a resolved line direction (older layouts), the authored style decides.
    const finalBox = layoutNode(rtl.layout.pages[1].elements[0], 'The final slide.')!;
    finalBox.children.filter(child => child.nodeType === 'TextLine').forEach(line => withDirection(line));
    const rtlParts = await readZip(await presentationBytes(rtl)), rtlSlide = xml(rtlParts, 'ppt/slides/slide1.xml');
    const paragraphOf = (slideXml: string, text: string) => slideXml.split('<a:p>').find(paragraph => paragraph.includes(text))!;
    // The PDF line is flush left, so the export keeps that alignment while marking the paragraph RTL.
    assert.match(paragraphOf(rtlSlide, 'التجريبي'), /<a:pPr rtl="1"\s+algn="l"/);
    assert.match(paragraphOf(rtlSlide, 'Microsoft Office'), /<a:rPr lang="ar-SA" altLang="en-US"/);
    assert.match(paragraphOf(rtlSlide, 'التجريبي'), /<a:latin typeface="[^"]+"[^>]*\/><a:cs typeface="[^"]+"\/>/);
    assert.doesNotMatch(paragraphOf(rtlSlide, 'italic'), /rtl="1"|ar-SA/, 'LTR paragraphs keep their existing output');
    // The engine reports the alignment it applied to each line; the deck follows it.
    (titleLine.style as { textAlign: string }).textAlign = 'Right';
    assert.match(paragraphOf(xml(await readZip(await presentationBytes(rtl)), 'ppt/slides/slide1.xml'), 'التجريبي'), /<a:pPr rtl="1"\s+algn="r"/, 'A line aligned right maps to right alignment.');
    // Without a resolved line direction (older layouts), the reviewed geometry decides.
    (titleLine.style as { textAlign: string }).textAlign = 'Left';
    withDirection(titleLine); withDirection(titleBox);
    titleLine.x = titleBox.x + titleBox.width - titleLine.width;
    assert.match(paragraphOf(xml(await readZip(await presentationBytes(rtl)), 'ppt/slides/slide1.xml'), 'التجريبي'), /<a:pPr rtl="1"\s+algn="r"/, 'Flush-right RTL lines map to right alignment.');
    const declared = paragraphOf(xml(rtlParts, 'ppt/slides/slide2.xml'), 'The final slide.');
    assert.match(declared, /<a:pPr rtl="1"/);
    assert.match(declared, /<a:rPr lang="en-US"/, 'A declared direction without RTL letters keeps the English language tag.');
    const unsafe = structuredClone(capture);
    for (const face of unsafe.doc.fonts!) {
      const font = Buffer.from(face.src as string, 'base64');
      for (let i = 0; i < font.readUInt16BE(4); i++) {
        const entry = 12 + i * 16;
        if (font.toString('ascii', entry, entry + 4) === 'OS/2') font.writeUInt16BE(2, font.readUInt32BE(entry + 8) + 8);
      }
      face.src = font.toString('base64');
    }
    await assert.rejects(presentationBytes(unsafe), /does not permit editable font embedding/);
    const unsupported = structuredClone(capture);
    unsupported.layout.pages[0].elements[0].style.opacity = 0.5;
    await assert.rejects(presentationBytes(unsupported), /group opacity/);
    const shadow = structuredClone(capture);
    shadow.doc.children[0].style.transform = [{ type: 'translate', x: 10, y: 0 }];
    await assert.rejects(presentationBytes(shadow), /transforms/);
  } finally { await f.cleanup(); }
});

test('solid slide colors export as native backgrounds while image and media backgrounds stay pictures', async () => {
  const f = await presentationFixture();
  try {
    const media = resolve(f.root, 'documents/proof/media/artwork');
    await mkdir(media, { recursive: true });
    await copyFile(resolve(f.root, 'assets/brand/wordmark.png'), resolve(media, 'image.png'));
    await writeFile(resolve(media, 'meta.json'), JSON.stringify({ title: 'Wordmark', description: 'Synthetic background test, not artwork.', file: 'image.png', kind: 'image', data: 'recipe.json' }));
    await writeFile(resolve(media, 'recipe.json'), '{}');
    await recordMedia(f.root, 'proof', 'artwork');
    await writeFile(f.entry, `import {Presentation,Slide,Paragraph} from '../../src/document';
import {neutral} from '../../themes';
export const meta={title:'Backgrounds',description:'Synthetic background test',theme:'neutral'};
export default function Proof(){return <Presentation title={meta.title} theme={{...neutral,paper:'#ffcc00'}}>
<Slide id="solid"><Paragraph id="a">Solid</Paragraph></Slide>
<Slide id="faded" backgroundOpacity={0.5}><Paragraph id="b">Faded</Paragraph></Slide>
<Slide id="image" backgroundImage="./media/artwork/image.png" backgroundOpacity={0.4}><Paragraph id="c">Image</Paragraph></Slide>
<Slide id="media" backgroundMedia="artwork" backgroundSize="contain"><Paragraph id="d">Media</Paragraph></Slide>
</Presentation>}`);
    const render = await renderOnce(f.root, 'proof');
    assert.deepEqual(render.artifact.slides?.map(slide => slide.background), [{ r: 1, g: 0.8, b: 0, a: 1 }, { r: 1, g: 0.8, b: 0, a: 1 }, undefined, undefined]);
    const parts = await readZip(await readPresentationBytes(render.directory, render.artifact.hash));
    const background = (slide: number) => xml(parts, `ppt/slides/slide${slide}.xml`).match(/<p:bg>.*?<\/p:bg>/s)?.[0];
    const pictures = (slide: number) => [...xml(parts, `ppt/slides/slide${slide}.xml`).matchAll(/<p:pic>.*?<\/p:pic>/gs)].map(match => match[0]);
    const images = (slide: number) => [...xml(parts, `ppt/slides/_rels/slide${slide}.xml.rels`).matchAll(/Target="\.\.\/media\/[^"]+"/g)];
    assert.equal(background(1), '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFCC00"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>');
    assert.match(background(2)!, /<a:solidFill><a:srgbClr val="FFCC00"><a:alpha val="50000"\/><\/a:srgbClr><\/a:solidFill>/, 'backgroundOpacity fades the native fill as it does the PDF layer');
    for (const slide of [1, 2]) {
      assert.deepEqual(pictures(slide), [], `slide ${slide}: no selectable background picture`);
      assert.deepEqual(images(slide), [], `slide ${slide}: no background media part`);
    }
    for (const [slide, name] of [[3, 'image'], [4, 'media']] as const) {
      assert.equal(background(slide), undefined, `slide ${slide}: the picture is not replaced by the paper color`);
      assert.equal(pictures(slide).length, 1);
      assert.match(pictures(slide)[0], new RegExp(`name="${name} background image"`));
      assert.equal(images(slide).length, 1);
    }
    assert.match(pictures(3)[0], /<a:alphaModFix amt="40000"\/>/, 'an image background keeps its opacity');
  } finally { await f.cleanup(); }
});

test('review exports a single captured revision and warns about unsupported PPTX styling before export', async () => {
  const f = await presentationFixture();
  try {
    const first = await reviewTarget(f.root, { kind: 'document', id: 'proof' }, { export: true });
    if (first.status !== 'ready') throw new Error(first.error);
    assert.equal(first.powerpointVisualReview, 'required');
    const saved = await readFile(first.outputs.pptx!);
    const parts = await readZip(saved);
    assert.match(xml(parts, 'ppt/slides/slide2.xml'), /prst="roundRect"/);
    const original = await readFile(f.entry, 'utf8');
    await writeFile(f.entry, original.replace('The final slide.', 'A revised final slide.'));
    const revised = await reviewTarget(f.root, { kind: 'document', id: 'proof' }, { export: true });
    if (revised.status !== 'ready') throw new Error(revised.error);
    assert.deepEqual(revised.changes.changedPages, [2]);
    assert.match(xml(await readZip(await readFile(revised.outputs.pptx!)), 'ppt/slides/slide2.xml'), /A revised final slide/);
    const manifest = await readFile(revised.outputs.review), pdf = await readFile(revised.outputs.pdf), pptx = await readFile(revised.outputs.pptx!);
    await writeFile(f.entry, original.replace('borderRadius:12', 'borderRadius:12,borderLeftWidth:3,boxShadow:"1px 1px 2px #999999"'));
    const render = await renderOnce(f.root, 'proof');
    const issues = render.artifact.issues!.filter(issue => issue.format === 'pptx');
    assert.ok(issues.some(issue => /nonuniform rounded borders/.test(issue.message) && issue.blockId === 'panel' && issue.page === 2 && issue.bounds));
    assert.ok(issues.some(issue => /shadows/.test(issue.message) && issue.source?.file === 'documents/proof/index.tsx'));
    const failed = await reviewTarget(f.root, { kind: 'document', id: 'proof' }, { export: true });
    assert.equal(failed.status, 'error');
    if (failed.status === 'error') assert.ok(failed.issues.some(issue => issue.format === 'pptx'));
    assert.deepEqual(await readFile(revised.outputs.review), manifest);
    assert.deepEqual(await readFile(revised.outputs.pdf), pdf);
    assert.deepEqual(await readFile(revised.outputs.pptx!), pptx);
    await writeFile(f.entry, original.replace(/<Slide id="last">[\s\S]*?<\/Slide>/, ''));
    const shortened = await reviewTarget(f.root, { kind: 'document', id: 'proof' });
    if (shortened.status !== 'ready') throw new Error(shortened.error);
    assert.deepEqual(shortened.changes.removedPages, [2]);
    assert.equal(shortened.outputs.pptx, undefined);
    assert.equal((await readdir(shortened.outputs.directory)).includes('document.pptx'), false, 'PDF-only review must not leave a stale editable deck beside the new PDF.');
  } finally { await f.cleanup(); }
});

test('rounded child clipping warns during PDF review and blocks PPTX without replacing prior exports', async () => {
  const f = await presentationFixture();
  try {
    const original = await readFile(f.entry, 'utf8');
    const prior = await reviewTarget(f.root, { kind: 'document', id: 'proof' }, { export: true });
    if (prior.status !== 'ready') throw new Error(prior.error);
    const saved = await Promise.all([prior.outputs.pdf, prior.outputs.pptx!, prior.outputs.review].map(path => readFile(path)));
    for (const background of [",backgroundColor:'#0000ff'", '']) {
      await writeFile(f.entry, original.replace(/<Slide id="last">[\s\S]*?<\/Slide>/,
        `<Slide id="last"><Block id="clip" style={{width:300,height:150,borderRadius:40,overflow:'hidden'${background}}}><Block id="fill" style={{width:300,height:150,backgroundColor:'#ff0000'}} /></Block></Slide>`));
      const rendered = await renderOnce(f.root, 'proof');
      const issue = rendered.artifact.issues?.find(issue => /rounded clipping/.test(issue.message));
      assert.equal(issue?.format, 'pptx');
      assert.equal(issue?.severity, 'warning');
      assert.equal(issue?.blockId, 'clip');
      assert.equal(issue?.page, 2);
      assert.equal(issue?.source?.file, 'documents/proof/index.tsx');
      assert.ok(issue?.bounds);
      await assert.rejects(readPresentationBytes(rendered.directory, rendered.artifact.hash), /rounded clipping/);
      const rejected = await reviewTarget(f.root, { kind: 'document', id: 'proof' }, { export: true });
      assert.equal(rejected.status, 'error');
      assert.deepEqual(await Promise.all([prior.outputs.pdf, prior.outputs.pptx!, prior.outputs.review].map(path => readFile(path))), saved);
    }
    const pdfOnly = await reviewTarget(f.root, { kind: 'document', id: 'proof' });
    assert.equal(pdfOnly.status, 'ready', 'Unsupported PPTX clipping must leave PDF review available.');
  } finally { await f.cleanup(); }
});

test('rich links survive line boundaries and unexpected text fails rather than disappearing', () => {
  const source = { type: 'Text' as const, content: 'Read the evidence today.', runs: [{ content: 'Read ' }, { content: 'the evidence', style: { fontWeight: 600 }, href: 'https://example.com/evidence' }, { content: ' today.' }] };
  const runs = presentationTextRuns(source, [{ textContent: 'Read the ' }, { textContent: 'evidence today.' }])!;
  assert.equal(runs.map(run => run.text).join(''), 'Read the \nevidence today.');
  assert.deepEqual(runs.filter(run => run.href).map(run => run.text), ['the ', 'evidence']);
  assert.equal(presentationTextRuns(source, [{ textContent: 'Unexpected text' }]), null);
});

test('paragraph direction follows an explicit style, then the first strong character (UAX #9 P2/P3)', () => {
  assert.equal(firstStrongCharacter('2026 قمنا بتحديث Microsoft Office')?.direction, 'rtl', 'digits and spaces are weak');
  assert.equal(firstStrongCharacter('Microsoft Office في المكتب')?.direction, 'ltr');
  assert.equal(firstStrongCharacter('\u2067English inside an isolate\u2069 ثم نص عربي')?.direction, 'rtl', 'isolated text is skipped');
  assert.equal(firstStrongCharacter('\u200F2026')?.direction, 'rtl');
  assert.equal(firstStrongCharacter('١٢٣ — 456 …'), undefined, 'Arabic-Indic digits and punctuation are not strong');
  assert.deepEqual(paragraphDirection(undefined, '١٢٣'), { rtl: false });
  assert.deepEqual(paragraphDirection(undefined, 'قمنا بتحديث نظام Microsoft Office'), { rtl: true, lang: 'ar-SA' });
  assert.deepEqual(paragraphDirection('auto', 'שלום world'), { rtl: true, lang: 'he-IL' });
  assert.deepEqual(paragraphDirection('Rtl', 'Microsoft Office'), { rtl: true, lang: undefined });
  assert.deepEqual(paragraphDirection('ltr', 'قمنا بتحديث'), { rtl: false });
  const box = { x: 40, width: 200, style: { padding: { top: 0, right: 10, bottom: 0, left: 10 }, borderWidth: { top: 0, right: 0, bottom: 0, left: 0 } } } as unknown as ElementInfo;
  assert.equal(rtlParagraphAlignment('Left', box, [{ x: 130, width: 100 }]), 'right');
  assert.equal(rtlParagraphAlignment('Left', box, [{ x: 50, width: 100 }]), 'left');
  assert.equal(rtlParagraphAlignment('Left', box, [{ x: 50, width: 180 }]), 'right', 'a full line is aligned to the start edge');
  assert.equal(rtlParagraphAlignment('Center', box, [{ x: 90, width: 100 }]), 'center');
  assert.equal(rtlParagraphAlignment('Right', box, [{ x: 130, width: 100 }]), 'right');
});

test('PowerPoint paragraph alignment matches the PDF for either direction in either deck direction', async () => {
  const f = await presentationFixture();
  // Each paragraph's expected PowerPoint direction and physical alignment, as the PDF draws it.
  const cases: Record<'rtl' | 'ltr', [id: string, style: string, text: string, rtl: boolean, align: 'l' | 'r' | 'ctr'][]> = {
    rtl: [
      ['arabic', '', 'مرحبا بكم في العرض', true, 'r'],
      ['english-ltr', "direction:'ltr'", 'An English paragraph inside.', false, 'l'],
      ['english-auto', "direction:'auto'", 'An automatic English paragraph.', false, 'l'],
      ['english-inherited', '', 'English inheriting the deck direction.', true, 'r'],
      ['english-left', "direction:'ltr',textAlign:'left'", 'Explicitly left.', false, 'l'],
      ['english-right', "direction:'ltr',textAlign:'right'", 'Explicitly right.', false, 'r'],
      ['english-center', "direction:'ltr',textAlign:'center'", 'Explicitly centered.', false, 'ctr'],
      ['arabic-left', "textAlign:'left'", 'فقرة إلى اليسار', true, 'l'],
      ['arabic-center', "textAlign:'center'", 'فقرة في الوسط', true, 'ctr'],
    ],
    ltr: [
      ['english', '', 'An English paragraph.', false, 'l'],
      ['arabic-rtl', "direction:'rtl'", 'فقرة عربية من اليمين', true, 'r'],
      ['arabic-auto', "direction:'auto'", 'فقرة عربية تلقائية', true, 'r'],
      ['arabic-left', "direction:'rtl',textAlign:'left'", 'فقرة إلى اليسار', true, 'l'],
      ['arabic-center', "direction:'rtl',textAlign:'center'", 'فقرة في الوسط', true, 'ctr'],
      ['english-right', "textAlign:'right'", 'Explicitly right.', false, 'r'],
    ],
  };
  try {
    for (const [direction, paragraphs] of Object.entries(cases)) {
      await writeFile(f.entry, `import {Presentation,Slide,Paragraph} from '../../src/document';
export const meta={title:'Alignment',description:'Synthetic alignment test',theme:'neutral'};
export default function Proof(){return <Presentation title={meta.title} direction="${direction}"><Slide id="only">
${paragraphs.map(([id, style, text]) => `<Paragraph id="${id}" style={{${style}}}>${text}</Paragraph>`).join('\n')}
</Slide></Presentation>}`);
      const render = await renderOnce(f.root, 'proof');
      const capture: PresentationCapture = JSON.parse(await readFile(resolve(render.directory, 'presentation.json'), 'utf8'));
      const slide = xml(await readZip(await readPresentationBytes(render.directory, render.artifact.hash)), 'ppt/slides/slide1.xml');
      const lineOf = (node: ElementInfo, text: string): [ElementInfo, ElementInfo] | undefined => {
        const line = node.children.find(child => child.nodeType === 'TextLine' && child.textContent === text);
        return line ? [node, line] : node.children.map(child => lineOf(child, text)).find(Boolean);
      };
      for (const [id, , text, rtl, align] of paragraphs) {
        const label = `${direction} deck, ${id}`;
        const shape = slide.split('<p:sp>').find(part => part.includes(`name="${id}"`));
        assert.ok(shape, `${label}: exported as its own text box`);
        assert.match(shape, new RegExp(`<a:pPr ${rtl ? 'rtl="1"\\s+' : ''}algn="${align}"`), `${label}: PowerPoint direction and alignment`);
        // The expectation is the PDF's own geometry: the reviewed line sits at that edge.
        const [box, line] = capture.layout.pages[0].elements.map(element => lineOf(element, text)).find(Boolean)!;
        const offset = { l: line.x - box.x, r: box.x + box.width - line.x - line.width, ctr: Math.abs(line.x - box.x - (box.x + box.width - line.x - line.width)) }[align];
        assert.ok(offset < 0.5, `${label}: the PDF line is drawn ${align}`);
      }
    }
  } finally { await f.cleanup(); }
});

test('every exported object has a unique, stable name built from its component', async () => {
  const f = await fixture();
  const manifest = JSON.parse(await readFile(resolve(f.root, 'projects.json'), 'utf8'));
  await writeFile(resolve(f.root, 'projects.json'), JSON.stringify({ ...manifest, formats: { proof: 'presentation' } }));
  await writeFile(f.entry, `import {Presentation,Slide,Heading,Paragraph,Block,List,DataTable,Callout} from '../../src/document';
export const meta={title:'Names',description:'Synthetic naming test',theme:'neutral'};
function Card({ id, title, body }: { id: string; title: string; body: string }) { return <Block id={id} style={{backgroundColor:'#eef2ff',borderTopWidth:2,borderColor:'#123456',padding:8,marginBottom:6}}><Paragraph id={\`\${id}-title\`}>{title}</Paragraph><Paragraph id={\`\${id}-body\`}>{body}</Paragraph></Block>; }
export default function Proof(){return <Presentation title={meta.title}>
<Slide id="lists"><Heading id="lists-title">Lists</Heading>
<List id="steps" items={[{ id: 'call', children: 'Call the vendor' }, { id: 'sign', children: 'Sign both copies' }]}/>
<List id="order" ordered items={[{ id: 'first', children: 'First' }, { id: 'second', children: 'Second' }]}/>
<Callout id="note" title="Note">Read twice.</Callout></Slide>
<Slide id="tables"><DataTable id="costs" caption="Costs" columns={[{ id: 'item', label: 'Item' }, { label: 'Cost' }]} rows={[['Paper', '2'], ['Ink', '3']]} rowIds={['paper', 'ink']}/></Slide>
<Slide id="cards"><Card id="alpha" title="Same title" body="Same body"/><Card id="beta" title="Same title" body="Same body"/></Slide>
</Presentation>}`);
  const diagnostics: string[] = [];
  setDiagnosticHandler(diagnostic => { diagnostics.push(`${diagnostic.code}: ${diagnostic.message}`); });
  try {
    const render = await renderOnce(f.root, 'proof');
    const bytes = await readPresentationBytes(render.directory, render.artifact.hash);
    assert.deepEqual(diagnostics.filter(message => message.startsWith('object-name/')), [], 'ts-pptx reports no duplicate or invalid object names');
    const parts = await readZip(bytes);
    const names = (slide: number) => [...xml(parts, `ppt/slides/slide${slide}.xml`).matchAll(/<p:cNvPr id="\d+" name="([^"]*)"/g)].map(match => match[1]).slice(1);
    for (const slide of [1, 2, 3]) {
      const list = names(slide);
      assert.ok(list.length && list.every(Boolean), `slide ${slide}: every object is named`);
      assert.equal(new Set(list).size, list.length, `slide ${slide}: names are unique (${list.join(', ')})`);
    }
    const lists = names(1);
    for (const name of ['lists-title', 'steps-call', 'steps-call marker', 'steps-sign', 'steps-sign marker', 'order-first marker', 'note title', 'note', 'note left border'])
      assert.ok(lists.includes(name), `${name} in ${lists.join(', ')}`);
    assert.ok(lists.indexOf('steps-call marker') < lists.indexOf('steps-call'), 'Names follow drawing order; the marker is drawn first');
    const tables = names(2);
    for (const name of ['costs caption', 'costs column-item', 'costs column-1', 'costs row-paper-column-item', 'costs row-ink-column-1', 'costs background'])
      assert.ok(tables.includes(name), `${name} in ${tables.join(', ')}`);
    const cards = names(3);
    for (const name of ['alpha background', 'alpha top border', 'alpha-title', 'alpha-body', 'beta background', 'beta-title', 'beta-body'])
      assert.ok(cards.includes(name), `${name} in ${cards.join(', ')}`);
    const again = await readZip(await readPresentationBytes(render.directory, render.artifact.hash));
    for (const slide of [1, 2, 3]) assert.equal(xml(again, `ppt/slides/slide${slide}.xml`), xml(parts, `ppt/slides/slide${slide}.xml`), 'Names are deterministic');
  } finally { setDiagnosticHandler(null); await f.cleanup(); }
});

test('object names keep the block ID and add a qualifier or number only when needed', () => {
  assert.deepEqual(slideObjectNames([
    { block: 'slide', part: 'background' }, { block: 'body', part: 'children', text: true },
    { block: 'item', part: 'marker', text: true }, { block: 'item', part: 'children', text: true },
    { block: 'table', part: 'column-0', text: true }, { block: 'table', part: 'column-0', text: true },
    { block: 'card', part: 'top border' }, { block: 'card', part: 'top border' }, { block: 'card', part: 'top border 2' },
    { block: 'only', part: 'title', text: true },
  ]), ['slide background', 'body', 'item marker', 'item', 'table column-0', 'table column-0 2', 'card top border', 'card top border 2', 'card top border 2 2', 'only']);
});

test('PPTX receipts preserve recovery, format identity, collisions, delete/Undo, and stale publication', async () => {
  const f = await presentationFixture();
  try {
    const render = await renderOnce(f.root, 'proof'), bytes = await readPresentationBytes(render.directory, render.artifact.hash);
    const store = new ExportStore(f.root), request = { id: randomUUID(), documentId: 'proof', hash: render.artifact.hash, filename: 'Deck.pptx', format: 'pptx' as const };
    const prepare = async () => ({ bytes, isCurrent: () => true });
    const first = await store.save(request, prepare);
    const restarted = new ExportStore(f.root);
    assert.deepEqual(await restarted.save(request, async () => { throw new Error('A recovered export must not render again.'); }), first);
    await assert.rejects(restarted.save({ ...request, format: 'pdf', filename: 'Deck.pdf' }, prepare), /another file/);
    const second = await store.save({ ...request, id: randomUUID() }, prepare);
    assert.equal(second.filename, 'Deck (2).pptx');
    await store.remove(request.id);
    await writeFile(first.path, 'An unrelated replacement');
    const restored = await restarted.restore(request.id);
    assert.equal(restored.filename, 'Deck (3).pptx');
    assert.deepEqual(await readFile(restored.path), Buffer.from(bytes));
    assert.equal(await readFile(first.path, 'utf8'), 'An unrelated replacement');
    const before = (await readdir(resolve(f.root, 'output'))).sort();
    await assert.rejects(store.save({ ...request, id: randomUUID() }, async () => ({ bytes, isCurrent: () => false })), /changed during export/);
    await assert.rejects(store.save({ ...request, id: randomUUID() }, async () => ({ bytes: Buffer.from('PKbroken'), isCurrent: () => true })), /incomplete/);
    assert.deepEqual((await readdir(resolve(f.root, 'output'))).sort(), before);
    const pdf = await store.save({ ...request, id: randomUUID(), format: 'pdf', filename: 'Legacy.pdf' }, async () => ({ bytes: Buffer.from('%PDF-1.7 legacy'), isCurrent: () => true }));
    const receiptPath = resolve(f.root, '.opendoc/exports', `${pdf.id}.json`), receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    delete receipt.format; await writeFile(receiptPath, JSON.stringify(receipt));
    assert.equal((await restarted.get(pdf.id))?.filename, 'Legacy.pdf');
  } finally { await f.cleanup(); }
});

test('CLI exports full presentations offline and history adopts the PPTX once', async () => {
  assert.deepEqual(parseExportArgs(['proof', '--format', 'pptx']), { all: false, json: false, ids: ['proof'], format: 'pptx' });
  assert.throws(() => parseExportArgs(['proof', '--format', 'html']));
  const f = await presentationFixture();
  try {
    const [result] = await exportDocuments(f.root, ['proof'], { format: 'pptx' });
    assert.equal(result.status, 'success', JSON.stringify(result)); assert.match(result.path, /proof.pptx$/);
    const store = new ExportStore(f.root);
    const history = await store.list('proof'); assert.equal(history.length, 1); assert.equal(history[0].format, 'pptx');
    assert.deepEqual(await store.list('proof'), history);
  } finally { await f.cleanup(); }
});

test('PPTX HTTP export authenticates, downloads, recovers a lost response, and blocks stale or invalid previews', { timeout: 60_000 }, async () => {
  const f = await presentationFixture();
  const child = spawn(process.execPath, ['--import', 'tsx', resolve(projectRoot, 'src/server/index.ts')], { cwd: f.root, env: { ...process.env, OPENDOC_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', data => logs += data); child.stderr.on('data', data => logs += data);
  try {
    let connection: { origin: string; token: string } | undefined;
    await until(async () => { try { connection = JSON.parse(await readFile(resolve(f.root, '.opendoc/server.json'), 'utf8')); return true; } catch { if (child.exitCode !== null) throw new Error(logs); return false; } });
    const { origin, token } = connection!, headers = { 'Content-Type': 'application/json', 'X-OpenDoc-Token': token, Origin: origin };
    const post = (path: string, value: unknown) => fetch(`${origin}${path}`, { method: 'POST', headers, body: JSON.stringify(value) });
    let state: DocumentState | undefined;
    await until(async () => { state = (await fetch(`${origin}/api/documents`).then(r => r.json()))[0]; return state?.status === 'ready'; });
    const request = { id: randomUUID(), hash: state!.artifact!.hash, filename: 'Reviewed.pptx', format: 'pptx' }, route = '/api/documents/proof/exports';
    assert.equal((await fetch(`${origin}${route}`, { method: 'POST', body: JSON.stringify(request) })).status, 403);
    assert.equal((await post(route, { ...request, format: 'html' })).status, 400);
    const first = await post(route, request); assert.equal(first.status, 200, await first.clone().text());
    await first.body?.cancel(); // The file exists, but the client never receives its receipt body.
    const saved = await post(route, request).then(r => r.json()) as SavedExport;
    assert.equal(saved.format, 'pptx');
    const response = await fetch(`${origin}/api/exports/${saved.id}/download`);
    assert.equal(response.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    assert.match(response.headers.get('content-disposition')!, /attachment;.*Reviewed.pptx/);
    const parts = await readZip(new Uint8Array(await response.arrayBuffer()));
    assert.match(xml(parts, 'ppt/slides/slide1.xml'), /Editable proof/);
    await writeFile(f.entry, (await readFile(f.entry, 'utf8')).replace('A <Strong>', 'A revised <Strong>'));
    await until(async () => { state = (await fetch(`${origin}/api/documents`).then(r => r.json()))[0]; return state?.status === 'ready' && state.artifact?.hash !== request.hash; });
    assert.equal((await post(route, { ...request, id: randomUUID() })).status, 409);
    assert.deepEqual(await post(route, request).then(r => r.json()), saved);
    const latestHash = state!.artifact!.hash;
    await writeFile(f.entry, 'Invalid source');
    await until(async () => { state = (await fetch(`${origin}/api/documents`).then(r => r.json()))[0]; return state?.status === 'error'; });
    assert.equal((await post(route, { ...request, id: randomUUID(), hash: latestHash })).status, 409);
    assert.equal((await readdir(resolve(f.root, 'output'))).length, 1);
    assert.deepEqual(await fetch(`${origin}/api/documents/proof/exports`).then(r => r.json()), [{ ...saved, available: true }]);
  } finally {
    child.kill('SIGTERM');
    await new Promise<void>(accept => { if (child.exitCode !== null) accept(); else child.once('exit', () => accept()); });
    await f.cleanup();
  }
});
