import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { AssetStore } from '../assets/store';
import { AssetError, assertKind, assetFile, readAssetRevision, revisionFiles } from '../assets/files';
import type { UploadFile } from '../assets/imports';
import { importMedia, editMedia } from './media-mutations';
import { themeFile } from './themes';

type Send = (res: ServerResponse, value: unknown, status?: number) => void;
type Body = (req: IncomingMessage, limit?: number) => Promise<any>;
function object(value: unknown, fields: string[]): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw new AssetError('Invalid asset request. Reload the form and try again.');
}
/** Use the platform multipart parser, with a byte bound before parsing or publication. */
export async function assetUpload(req: IncomingMessage, multiple = false): Promise<{ metadata: Record<string, any>; files: UploadFile[] }> {
  const type = req.headers['content-type'];
  if (!type?.startsWith('multipart/form-data;')) throw new AssetError('Choose files using a multipart upload.');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100 * 1024 * 1024) throw new AssetError('Keep the complete upload below 100 MB.', 413);
    chunks.push(Buffer.from(chunk));
  }
  let form: FormData;
  try { form = await new Response(new Uint8Array(Buffer.concat(chunks)), { headers: { 'Content-Type': type } }).formData(); }
  catch { throw new AssetError('The upload was interrupted or malformed. Choose the files and try again.'); }
  if ([...form.keys()].some(key => !['metadata', multiple ? 'files' : 'file'].includes(key)) || form.getAll('metadata').length !== 1) throw new AssetError('Include one metadata record and the chosen files.');
  let metadata: unknown;
  const raw = form.get('metadata');
  if (typeof raw !== 'string' || raw.length > 32_000) throw new AssetError('The upload metadata is too large or missing.');
  try { metadata = JSON.parse(raw); } catch { throw new AssetError('The upload metadata must be valid JSON.'); }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new AssetError('Include an upload metadata object.');
  const entries = form.getAll(multiple ? 'files' : 'file');
  if (!entries.length || entries.length > (multiple ? 24 : 1) || entries.some(entry => typeof entry === 'string')) throw new AssetError(multiple ? 'Choose between one and 24 static font files.' : 'Choose one image file.');
  const files = await Promise.all((entries as File[]).map(async file => ({ filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })));
  return { metadata: metadata as Record<string, any>, files };
}

/** Called after the server's local-session write guard. App and CLI share AssetStore. */
export async function handleAssetRequest(root: string, store: AssetStore, req: IncomingMessage, res: ServerResponse, url: URL, json: Send, body: Body, changed: () => void): Promise<boolean> {
  if (url.pathname === '/api/assets' && req.method === 'GET') {
    const kind = url.searchParams.get('kind') ?? undefined; if (kind) assertKind(kind);
    json(res, await store.list(kind as 'logo' | 'font' | undefined, url.searchParams.get('archived') === 'true')); return true;
  }
  const defaults = url.pathname.match(/^\/api\/themes\/([a-z0-9-]+)\/assets$/);
  if (defaults) {
    await themeFile(root, defaults[1], 'index.ts');
    if (req.method === 'GET') { json(res, await store.defaults(defaults[1])); return true; }
    if (req.method === 'PUT') { const input = await body(req); object(input, ['defaults', 'expectedRevision']); json(res, await store.setDefaults(defaults[1], input.defaults, input.expectedRevision)); changed(); return true; }
  }
  const media = url.pathname.match(/^\/api\/materials\/([a-z0-9-]+)\/(import|meta)$/);
  if (media?.[2] === 'import' && req.method === 'POST') {
    const upload = await assetUpload(req); object(upload.metadata, ['id', 'title', 'description', 'kind', 'alt', 'attribution', 'sources']);
    json(res, await importMedia(root, media[1], upload.metadata as Parameters<typeof importMedia>[2], upload.files[0]), 201); changed(); return true;
  }
  if (media?.[2] === 'meta' && req.method === 'PATCH') {
    const input = await body(req); object(input, ['expectedRevision', 'meta']);
    json(res, await editMedia(root, media[1], url.searchParams.get('item') ?? '', input as Parameters<typeof editMedia>[3])); changed(); return true;
  }
  const route = url.pathname.match(/^\/api\/assets\/(logo|font)(?:\/([a-z0-9-]+)(?:\/(file|variations|faces|archive|restore))?)?$/);
  if (!route) return false;
  const [, kindValue, id, action] = route; assertKind(kindValue); const kind = kindValue;
  if (!id && req.method === 'POST') {
    const { metadata, files } = await assetUpload(req, kind === 'font');
    object(metadata, kind === 'logo' ? ['id', 'name', 'description', 'variationName', 'variationDescription'] : ['id', 'name', 'description']);
    const result = kind === 'logo' ? await store.createLogo(metadata as Parameters<AssetStore['createLogo']>[0], files[0]) : await store.createFont(metadata, files);
    json(res, result, 201); changed(); return true;
  }
  if (!id) throw new AssetError('Asset not found.', 404);
  if (req.method === 'GET' && !action) { json(res, await store.inspect(kind, id, url.searchParams.get('revision') ?? undefined)); return true; }
  if (req.method === 'GET' && action === 'file') {
    const revision = url.searchParams.get('revision'); if (!revision) throw new AssetError('Choose the saved version for this asset file.');
    const asset = readAssetRevision(root, kind, id, revision);
    const file = revisionFiles(asset).find(file => file.file === url.searchParams.get('file'));
    if (!file) throw new AssetError('This file is not part of the chosen asset version.', 404);
    const bytes = await readFile(assetFile(root, kind, id, file));
    const extension = file.file.split('.').at(-1)!;
    const mime = ({ png: 'image/png', svg: 'image/svg+xml', ttf: 'font/ttf', otf: 'font/otf', pdf: 'application/pdf' } as Record<string, string>)[extension];
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': bytes.length, 'Content-Disposition': `${extension === 'svg' ? 'attachment' : 'inline'}; filename="${id}.${extension}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(extension === 'svg' ? { 'Content-Security-Policy': "default-src 'none'; sandbox" } : {}) });
    res.end(bytes); return true;
  }
  if (req.method === 'PATCH' && !action) {
    const input = await body(req); object(input, ['expectedRevision', 'name', 'description', 'defaultVariation', 'variation', 'removeVariation', 'removeFace']);
    json(res, await store.revise(kind, id, input as Parameters<AssetStore['revise']>[2])); changed(); return true;
  }
  if (req.method === 'POST' && (action === 'archive' || action === 'restore')) {
    const input = await body(req); object(input, action === 'archive' ? ['expectedRevision', 'clearDefaults'] : ['expectedRevision']);
    if (input.clearDefaults !== undefined && typeof input.clearDefaults !== 'boolean') throw new AssetError('Confirm whether theme defaults should be cleared.');
    json(res, action === 'archive' ? await store.archive(kind, id, input.expectedRevision, input.clearDefaults) : await store.restore(kind, id, input.expectedRevision)); changed(); return true;
  }
  if (req.method === 'POST' && kind === 'logo' && action === 'variations') {
    const { metadata, files } = await assetUpload(req); object(metadata, ['expectedRevision', 'id', 'name', 'description', 'replaceId']);
    json(res, await store.addVariation(id, metadata as Parameters<AssetStore['addVariation']>[1], files[0])); changed(); return true;
  }
  if (req.method === 'POST' && kind === 'font' && action === 'faces') {
    const { metadata, files } = await assetUpload(req, true); object(metadata, ['expectedRevision']);
    json(res, await store.addFaces(id, metadata as Parameters<AssetStore['addFaces']>[1], files)); changed(); return true;
  }
  throw new AssetError('Asset action not found.', 404);
}
