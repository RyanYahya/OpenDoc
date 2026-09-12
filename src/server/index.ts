import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { readFile, rm, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createReadStream } from 'node:fs';
import { scanMaterials } from './materials';
import { AssetStore, AssetError } from '../assets/store';
import { handleAssetRequest } from './assets-http';
import { ownedFile, readMedia, mediaDirectory, localPath } from '../media/files';
import type { Materials } from '../shared/media';
import { randomBytes } from 'node:crypto';
import { watch } from 'chokidar';
import type { ViteDevServer } from 'vite';
import { builtClient } from './client';
import { GuideError, readGuide } from './guides';
import { Workspace } from './workspace';
import { atomicWrite } from './files';
import { addComment, changeComment, editComment, deleteComment, readComments, Conflict, withCommentLock } from './comments';
import { renameDocument, duplicateDocument, deleteDocument, restoreDocument } from './documents';
import { validId } from './render';
import { createDocument, listStarters, CreateDocumentError } from './create';
import { publishFile, ExportChangedError } from './export-file';
import { exportInfo } from '../shared/export';
import { readPresentationBytes } from './pptx';
import { ExportStore, ExportError, exportFormat } from './exports';
import { canCopyFile } from './clipboard';
import { getBlock, summarizeDocument } from '../shared/types';
import { anchorForSelection, getTextTarget } from '../shared/anchors';
import { readSelection } from './selection';
import { TextEditService } from './edits';
import { ThemeCatalog, readThemeGuide, themeFile } from './themes';
import { TemplateCatalog, createFromTemplate, readTemplateGuide } from './templates';
import { assignProject, createProject, deleteProject, ProjectError, readProjects, requireProject, updateProject } from './projects';

import { readAssetHead as selectedAssetHead, readAssetRevision as selectedAssetRevision } from '../assets/files';
import type { SelectedAsset } from '../shared/assets';
import { applicationRoot } from '../runtime/paths';

const root = process.cwd();
const workspace = new Workspace(root);
const edits = new TextEditService(root);
const exports = new ExportStore(root);
const assets = new AssetStore(root, () => workspace.list());
workspace.manualEditSummary = id => edits.summary(id);
const templates = new TemplateCatalog(root);
const themes = new ThemeCatalog(root);
const token = randomBytes(24).toString('hex');
const events = new WebSocketServer({ noServer: true, maxPayload: 1024 });
const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
let vite: ViteDevServer | undefined;
let client: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
let port = Number(process.env.OPENDOC_PORT ?? 4310);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('OPENDOC_PORT must be an integer from 0 to 65535.');
let origin = '';
let materialsVersion = 0;
let materialCache: { version: number; result: Promise<Materials> } | undefined;
function materials() {
  if (!materialCache || materialCache.version !== materialsVersion) materialCache = { version: materialsVersion, result: scanMaterials(root, workspace.list()) };
  return materialCache.result.catch(error => { materialCache = undefined; throw error; });
}
function json(res: ServerResponse, value: unknown, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
async function body(req: IncomingMessage, limit = 32_000) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Use application/json.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new Error('Request too large.');
    chunks.push(bytes);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new Error('The request contains invalid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Send a JSON object.');
  return value;
}

const server = createServer(async (req, res) => {
  if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) { json(res, { error: 'Invalid host.' }, 403); return; }
  try {
    const url = new URL(req.url ?? '/', origin);
    if (!url.pathname.startsWith('/api/')) { await client(req, res); return; }
    if (!['GET', 'HEAD'].includes(req.method ?? 'GET')) {
      const expectedOrigin = `http://${req.headers.host}`;
      if ((req.headers.origin && req.headers.origin !== expectedOrigin) || req.headers['x-opendoc-token'] !== token) { json(res, { error: 'This write must come from the local OpenDoc session.' }, 403); return; }
    }
    if (req.method === 'GET' && url.pathname === '/api/session') { json(res, { token }); return; }
    if (req.method === 'GET' && url.pathname === '/api/guides') { json(res, await readGuide(root, url.searchParams.get('path'))); return; }
    if (await handleAssetRequest(root, assets, req, res, url, json, body, () => workspace.changed())) return;
    if (req.method === 'GET' && url.pathname === '/api/exports/capabilities') { json(res, { copyFile: canCopyFile }); return; }
    const exportRoute = url.pathname.match(/^\/api\/exports\/([a-f0-9-]+)(?:\/(download|open|reveal|copy|restore))?$/);
    if (exportRoute) {
      const [, exportId, action] = exportRoute;
      if (req.method === 'DELETE' && !action) { await exports.remove(exportId); json(res, { ok: true }); return; }
      if (req.method === 'POST' && action === 'restore') { json(res, await exports.restore(exportId)); return; }
      if (req.method === 'POST' && action === 'reveal') { await exports.reveal(exportId); json(res, { ok: true }); return; }
      if (req.method === 'POST' && action === 'copy') { await exports.copy(exportId); json(res, { ok: true }); return; }
      if (req.method === 'GET' && !action) { json(res, { result: await exports.get(exportId) ?? null }); return; }
      if (req.method === 'GET' && (action === 'download' || action === 'open')) {
        const { result, bytes } = await exports.bytes(exportId);
        const info = exportInfo(result.format);
        res.writeHead(200, { 'Content-Type': info.mime, 'Content-Length': bytes.length, 'Content-Disposition': `${action === 'download' || result.format === 'pptx' ? 'attachment' : 'inline'}; filename="document${info.extension}"; filename*=UTF-8''${encodeURIComponent(result.filename).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16)}`)}`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(bytes); return;
      }
      json(res, { error: 'Not found.' }, 404); return;
    }
    const saveExportRoute = url.pathname.match(/^\/api\/documents\/([a-z0-9-]+)\/exports$/);
    if (saveExportRoute && req.method === 'GET') {
      if (!workspace.states.has(saveExportRoute[1])) throw new ExportError('Document not found.', 404);
      json(res, await exports.list(saveExportRoute[1])); return;
    }
    if (saveExportRoute && req.method === 'POST') {
      const input = await body(req);
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['id', 'hash', 'filename', 'format'].includes(key))) throw new ExportError('Invalid export request.');
      const documentId = saveExportRoute[1];
      const format = exportFormat(input.format);
      const result = await exports.save({ ...input, documentId, format }, async () => {
        const state = workspace.states.get(documentId);
        if (!state) throw new ExportError('Document not found.', 404);
        if (state.status !== 'ready' || state.artifact?.hash !== input.hash) throw new ExportChangedError();
        const revision = state.revision;
        const output = workspace.output(documentId, input.hash);
        if (!output) throw new ExportChangedError();
        if (format === 'pptx' && output.artifact.format !== 'presentation') throw new ExportError('PowerPoint export is available for presentations only.');
        const bytes = format === 'pptx' ? await readPresentationBytes(output.directory, input.hash) : await readFile(resolve(output.directory, 'document.pdf'));
        return { bytes, assetBindings: output.artifact.assetBindings, assets: output.artifact.assets, isCurrent: () => workspace.states.get(documentId) === state && state.status === 'ready' && state.revision === revision && state.artifact?.hash === input.hash };
      });
      json(res, result); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/documents') {
      const states = workspace.list();
      await Promise.all(states.map(async state => { state.manualEdit = await edits.summary(state.id); }));
      json(res, url.searchParams.get('view') === 'summary' ? states.map(summarizeDocument) : states); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/projects') { json(res, await readProjects(root)); return; }
    const documentRoute = url.pathname.match(/^\/api\/documents\/([a-z0-9-]+)$/);
    if (documentRoute && req.method === 'GET') {
      const state = workspace.states.get(documentRoute[1]);
      if (!state) { json(res, { error: 'Document not found.' }, 404); return; }
      const manualEdit = await edits.summary(state.id);
      // Read the live state after asynchronous metadata work so status/revision stay current.
      const current = workspace.states.get(documentRoute[1]);
      if (!current) { json(res, { error: 'Document not found.' }, 404); return; }
      json(res, { ...current, manualEdit }); return;
    }
    if (documentRoute && req.method === 'PATCH') {
      const renamed = await renameDocument(root, documentRoute[1], await body(req));
      await workspace.refreshProjects(); json(res, renamed); return;
    }
    if (documentRoute && req.method === 'DELETE') {
      const id = documentRoute[1];
      const removed = await edits.withDocument(id, () => withCommentLock(root, id, () => deleteDocument(root, id)));
      await workspace.refreshProjects(); json(res, removed); return;
    }
    const duplicateRoute = url.pathname.match(/^\/api\/documents\/([a-z0-9-]+)\/duplicate$/);
    if (duplicateRoute && req.method === 'POST') {
      const id = duplicateRoute[1];
      const copied = await edits.withDocument(id, () => withCommentLock(root, id, () => duplicateDocument(root, id, workspace.states.get(id)?.artifact?.meta.title ?? id)));
      await workspace.refreshProjects(); workspace.invalidate(copied.id); json(res, copied, 201); return;
    }
    const restoreRoute = url.pathname.match(/^\/api\/document-trash\/([a-f0-9-]+)\/restore$/);
    if (restoreRoute && req.method === 'POST') {
      const restored = await restoreDocument(root, restoreRoute[1]);
      await workspace.refreshProjects(); workspace.invalidate(restored.id); json(res, restored); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/projects') {
      const project = await createProject(root, await body(req));
      await workspace.refreshProjects(); json(res, project, 201); return;
    }
    const projectRoute = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)$/);
    if (projectRoute && req.method === 'PATCH') {
      const project = await updateProject(root, projectRoute[1], await body(req));
      await workspace.refreshProjects(); json(res, project); return;
    }
    if (projectRoute && req.method === 'DELETE') {
      await deleteProject(root, projectRoute[1]);
      await workspace.refreshProjects(); json(res, { ok: true }); return;
    }
    const assignmentRoute = url.pathname.match(/^\/api\/documents\/([a-z0-9-]+)\/project$/);
    if (assignmentRoute && req.method === 'PUT') {
      const input = await body(req);
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'projectId')) throw new ProjectError('Choose the document’s destination project.');
      const assigned = await assignProject(root, assignmentRoute[1], input.projectId);
      await workspace.refreshProjects(); json(res, assigned); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/themes') { json(res, await themes.list()); return; }
    const themeRoute = url.pathname.match(/^\/api\/themes\/([a-z0-9-]+)\/(preview|pdf|guide)$/);
    if (themeRoute && req.method === 'GET') {
      const [, id, action] = themeRoute;
      if (action === 'guide') { json(res, { file: `themes/${id}/design.md`, markdown: await readThemeGuide(root, id) }); return; }
      if (action === 'preview') { json(res, await themes.preview(id)); return; }
      const bytes = await themes.pdf(id, url.searchParams.get('hash') ?? '');
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' }); res.end(bytes); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/templates') { json(res, await templates.list()); return; }
    const templateRoute = url.pathname.match(/^\/api\/templates\/([a-z0-9-]+)\/(pdf|documents|guide|preview)$/);
    if (templateRoute?.[2] === 'preview' && req.method === 'GET') { json(res, await templates.preview(templateRoute[1])); return; }
    if (templateRoute?.[2] === 'guide' && req.method === 'GET') {
      json(res, { file: `templates/${templateRoute[1]}/AGENTS.md`, markdown: await readTemplateGuide(root, templateRoute[1]) }); return;
    }
    if (templateRoute?.[2] === 'pdf' && req.method === 'GET') {
      const bytes = await templates.pdf(templateRoute[1], url.searchParams.get('hash') ?? '');
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' }); res.end(bytes); return;
    }
    if (templateRoute?.[2] === 'documents' && req.method === 'POST') {
      const created = await createFromTemplate(root, templateRoute[1], await body(req));
      await workspace.discover();
      workspace.noteChange(resolve(root, 'documents', created.id, 'index.tsx'));
      json(res, created, 201); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/materials') { json(res, await materials()); return; }
    const materialFile = url.pathname.match(/^\/api\/materials\/([^/]+)\/(image|file)$/);
    if (req.method === 'GET' && materialFile) {
      const [, id, action] = materialFile;
      if (!validId(id) || !workspace.states.has(id)) throw new Error('Unknown document.');
      const document = resolve(root, 'documents', id);
      if (action === 'image') {
        const asset = readMedia(document, url.searchParams.get('item') ?? '');
        if (url.searchParams.get('hash') !== asset.hash) throw new Conflict('This image changed. Reload the media browser.');
        res.writeHead(200, { 'Content-Type': asset.mime, 'Content-Length': asset.bytes.length, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
        res.end(asset.bytes); return;
      }
      const name = url.searchParams.get('path') ?? '';
      localPath(name, 'Media path');
      if (!name.startsWith('media/')) throw new Error('Only files inside this document’s media folder are available here.');
      const file = ownedFile(document, name);
      const info = await stat(file);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': info.size, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name.split('/').at(-1)!)}`, 'X-Content-Type-Options': 'nosniff' });
      const stream = createReadStream(file); stream.on('error', () => res.destroy()); stream.pipe(res); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/starters') { json(res, { starters: listStarters() }); return; }
    if (req.method === 'POST' && url.pathname === '/api/documents') {
      const created = await createDocument(root, await body(req));
      await workspace.discover();
      workspace.noteChange(resolve(root, 'documents', created.id, 'index.tsx'));
      json(res, created, 201); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      // Stop older clients from reconnecting their HTTP-slot-consuming SSE stream.
      res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end(); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/context') {
      const value = await body(req);
      if (value.documentId !== null && !workspace.states.has(value.documentId)) throw new Error('Unknown document.');
      if (value.blockId !== null && typeof value.blockId !== 'string') throw new Error('Invalid block.');
      const state = workspace.states.get(value.documentId);
      if (value.blockId && !getBlock(state?.artifact, value.blockId)) {
        const comments = await readComments(root, value.documentId);
        if (!comments.some(c => c.blockId === value.blockId)) throw new Error('Unknown block.');
      }
      const contextPages = Math.max(state?.artifact?.pages.length ?? 1, value.draftPreview === true && state ? edits.previewPageCount(state.id) : 1);
      if (!Number.isInteger(value.page) || value.page < 1 || value.page > contextPages) throw new Error('Invalid page.');
      if (value.mediaId != null) {
        if (!state) throw new Error('Choose the owning document first.');
        mediaDirectory(resolve(root, 'documents', state.id), value.mediaId);
      }
      const projectId = state?.projectId ?? (value.projectId == null ? null : requireProject(await readProjects(root), value.projectId).id);
      const themeId = state ? null : value.themeId ?? null;
      if (themeId !== null) await themeFile(root, themeId, 'index.ts');
      let selectedAsset: SelectedAsset | null = null;
      // Library selection is independent observed context, and is cleared by document/theme navigation.
      if (!state && !themeId && value.mediaId == null && value.selectedAsset != null) {
        const requested = value.selectedAsset;
        if (!requested || typeof requested !== 'object' || Array.isArray(requested)
          || Object.keys(requested).some(key => !['kind', 'id', 'revision', 'variation', 'face'].includes(key))) throw new Error('Invalid selected asset.');
        const head = selectedAssetHead(root, requested.kind, requested.id);
        const asset = selectedAssetRevision(root, requested.kind, requested.id, requested.revision ?? head.revision);
        if (requested.variation !== undefined && (asset.kind !== 'logo' || !asset.variations.some(item => item.id === requested.variation))) throw new Error('Unknown logo variation.');
        if (requested.face !== undefined && (asset.kind !== 'font' || !asset.faces.some(item => item.id === requested.face))) throw new Error('Unknown font face.');
        selectedAsset = { kind: asset.kind, id: asset.id, revision: asset.revision,
          ...(requested.variation !== undefined ? { variation: requested.variation } : {}), ...(requested.face !== undefined ? { face: requested.face } : {}) };
      }
      const selection = readSelection(value.selection, value.blockId);
      if (value.editing !== undefined && typeof value.editing !== 'boolean') throw new Error('Invalid editor state.');
      if (value.pendingEdits !== undefined && (!Number.isInteger(value.pendingEdits) || value.pendingEdits < 0 || value.pendingEdits > 100)) throw new Error('Invalid pending edit count.');
      if (value.draftPreview !== undefined && typeof value.draftPreview !== 'boolean') throw new Error('Invalid draft preview state.');
      await workspace.setContext({ themeId, projectId, selectedAsset, documentId: value.documentId, blockId: value.blockId, page: value.page, mediaId: value.mediaId ?? null, selection, editing: value.editing ?? false, pendingEdits: value.pendingEdits ?? 0, draftPreview: value.draftPreview ?? false });
      json(res, { ok: true }); return;
    }
    const draftPDF = url.pathname.match(/^\/api\/documents\/([^/]+)\/edits\/previews\/([a-f0-9-]+)\/pdf$/);
    if (draftPDF && req.method === 'GET' && validId(draftPDF[1])) {
      const bytes = await edits.previewPDF(draftPDF[1], draftPDF[2]);
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' }); res.end(bytes); return;
    }
    const editPreview = url.pathname.match(/^\/api\/documents\/([^/]+)\/edits\/preview$/);
    if (editPreview && req.method === 'POST' && validId(editPreview[1])) {
      const state = workspace.states.get(editPreview[1]);
      if (!state) { json(res, { error: 'Document not found.' }, 404); return; }
      json(res, await edits.preview(state.id, await body(req, 256_000), state)); return;
    }
    const editRoute = url.pathname.match(/^\/api\/documents\/([^/]+)\/edits(?:\/([^/]+)\/undo)?$/);
    if (editRoute && req.method === 'POST' && validId(editRoute[1])) {
      const [, id, editId] = editRoute;
      const state = workspace.states.get(id);
      if (!state) { json(res, { error: 'Document not found.' }, 404); return; }
      const input = await body(req, 256_000);
      state.manualEdit = editId ? await edits.undo(id, editId) : await edits.apply(id, input, state);
      const files = edits.changedFiles(id);
      if (files.length) for (const file of files) workspace.noteChange(resolve(root, file));
      else workspace.invalidate(id);
      workspace.changed();
      json(res, state); return;
    }
    const match = url.pathname.match(/^\/api\/documents\/([^/]+)\/(pdf|export|comments)(?:\/([^/]+))?$/);
    if (!match || !validId(match[1])) { json(res, { error: 'Not found.' }, 404); return; }
    const [, id, action, commentId] = match;
    const state = workspace.states.get(id);
    if (!state) { json(res, { error: 'Document not found.' }, 404); return; }
    if (action === 'pdf' && req.method === 'GET') {
      const output = workspace.output(id, url.searchParams.get('hash') ?? '');
      if (!output) { json(res, { error: 'This preview was replaced. Reload the document.' }, 409); return; }
      const bytes = await readFile(resolve(output.directory, 'document.pdf'));
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' }); res.end(bytes); return;
    }
    if (action === 'export' && req.method === 'POST') {
      const { hash, format: requestedFormat } = await body(req);
      const format = exportFormat(requestedFormat), info = exportInfo(format);
      if (state.status !== 'ready' || state.artifact?.hash !== hash) throw new Conflict('Wait for the current document to finish rendering before exporting.');
      const output = workspace.output(id, hash)!;
      const revision = state.revision;
      if (format === 'pptx' && output.artifact.format !== 'presentation') throw new ExportError('PowerPoint export is available for presentations only.');
      const bytes = format === 'pptx' ? await readPresentationBytes(output.directory, hash) : await readFile(resolve(output.directory, 'document.pdf'));
      if (state.status !== 'ready' || state.revision !== revision) throw new Conflict('The document changed during export. Try again.');
      await publishFile(root, id, bytes, format, () => workspace.states.get(id) === state && state.status === 'ready' && state.revision === revision && state.artifact?.hash === hash);
      res.writeHead(200, { 'Content-Type': info.mime, 'Content-Length': bytes.length, 'Content-Disposition': `attachment; filename="${id}${info.extension}"`, 'Cache-Control': 'no-store' }); res.end(bytes); return;
    }
    if (action === 'comments') {
      if (req.method === 'GET') { json(res, (await readComments(root, id)).filter(comment => comment.status !== 'deleted')); return; }
      if (req.method === 'POST' && !commentId) {
        const value = await body(req);
        if (state.status !== 'ready' || state.artifact?.hash !== value.hash) throw new Conflict('The preview changed. Wait for the latest version before commenting.');
        const block = getBlock(state.artifact, value.blockId);
        if (!block) throw new Error('The selected block is no longer available.');
        const selection = readSelection(value.selection, value.blockId);
        if (selection && (selection.renderHash !== undefined && selection.renderHash !== value.hash
          || selection.revision !== undefined && selection.revision !== state.revision)) throw new Conflict('This selection changed. Select the phrase again before commenting.');
        const anchor = anchorForSelection(state.artifact, selection);
        if (selection?.targetId && !anchor && getTextTarget(state.artifact, selection.targetId)?.stable !== false) throw new Error('Select the phrase again before commenting.');
        json(res, (await addComment(root, id, { blockId: block.id, text: value.text, quote: selection?.quote ?? block.text, anchor, exactQuote: !!selection?.quote })).filter(comment => comment.status !== 'deleted')); workspace.changed(); return;
      }
      if (req.method === 'PATCH' && commentId) {
        const value = await body(req);
        const comments = Object.hasOwn(value, 'text')
          ? await editComment(root, id, commentId, value.text, value.version)
          : await changeComment(root, id, commentId, value.status, value.version);
        json(res, comments.filter(comment => comment.status !== 'deleted')); workspace.changed(); return;
      }
      if (req.method === 'DELETE' && commentId) {
        const value = await body(req);
        json(res, (await deleteComment(root, id, commentId, value.version)).filter(comment => comment.status !== 'deleted')); workspace.changed(); return;
      }
    }
    json(res, { error: 'Not found.' }, 404);
  } catch (error) { json(res, { error: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'That local file is missing. Restore it or reload the library.' : error instanceof Error ? error.message : String(error) }, error instanceof CreateDocumentError || error instanceof ProjectError || error instanceof ExportError || error instanceof AssetError || error instanceof GuideError ? error.status : error instanceof Conflict || error instanceof ExportChangedError ? 409 : (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 400); }
});

// Upgraded sockets do not occupy the browser's six HTTP/1 request slots.
server.on('upgrade', (req, socket, head) => {
  if (req.url?.split('?')[0] !== '/api/events') {
    if (production) socket.destroy(); // Vite owns other upgrades in development.
    return;
  }
  const host = req.headers.host;
  if ((host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) || req.headers.origin !== `http://${host}`) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
  }
  events.handleUpgrade(req, socket, head, client => {
    client.on('error', () => client.terminate());
    client.send('connected');
  });
});

if (production) client = await builtClient(applicationRoot);
else {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({ root: applicationRoot, server: { middlewareMode: true, ws: { server } }, appType: 'spa' });
  client = (req, res) => vite!.middlewares(req, res);
}
while (true) {
  try {
    await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); accept(); }); }); break;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || process.env.OPENDOC_PORT || port >= 4320) throw error; port++; }
}
const address = server.address();
if (address && typeof address === 'object') port = address.port;
origin = `http://127.0.0.1:${port}`;
await atomicWrite(resolve(root, '.opendoc/server.json'), JSON.stringify({ origin, token, pid: process.pid }, null, 2));
workspace.on('change', () => {
  materialsVersion++;
  for (const client of events.clients) if (client.readyState === WebSocket.OPEN) client.send('changed');
});
const watcher = watch([...new Set([root, resolve(applicationRoot, 'src'), resolve(applicationRoot, 'package.json'), resolve(applicationRoot, 'pnpm-lock.yaml'), resolve(applicationRoot, 'tsconfig.workspace.json')])], { ignoreInitial: true, ignored: path => {
  const installed = relative(applicationRoot, path);
  const rel = installed === '' || (!installed.startsWith('../') && installed !== '..') ? installed : relative(root, path);
  return /(^|[/\\])(node_modules|\.git|\.opendoc|output|tmp|dist|tests)([/\\]|$)/.test(rel) || /\.forme-render-|\.tmp$/.test(rel);
} });
watcher.on('all', (_event, path) => {
  if (relative(root, path) === 'projects.json') {
    void workspace.refreshProjects().catch(error => workspace.emit('workspace-error', error)); return;
  }
  // Catalogs follow their own imports and asset bindings, including local data files.
  void Promise.all([templates.noteChange(path), themes.noteChange(path)])
    .then(() => workspace.changed()).catch(error => workspace.emit('workspace-error', error));
  if (/^themes\/.*\.md$/.test(relative(root, path))) return;
  if (path.endsWith('comments.json')) { workspace.changed(); return; }
  // Documents may import modules or read local assets in any format (CSV, text,
  // diagrams, and fonts included). Dependency handling decides what is affected.
  workspace.noteChange(path);
});
workspace.on('workspace-error', error => console.error('Workspace refresh failed:', error));
await workspace.refresh();
console.log(`\nOpenDoc is running at ${origin}\nDocuments: ${resolve(root, 'documents')}\n`);
let closing = false;
async function close() {
  if (closing) return; closing = true;
  const stopped = new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()));
  for (const client of events.clients) client.terminate();
  events.close();
  for (const client of vite?.ws.clients ?? []) client.socket.terminate();
  // Complete accepted saves while their preview files and source watcher are still available.
  await stopped;
  await watcher.close();
  await workspace.close(); await edits.close(); await templates.close(); await themes.close(); await vite?.close();
  const sessionFile = resolve(root, '.opendoc/server.json');
  const session = await readFile(sessionFile, 'utf8').then(JSON.parse, error => { if (error.code === 'ENOENT') return null; throw error; });
  // Another process may now own the workspace session. Do not disconnect its CLI.
  if (session?.pid === process.pid && session?.token === token) await rm(sessionFile, { force: true });
}
function shutdown() { if (closing) return; void close().then(() => process.exit(0), error => { console.error('OpenDoc could not finish closing:', error); process.exit(1); }); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
