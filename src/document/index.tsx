import React, { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import * as F from '@formepdf/react';
import { relative, resolve, sep } from 'node:path';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { readyMedia, mediaUri, framedMedia, type ImageFrameOptions } from '../media/render';
import type { MediaUse } from '../shared/media';
import type { AssetUse, DocumentAssets } from '../shared/assets';
import { documentThemeAssets, withDocumentAssets, type AppliedDocumentAssets } from '../assets';
import { assetFile, assetRevisionPath, readAssetRevision } from '../assets/files';
import { neutral, themePage, themeType, validateTheme, type DocTheme, type ThemeTypeRole } from '../themes/index';
import type { BlockInfo, SourceLocation, DocumentFormat, SlideInfo } from '../shared/types';
import { Page } from './page';
import { TextCapture, TextSlot, type TextSlotProps } from './text-targets';
export { TextSlot, type TextSlotProps, type TextFieldPath } from './text-targets';

export type { DocumentMeta } from '../shared/types';
export type { DocTheme } from '../themes/index';
export { Page } from './page';
export type { PageProps } from './page';
export type { ImageFrameOptions } from '../media/render';
export { PageBreak, Em, Svg, View, Text, Link, Image } from '@formepdf/react';
/** Match the bundled semibold face; Forme does not choose the nearest weight for inline bold. */
export function Strong({ children, style }: F.StrongProps) { return <F.Strong style={{ fontWeight: 600, ...style }}><TextSlot slot="children" from="children">{children}</TextSlot></F.Strong>; }
export type Reference = { title: string; author?: string; year?: string; url?: string };
export type ReferenceMap = Record<string, Reference>;
export type CitationStyle = 'numeric' | 'author-date';
type Props = { id: string; children?: ReactNode; style?: F.Style; href?: string };
type Target = { label: string; needsCaption?: boolean };
type Endnote = { id: string; children: ReactNode };
type Runtime = {
  format: DocumentFormat; slides: SlideInfo[]; currentSlide?: string; slidePages: WeakSet<object>;
  media: MediaUse[];
  assets: AssetUse[]; managed?: AppliedDocumentAssets; currentBlock?: string;
  theme: DocTheme; refs: ReferenceMap; cited: string[]; citationStyle: CitationStyle;
  blocks: Record<string, BlockInfo>; targets: Map<string, Target>; notes: Endnote[];
  figureCount: number; tableCount: number; documentCount: number; referencesCount: number; notesCount: number;
};
let runtime: Runtime;
const roots = new Set(Object.values(F));
const nativeCharts = new Map<unknown, string>([[F.BarChart, 'BarChart'], [F.LineChart, 'LineChart'], [F.PieChart, 'PieChart'], [F.AreaChart, 'AreaChart'], [F.DotPlot, 'DotPlot']]);
type Globals = typeof globalThis & { __formeSourceMap?: WeakMap<object, SourceLocation>; __opendocRoot?: string; __opendocDocumentDirectory?: string; __opendocDocumentAssets?: DocumentAssets };
const globals = globalThis as Globals;
const blockKinds = new Map<unknown, string>();
function block<T>(fn: T, kind: string): T { blockKinds.set(fn, kind); return fn; }
const validId = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
function checkId(id: unknown, description: string): asserts id is string {
  if (typeof id !== 'string' || !validId.test(id)) throw new Error(`${description} needs a stable id (letters, numbers, dots, hyphens, underscores).`);
}
function plainText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plainText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return plainText(node.props.children);
  return '';
}
function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be nonempty text.`);
}

/** Expand pure author components once. Resolve citations and cross-references after collecting every target. */
export function prepareDocument(input: ReactNode) {
  runtime = {
    format: 'document', slides: [], slidePages: new WeakSet(),
    media: [], assets: [], theme: neutral, refs: {}, cited: [], citationStyle: 'numeric', blocks: Object.create(null), targets: new Map(), notes: [],
    figureCount: 0, tableCount: 0, documentCount: 0, referencesCount: 0, notesCount: 0,
  };
  const map = globals.__formeSourceMap ??= new WeakMap();
  const textCapture = new TextCapture(map);
  // A passed React child retains the component that constructed it. This is
  // the explicit provenance chain for TextSlot, not a search through ancestors.
  const componentOwners = new WeakMap<object, SourceLocation | undefined>();
  function elementsIn(value: unknown, found: WeakSet<object>, callback?: (element: ReactElement) => void) {
    if (!value || typeof value !== 'object' || found.has(value)) return;
    found.add(value);
    if (isValidElement(value)) callback?.(value);
    if (Array.isArray(value)) value.forEach(item => elementsIn(item, found, callback));
    else if (isValidElement(value)) elementsIn(value.props, found, callback);
    else for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if (descriptor.enumerable && 'value' in descriptor) elementsIn(descriptor.value, found, callback);
    }
  }
  const deferred = new WeakMap<object, { parentId?: string; source?: SourceLocation; slideId?: string }>();
  let proseDepth = 0;
  const lateTypes = new Set([Cite, References, CrossReference, Note, Notes]);
  function typesetProse(input: ReactNode, paragraphGap = 0): ReactNode {
    if (!Number.isFinite(paragraphGap) || paragraphGap < 0) throw new Error('Prose paragraphGap must be a finite, non-negative number.');
    let continuation = false;
    function format(node: ReactNode): ReactNode {
      if (Array.isArray(node)) return node.map(format);
      if (!isValidElement<{ children?: ReactNode; style?: F.Style }>(node)) return node;
      const location = map.get(node);
      const id = location?.file.startsWith('opendoc:block:') ? location.file.slice('opendoc:block:'.length) : undefined;
      const kind = id ? runtime.blocks[id]?.kind : undefined;
      const isParagraph = node.type === F.Text && kind === 'paragraph';
      if (isParagraph) {
        const style = node.props.style ?? {};
        const em = style.fontSize ?? runtime.theme.fontSize;
        // An isolated em-space run has a fixed advance in Forme. A leading
        // whitespace string is stretchable glue and is NOT a reliable indent.
        // No tabs, word joiners, manual line splitting, or whole-block padding.
        const spacer = continuation ? <F.Text style={{ fontSize: em * 1.5 }}>{'\u2003'}</F.Text> : null;
        continuation = true;
        const result = React.cloneElement(node, { style: { lineBreaking: 'greedy', ...style, marginBottom: paragraphGap } }, spacer, node.props.children);
        if (location) map.set(result, location);
        textCapture.copy(node, result);
        return result;
      }
      // Inline text and deferred references belong to the current paragraph;
      // don't treat their runs as new paragraphs or disturb citation identity.
      if (node.type === F.Text || lateTypes.has(node.type as typeof Cite)) return node;
      if (kind && ['figure', 'table', 'callout', 'code', 'list', 'title'].includes(kind)) { continuation = false; return node; }
      const separates = kind && ['heading', 'section', 'figure', 'table', 'callout', 'code', 'list', 'title', 'block'].includes(kind);
      if (separates || node.type === F.PageBreak || !node.props.children) continuation = false;
      const result = React.cloneElement(node, {}, format(node.props.children));
      if (location) map.set(result, location);
      textCapture.copy(node, result);
      if (separates && kind !== 'section' && kind !== 'heading' && kind !== 'block') continuation = false;
      return result;
    }
    return format(input);
  }
  function visit(node: ReactNode, parentId?: string, caller?: SourceLocation, resolving = false): ReactNode {
    if (Array.isArray(node)) return node.map(child => visit(child, parentId, caller, resolving));
    if (!isValidElement(node)) {
      if (runtime.format === 'presentation' && !runtime.currentSlide && (typeof node === 'string' || typeof node === 'number') && String(node).trim()) throw new Error('Presentation content must be inside a Slide.');
      return node;
    }
    const el = node as ReactElement<Record<string, any>>;
    if (runtime.format === 'presentation') {
      if (el.type === F.PageBreak || el.type === Pages || el.type === F.Fixed) throw new Error(`Slide ${runtime.currentSlide ?? ''}: flowing pages, page breaks, and running furniture are not supported in presentations.`);
      if ((el.type === Page || el.type === F.Page) && !runtime.slidePages.has(el)) throw new Error('Presentations must use Slide instead of Page or Pages.');
      if (el.type === Slide && runtime.currentSlide) throw new Error(`Slide ${runtime.currentSlide}: slides cannot nest.`);
      if (roots.has(el.type as never) && el.type !== F.Document && !runtime.currentSlide) throw new Error('Presentation content must be inside a Slide.');
    }
    if (el.type === TextSlot) {
      const props = el.props as TextSlotProps;
      return textCapture.wrap(visit(props.children, parentId, caller, resolving), props, componentOwners.get(el));
    }
    const nativeChart = nativeCharts.get(el.type);
    if (nativeChart) throw new Error(`${parentId ? `${parentId}: ` : ''}${nativeChart} is not supported by the current PDF engine with OpenDoc fonts: chart labels are encoded incorrectly. Generate a local chart asset inside Figure and review its labels, units, scale, and legend.`);
    const ownSource = map.get(el);
    const source = ownSource?.file.includes('/src/document/') ? caller ?? ownSource : ownSource ?? caller;
    if (el.type === Prose) {
      if (proseDepth) throw new Error('Prose regions cannot nest. Use separate sibling regions to restart paragraph flow.');
      proseDepth++;
      try { return typesetProse(visit(el.props.children, parentId, source, resolving), el.props.paragraphGap); }
      finally { proseDepth--; }
    }
    let id = parentId;
    if (el.type === Media || el.type === MediaFrame) runtime.media.push({ item: el.props.item, blockId: parentId });
    if (el.type === Page && el.props.backgroundMedia !== undefined) runtime.media.push({ item: el.props.backgroundMedia, blockId: parentId });
    if (el.type === Slide && el.props.backgroundMedia !== undefined) runtime.media.push({ item: el.props.backgroundMedia, blockId: el.props.id });
    const kind = blockKinds.get(el.type);
    if (kind) {
      id = el.props.id;
      checkId(id, kind);
      if (Object.hasOwn(runtime.blocks, id)) throw new Error(`Duplicate block id: ${id}. Keep every block ID unique within a document.`);
      runtime.blocks[id] = { id, kind, source, text: '', ...(runtime.currentSlide || kind === 'slide' ? { slideId: kind === 'slide' ? id : runtime.currentSlide } : {}) };
      if (kind === 'paragraph' && el.props.maxLines !== undefined) {
        if (!Number.isInteger(el.props.maxLines) || el.props.maxLines < 1) throw new Error(`Paragraph ${id} maxLines must be a positive integer.`);
        runtime.blocks[id].maxLines = el.props.maxLines;
      }
      if (kind === 'heading' || kind === 'section') {
        const title = plainText(kind === 'section' ? el.props.title : el.props.children);
        requireText(title, `${kind} ${id} title`);
        runtime.targets.set(id, { label: title.trim() });
      } else if (kind === 'figure' || kind === 'table') {
        const number = kind === 'figure' ? ++runtime.figureCount : ++runtime.tableCount;
        runtime.targets.set(id, { label: `${kind === 'figure' ? 'Figure' : 'Table'} ${number}`, needsCaption: kind === 'table' && !el.props.caption });
      }
    }
    if (!resolving && lateTypes.has(el.type as typeof Cite)) {
      if (el.type === Cite) {
        checkId(el.props.source, 'Citation source');
        if (!runtime.cited.includes(el.props.source)) runtime.cited.push(el.props.source);
      }
      if (el.type === References) runtime.referencesCount++;
      if (el.type === Notes) runtime.notesCount++;
      if (el.type === Note) {
        checkId(el.props.id, 'Note');
        if (runtime.notes.some(note => note.id === el.props.id)) throw new Error(`Duplicate note id: ${el.props.id}.`);
        requireText(plainText(el.props.children), `Note ${el.props.id}`);
        // Note bodies are prepared now so citations in them join the same reference list.
        const note = { id: el.props.id, children: visit(el.props.children, parentId, source) };
        runtime.notes.push(note);
      }
      deferred.set(el, { parentId: id, source, slideId: runtime.currentSlide });
      return el;
    }
    if (typeof el.type === 'function' && !roots.has(el.type as never)) {
      const inputs = new WeakSet<object>();
      elementsIn(el.props, inputs);
      const previousBlock = runtime.currentBlock;
      const previousSlide = runtime.currentSlide;
      runtime.currentBlock = id;
      if (el.type === Slide) runtime.currentSlide = id;
      let output: ReactNode;
      try {
        output = (el.type as (p: unknown) => ReactNode)(el.props);
        elementsIn(output, new WeakSet(), element => {
          if (!inputs.has(element) && !componentOwners.has(element)) componentOwners.set(element, ownSource);
        });
        return visit(output, id, source, resolving);
      } finally { runtime.currentBlock = previousBlock; runtime.currentSlide = previousSlide; }
    }
    if (el.type === React.Fragment) return visit(el.props.children, id, source, resolving);
    const cloned = createElement(el.type, { ...el.props, key: el.key }, visit(el.props.children, id, source, resolving));
    const location = id ? { file: `opendoc:block:${id}`, line: 1, column: 1 } : map.get(el);
    if (location) map.set(cloned, location);
    textCapture.remember(cloned, ownSource);
    return cloned;
  }
  const collected = visit(input);
  if (runtime.documentCount !== 1) throw new Error('A document must contain exactly one OpenDoc Document root.');
  if (runtime.format === 'presentation' && !runtime.slides.length) throw new Error('A presentation needs at least one Slide.');
  if (runtime.referencesCount > 1) throw new Error('Use one References list per document.');
  if (runtime.notesCount > 1) throw new Error('Use one Notes list per document.');
  for (const key of runtime.cited) {
    if (!Object.hasOwn(runtime.refs, key)) throw new Error(`Unknown citation source: ${key}`);
    const ref = runtime.refs[key];
    if (runtime.citationStyle === 'author-date' && (!ref.author?.trim() || !ref.year?.trim())) {
      throw new Error(`Source ${key} needs author and year for author-date citations.`);
    }
  }
  if (runtime.cited.length && !runtime.referencesCount) throw new Error('This document contains citations. Add <References /> to include their source records.');
  if (runtime.notes.length && !runtime.notesCount) throw new Error('This document contains notes. Add <Notes /> to include their text.');
  function finish(node: ReactNode): ReactNode {
    if (Array.isArray(node)) return node.map(finish);
    if (!isValidElement(node)) return node;
    const el = node as ReactElement<Record<string, any>>;
    const pending = deferred.get(el);
    if (pending) {
      const previousSlide = runtime.currentSlide;
      runtime.currentSlide = pending.slideId;
      try { return textCapture.protect(finish(visit(el, pending.parentId, pending.source, true)), 'Generated reference content. Ask your agent to change its inputs.'); }
      finally { runtime.currentSlide = previousSlide; }
    }
    const cloned = createElement(el.type, { ...el.props, key: el.key }, finish(el.props.children));
    const location = map.get(el);
    if (location) map.set(cloned, location);
    textCapture.copy(el, cloned);
    return cloned;
  }
  type FontStyle = { family?: string; weight: number; renderedWeight?: number; style: string };
  const headings = new Set<unknown>([F.H1, F.H2, F.H3, F.H4, F.H5, F.H6]);
  function applyFonts(node: ReactNode, inherited: FontStyle = { weight: 400, style: 'normal' }, parentId?: string): ReactNode {
    if (Array.isArray(node)) return node.map(child => applyFonts(child, inherited, parentId));
    if (!isValidElement(node)) {
      if ((typeof node === 'string' || typeof node === 'number') && String(node).trim() && inherited.family) {
        const font = runtime.managed?.fonts.get(inherited.family);
        if (font) {
          const face = font.faces.find(face => face.weight === (inherited.renderedWeight ?? inherited.weight) && face.style === inherited.style);
          if (!face) throw new Error(`Font “${font.name}” does not include ${inherited.renderedWeight ?? inherited.weight} ${inherited.style}${parentId ? ` (block ${parentId})` : ''}. Add this face and rebind the document, or choose a style that the family provides.`);
          const use: AssetUse = { kind: 'font', id: font.id, revision: font.revision, face: face.id, ...(parentId ? { blockId: parentId } : {}) };
          if (!runtime.assets.some(item => item.kind === use.kind && item.id === use.id && item.revision === use.revision && item.face === use.face && item.blockId === use.blockId)) runtime.assets.push(use);
        }
      }
      return node;
    }
    const el = node as ReactElement<Record<string, any>>;
    const location = map.get(el);
    const id = location?.file.startsWith('opendoc:block:') ? location.file.slice('opendoc:block:'.length) : parentId;
    const style: F.Style = el.props.style ?? {};
    const weight = style.fontWeight === 'bold' ? 700 : style.fontWeight === 'normal' ? 400 : style.fontWeight;
    const current: FontStyle = {
      family: style.fontFamily ?? (el.type === F.Code ? 'Courier' : inherited.family),
      weight: weight ?? (el.type === F.Strong || headings.has(el.type) ? 700 : inherited.weight),
      style: style.fontStyle ?? (el.type === F.Em ? 'italic' : inherited.style),
    };
    const font = current.family && runtime.managed?.fonts.get(current.family);
    // Emphasis may use the family's real bold face when semibold is absent.
    // Resolve the run's true weight; registering bold bytes as 600 causes spacing errors.
    const fallback = !!font && current.weight === 600 && !font.faces.some(face => face.weight === 600 && face.style === current.style) && font.faces.some(face => face.weight === 700 && face.style === current.style);
    current.renderedWeight = fallback ? 700 : current.weight;
    const naturalWeight = weight ?? (el.type === F.Strong || headings.has(el.type) ? 700 : inherited.renderedWeight ?? inherited.weight);
    // Preserve the requested weight through nested style changes. A bold fallback
    // on a parent must not hide an available semibold italic face on its child.
    const adjusted = current.renderedWeight !== naturalWeight;
    const cloned = createElement(el.type, { ...el.props, ...(adjusted ? { style: { ...style, fontWeight: current.renderedWeight } } : {}), key: el.key }, applyFonts(el.props.children, current, id));
    if (location) map.set(cloned, location);
    textCapture.copy(el, cloned);
    return cloned;
  }
  const finished = finish(collected);
  const complete = textCapture.complete(runtime.managed?.fonts.size ? applyFonts(finished) : finished);
  return { ...complete, blocks: runtime.blocks, media: runtime.media, assets: runtime.assets, assetBindings: runtime.managed?.bindings,
    assetDependencies: [...(runtime.managed?.dependencies ?? [])].sort(), themeId: runtime.theme.id, format: runtime.format, slides: runtime.slides };
}

/** A deck uses the same document runtime, fonts, assets, references, and text bindings. */
export function Presentation(props: Parameters<typeof Document>[0]) {
  if (runtime.documentCount || runtime.format === 'presentation') throw new Error('Presentation must be the single root.');
  runtime.format = 'presentation';
  return <Document {...props} />;
}

export const SLIDE_SIZE = { width: 960, height: 540 } as const;
export type SlideProps = Pick<import('./page').PageProps, 'backgroundMedia' | 'backgroundImage' | 'backgroundOpacity' | 'backgroundSize' | 'backgroundPosition'> & {
  id: string; children?: ReactNode; padding?: number; style?: F.Style;
};
/** Fixed canvas: content must fit; the worker rejects clipping or continuation pages. */
export const Slide = block(function Slide({ id, children, padding = 40, style, ...background }: SlideProps) {
  if (runtime.format !== 'presentation') throw new Error('Slide must be inside Presentation.');
  if (!Number.isFinite(padding) || padding < 0 || padding >= SLIDE_SIZE.height / 2) throw new Error(`Slide ${id}: padding must be between 0 and 270 points.`);
  runtime.slides.push({ id });
  const page = Page({ ...background, size: SLIDE_SIZE, margin: 0, style: { backgroundColor: runtime.theme.paper },
    children: <F.View wrap={false} style={{ ...style, width: SLIDE_SIZE.width, height: SLIDE_SIZE.height, padding, flexShrink: 0, overflow: 'hidden' }}>{children}</F.View> });
  runtime.slidePages.add(page);
  return page;
}, 'slide');

export function Document({ title, author, theme = neutral, references = {}, citationStyle = 'numeric', children }: {
  title: string; author?: string; theme?: DocTheme; references?: ReferenceMap; citationStyle?: CitationStyle; children: ReactNode;
}) {
  runtime.documentCount++;
  if (!documentThemeAssets(theme) && globals.__opendocDocumentAssets) theme = withDocumentAssets(theme, globals.__opendocDocumentAssets);
  runtime.managed = documentThemeAssets(theme);
  // Authored theme registrations keep their own bounded contract. Each managed
  // family is separately validated and may contribute up to 24 additional faces.
  validateTheme(runtime.managed ? { ...theme, fonts: theme.fonts?.filter(font => !runtime.managed!.fonts.has(font.family)) } : theme);
  requireText(title, 'Document title');
  if (!['numeric', 'author-date'].includes(citationStyle)) throw new Error('citationStyle must be numeric or author-date.');
  if (!references || typeof references !== 'object' || Array.isArray(references)) throw new Error('references must be an object of named source records.');
  for (const [key, ref] of Object.entries(references)) {
    checkId(key, 'Reference key');
    if (!ref || typeof ref !== 'object') throw new Error(`Source ${key} must be a reference record.`);
    requireText(ref.title, `Source ${key} title`);
    if (ref.author !== undefined) requireText(ref.author, `Source ${key} author`);
    if (ref.year !== undefined) requireText(ref.year, `Source ${key} year`);
    if (ref.url !== undefined) {
      try {
        const url = new URL(ref.url);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
      } catch { throw new Error(`Source ${key} needs a valid http or https URL without credentials.`); }
    }
  }
  runtime.theme = theme;
  runtime.refs = references;
  runtime.citationStyle = citationStyle;
  const fonts: NonNullable<F.DocumentProps['fonts']> = ['Sans', 'Serif'].flatMap(family => ['Regular', 'Semibold', 'Italic', 'SemiboldItalic'].map(face => ({
    family: `OpenDoc ${family}`,
    src: resolve(globals.__opendocRoot ?? process.cwd(), 'assets/fonts', `OpenDoc${family}-${face}.ttf`),
    fontWeight: face.startsWith('Semibold') ? 600 : 400,
    fontStyle: face.endsWith('Italic') ? 'italic' as const : 'normal' as const,
  })));
  fonts.push({ family: 'OpenDoc Mono', src: resolve(globals.__opendocRoot ?? process.cwd(), 'assets/fonts/OpenDocMono-Regular.ttf'), fontWeight: 400, fontStyle: 'normal' });
  for (const font of theme.fonts ?? []) {
    const root = realpathSync(globals.__opendocRoot ?? process.cwd());
    const path = resolve(root, font.src);
    let local: string;
    try { local = realpathSync(path); } catch { throw new Error(`Theme ${theme.id}: font file ${font.src} was not found.`); }
    if (!local.startsWith(root + sep) || !statSync(local).isFile()) throw new Error(`Theme ${theme.id}: font ${font.src} must be a file inside this workspace.`);
    const managedRoot = realpathSync(resolve(root, font.src.startsWith('assets/') ? 'assets' : `themes/${theme.id}`));
    if (!local.startsWith(managedRoot + sep)) throw new Error(`Theme ${theme.id}: font ${font.src} must stay inside its theme or shared assets folder.`);
    fonts.push({ ...font, src: local });
  }
  const registered = new Set(fonts.map(font => font.family));
  const families = new Set([theme.body, theme.heading]);
  function collectFonts(value: unknown) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'fontFamily' && typeof item === 'string') families.add(item);
      else if (item && typeof item === 'object') collectFonts(item);
    }
  }
  collectFonts(theme.design);
  for (const family of families) if (!registered.has(family)) throw new Error(`Theme ${theme.id}: register local font family ${family} in fonts.`);
  return <F.Document title={title} author={author} lang="en" tagged fonts={fonts} style={{ fontFamily: theme.body, fontSize: theme.fontSize, color: theme.ink, lineHeight: theme.lineHeight }}>{children}</F.Document>;
}

/** Semantic families for theme components. Read inside the component's render function. */
export function documentFont(role: 'body' | 'heading') {
  if (!runtime?.documentCount) throw new Error('documentFont must be called while rendering an OpenDoc document. Use it inside a component, not at module scope.');
  return runtime.theme[role];
}

export function Pages({ title, children, size, margin, header, footer, pageNumbers = true }: {
  title: string; children: ReactNode; size?: F.PageProps['size']; margin?: F.PageProps['margin'];
  header?: string | false; footer?: string | false; pageNumbers?: boolean;
}) {
  const t = runtime.theme;
  const furniture = t.design?.furniture;
  const headerText = header === undefined ? (t.runningHeader ? (furniture?.uppercaseHeader === false ? title : title.toUpperCase()) : false) : header;
  const footerText = footer === undefined ? (t.runningFooter ? t.footerLabel : false) : footer;
  const furnitureText = { ...themeType(t, 'small', { fontSize: 8 }), ...furniture?.text };
  return <Page {...themePage(t)} size={size ?? t.pageSize} margin={margin ?? themePage(t).margin}>
    {headerText !== false && <F.Fixed position="header"><F.Text style={{ ...furnitureText, paddingBottom: 18, ...furniture?.header }}>{headerText}</F.Text></F.Fixed>}
    {footerText !== false && <F.Fixed position="footer"><F.View style={{ borderTopWidth: 0.5, borderColor: t.line, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', ...furniture?.footer }}>
      <F.Text style={furnitureText}>{footerText}</F.Text>
      {pageNumbers && <F.Text style={furnitureText}>{furniture?.pageNumber === 'page' ? '{{pageNumber}}' : '{{pageNumber}} / {{totalPages}}'}</F.Text>}
    </F.View></F.Fixed>}{children}
  </Page>;
}

export function Cover({ eyebrow, title, subtitle, footer, idPrefix = 'cover' }: {
  eyebrow: string; title: string; subtitle: string; footer: string; idPrefix?: string;
}) {
  const t = runtime.theme;
  checkId(idPrefix, 'Cover prefix');
  requireText(title, 'Cover title');
  return <Page {...themePage(t, { top: t.margin, left: t.margin, right: t.margin, bottom: t.margin + 36 })} style={{ backgroundColor: t.paper, ...t.design?.page?.style, ...t.design?.cover?.page }}>
    <Paragraph id={`${idPrefix}-eyebrow`} style={{ ...themeType(t, 'label', { fontSize: 10, letterSpacing: 1.6 }), ...t.design?.title?.eyebrow, ...t.design?.cover?.eyebrow }}>{t.design?.title?.uppercaseEyebrow === false ? <TextSlot slot="eyebrow" from="eyebrow">{eyebrow}</TextSlot> : eyebrow.toUpperCase()}</Paragraph>
    <F.View style={{ marginTop: 72, borderTopWidth: 1, borderColor: t.accent, paddingTop: 26, ...t.design?.cover?.block }}>
      <TextSlot slot="title" from="title"><Heading id={`${idPrefix}-title`} level={1} baseStyle={{ fontSize: 44, lineHeight: 1.1, marginBottom: 26 }} style={t.design?.cover?.title}>{title}</Heading></TextSlot>
      <TextSlot slot="subtitle" from="subtitle"><Paragraph id={`${idPrefix}-subtitle`} style={{ ...themeType(t, 'lead', { fontSize: 16, lineHeight: 1.5, color: t.muted }), ...t.design?.cover?.subtitle }}>{subtitle}</Paragraph></TextSlot>
    </F.View>
    <F.Fixed position="footer"><TextSlot slot="footer" from="footer"><Paragraph id={`${idPrefix}-footer`} style={{ ...themeType(t, 'small', { fontSize: 10, color: t.accent }), marginBottom: 0, ...t.design?.furniture?.text, ...t.design?.cover?.footer }}>{footer}</Paragraph></TextSlot></F.Fixed>
  </Page>;
}

export const Heading = block(function Heading({ level = 2, children, style, baseStyle, bookmark }: Props & { level?: 1 | 2 | 3; baseStyle?: F.Style; bookmark?: string | false }) {
  const t = runtime.theme;
  const Tag = level === 1 ? F.H1 : level === 2 ? F.H2 : F.H3;
  return <Tag bookmark={bookmark === false ? undefined : bookmark ?? plainText(children).trim()} style={{ ...themeType(t, `h${level}`, baseStyle), ...style }}><TextSlot slot="children" from="children">{children}</TextSlot></Tag>;
}, 'heading');

export const Paragraph = block(function Paragraph({ children, style, baseStyle, role, href }: Props & { role?: ThemeTypeRole; baseStyle?: F.Style; maxLines?: number }) {
  return <F.Text href={href} style={{ marginBottom: runtime.theme.paragraphGap, minWidowLines: 2, minOrphanLines: 2, ...baseStyle, ...(role && runtime.theme.design?.typography?.[role]), ...style }}><TextSlot slot="children" from="children">{children}</TextSlot></F.Text>;
}, 'paragraph');

/** Continuous prose: flush openings, fixed first-line indents, optional paragraph spacing in points. */
export function Prose({ children }: { children: ReactNode; paragraphGap?: number }) { return <>{children}</>; }

export const Block = block(function Block({ children, style, keepTogether }: Props & { keepTogether?: boolean }) { return <F.View wrap={keepTogether === undefined ? undefined : !keepTogether} style={style}>{children}</F.View>; }, 'block');

/** A short opening stays with its heading; the rest of the section remains normal flowing content. */
export const Section = block(function Section({ id, title, lead, level = 2, children, style }: Props & { title: ReactNode; lead: ReactNode; level?: 1 | 2 | 3 }) {
  const leadText = plainText(lead);
  if (!leadText.trim()) throw new Error(`Section ${id} needs a short lead paragraph.`);
  if (leadText.length > 700) throw new Error(`Section ${id} lead is too long to keep with its heading. Use a short opening of up to 700 characters, then put the remaining content inside the section.`);
  return <F.View style={style}><F.View wrap={false}><TextSlot slot="title" from="title"><Heading id={`${id}-heading`} level={level}>{title}</Heading></TextSlot><TextSlot slot="lead" from="lead"><Paragraph id={`${id}-lead`}>{lead}</Paragraph></TextSlot></F.View>{children}</F.View>;
}, 'section');

export const TitleBlock = block(function TitleBlock({ id, eyebrow, title, subtitle, byline, style }: Props & { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; byline?: ReactNode }) {
  requireText(plainText(title), `TitleBlock ${id} title`);
  const t = runtime.theme;
  const titleDesign = t.design?.title;
  return <F.View wrap={false} style={{ marginBottom: 24, paddingBottom: 18, borderBottomWidth: 0.6, borderColor: t.line, ...titleDesign?.block, ...style }}>
    {eyebrow && <F.Text style={{ ...themeType(t, 'label', { marginBottom: 12 }), ...titleDesign?.eyebrow }}>{titleDesign?.uppercaseEyebrow === false ? <TextSlot slot="eyebrow" from="eyebrow">{eyebrow}</TextSlot> : eyebrow.toUpperCase()}</F.Text>}
    <TextSlot slot="title" from="title"><Heading id={`${id}-title`} level={1} baseStyle={{ fontSize: 32, marginBottom: 12 }} style={titleDesign?.heading}>{title}</Heading></TextSlot>
    {subtitle && <TextSlot slot="subtitle" from="subtitle"><Paragraph id={`${id}-subtitle`} style={{ ...themeType(t, 'lead', { marginBottom: byline ? 12 : 0 }), ...titleDesign?.subtitle }}>{subtitle}</Paragraph></TextSlot>}
    {byline && <TextSlot slot="byline" from="byline"><Paragraph id={`${id}-byline`} style={{ ...themeType(t, 'small', { fontSize: 9, marginBottom: 0 }), ...titleDesign?.byline }}>{byline}</Paragraph></TextSlot>}
  </F.View>;
}, 'title');

export const Callout = block(function Callout({ title, children, style, keepTogether }: Props & { title?: string; keepTogether?: boolean }) {
  const t = runtime.theme;
  const inlineTypes = new Set<unknown>([F.Text, F.Em, F.Strong, Strong, F.Link, Cite, CrossReference, Note, TextSlot]);
  const content: ReactNode[] = [];
  let inline: ReactNode[] = [];
  function flush() {
    if (inline.length) content.push(<F.Text key={`inline-${content.length}`} style={{ fontSize: t.fontSize, minWidowLines: 2, minOrphanLines: 2, ...t.design?.callout?.text }}>{inline}</F.Text>);
    inline = [];
  }
  function collect(node: ReactNode) {
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (isValidElement<{ children?: ReactNode }>(node) && node.type === React.Fragment) { collect(node.props.children); return; }
    if (!isValidElement(node) || inlineTypes.has(node.type)) inline.push(node);
    else { flush(); content.push(node); }
  }
  const authored = Array.isArray(children) ? children : [children];
  authored.forEach((child, childIndex) => collect(typeof child === 'string' || typeof child === 'number'
    ? <TextSlot slot="children" from="children" childIndex={childIndex}>{child}</TextSlot> : child));
  flush();
  return <F.View wrap={keepTogether === undefined ? undefined : !keepTogether} style={{ backgroundColor: t.paper, borderLeftWidth: 2, borderColor: t.accent, padding: 14, marginTop: 6, marginBottom: 18, ...t.design?.callout?.text, ...t.design?.callout?.block, ...style }}>
    {title && <F.Text style={{ ...themeType(t, 'label', { fontWeight: 600, fontSize: 10, letterSpacing: 0 }), marginBottom: 6, ...t.design?.callout?.title }}><TextSlot slot="title" from="title">{title}</TextSlot></F.Text>}
    {content}
  </F.View>;
}, 'callout');

const ListEntry = block(function ListEntry({ id, children, ordered, number }: Props & { ordered: boolean; number: number }) {
  if (!plainText(children).trim()) throw new Error(`List item ${id} needs nonempty text.`);
  // Native Forme lists mismeasure wrapped items and can panic on page breaks.
  // Normal flex rows use the same text width during measurement and drawing.
  const design = runtime.theme.design?.list;
  const markerWidth = Math.max(design?.markerWidth ?? 18, String(number).length * runtime.theme.fontSize * 0.7);
  return <F.View wrap={false} style={{ flexDirection: 'row', gap: design?.gap ?? 8, marginBottom: 7, ...design?.item }}>
    <F.Text style={{ width: markerWidth, flexShrink: 0 }}>{ordered ? `${number}.` : '•'}</F.Text>
    <F.Text style={{ flex: 1, minWidth: 0, minWidowLines: 2, minOrphanLines: 2, lineBreaking: 'greedy' }}>{children}</F.Text>
  </F.View>;
}, 'list-item');
export const List = block(function List({ id, items, ordered = false, start = 1, style }: {
  id: string; items: { id: string; children: ReactNode }[]; ordered?: boolean; start?: number; style?: F.Style;
}) {
  if (!Array.isArray(items) || !items.length) throw new Error(`List ${id} needs at least one item. Omit the List when there is nothing to show.`);
  if (!Number.isSafeInteger(start) || start < 1) throw new Error(`List ${id} start must be a positive integer.`);
  const children = items.map((item, index) => { checkId(item.id, `List ${id} item`); return <ListEntry id={`${id}-${item.id}`} key={item.id} ordered={ordered} number={start + index}>{item.children}</ListEntry>; });
  const listStyle: F.Style = { marginBottom: runtime.theme.paragraphGap, paddingLeft: 18, ...runtime.theme.design?.list?.block, ...style };
  return <F.View style={listStyle}>{children}</F.View>;
}, 'list');

export const CodeBlock = block(function CodeBlock({ id, children, language, caption, style, tabSize = 4 }: {
  id: string; children: string; language?: string; caption?: string; style?: F.Style; tabSize?: 2 | 4 | 8;
}) {
  if (typeof children !== 'string' || !children.trim()) throw new Error(`CodeBlock ${id} needs nonempty source text.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(children)) throw new Error(`CodeBlock ${id} contains unsupported control characters.`);
  if (![2, 4, 8].includes(tabSize)) throw new Error(`CodeBlock ${id} tabSize must be 2, 4, or 8.`);
  const t = runtime.theme;
  const code = children.replace(/\r\n?/g, '\n').replace(/\t/g, ' '.repeat(tabSize));
  return <F.View style={{ marginTop: 8, marginBottom: 18, ...t.design?.code?.block, ...style }}>
    {(caption || language) && <F.Text style={themeType(t, 'caption', { marginBottom: 7 })}><TextSlot slot="caption" from="caption">{caption}</TextSlot>{caption && language ? ' / ' : ''}<TextSlot slot="language" from="language">{language}</TextSlot></F.Text>}
    <F.View style={{ padding: 14, backgroundColor: t.paper, ...t.design?.code?.panel }}><F.Text style={{ ...themeType(t, 'code'), minWidowLines: 2, minOrphanLines: 2, hyphens: 'none', lineBreaking: 'greedy' }}><TextSlot slot="children" from="children">{code}</TextSlot></F.Text></F.View>
  </F.View>;
}, 'code');

function numberedCaption(id: string, caption: string) {
  const label = runtime.targets.get(id)!.label;
  // Preserve the original API, whose callers supplied their own numbered captions.
  const numbered = caption.match(/^(Figure|Table)\s+\d+[.:]\s/i);
  if (numbered) {
    if (numbered[0].replace(/[.:]\s$/, '').toLowerCase() !== label.toLowerCase()) throw new Error(`${id} caption numbering does not match ${label}. Remove the manual number and OpenDoc will keep the caption and cross-references in sync.`);
    return <TextSlot slot="caption" from="caption">{caption}</TextSlot>;
  }
  return <><TextSlot slot="caption-number" reason="Numbered label. Ask your agent to change the figure or table order.">{label}. </TextSlot><TextSlot slot="caption" from="caption">{caption}</TextSlot></>;
}
export const Figure = block(function Figure({ id, children, caption, sourceNote, style }: Props & { caption: string; sourceNote?: string }) {
  const t = runtime.theme;
  requireText(caption, `Figure ${id} caption`);
  return <F.View wrap={false} style={{ marginTop: 8, marginBottom: 18, ...t.design?.figure?.block, ...style }}>{children}
    <F.Text style={themeType(t, 'caption', { marginTop: 8 })}>{numberedCaption(id, caption)}</F.Text>
    {sourceNote && <F.Text style={themeType(t, 'small', { marginTop: 4 })}><TextSlot slot="sourceNote" from="sourceNote">{sourceNote}</TextSlot></F.Text>}
  </F.View>;
}, 'figure');

export type TableColumn = { label: string; width?: number; align?: 'left' | 'center' | 'right' };
export const DataTable = block(function DataTable({ id, columns, rows, rowIds, caption, sourceNote, emptyMessage = 'No records to display.', style }: {
  id: string; columns: TableColumn[]; rows: (string | number | ReactElement<TextSlotProps>)[][]; rowIds?: string[]; caption?: string; sourceNote?: string; emptyMessage?: string; style?: F.Style;
}) {
  const t = runtime.theme;
  if (!Array.isArray(columns) || !columns.length) throw new Error(`Table ${id} needs at least one column.`);
  if (columns.some(column => !column || typeof column !== 'object' || Array.isArray(column))) throw new Error(`Table ${id} columns must be objects with a label and optional width or alignment.`);
  const total = columns.reduce((sum, c) => sum + (c.width ?? 1), 0);
  if (columns.some(c => !Number.isFinite(c.width ?? 1) || (c.width ?? 1) <= 0) || !Number.isFinite(total)) throw new Error('Table columns need positive finite widths.');
  for (const column of columns) {
    requireText(column.label, `Table ${id} column label`);
    if (column.align !== undefined && !['left', 'center', 'right'].includes(column.align)) throw new Error(`Table ${id} column alignment must be left, center, or right.`);
  }
  if (!Array.isArray(rows) || rows.some(row => !Array.isArray(row) || row.length !== columns.length)) throw new Error('Every table row must match the number of columns.');
  rows.forEach((row, r) => row.forEach((value, c) => {
    if ((typeof value !== 'string' && typeof value !== 'number' && !(isValidElement(value) && value.type === TextSlot)) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`Table ${id} row ${r + 1}, column ${c + 1} must be text or a finite number.`);
  }));
  if (rowIds && (rowIds.length !== rows.length || new Set(rowIds).size !== rowIds.length || rowIds.some(value => typeof value !== 'string' || !value))) throw new Error(`Table ${id} rowIds must identify every row uniquely.`);
  requireText(emptyMessage, `Table ${id} emptyMessage`);
  const alignments = columns.map((column, i) => column.align ?? (rows.length && rows.every(row => typeof row[i] === 'number') ? 'right' : 'left'));
  const noteStyle = themeType(t, 'caption');
  const design = t.design?.table;
  const alternate = design?.alternate === false ? '#ffffff' : design?.alternate ?? t.paper;
  return <F.Table columns={columns.map(c => ({ width: { fraction: (c.width ?? 1) / total } }))} style={{ marginTop: 8, marginBottom: 16, ...design?.block, ...style }}>
    {caption && <F.Row header><F.Cell colSpan={columns.length} style={{ paddingBottom: 8 }}><F.Text style={{ ...noteStyle, color: t.ink, fontWeight: 600 }}>{numberedCaption(id, caption)}</F.Text></F.Cell></F.Row>}
    <F.Row header style={{ backgroundColor: t.accent, ...design?.header }}>{columns.map((col, i) => <F.Cell key={i} style={{ padding: 9, ...design?.cell, ...design?.header }}><F.Text style={{ fontFamily: 'OpenDoc Sans', fontSize: 9, color: '#ffffff', fontWeight: 600, ...design?.headerText, textAlign: alignments[i] }}>{col.label}</F.Text></F.Cell>)}</F.Row>
    {rows.length ? rows.map((row, i) => <F.Row key={rowIds?.[i] ?? i} style={{ backgroundColor: i % 2 === 0 ? alternate : '#ffffff' }}>{row.map((cell, j) => <F.Cell key={j} style={{ padding: 9, borderBottomWidth: 0.4, borderColor: t.line, ...design?.cell }}><F.Text style={{ fontFamily: 'OpenDoc Sans', fontSize: 10, ...design?.text, textAlign: alignments[j] }}>{isValidElement(cell) ? cell : <TextSlot slot={`row-${rowIds?.[i] ?? i}-column-${j}`} stable={false}>{typeof cell === 'number' ? String(cell) : cell}</TextSlot>}</F.Text></F.Cell>)}</F.Row>) : <F.Row><F.Cell colSpan={columns.length} style={{ padding: 12, backgroundColor: t.paper }}><F.Text style={noteStyle}>{emptyMessage}</F.Text></F.Cell></F.Row>}
    {sourceNote && <F.Row><F.Cell colSpan={columns.length} style={{ paddingTop: 8 }}><F.Text style={noteStyle}><TextSlot slot="sourceNote" from="sourceNote">{sourceNote}</TextSlot></F.Text></F.Cell></F.Row>}
  </F.Table>;
}, 'table');

function citationYear(key: string) {
  const ref = runtime.refs[key];
  const duplicates = runtime.cited.filter(other => runtime.refs[other].author === ref.author && runtime.refs[other].year === ref.year);
  let suffix = '';
  if (duplicates.length > 1) {
    let index = duplicates.indexOf(key) + 1;
    while (index > 0) { index--; suffix = String.fromCharCode(97 + index % 26) + suffix; index = Math.floor(index / 26); }
  }
  return `${ref.year}${suffix}`;
}
function authorDate(key: string) {
  return `${runtime.refs[key].author}, ${citationYear(key)}`;
}
export function Cite({ source, locator }: { source: string; locator?: string }) {
  if (locator !== undefined) requireText(locator, `Citation ${source} locator`);
  const detail = locator ? `, ${locator}` : '';
  const label = runtime.citationStyle === 'author-date' ? `(${authorDate(source)}${detail})` : `[${runtime.cited.indexOf(source) + 1}${detail}]`;
  return <F.Text style={{ color: runtime.theme.accent }}>{label}</F.Text>;
}

/** Labels are resolved from existing targets; this deliberately does not invent page numbers. */
export function CrossReference({ target, children }: { target: string; children?: ReactNode }) {
  const found = runtime.targets.get(target);
  if (!found) throw new Error(`Unknown cross-reference target: ${target}. Use a heading, section, figure, or table id from this document.`);
  if (found.needsCaption) throw new Error(`Cross-reference target ${target} needs a table caption so readers can find ${found.label}.`);
  return <F.Text style={{ color: runtime.theme.accent }}>{children ?? found.label}</F.Text>;
}

export function References({ title = 'References', id = 'references', headingStyle, headingBaseStyle }: { title?: string; id?: string; headingStyle?: F.Style; headingBaseStyle?: F.Style } = {}) {
  const entries = runtime.cited.map((key, i) => {
    const ref = runtime.refs[key];
    const prefix = runtime.citationStyle === 'author-date' ? `${ref.author} (${citationYear(key)}). ` : `[${i + 1}] ${ref.author ? `${ref.author}. ` : ''}`;
    return <Paragraph key={key} id={`reference-${key}`} href={ref.url} role="small" baseStyle={{ fontSize: 9.5 }} style={{ color: ref.url ? runtime.theme.accent : runtime.theme.ink }}>{prefix}{ref.title}{runtime.citationStyle === 'numeric' && ref.year ? ` (${ref.year})` : ''}.{ref.url ? ` ${ref.url}` : ''}</Paragraph>;
  });
  if (!entries.length) return null;
  return plainText(entries[0]).length <= 700
    ? <><F.View wrap={false}><Heading id={id} baseStyle={headingBaseStyle} style={headingStyle}>{title}</Heading>{entries[0]}</F.View>{entries.slice(1)}</>
    : <><Heading id={id} baseStyle={headingBaseStyle} style={headingStyle}>{title}</Heading>{entries}</>;
}

/** Inline markers with an explicit Notes section; these are endnotes, never simulated page footnotes. */
export function Note({ id }: { id: string; children: ReactNode }) {
  const number = runtime.notes.findIndex(note => note.id === id) + 1;
  return <F.Text style={{ color: runtime.theme.accent, fontSize: runtime.theme.fontSize * 0.8 }}> [note {number}]</F.Text>;
}
export function Notes({ title = 'Notes', id = 'notes' }: { title?: string; id?: string } = {}) {
  const entries = runtime.notes.map((note, i) => <Paragraph key={note.id} id={`note-${note.id}`} role="small" baseStyle={{ fontSize: 9.5 }}>[note {i + 1}] {note.children}</Paragraph>);
  if (!entries.length) return null;
  return plainText(entries[0]).length <= 700
    ? <><F.View wrap={false}><Heading id={id}>{title}</Heading>{entries[0]}</F.View>{entries.slice(1)}</>
    : <><Heading id={id}>{title}</Heading>{entries}</>;
}

/** Embed a document-owned image by its media folder identity. */
export function Media({ item, width, height, alt, style }: { item: string; width: number; height?: number; alt?: string; style?: F.Style }) {
  if (!Number.isFinite(width) || width <= 0 || (height !== undefined && (!Number.isFinite(height) || height <= 0))) throw new Error('Media needs a positive display width and optional positive height in points.');
  const asset = readyMedia(item);
  const scale = Math.min(width / asset.width, (height ?? Infinity) / asset.height);
  return <F.Image src={mediaUri(asset)} alt={alt ?? asset.meta.alt ?? asset.meta.description}
    style={{ ...style, width: asset.width * scale, height: asset.height * scale }} />;
}

/** An exact image box: crop without distortion, or contain the whole image with transparent padding. */
export function MediaFrame({ item, alt, style, ...frame }: ImageFrameOptions & { item: string; alt?: string; style?: F.Style }) {
  const asset = readyMedia(item);
  return <F.Image src={framedMedia(asset, frame)} alt={alt ?? asset.meta.alt ?? asset.meta.description}
    style={{ ...style, width: frame.width, height: frame.height }} />;
}

/** Embed a saved logo binding. Variation guidance is a choice for the authoring agent. */
export function Logo({ name, variation, width, height, alt, style }: { name?: string; variation?: string; width: number; height?: number; alt?: string; style?: F.Style }) {
  if (!runtime?.managed) throw new Error('This document has no saved asset selections. Bind a logo with npx opendoc assets before using Logo.');
  if (!Number.isFinite(width) || width <= 0 || (height !== undefined && (!Number.isFinite(height) || height <= 0))) throw new Error('Logo needs a positive width and optional positive height in points.');
  const bindings = runtime.managed.bindings;
  const binding = name ? (Object.hasOwn(bindings.logos ?? {}, name) ? bindings.logos![name] : undefined) : bindings.logo;
  if (!binding) throw new Error(name ? `No logo is bound as “${name}”. Inspect this document's assets and bind that name before using it.` : 'This document has no preferred logo. Bind a logo with npx opendoc assets before using <Logo />.');
  const root = globals.__opendocRoot ?? process.cwd();
  const asset = readAssetRevision(root, 'logo', binding.id, binding.revision);
  if (asset.kind !== 'logo') throw new Error(`Asset ${binding.id} is not a logo.`);
  const selected = variation ?? binding.variation ?? asset.defaultVariation;
  const artwork = asset.variations.find(item => item.id === selected);
  if (!artwork) throw new Error(`Logo “${asset.name}” has no variation “${selected}” in saved revision ${asset.revision}. Available variations: ${asset.variations.map(item => item.id).join(', ')}. Use one of these IDs or rebind to a newer revision.`);
  const file = assetFile(root, 'logo', asset.id, artwork.image);
  runtime.managed.dependencies.add(relative(root, assetRevisionPath(root, 'logo', asset.id, asset.revision)));
  runtime.managed.dependencies.add(relative(root, file));
  runtime.assets.push({ kind: 'logo', id: asset.id, revision: asset.revision, variation: artwork.id, ...(runtime.currentBlock ? { blockId: runtime.currentBlock } : {}) });
  if (!artwork.image.width || !artwork.image.height) throw new Error(`Logo “${asset.name}” has no prepared dimensions. Reimport this variation.`);
  const scale = Math.min(width / artwork.image.width, (height ?? Infinity) / artwork.image.height);
  return <F.Image src={`data:${artwork.image.mime};base64,${readFileSync(file).toString('base64')}`} alt={alt ?? `${asset.name} — ${artwork.name}`}
    style={{ ...style, width: artwork.image.width * scale, height: artwork.image.height * scale }} />;
}
