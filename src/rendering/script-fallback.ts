import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { create as createFont, type Font } from 'fontkit';
import type { FormeDocument, FormeNode, FormeStyle } from '@formepdf/react';
import type { AssetUse, FontFace, FontRevision } from '../shared/assets';
import { assetDirectory, assetFile, assetRevisionPath, readAssetHead, readAssetRevision } from '../assets/files';
import { assetFontFamily } from '../assets/index';
import { fontFamilies } from '../themes/types';

/** The built-in family OpenDoc appends for Arabic-script text that no chosen font covers. */
export const ARABIC_FALLBACK_ASSET = 'noto-naskh-arabic';
/** Arabic-script letters, marks, digits, and punctuation, including those shared with other scripts. */
const arabicScript = /\p{Script_Extensions=Arabic}/u;

type FontRegistration = NonNullable<FormeDocument['fonts']>[number];
type TextPiece = { text: string; family?: string; weight: number; italic: boolean; blockId?: string };
export interface ScriptFallback { family: string; uses: AssetUse[]; dependencies: string[] }

// Serialized styles carry numeric weights; keywords are accepted defensively.
function numericWeight(value: unknown, inherited: number) {
  return value === 'bold' ? 700 : value === 'normal' ? 400 : typeof value === 'number' ? value : inherited;
}
const isItalic = (value: unknown, inherited: boolean) => typeof value === 'string' ? /^(italic|oblique)$/i.test(value) : inherited;

/** Each text run with the font family list, weight, and style it inherits, in document order. */
function textPieces(doc: FormeDocument): TextPiece[] {
  const pieces: TextPiece[] = [];
  const root = doc.defaultStyle ?? {};
  function visit(node: FormeNode, family: string | undefined, weight: number, italic: boolean, blockId?: string) {
    const style = node.style ?? {};
    const source = node.sourceLocation?.file;
    blockId = source?.startsWith('opendoc:block:') ? source.slice('opendoc:block:'.length) : blockId;
    family = style.fontFamily ?? family;
    weight = numericWeight(style.fontWeight, weight);
    italic = isItalic(style.fontStyle, italic);
    if (node.kind.type === 'Text' || node.kind.type === 'Heading') {
      const runs = node.kind.runs?.length ? node.kind.runs : [{ content: node.kind.content }];
      for (const run of runs) pieces.push({ text: run.content, family: run.style?.fontFamily ?? family, weight: numericWeight(run.style?.fontWeight, weight), italic: isItalic(run.style?.fontStyle, italic), blockId });
    }
    for (const child of node.children) visit(child, family, weight, italic, blockId);
  }
  for (const node of doc.children) visit(node, root.fontFamily, numericWeight(root.fontWeight, 400), isItalic(root.fontStyle, false));
  return pieces;
}

/** Forme's FontRegistry::resolve order: the exact weight, the snapped weight, then the opposite one. */
function resolveWeight<T>(lookup: (weight: number) => T | undefined, weight: number): T | undefined {
  const snapped = weight >= 600 ? 700 : 400;
  for (const candidate of [weight, snapped, snapped === 700 ? 400 : 700]) {
    const found = lookup(candidate);
    if (found) return found;
  }
  return undefined;
}

function fontBytes(src: FontRegistration['src']): Buffer {
  if (typeof src !== 'string') return Buffer.from(src);
  if (src.startsWith('data:')) return Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
  return readFileSync(src);
}

/**
 * Glyph coverage of the face a family resolves to. Unregistered families and missing
 * styles cover nothing, as in the engine, whose built-in faces have no Arabic.
 */
function registeredCoverage(doc: FormeDocument) {
  const sources = new Map<string, FontRegistration['src']>();
  for (const font of doc.fonts ?? []) sources.set(`${font.family}:${font.weight ?? 400}:${!!font.italic}`, font.src);
  const opened = new Map<string, Font | null>();
  return (family: string, weight: number, italic: boolean, point: number): boolean => {
    const key = resolveWeight(candidate => sources.has(`${family}:${candidate}:${italic}`) ? `${family}:${candidate}:${italic}` : undefined, weight);
    if (!key) return false;
    if (!opened.has(key)) {
      try { const font = createFont(fontBytes(sources.get(key)!)); opened.set(key, 'hasGlyphForCodePoint' in font ? font : null); }
      catch { opened.set(key, null); }
    }
    // A face OpenDoc cannot inspect counts as covering; the engine still reports real gaps.
    return opened.get(key)?.hasGlyphForCodePoint(point) ?? true;
  };
}

/** The built-in Noto Naskh Arabic revision, or nothing when this workspace lacks a usable copy. */
function builtInFallback(root: string) {
  try {
    const head = readAssetHead(root, 'font', ARABIC_FALLBACK_ASSET);
    if (!head.builtIn) return undefined;
    const revision = readAssetRevision(root, 'font', ARABIC_FALLBACK_ASSET, head.revision);
    if (revision.kind !== 'font') return undefined;
    const faces = revision.faces.filter(face => face.style === 'normal').map(face => ({ face, path: assetFile(root, 'font', ARABIC_FALLBACK_ASSET, face.file) }));
    if (!faces.length) return undefined;
    return { revision: revision as FontRevision, faces: faces.map(({ face, path }) => ({ face, path, font: createFont(readFileSync(path)) as Font })) };
  } catch { return undefined; }
}

/**
 * Append the built-in Arabic family as the last font fallback when the document has
 * Arabic-script text that none of its chosen fonts (including theme fallbacks) can draw.
 * Documents without such text are returned untouched, so their PDFs stay byte for byte
 * the same. Only faces that the text actually resolves to are registered.
 */
export function applyScriptFallback(doc: FormeDocument, root: string): ScriptFallback | undefined {
  const pieces = textPieces(doc).filter(piece => arabicScript.test(piece.text));
  if (!pieces.length) return undefined;
  const covers = registeredCoverage(doc);
  const uncovered = pieces.map(piece => {
    const chain = fontFamilies(piece.family ?? '');
    const missing = new Set<number>();
    for (const character of piece.text) {
      const point = character.codePointAt(0)!;
      if (arabicScript.test(character) && !chain.some(family => covers(family, piece.weight, piece.italic, point))) missing.add(point);
    }
    return { piece, missing };
  }).filter(item => item.missing.size);
  if (!uncovered.length) return undefined;
  const fallback = builtInFallback(root);
  if (!fallback) return undefined;
  const family = assetFontFamily({ id: ARABIC_FALLBACK_ASSET, revision: fallback.revision.revision });
  const faceFor = (weight: number) => resolveWeight(candidate => fallback.faces.find(item => item.face.weight === candidate), weight);
  const needed = new Map<string, { face: FontFace; path: string; weight: number; italic: boolean }>();
  const uses: AssetUse[] = [];
  for (const { piece, missing } of uncovered) {
    const chosen = faceFor(piece.weight);
    if (!chosen || ![...missing].some(point => chosen.font.hasGlyphForCodePoint(point))) continue;
    // The family has no italics; Arabic has no italic convention, so an italic run uses upright faces.
    needed.set(`${chosen.face.id}:${piece.italic}`, { face: chosen.face, path: chosen.path, weight: chosen.face.weight, italic: piece.italic });
    const use: AssetUse = { kind: 'font', id: ARABIC_FALLBACK_ASSET, revision: fallback.revision.revision, face: chosen.face.id, ...(piece.blockId ? { blockId: piece.blockId } : {}) };
    if (!uses.some(item => item.face === use.face && item.blockId === use.blockId)) uses.push(use);
  }
  if (!needed.size) return undefined;
  const registered = new Set((doc.fonts ?? []).map(font => `${font.family}:${font.weight ?? 400}:${!!font.italic}`));
  doc.fonts = [...(doc.fonts ?? [])];
  for (const item of needed.values()) {
    if (!registered.has(`${family}:${item.weight}:${item.italic}`)) doc.fonts.push({ family, src: item.path, weight: item.weight, italic: item.italic });
  }
  const append = (style: FormeStyle | undefined) => {
    if (typeof style?.fontFamily === 'string' && !fontFamilies(style.fontFamily).includes(family)) style.fontFamily = `${style.fontFamily}, ${family}`;
  };
  append(doc.defaultStyle);
  const visit = (node: FormeNode) => {
    append(node.style);
    if (node.kind.type === 'Text' || node.kind.type === 'Heading') node.kind.runs?.forEach(run => append(run.style));
    node.children.forEach(visit);
  };
  doc.children.forEach(visit);
  const directory = assetDirectory(root, 'font', ARABIC_FALLBACK_ASSET);
  const dependencies = [resolve(directory, 'asset.json'), assetRevisionPath(root, 'font', ARABIC_FALLBACK_ASSET, fallback.revision.revision), ...[...needed.values()].map(item => item.path)];
  return { family, uses, dependencies: [...new Set(dependencies.map(file => relative(root, file)))].sort() };
}
