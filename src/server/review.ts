import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { lstatSync, readdirSync, renameSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { LayoutInfo } from '@formepdf/core';
import type { BlockInfo, DocumentFormat, RenderArtifact, ReviewIssue } from '../shared/types';
import { runtimeResolve } from '../runtime/paths';
import { captureEntryExportInputs, captureExportInputs } from './export-inputs';
import { ExportChangedError, outputFolder } from './export-file';
import { renderOnce, validId } from './render';
import { RenderFailure } from './render-error';
import { ThemeCatalog, themeFile } from './themes';
import { TemplateCatalog, templateFile } from './templates';
import { inspectElements, type InspectedElement } from './layout-inspection';
import { readPresentationBytes } from './pptx';

export interface ReviewTarget { kind: 'document' | 'theme' | 'template'; id: string }
export interface ReviewPage {
  page: number; width: number; height: number; image: string; text: string;
  blockIds: string[]; issues: ReviewIssue[];
  contentHash: string; elements?: InspectedElement[];
}
export interface ReviewReport extends ReviewTarget {
  version: 1; status: 'ready'; hash: string; format: DocumentFormat; renderedAt: string; pageCount: number;
  visualReview: 'required'; factualReview: 'required';
  outputs: { directory: string; pdf: string; text: string; review: string; pptx?: string };
  changes: { previousHash: string | null; changedPages: number[]; removedPages: number[] };
  powerpointVisualReview?: 'required';
  pages: ReviewPage[]; issues: ReviewIssue[]; blocks: BlockInfo[]; warning?: string;
}
export interface ReviewError extends ReviewTarget {
  status: 'error'; error: string; issues: ReviewIssue[]; updated: false; previousOutputRetained: boolean;
}
export type ReviewResult = ReviewReport | ReviewError;
const collections = { document: 'documents', theme: 'themes', template: 'templates' } as const;

/** Prepare one render for review. Neither this path nor the catalog paths inspect GUI state. */
export async function reviewTarget(root: string, target: ReviewTarget, options: { renderTimeoutMs?: number; export?: boolean } = {}): Promise<ReviewResult> {
  const { id, kind } = target;
  if (!validId(id) || !Object.hasOwn(collections, kind)) throw new Error('Choose a valid document, theme, or template ID.');
  if (options.export && kind !== 'document') throw new Error('--export requires a document or presentation ID. Use specimen review without --export.');
  let cleanup: (() => Promise<void>) | undefined;
  try {
    let artifact: RenderArtifact, bytes: Uint8Array, unchanged: () => boolean, layout: LayoutInfo | undefined, pptx: Uint8Array | undefined;
    if (kind === 'document') {
      unchanged = await captureExportInputs(root, id);
      const rendered = await renderOnce(root, id, options.renderTimeoutMs);
      cleanup = () => rm(rendered.directory, { recursive: true, force: true });
      artifact = rendered.artifact;
      bytes = await readFile(resolve(rendered.directory, 'document.pdf'));
      layout = JSON.parse(await readFile(resolve(rendered.directory, 'layout.json'), 'utf8'));
      if (options.export && artifact.format === 'presentation') {
        try { pptx = await readPresentationBytes(rendered.directory, artifact.hash); }
        catch (error) { throw new RenderFailure(message(error), artifact.issues); }
      }
    } else {
      const entry = kind === 'theme' ? await themeFile(root, id, 'preview.tsx') : await templateFile(root, id, 'preview.tsx');
      unchanged = await captureEntryExportInputs(root, entry);
      // Catalogs validate their guides, definitions, theme identities, and format before returning a specimen.
      const catalog = kind === 'theme' ? new ThemeCatalog(root) : new TemplateCatalog(root);
      cleanup = () => catalog.close();
      const preview = await catalog.preview(id);
      if (!preview.artifact) throw new RenderFailure(preview.error ?? 'Specimen rendering failed.', preview.issues);
      artifact = preview.artifact;
      bytes = await catalog.pdf(id, artifact.hash);
      layout = await catalog.layout(id, artifact.hash);
    }
    if (!unchanged()) throw new ExportChangedError();
    const report = await publishReview(root, target, artifact, bytes, unchanged, { layout, pptx });
    try { await cleanup?.(); cleanup = undefined; }
    catch (error) { report.warning = `Review artifacts were saved, but temporary render cleanup failed: ${message(error)}`; }
    return report;
  } catch (error) {
    const prior = resolve(root, 'output/reviews', collections[kind], id, 'review.json');
    const previousOutputRetained = await lstat(prior).then(info => info.isFile() && !info.isSymbolicLink(), () => false);
    return { ...target, status: 'error', error: message(error), issues: error instanceof RenderFailure ? error.issues : [], updated: false, previousOutputRetained };
  } finally { await cleanup?.().catch(() => {}); }
}

function message(error: unknown) { return error instanceof Error ? error.message : String(error); }

/** Review files are user-accessible while a new set is prepared; preserve concurrent additions and edits. */
function reviewFilesStamp(directory: string) {
  return JSON.stringify(readdirSync(directory).sort().map(name => {
    const info = lstatSync(resolve(directory, name), { bigint: true });
    if (!info.isFile() || info.isSymbolicLink() || !/^(?:document\.(?:pdf|pptx|txt)|review\.json|page-\d{3,}\.(?:png|txt))$/.test(name)) throw new Error('The review destination contains other files. Move them before creating this review.');
    return [name, `${info.dev}:${info.ino}:${info.mode}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`];
  }));
}

/** Rasterize and extract text from the exact PDF bytes, then publish the complete set together. */
export async function publishReview(root: string, target: ReviewTarget, artifact: RenderArtifact, bytes: Uint8Array, isCurrent: () => boolean, extras: { layout?: LayoutInfo; pptx?: Uint8Array } = {}): Promise<ReviewReport> {
  if (!validId(target.id) || !Object.hasOwn(collections, target.kind)) throw new Error('Invalid review target.');
  if (createHash('sha256').update(bytes).digest('hex') !== artifact.hash) throw new Error('Review PDF bytes do not match their render artifact.');
  const folder = await outputFolder(root, ['reviews', collections[target.kind]]);
  const parents = [resolve(root, 'output'), resolve(root, 'output/reviews'), folder].map(path => ({ path, info: lstatSync(path) }));
  const directory = resolve(folder, target.id);
  const previous = await lstat(directory).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
  let previousFiles: string | undefined;
  let prior: ReviewReport | undefined;
  if (previous) {
    if (!previous.isDirectory() || previous.isSymbolicLink()) throw new Error('The review destination must be a regular local directory.');
    previousFiles = reviewFilesStamp(directory);
    const manifest = resolve(directory, 'review.json');
    const manifestInfo = await lstat(manifest).catch(() => undefined);
    prior = manifestInfo?.isFile() && !manifestInfo.isSymbolicLink() ? await readFile(manifest, 'utf8').then(JSON.parse).catch(() => undefined) : undefined;
    if (prior?.version !== 1 || prior.id !== target.id || prior.kind !== target.kind) throw new Error('The review destination contains other files. Move them before creating this review.');
  }
  const temporary = resolve(folder, `.${target.id}-${randomUUID()}.tmp`);
  const backup = resolve(folder, `.${target.id}-${randomUUID()}.previous`);
  await mkdir(temporary);
  let published = false, retained = false;
  const report: ReviewReport = {
    version: 1, status: 'ready', ...target, hash: artifact.hash, format: artifact.format ?? 'document', renderedAt: artifact.renderedAt,
    pageCount: artifact.pages.length, visualReview: 'required', factualReview: 'required',
    outputs: { directory, pdf: resolve(directory, 'document.pdf'), text: resolve(directory, 'document.txt'), review: resolve(directory, 'review.json') },
    changes: { previousHash: prior?.hash ?? null, changedPages: [], removedPages: [] },
    pages: [], issues: artifact.issues ?? [], blocks: Object.values(artifact.blocks),
  };
  try {
    const inspected = extras.layout && inspectElements(extras.layout, artifact.blocks);
    if (extras.pptx) {
      await writeFile(resolve(temporary, 'document.pptx'), extras.pptx);
      report.outputs.pptx = resolve(directory, 'document.pptx');
      report.powerpointVisualReview = 'required';
    }
    const pdfjs = dirname(runtimeResolve('pdfjs-dist/package.json'));
    const loading = getDocument({
      data: new Uint8Array(bytes), useSystemFonts: false, verbosity: 0,
      standardFontDataUrl: resolve(pdfjs, 'standard_fonts') + sep,
      cMapUrl: resolve(pdfjs, 'cmaps') + sep, cMapPacked: true, wasmUrl: resolve(pdfjs, 'wasm') + sep,
    });
    const texts: string[] = [];
    try {
      const pdf = await loading.promise;
      if (pdf.numPages !== artifact.pages.length) throw new Error('The PDF page count does not match its render artifact.');
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const name = `page-${String(number).padStart(3, '0')}`;
        const content = await page.getTextContent();
        const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim() + '\n';
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        try {
          await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D, viewport }).promise;
          const png = await canvas.encode('png');
          await writeFile(resolve(temporary, `${name}.png`), png);
          const contentHash = createHash('sha256').update(png).update(text).digest('hex');
          const info = artifact.pages[number - 1];
          report.pages.push({ page: number, width: info.width, height: info.height, image: resolve(directory, `${name}.png`), text: resolve(directory, `${name}.txt`), contentHash,
            blockIds: [...new Set(info.fragments.map(fragment => fragment.id))], issues: report.issues.filter(issue => issue.page === number), ...(inspected ? { elements: inspected[number - 1] } : {}) });
          if (!Array.isArray(prior?.pages) || prior.pages[number - 1]?.contentHash !== contentHash) report.changes.changedPages.push(number);
        } finally { canvas.width = 0; canvas.height = 0; }
        await writeFile(resolve(temporary, `${name}.txt`), text);
        texts.push(text);
        page.cleanup();
      }
    } finally { await loading.destroy(); }
    if (Array.isArray(prior?.pages)) report.changes.removedPages = prior.pages.filter(page => page.page > report.pageCount).map(page => page.page);
    await writeFile(resolve(temporary, 'document.pdf'), bytes);
    await writeFile(resolve(temporary, 'document.txt'), texts.join('\n\f\n'));
    await writeFile(resolve(temporary, 'review.json'), JSON.stringify(report, null, 2) + '\n');
    // No event-loop turn may separate freshness and publication. A failed rename restores the old set.
    if (!isCurrent()) throw new ExportChangedError();
    for (const { path, info: expected } of parents) {
      const info = lstatSync(path);
      if (!info.isDirectory() || info.isSymbolicLink() || info.ino !== expected.ino || info.dev !== expected.dev) throw new Error('The review output folder changed during preparation.');
    }
    const current = (() => { try { return lstatSync(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; } })();
    if (current?.ino !== previous?.ino || current?.dev !== previous?.dev) throw new Error('The review destination changed during preparation. Retry after the other review finishes.');
    if (previousFiles !== undefined) {
      let unchanged = false;
      try { unchanged = reviewFilesStamp(directory) === previousFiles; } catch { /* A new file or link is a concurrent edit too. */ }
      if (!unchanged) throw new Error('The review files changed during preparation. Your existing files were retained; retry after edits finish.');
    }
    if (previous) { renameSync(directory, backup); retained = true; }
    try { renameSync(temporary, directory); published = true; }
    catch (error) { if (retained) { renameSync(backup, directory); retained = false; } throw error; }
    if (retained) {
      try { await rm(backup, { recursive: true, force: true }); retained = false; }
      catch (error) { report.warning = `Review artifacts were saved; the prior review remains at ${backup}: ${message(error)}`; }
    }
    return report;
  } finally { if (!published) await rm(temporary, { recursive: true, force: true }); }
}
