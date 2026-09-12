import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import * as fontkit from 'fontkit';
import ttf2eot from 'ttf2eot';
import TsPptx, { type TextPropsOptions } from '@shbernal/ts-pptx';
import type { ElementInfo, ElementStyleInfo, LayoutInfo, Color } from '@formepdf/core';
import type { FormeDocument, FormeNode, FormeStyle } from '@formepdf/react';
import type { DocumentMeta, SlideInfo, SourceLocation } from '../shared/types';

export interface PresentationCapture {
  version: 1; hash: string; meta: DocumentMeta; slides: SlideInfo[]; doc: FormeDocument; layout: LayoutInfo;
}
type TextKind = Extract<FormeNode['kind'], { type: 'Text' | 'Heading' }>;
type Run = { text: string; style: FormeStyle; href?: string };
type FontFace = { bytes: Buffer; family: string; weight: number; italic: boolean; restrictions: { noEmbedding?: boolean; bitmapOnly?: boolean; viewOnly?: boolean } };
type PaintStyle = ElementStyleInfo & { borderStyle?: Partial<Record<'top' | 'right' | 'bottom' | 'left', string>>; transform?: unknown };
const PT = 72;
const key = (location: SourceLocation | undefined, type: string) => `${location?.file ?? ''}:${location?.line ?? 0}:${location?.column ?? 0}:${type}`;
const hex = (color: Color) => [color.r, color.g, color.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const fill = (color: Color) => ({ color: hex(color), transparency: (1 - (color.a ?? 1)) * 100 });
const box = (node: ElementInfo) => ({ x: node.x / PT, y: node.y / PT, w: node.width / PT, h: node.height / PT });

/** Preserve authored runs inside one editable textbox, using the reviewed line breaks. */
export function presentationTextRuns(source: TextKind, lines: Pick<ElementInfo, 'textContent'>[]): Run[] | null {
  const input = source.runs ?? [{ content: source.content, href: source.href }];
  if (input.map(r => r.content).join('').replace(/\s/g, '') !== lines.map(l => l.textContent ?? '').join('').replace(/\s/g, '')) return null;
  const chars = input.flatMap(run => Array.from(run.content, c => ({ c, style: run.style ?? {}, href: run.href ?? source.href })));
  let position = 0;
  const output: Run[] = [];
  for (const [index, line] of lines.entries()) {
    if (index) output.push({ text: '\n', style: {} });
    for (const c of line.textContent ?? '') {
      while (position < chars.length && /\s/.test(chars[position].c) && chars[position].c !== c) position++;
      if (position >= chars.length || chars[position].c !== c) return null;
      const run = chars[position++], last = output.at(-1);
      if (last && last.text !== '\n' && JSON.stringify(last.style) === JSON.stringify(run.style) && last.href === run.href) last.text += c;
      else output.push({ text: c, style: run.style, href: run.href });
    }
    while (position < chars.length && /\s/.test(chars[position].c)) position++;
  }
  return output;
}

function fontCatalog(doc: FormeDocument) {
  const fonts = new Map<string, FontFace>();
  for (const item of doc.fonts ?? []) {
    const bytes = typeof item.src === 'string' ? Buffer.from(item.src, 'base64') : Buffer.from(item.src);
    const font = fontkit.create(bytes);
    if (!('familyName' in font)) throw new Error('PowerPoint export requires individual font faces, not a font collection.');
    const restrictions = (font as unknown as { 'OS/2'?: { fsType?: FontFace['restrictions'] } })['OS/2']?.fsType ?? {};
    fonts.set(`${item.family}:${item.weight ?? 400}:${!!item.italic}`, { bytes, family: font.familyName, weight: item.weight ?? 400, italic: !!item.italic, restrictions });
  }
  return fonts;
}

export async function presentationBytes(capture: PresentationCapture): Promise<Uint8Array> {
  if (capture.version !== 1 || capture.slides.length !== capture.layout.pages.length || capture.doc.children.length !== capture.slides.length) throw new Error('The presentation preview is incomplete. Render it again before exporting.');
  const fonts = fontCatalog(capture.doc), used = new Map<string, FontFace>();
  const pptx = new TsPptx();
  pptx.defineLayout({ name: 'OPENDOC', width: 960 / PT, height: 540 / PT });
  pptx.layout = 'OPENDOC'; pptx.title = capture.meta.title; pptx.author = capture.meta.author ?? 'OpenDoc';
  function textStyle(style: ElementStyleInfo): TextPropsOptions {
    // Match Forme 0.20.1 FontRegistry::resolve: exact, snapped, then opposite weight.
    // Choosing the numerically closest face would disagree with the reviewed PDF.
    const weight = style.fontWeight ?? 400, snapped = weight >= 600 ? 700 : 400;
    let font: FontFace | undefined;
    for (const family of style.fontFamily.split(',').map(name => name.trim().replace(/^["']|["']$/g, ''))) {
      for (const candidate of [weight, snapped, snapped === 700 ? 400 : 700]) {
        font = fonts.get(`${family}:${candidate}:${style.fontStyle === 'Italic'}`);
        if (font) break;
      }
      if (font) break;
    }
    if (!font) throw new Error(`PowerPoint export needs the exact font face: ${style.fontFamily}, weight ${style.fontWeight}.`);
    const slot = `${font.family}:${font.weight >= 600}:${font.italic}`, previous = used.get(slot);
    if (previous && !previous.bytes.equals(font.bytes)) throw new Error(`PowerPoint cannot preserve these different weights of ${font.family} in the same font style. Use regular and semibold/bold faces.`);
    used.set(slot, font);
    return { fontFace: font.family, fontSize: style.fontSize, bold: font.weight >= 600, italic: font.italic,
      color: hex(style.color), transparency: (1 - (style.color.a ?? 1)) * 100, charSpacing: style.letterSpacing ?? 0,
      ...(style.textDecoration === 'Underline' ? { underline: { style: 'sng' as const } } : {}), ...(style.textDecoration === 'LineThrough' ? { strike: true } : {}) };
  }
  for (const [index, page] of capture.layout.pages.entries()) {
    const sourcePage = capture.doc.children[index], label = capture.slides[index].id;
    if (page.width !== 960 || page.height !== 540 || sourcePage.kind.type !== 'Page') throw new Error('PowerPoint export requires 960 × 540 presentation slides.');
    const sources = new Map<string, FormeNode[]>();
    function indexSource(node: FormeNode) {
      const styles = [node.style, ...('runs' in node.kind ? node.kind.runs?.map(run => run.style) ?? [] : [])];
      for (const style of styles) {
        if (!style) continue;
        const unsupported = style.transform?.length ? 'transforms' : style.boxShadow ? 'shadows' : style.background && style.background.type !== 'color' ? 'gradients' : style.wordSpacing ? 'custom word spacing' : style.textAlign === 'Justify' ? 'justified text' : undefined;
        if (unsupported) throw new Error(`Slide ${label}: PowerPoint export does not yet support ${unsupported}.`);
      }
      if (['Text', 'Heading', 'Image'].includes(node.kind.type)) {
        const id = key(node.sourceLocation, node.kind.type), list = sources.get(id) ?? [];
        list.push(node); sources.set(id, list);
      }
      node.children.forEach(indexSource);
    }
    indexSource(sourcePage);
    const slide = pptx.addSlide(), config = sourcePage.kind.config;
    if (config.backgroundImage) slide.addImage({ data: config.backgroundImage, x: 0, y: 0, w: 960 / PT, h: 540 / PT, transparency: (1 - (config.backgroundOpacity ?? 1)) * 100 });
    function visit(node: ElementInfo) {
      const style = node.style as PaintStyle;
      if (style.opacity === 0) return;
      if (style.opacity !== undefined && style.opacity !== 1) throw new Error(`Slide ${label}: PowerPoint export does not yet support group opacity.`);
      if (style.transform) throw new Error(`Slide ${label}: PowerPoint export does not yet support transforms.`);
      if (node.kind === 'Rect') {
        if (Object.values(style.borderRadius ?? {}).some(radius => radius !== 0)) throw new Error(`Slide ${label}: PowerPoint export does not yet support rounded corners.`);
        if (style.backgroundColor) slide.addShape('rect', { ...box(node), line: { transparency: 100 }, fill: fill(style.backgroundColor) });
        for (const side of ['top', 'right', 'bottom', 'left'] as const) if (style.borderWidth?.[side] > 0) {
          if (style.borderStyle?.[side] !== 'solid') throw new Error(`Slide ${label}: PowerPoint export does not yet support this border style.`);
          const horizontal = side === 'top' || side === 'bottom';
          slide.addShape('line', { x: (node.x + (side === 'right' ? node.width : 0)) / PT, y: (node.y + (side === 'bottom' ? node.height : 0)) / PT,
            w: horizontal ? node.width / PT : 0, h: horizontal ? 0 : node.height / PT,
            line: { ...fill(style.borderColor[side]), width: style.borderWidth[side], beginArrowType: 'none', endArrowType: 'none' } });
        }
      }
      const type = /^H[1-6]$/.test(node.nodeType) ? 'Heading' : node.nodeType;
      if (['Text', 'Heading'].includes(type) && node.children.some(child => child.nodeType === 'TextLine')) {
        const source = sources.get(key(node.sourceLocation, type))?.shift();
        if (!source || (source.kind.type !== 'Text' && source.kind.type !== 'Heading')) throw new Error(`Slide ${label}: an editable text source could not be matched.`);
        const lines = node.children.filter(child => child.nodeType === 'TextLine');
        const pageNumbers = (text: string) => text.replaceAll('{{pageNumber}}', String(index + 1)).replaceAll('{{totalPages}}', String(capture.slides.length)).replaceAll('\u0002', String(index + 1)).replaceAll('\u0003', String(capture.slides.length));
        const runs = presentationTextRuns({ ...source.kind, content: pageNumbers(source.kind.content), runs: source.kind.runs?.map(run => ({ ...run, content: pageNumbers(run.content) })) }, lines.map(line => ({ textContent: pageNumbers(line.textContent ?? '') })));
        if (!runs) throw new Error(`Slide ${label}: PowerPoint export cannot preserve this text transformation.`);
        const rich = runs.map(run => ({ text: run.text, options: { ...textStyle({ ...style, ...run.style } as ElementStyleInfo), ...(run.href ? { hyperlink: { url: run.href } } : {}) } }));
        slide.addText(rich, { ...box(node), y: lines[0].y / PT, ...textStyle(style), margin: 0, breakLine: false, paraSpaceAfter: 0, paraSpaceBefore: 0,
          lineSpacing: style.fontSize * style.lineHeight, align: style.textAlign.toLowerCase() as TextPropsOptions['align'], valign: 'top', wrap: false, fit: 'none',
          objectName: node.sourceLocation?.file?.replace('opendoc:block:', '') ?? 'text' });
        return;
      }
      if (node.kind === 'Image') {
        const source = sources.get(key(node.sourceLocation, 'Image'))?.shift();
        if (source?.kind.type !== 'Image' || !source.kind.src) throw new Error(`Slide ${label}: an image source could not be matched.`);
        slide.addImage({ data: source.kind.src, ...box(node), altText: source.alt ?? '' }); return;
      }
      if (!['Rect', 'None', 'Text'].includes(node.kind)) throw new Error(`Slide ${label}: PowerPoint export does not yet support ${node.nodeType}.`);
      if (node.nodeType === 'TextLine') throw new Error(`Slide ${label}: an editable text line could not be matched.`);
      node.children.forEach(visit);
    }
    page.elements.forEach(visit);
  }
  for (const font of used.values()) {
    if (font.restrictions.noEmbedding || font.restrictions.bitmapOnly || font.restrictions.viewOnly) throw new Error(`${font.family} does not permit editable font embedding. Choose a font that does before exporting PowerPoint.`);
    if (font.bytes.readUInt32BE(0) !== 0x00010000) throw new Error(`PowerPoint export currently requires TrueType outlines: ${font.family}.`);
    // PowerPoint consumes EOT containers in .fntdata, not the raw TTF accepted by ts-pptx.
    await pptx.embedFont({ data: ttf2eot(font.bytes), typeface: font.family, style: font.italic ? (font.weight >= 600 ? 'boldItalic' : 'italic') : (font.weight >= 600 ? 'bold' : 'regular') });
  }
  const bytes = await pptx.write({ outputType: 'uint8array' });
  if (!(bytes instanceof Uint8Array)) throw new Error('PowerPoint export returned an unexpected file format.');
  return bytes;
}

export async function readPresentationBytes(directory: string, hash: string) {
  const capture = JSON.parse(await readFile(resolve(directory, 'presentation.json'), 'utf8')) as PresentationCapture;
  const pdf = await readFile(resolve(directory, 'document.pdf'));
  if (capture.hash !== hash || createHash('sha256').update(pdf).digest('hex') !== hash) throw new Error('The presentation preview changed. Wait for the latest preview and try again.');
  return presentationBytes(capture);
}
