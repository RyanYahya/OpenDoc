import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { readFileSync, realpathSync } from 'node:fs';
import { createTextSourceResolver, createJsonTextSourceResolver, type TextSourceResolver } from './text-source';
import { attachTextLines } from './text-layout';
import type { TextGlobals } from '../document/text-targets';
import type { TextTarget } from '../shared/selection';
import { createHash } from 'node:crypto';
import { renderDocumentSource } from './render-source';
import type { MediaUse } from '../shared/media';
import type { AssetUse, DocumentAssets } from '../shared/assets';
import { readDocumentAssetsAt, resolveThemeAssets } from '../assets/files';
import type { LayoutInfo, ElementInfo } from '@formepdf/core';
import type { BlockInfo, DocumentMeta, DocumentProvenance, RenderArtifact, Fragment, DocumentFormat, SlideInfo } from '../shared/types';
import { RenderFailure } from './render-error';
import { inspectLayout, assertLayoutSafe, assertSlideLayout } from './preflight';
import { inspectPresentationCompatibility } from './pptx-compatibility';
import { containedFile } from './files';
import { readProjects } from './projects';
import { originalBinding, type SourceOverride } from './source-overrides';
import { runtimeSource } from '../runtime/paths';

const [inputEntry, destination, overrideFlag] = process.argv.slice(2);
const entry = realpathSync(inputEntry);
const root = process.cwd();
const sourceOverrides = overrideFlag ? await new Promise<SourceOverride[]>(accept => process.once('message', (message: { sourceOverrides: SourceOverride[] }) => accept(message.sourceOverrides))) : [];
const overrides = new Map(sourceOverrides.map(override => [override.file, override]));
const globalState = globalThis as TextGlobals & { __opendocTemplateValidated?: boolean; __opendocDataFile?: string; __opendocRoot?: string; __opendocDocumentDirectory?: string; __opendocDocumentAssets?: DocumentAssets; __opendocCapture?: { format: DocumentFormat; slides: SlideInfo[]; themeId: string; meta: DocumentMeta; blocks: Record<string, BlockInfo>; provenance?: Partial<DocumentProvenance>; media?: MediaUse[]; assets?: AssetUse[]; assetBindings?: DocumentAssets; assetDependencies?: string[]; textTargets?: TextTarget[] } };
globalState.__opendocRoot = root;
globalState.__opendocDocumentDirectory = dirname(entry);
const documentDirectory = realpathSync(dirname(entry));
const resolvers = new Map<string, TextSourceResolver>();
const fieldResolvers = new Map<string, ReturnType<typeof createJsonTextSourceResolver>>();
function documentFile(file: string) {
  try {
    const absolute = realpathSync(resolve(root, file));
    return absolute.startsWith(documentDirectory + sep) ? absolute : undefined;
  } catch { return undefined; }
}
globalState.__opendocResolveTextSource = (location, slot, childIndex) => {
  const absolute = documentFile(location.file);
  if (!absolute || !/\.[cm]?[jt]sx?$/.test(absolute)) return undefined;
  let resolver = resolvers.get(absolute);
  if (!resolver) { resolver = createTextSourceResolver(relative(root, absolute), overrides.get(absolute)?.contents ?? readFileSync(absolute, 'utf8')); resolvers.set(absolute, resolver); }
  return originalBinding(resolver.resolveAt(location.line, location.column, slot, childIndex), overrides.get(absolute));
};
globalState.__opendocResolveTextField = field => {
  const absolute = globalState.__opendocDataFile && documentFile(globalState.__opendocDataFile);
  if (!absolute || !absolute.endsWith('.json')) return undefined;
  let resolver = fieldResolvers.get(absolute);
  if (!resolver) { resolver = createJsonTextSourceResolver(relative(root, absolute), overrides.get(absolute)?.contents ?? readFileSync(absolute, 'utf8')); fieldResolvers.set(absolute, resolver); }
  return originalBinding(resolver(field), overrides.get(absolute));
};

function pagesFromLayout(layout: LayoutInfo, blocks: Record<string, BlockInfo>) {
  return layout.pages.map(page => {
    const groups = new Map<string, Fragment>();
    function visit(node: ElementInfo, inherited?: string) {
      const file = node.sourceLocation?.file;
      const id = file?.startsWith('opendoc:block:') ? file.slice('opendoc:block:'.length) : inherited;
      if (id && blocks[id]) {
        if (node.textContent) blocks[id].text += `${node.textContent} `;
        if (node.width > 0 && node.height > 0) {
          const prev = groups.get(id);
          const x = node.x, y = node.y;
          const right = node.x + node.width, bottom = node.y + node.height;
          if (prev) {
            const newRight = Math.max(prev.x + prev.width, right), newBottom = Math.max(prev.y + prev.height, bottom);
            prev.x = Math.min(prev.x, x); prev.y = Math.min(prev.y, y);
            prev.width = newRight - prev.x; prev.height = newBottom - prev.y;
          } else groups.set(id, { id, x, y, width: right - x, height: bottom - y });
        }
      }
      for (const child of node.children) visit(child, id);
    }
    for (const node of page.elements) visit(node);
    return { width: page.width, height: page.height, fragments: [...groups.values()] };
  });
}

try {
  const entryPath = relative(root, entry).split(sep).join('/');
  const themePreview = /^themes\/([a-z0-9-]+)\/preview\.tsx$/.exec(entryPath)?.[1];
  const templatePreview = /^templates\/[a-z0-9-]+\/preview\.tsx$/.test(entryPath);
  if (themePreview || templatePreview) {
    const themeId = themePreview ?? 'neutral';
    const bindings = resolveThemeAssets(root, themeId);
    globalState.__opendocDocumentAssets = bindings;
    // Adapt the module in this isolated worker before a specimen's template
    // factory executes. Shared exported aliases keep the same object identity.
    const themeEntry = realpathSync(resolve(root, 'themes', themeId, 'index.ts'));
    const original = readFileSync(themeEntry, 'utf8');
    overrides.set(themeEntry, { file: themeEntry, originalDigest: createHash('sha256').update(original).digest('hex'), replacements: [],
      contents: `${original}\nimport { withDocumentAssets as __opendocWithAssets } from ${JSON.stringify(runtimeSource('assets/index.ts'))};\nObject.assign(theme, __opendocWithAssets(theme, ${JSON.stringify(bindings)}));\n` });
  } else {
    globalState.__opendocDocumentAssets = readDocumentAssetsAt(root, dirname(entry));
  }
  const source = `
    import Entry, * as definition from ${JSON.stringify(entry)};
    import { prepareDocument } from ${JSON.stringify(runtimeSource('document/index.tsx'))};
    export default function OpenDocRender() {
      globalThis.__opendocDataFile = definition.provenance?.dataFile;
      const input = typeof Entry === 'function' ? Entry() : Entry;
      const prepared = prepareDocument(input);
      globalThis.__opendocCapture = { format: prepared.format, slides: prepared.slides, themeId: prepared.themeId, meta: definition.meta, blocks: prepared.blocks, provenance: definition.provenance, media: prepared.media, assets: prepared.assets, assetBindings: prepared.assetBindings, assetDependencies: prepared.assetDependencies, textTargets: prepared.textTargets };
      return prepared.element;
    }
  `;
  const result = await renderDocumentSource(source, entry, overrides);
  if (sourceOverrides.some(override => override.file.endsWith('.json')) && !globalState.__opendocTemplateValidated) throw new Error('The document does not declare a data parser for these corrections. Ask your agent to change it.');
  const capture = globalState.__opendocCapture;
  if (!capture?.meta || typeof capture.meta.title !== 'string' || !capture.meta.title.trim()) throw new Error('Export meta with a nonempty title.');
  if (capture.meta.kind !== undefined && (typeof capture.meta.kind !== 'string' || !capture.meta.kind.trim())) throw new Error('meta.kind must be a nonempty descriptive label when supplied.');
  if (typeof capture.meta.description !== 'string') throw new Error('meta.description must be a string.');
  if (typeof capture.meta.theme !== 'string' || !capture.meta.theme.trim()) throw new Error('meta.theme must identify a theme.');
  if (capture.meta.theme !== capture.themeId) throw new Error('meta.theme must match the theme used by Document.');
  if (capture.meta.author !== undefined && typeof capture.meta.author !== 'string') throw new Error('meta.author must be a string.');
  const provenance: DocumentProvenance = { entry: relative(root, entry) };
  if (capture.provenance !== undefined) {
    if (!capture.provenance || typeof capture.provenance !== 'object' || Array.isArray(capture.provenance)) throw new Error('provenance must identify local template and data files.');
    for (const key of ['template', 'dataFile'] as const) {
      const value = capture.provenance[key];
      if (value === undefined) continue;
      if (typeof value !== 'string' || !value || value.startsWith('/') || value.split(/[\\/]/).includes('..')) throw new Error(`provenance.${key} must be a workspace-relative file path.`);
      await containedFile(root, resolve(root, value));
      provenance[key] = value;
    }
  }
  const ownerId = /^documents\/([^/]+)\/index\.tsx$/.exec(entryPath)?.[1];
  if (ownerId) {
    const manifest = await readProjects(root);
    const format = manifest.formats && Object.hasOwn(manifest.formats, ownerId) ? manifest.formats[ownerId] : 'document';
    if (capture.format !== format) throw new Error(`This ${format} must use the ${format === 'presentation' ? 'Presentation' : 'Document'} root. Create presentations with --format presentation.`);
  }
  const textTargets = capture.textTargets ?? [];
  attachTextLines(result.layout, textTargets);
  const pages = pagesFromLayout(result.layout, capture.blocks);
  if (!pages.length) throw new Error('The document rendered no pages.');
  for (const block of Object.values(capture.blocks)) {
    block.text = block.text.trim();
    if (block.source) block.source.file = relative(root, block.source.file);
  }
  if (capture.format === 'presentation') assertSlideLayout(result.layout, capture.slides, capture.blocks);
  const { issues, outline } = inspectLayout(result.layout, capture.blocks);
  if (capture.format === 'presentation') {
    // Standalone titles and low captions are intentional slide compositions.
    for (let index = issues.length - 1; index >= 0; index--) if (issues[index].code === 'stranded-heading') issues.splice(index, 1);
    for (const issue of issues) {
      const slide = capture.slides[(issue.page ?? 1) - 1];
      issue.message = `Slide ${slide?.id ?? issue.page}: ${issue.message.replace(/page (\d+)/g, 'slide $1').replace('or allow the content to flow onto another page', 'or split it into explicit slides')}`;
    }
  }
  for (const message of result.warnings) issues.push({ code: 'renderer-warning', severity: 'warning', message });
  assertLayoutSafe(issues);
  if (capture.format === 'presentation') issues.push(...inspectPresentationCompatibility(result.doc, result.layout, capture.slides, capture.blocks));
  const artifact: RenderArtifact = { meta: capture.meta, format: capture.format, ...(capture.format === 'presentation' ? { slides: capture.slides } : {}), media: capture.media ?? [], assets: capture.assets ?? [], assetBindings: capture.assetBindings, assetDependencies: capture.assetDependencies ?? [], textTargets, blocks: capture.blocks, pages, provenance, issues, outline, hash: createHash('sha256').update(result.pdf).digest('hex'), renderedAt: new Date().toISOString() };
  await mkdir(destination, { recursive: true });
  await writeFile(resolve(destination, 'document.pdf'), result.pdf);
  await writeFile(resolve(destination, 'artifact.json'), JSON.stringify(artifact, null, 2));
  await writeFile(resolve(destination, 'layout.json'), JSON.stringify(result.layout));
  if (capture.format === 'presentation') await writeFile(resolve(destination, 'presentation.json'), JSON.stringify({ version: 1, hash: artifact.hash, meta: capture.meta, slides: capture.slides, doc: result.doc, layout: result.layout }));
  process.send?.({ ok: true });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.send?.({ ok: false, error: message, ...(error instanceof RenderFailure ? { issues: error.issues } : {}) });
  if (!process.send) console.error(message);
  process.exitCode = 1;
}
