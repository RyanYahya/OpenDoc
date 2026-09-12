import { access, readdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ReviewIssue } from '../shared/types';
import type { PreviewSession } from './export-preview';
import { ExportResponseLost } from './export-errors';
import { RenderFailure } from './render-error';
import { documentEntry, renderOnce, validId } from './render';
import { publishRenderedPDF, publishFile } from './export-file';
import { readPresentationBytes } from './pptx';
import { exportInfo, type ExportFormat } from '../shared/export';
import { captureExportInputs } from './export-inputs';

export type ExportResult = {
  id: string; status: 'success'; pages: number; hash: string; path: string; source: 'preview' | 'render'; warning?: string;
} | {
  id: string; status: 'error'; error: string; path: string; updated: false | 'unknown'; previousOutputRetained: boolean; issues?: ReviewIssue[];
};
export interface ExportOptions { requestTimeoutMs?: number; readyTimeoutMs?: number; renderTimeoutMs?: number; format?: ExportFormat; mode?: 'preview' | 'direct' }
export const exportUsage = 'Usage: npx opendoc export <document-id> [more-ids...] [--format pdf|pptx] [--json]\n       npx opendoc export --all [--format pdf|pptx] [--json]';

export function parseExportArgs(args: string[]) {
  let all = false, json = false;
  const ids: string[] = [];
  let format: ExportFormat | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--format') {
      const next = args[++index];
      if (format || (next !== 'pdf' && next !== 'pptx')) throw new Error(`Choose one --format pdf or --format pptx.\n${exportUsage}`);
      format = next; continue;
    }
    parseArgument(arg);
  }
  function parseArgument(arg: string) {
    if (arg === '--') return;
    if (arg === '--all') { if (all) throw new Error(`Duplicate --all option.\n${exportUsage}`); all = true; }
    else if (arg === '--json') { if (json) throw new Error(`Duplicate --json option.\n${exportUsage}`); json = true; }
    else if (!validId(arg)) throw new Error(`Invalid argument: ${arg}\n${exportUsage}`);
    else if (!ids.includes(arg)) ids.push(arg);
  }
  if ((all && ids.length) || (!all && !ids.length)) throw new Error(exportUsage);
  return { all, json, ids, ...(format ? { format } : {}) };
}

export async function discoverDocumentIds(root: string) {
  const ids: string[] = [];
  for (const dir of await readdir(resolve(root, 'documents'), { withFileTypes: true })) {
    if (!dir.isDirectory() || !validId(dir.name)) continue;
    try { await access(resolve(root, 'documents', dir.name, 'index.tsx')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    ids.push(dir.name);
  }
  return ids.sort();
}

export async function exportDocuments(root: string, requestedIds: string[], supplied: ExportOptions = {}): Promise<ExportResult[]> {
  const ids = [...new Set(requestedIds)];
  if (ids.some(id => !validId(id))) throw new Error('Invalid document ID.');
  if (!ids.length) throw new Error('No documents were found to export.');
  const options = { requestTimeoutMs: 5_000, readyTimeoutMs: 35_000, renderTimeoutMs: 30_000, ...supplied, format: supplied.format ?? 'pdf' };
  let session: PreviewSession | null = null, sessionError: unknown;
  // Direct production never inspects a GUI session or loads its HTTP adapter.
  const preview = options.mode === 'direct' ? undefined : await import('./export-preview');
  if (preview) try { session = await preview.currentSession(root, options.requestTimeoutMs); } catch (error) { sessionError = error; }
  const results: ExportResult[] = new Array(ids.length);
  let next = 0;
  async function run() {
    while (next < ids.length) {
      const index = next++, id = ids[index], path = resolve(root, 'output', `${id}${exportInfo(options.format).extension}`);
      try {
        if (sessionError) throw sessionError;
        // Validate containment for online and offline requests alike.
        await documentEntry(root, id);
        if (session && preview) results[index] = await preview.exportPreview(root, id, session, options);
        else {
          const unchanged = await captureExportInputs(root, id);
          const result = await renderOnce(root, id, options.renderTimeoutMs);
          let exported: Extract<ExportResult, { status: 'success' }> | undefined;
          try {
            if (options.format === 'pptx') {
              if (result.artifact.format !== 'presentation') throw new Error('PowerPoint export is available for presentations only.');
              const bytes = await readPresentationBytes(result.directory, result.artifact.hash);
              await publishFile(root, id, bytes, 'pptx', unchanged);
            } else await publishRenderedPDF(root, id, result.directory, unchanged);
            exported = { id, status: 'success', pages: result.artifact.pages.length, hash: result.artifact.hash, path, source: 'render' };
            results[index] = exported;
          } finally {
            try { await rm(result.directory, { recursive: true, force: true }); }
            catch (error) {
              if (!exported) throw error;
              exported.warning = `The file was saved, but temporary render files could not be removed: ${error instanceof Error ? error.message : String(error)}`;
            }
          }
        }
      } catch (error) {
        const updated = error instanceof ExportResponseLost ? 'unknown' : false;
        let previousOutputRetained = false;
        if (updated === false) try { previousOutputRetained = (await stat(path)).isFile(); } catch { /* No prior export. */ }
        results[index] = { id, status: 'error', error: error instanceof Error ? error.message : String(error), path, updated, previousOutputRetained, ...(error instanceof RenderFailure ? { issues: error.issues } : {}) };
      }
    }
  }
  await Promise.all([run(), run()]);
  return results;
}
