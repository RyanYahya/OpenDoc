import { dirname, extname, resolve, sep } from 'node:path';
import { createInflate } from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { create as createFont, type Font } from 'fontkit';
import { createElement as h, type ReactNode } from 'react';
import * as F from '@formepdf/react';
import { renderDocument } from '@formepdf/core';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { preparedFile, type PreparedFonts, type PreparedLogo, type UploadFile } from './imports';
import { imageInfo } from '../media/files';
import { runtimeResolve } from '../runtime/paths';

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

async function pngDimensions(contents: Uint8Array) {
  const bytes = Buffer.from(contents);
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('This file is not a valid PNG. Export the logo as PNG again.');
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let offset = 8, ended = false, imageEnded = false, palette = false;
  const data: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    if (end > bytes.length) throw new Error('The PNG is truncated. Export the logo again.');
    const name = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(name) || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw new Error('The PNG has a damaged image chunk. Export the logo again.');
    if (offset === 8 && name !== 'IHDR') throw new Error('The PNG has no valid image header.');
    if (name === 'IHDR') {
      if (offset !== 8 || length !== 13) throw new Error('The PNG has an invalid image header.');
      width = bytes.readUInt32BE(offset + 8); height = bytes.readUInt32BE(offset + 12);
      bitDepth = bytes[offset + 16]; colorType = bytes[offset + 17]; interlace = bytes[offset + 20];
      const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!width || !height || width * height > 100_000_000) throw new Error('PNG logos must have positive dimensions and no more than 100 megapixels.');
      if (!depths[colorType]?.includes(bitDepth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || interlace > 1) throw new Error('The PNG uses an invalid image format.');
    } else if (name === 'PLTE') {
      if (data.length || palette || !length || length % 3 || length > 768) throw new Error('The PNG color palette is invalid.');
      palette = true;
    } else if (name === 'IDAT') {
      if (imageEnded) throw new Error('The PNG image chunks are out of order.');
      data.push(bytes.subarray(offset + 8, end - 4));
    } else if (name === 'IEND') {
      if (length || !data.length || end !== bytes.length) throw new Error('The PNG has an invalid ending.');
      ended = true; break;
    } else {
      if (data.length) imageEnded = true;
      if (name[0] === name[0].toUpperCase()) throw new Error(`The PNG has an unsupported ${name} image chunk.`);
    }
    offset = end;
  }
  if (!ended || (colorType === 3 && !palette)) throw new Error('The PNG is incomplete or has no required color palette.');
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const rows = passes.flatMap(([x, y, dx, dy]) => {
    const columns = Math.max(0, Math.ceil((width - x) / dx));
    const count = Math.max(0, Math.ceil((height - y) / dy));
    return columns && count ? [{ count, bytes: Math.ceil(columns * bitDepth * channels[colorType] / 8) + 1 }] : [];
  });
  // Stream decompression: a large valid image never allocates an equally large decoded buffer.
  await new Promise<void>((accept, reject) => {
    const stream = createInflate();
    let pass = 0, row = 0, position = 0;
    stream.on('data', (chunk: Buffer) => {
      let cursor = 0;
      while (cursor < chunk.length) {
        if (pass >= rows.length) { stream.destroy(new Error('The PNG has excess decompressed image data.')); return; }
        if (position === 0 && chunk[cursor] > 4) { stream.destroy(new Error('The PNG has an invalid pixel filter.')); return; }
        const step = Math.min(chunk.length - cursor, rows[pass].bytes - position);
        cursor += step; position += step;
        if (position === rows[pass].bytes) { position = 0; row++; if (row === rows[pass].count) { row = 0; pass++; } }
      }
    });
    stream.once('error', () => reject(new Error('The PNG pixel data is damaged. Export the logo again.')));
    stream.once('end', () => pass === rows.length && position === 0 ? accept() : reject(new Error('The PNG pixel data is incomplete.')));
    for (const chunk of data) stream.write(chunk);
    stream.end();
  });
  return { width, height };
}

async function validateSvg(source: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('SVG logos must be self-contained and cannot use document types or XML entities.');
  if (XMLValidator.validate(source) !== true) throw new Error('The SVG is not well-formed XML. Export the logo as SVG again.');
  const parsed = new XMLParser({ ignoreAttributes: false, processEntities: true, parseTagValue: false, parseAttributeValue: false, removeNSPrefix: true }).parse(source) as Record<string, unknown>;
  if (!Object.hasOwn(parsed, 'svg')) throw new Error('The file must contain an SVG root element.');
  const embedded = new Set<string>();
  let nodes = 0;
  function inspect(value: unknown, key = '', depth = 0) {
    if (++nodes > 50_000) throw new Error('This SVG contains too many elements. Simplify it before importing.');
    if (depth > 100) throw new Error('This SVG is too deeply nested. Simplify it before importing.');
    const tag = key.toLowerCase();
    if (['script', 'foreignobject', 'animate', 'animatetransform', 'animatemotion', 'set'].includes(tag)) throw new Error('Logo SVGs must be static artwork. Remove scripts, animation, or foreign content first.');
    if (['text', 'tspan', 'textpath'].includes(tag)) throw new Error('This SVG contains text whose fonts are not embedded as outlines. Convert text to paths before uploading, or use a PNG. OpenDoc does not substitute system fonts.');
    if (typeof value === 'string') {
      if (tag.startsWith('@_on')) throw new Error('Logo SVGs cannot contain scripted event handlers.');
      if (tag === '@_href') {
        const href = value.trim();
        if (href && !href.startsWith('#') && !/^data:image\/(?:png|jpeg);base64,[a-z0-9+/=\s]+$/i.test(href)) throw new Error('The SVG references an external image or file. Embed images as PNG/JPEG data, or upload a self-contained PNG.');
        if (href.startsWith('data:')) embedded.add(href);
      }
      if (tag === '@_base' && value.trim()) throw new Error('SVG logos cannot set an external base path. Embed their images and resources first.');
      if (tag === 'style' || tag === '@_style' || (tag.startsWith('@_') && /url\s*\(|\\/i.test(value))) {
        const css = value.replace(/\/\*[\s\S]*?\*\//g, '');
        if (/\\|@import|@font-face|expression\s*\(/i.test(css)) throw new Error('SVG logos cannot load external styles or fonts. Convert text to paths and embed images first.');
        for (const match of css.matchAll(/url\s*\(([^)]*)\)/gi)) if (!/^['"]?#[^\s'"()]+['"]?$/.test(match[1].trim())) throw new Error('The SVG uses an external style resource. Use only local SVG fragment references.');
      }
    } else if (Array.isArray(value)) { for (const child of value) inspect(child, key, depth + 1); }
    else if (value && typeof value === 'object') { for (const [childKey, child] of Object.entries(value)) inspect(child, childKey, depth + 1); }
  }
  inspect(parsed);
  for (const href of embedded) {
    const bytes = Buffer.from(href.slice(href.indexOf(',') + 1).replace(/\s/g, ''), 'base64');
    if (/^data:image\/png/i.test(href)) await pngDimensions(bytes);
    else {
      if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) throw new Error('An embedded JPEG image is damaged. Export the SVG with its images embedded again.');
      let offset = 2, bounded = false;
      while (offset + 4 < bytes.length) {
        if (bytes[offset++] !== 255) break;
        while (bytes[offset] === 255) offset++;
        const marker = bytes[offset++];
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        const length = bytes.readUInt16BE(offset);
        if (length < 2 || offset + length > bytes.length) break;
        if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
          const height = bytes.readUInt16BE(offset + 3), width = bytes.readUInt16BE(offset + 5);
          if (!width || !height || width * height > 100_000_000) throw new Error('An embedded SVG image exceeds the 100-megapixel limit. Reduce its dimensions first.');
          bounded = true; break;
        }
        offset += length;
      }
      if (!bounded) throw new Error('An embedded JPEG has no supported image dimensions. Re-export it as PNG before embedding.');
    }
    // usvg otherwise silently drops embedded images that its decoder cannot read.
    const probe = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><image href="${href.replace(/\s/g, '')}" width="1" height="1"/></svg>`, { font: { loadSystemFonts: false }, logLevel: 'off' });
    if (!probe.toString().includes('<image')) throw new Error('An embedded SVG image could not be decoded. Export the SVG with valid embedded PNG/JPEG images again.');
  }
}

async function logo(file: UploadFile): Promise<PreparedLogo> {
  if (extname(file.filename).toLowerCase() === '.png') {
    const dimensions = await pngDimensions(file.bytes);
    const original = preparedFile(file.bytes, 'png', 'image/png', dimensions);
    return { original, image: original };
  }
  const source = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
  await validateSvg(source);
  try {
    const options = { font: { loadSystemFonts: false }, logLevel: 'off' as const };
    const inspected = new Resvg(source, options);
    if (inspected.imagesToResolve().length) throw new Error('The SVG contains unresolved external images. Embed them before importing.');
    if (!Number.isFinite(inspected.width) || !Number.isFinite(inspected.height) || inspected.width <= 0 || inspected.height <= 0) throw new Error('The SVG needs a positive width and height or viewBox.');
    const fitTo = inspected.width >= inspected.height ? { mode: 'width' as const, value: 4096 } : { mode: 'height' as const, value: 4096 };
    const rendered = new Resvg(source, { ...options, fitTo }).render();
    if (!rendered.width || !rendered.height || rendered.width > 4096 || rendered.height > 4096) throw new Error('The SVG proportions could not be prepared within the 4096-pixel limit.');
    return {
      original: preparedFile(file.bytes, 'svg', 'image/svg+xml', { width: inspected.width, height: inspected.height }),
      image: preparedFile(rendered.asPng(), 'png', 'image/png', { width: rendered.width, height: rendered.height }),
    };
  } catch (error) { throw new Error(`The SVG could not be prepared: ${error instanceof Error ? error.message : String(error)}`); }
}

async function media(file: UploadFile) {
  const bytes = Buffer.from(file.bytes);
  const info = imageInfo(bytes);
  if ((extname(file.filename).toLowerCase() === '.png') !== (info.mime === 'image/png')) throw new Error('The image extension does not match its contents. Export it as PNG or JPEG again.');
  if (info.mime === 'image/png') await pngDimensions(bytes);
  else {
    if (bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) throw new Error('The JPEG is incomplete. Export it again from its original.');
    const probe = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><image href="data:image/jpeg;base64,${bytes.toString('base64')}" width="1" height="1"/></svg>`, { font: { loadSystemFonts: false }, logLevel: 'off' });
    if (!probe.toString().includes('<image')) throw new Error('The JPEG pixel data could not be decoded. Export it again from its original.');
  }
  return { image: preparedFile(file.bytes, info.mime === 'image/png' ? 'png' : 'jpg', info.mime, { width: info.width, height: info.height }) };
}

const plainSample = 'office efficiency finished';
const styleSample = 'Before bold words after italic words finish.';
const kerningSample = 'AVATAR To Wa office after space';
const alphabetSample = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789';

async function fonts(files: UploadFile[]): Promise<PreparedFonts> {
  const parsed: Font[] = [];
  const collisions = new Set<string>();
  let name = '';
  const faces: PreparedFonts['faces'] = files.map(file => {
    const bytes = Buffer.from(file.bytes);
    const signature = bytes.subarray(0, 4).toString('ascii');
    if (signature !== 'OTTO' && !bytes.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0]))) throw new Error(`${file.filename}: choose a static TTF or OTF file. Web fonts and font collections are not supported.`);
    let font: Font;
    try {
      const opened = createFont(bytes);
      if ('fonts' in opened) throw new Error('Font collections are not supported.');
      font = opened;
      if (Object.keys(font.variationAxes ?? {}).length) throw new Error('Variable fonts are not supported. Export a static TTF or OTF face.');
      if (!font.numGlyphs || !font.familyName) throw new Error('The font has no readable family or glyphs.');
    } catch (error) { throw new Error(`${file.filename}: ${error instanceof Error ? error.message : 'The font metadata could not be read.'}`); }
    const family = (font.getName('preferredFamily', 'en') || font.familyName).trim();
    if (name && name !== family) throw new Error(`Import one family at a time. ${file.filename} belongs to ${family}, while the other files belong to ${name}.`);
    name = family;
    const weight = font['OS/2']?.usWeightClass;
    if (!Number.isInteger(weight) || weight < 1 || weight > 1000) throw new Error(`${file.filename}: the font has no valid weight metadata.`);
    const style = font['OS/2']?.fsSelection?.italic || font['OS/2']?.fsSelection?.oblique || font.italicAngle !== 0 ? 'italic' : 'normal';
    const id = `${weight}-${style}`;
    if (collisions.has(id)) throw new Error(`${family} includes more than one ${weight} ${style} face. Choose one file for each weight and style.`);
    collisions.add(id); parsed.push(font);
    const extension = signature === 'OTTO' ? 'otf' : 'ttf';
    return { id, family, postscriptName: font.postscriptName || undefined, weight, style, file: preparedFile(file.bytes, extension, extension === 'otf' ? 'font/otf' : 'font/ttf') };
  });
  const problems: string[] = [];
  for (let index = 0; index < parsed.length; index++) {
    const missing = Array.from({ length: 95 }, (_, character) => character + 32).filter(character => !parsed[index].hasGlyphForCodePoint(character));
    if (missing.length) problems.push(`${faces[index].weight} ${faces[index].style} is missing English glyphs (${missing.slice(0, 6).map(code => String.fromCodePoint(code)).join(' ')}).`);
  }
  const regular = faces.find(face => face.weight === 400 && face.style === 'normal');
  const strong = faces.find(face => face.weight === 600 && face.style === 'normal') ?? faces.find(face => face.weight === 700 && face.style === 'normal');
  const italic = faces.find(face => face.weight === 400 && face.style === 'italic');
  const descriptionFonts = regular ? [parsed[faces.indexOf(regular)], ...parsed] : parsed;
  const description = descriptionFonts.map(font => font.getName('description', 'en')?.replace(/\s+/g, ' ').trim()).find(Boolean)?.slice(0, 4000) ?? '';
  const expected: string[] = [];
  const lines: ReactNode[] = [];
  const sample = (text: string, face: (typeof faces)[number], size = 13) => {
    expected.push(text);
    return h(F.Text, { style: { fontFamily: name, fontWeight: face.weight, fontStyle: face.style, fontSize: size, lineHeight: 1.4, marginBottom: 8 } }, text);
  };
  lines.push(h(F.Text, { style: { fontFamily: 'Helvetica', fontSize: 21, marginBottom: 8 } }, name));
  lines.push(h(F.Text, { style: { fontFamily: 'Helvetica', fontSize: 10, marginBottom: 22, color: '#596273' } }, 'Original font files · OpenDoc PDF compatibility specimen'));
  for (const face of faces) {
    lines.push(h(F.Text, { style: { fontFamily: 'Helvetica', fontSize: 9, marginTop: 12, marginBottom: 7, color: '#596273' } }, `${face.weight} ${face.style}`));
    lines.push(sample(alphabetSample, face, 11), sample(plainSample, face));
  }
  if (regular && strong) {
    const mix = (before: string, bold: string, after: string, emphasized: string, final: string, expectedText: string) => {
      expected.push(expectedText);
      return h(F.Text, { style: { fontFamily: name, fontWeight: 400, fontSize: 14, marginTop: 10, lineHeight: 1.4 } },
        before, h(F.Text, { style: { fontWeight: strong.weight } }, bold), after,
        h(F.Text, { style: { fontStyle: italic ? 'italic' : 'normal' } }, emphasized), final);
    };
    lines.push(mix('Before ', 'bold words', ' after ', 'italic words', ' finish.', styleSample));
    lines.push(mix('AVATAR ', 'To Wa', ' office ', 'after', ' space', kerningSample));
  }
  let specimen: PreparedFonts['specimen'];
  try {
    const bytes = await renderDocument(h(F.Document, { title: `${name} — font specimen`, fonts: faces.map(face => ({ family: name, src: face.file.contents, fontWeight: face.weight, fontStyle: face.style })) }, h(F.Page, { size: 'A4', margin: 45 }, ...lines)));
    specimen = preparedFile(bytes, 'pdf', 'application/pdf');
    const pdfTask = getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: resolve(dirname(runtimeResolve('pdfjs-dist/package.json')), 'standard_fonts') + sep, verbosity: 0, useSystemFonts: false, disableFontFace: true });
    try {
      const pdf = await pdfTask.promise;
      const actual: string[] = [];
      for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
        const content = await (await pdf.getPage(pageIndex)).getTextContent();
        let line = '';
        for (const item of content.items) {
          if (!('str' in item)) continue;
          if (!Number.isFinite(item.width) || item.width < 0 || item.transform.some(value => !Number.isFinite(value))) problems.push('The PDF contains invalid text geometry.');
          line += item.str;
          if (item.hasEOL) { actual.push(line.normalize('NFKC')); line = ''; }
        }
        if (line) actual.push(line.normalize('NFKC'));
      }
      for (const text of expected) {
        const found = actual.indexOf(text);
        if (found >= 0) actual.splice(found, 1);
        else problems.push(`The PDF does not preserve the text or spacing in “${text}”.`);
      }
    } finally { await pdfTask.destroy(); }
  } catch (error) { problems.push(`PDF validation failed: ${error instanceof Error ? error.message : String(error)}`); }
  const missingStyles = !regular || !strong ? 'Theme defaults require regular (400) plus semibold (600) or bold (700).' : undefined;
  return {
    name, description, faces, specimen,
    compatibility: {
      status: problems.length ? 'needs-attention' : 'ready',
      defaultEligible: !problems.length && Boolean(regular && strong),
      ...((problems.length || missingStyles) ? { message: [...new Set(problems), ...(missingStyles ? [missingStyles] : [])].join(' ') } : {}),
    },
  };
}

process.once('message', async (message: { kind: 'logo' | 'fonts' | 'media'; files: UploadFile[] }) => {
  try {
    const result = message.kind === 'logo' ? await logo(message.files[0]) : message.kind === 'media' ? await media(message.files[0]) : await fonts(message.files);
    process.send?.({ ok: true, result }, () => process.disconnect());
  } catch (error) {
    process.send?.({ ok: false, error: error instanceof Error ? error.message : String(error) }, () => process.disconnect());
    process.exitCode = 1;
  }
});
