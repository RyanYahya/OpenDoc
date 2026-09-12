import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import { documentEntry, validId } from './render';
import { atomicWrite } from './files';
import { readMedia, mediaFreshness, imageInfo, hashBytes } from '../media/files';
import type { GenerationRecord, } from '../media/files';
import type { MediaKind } from '../shared/media';
import { importMedia as importMediaUpload } from './media-mutations';
import { discoverDocumentIds } from './export-batch';
import { scanMaterials } from './materials';

/** Record only after generation and review; it is a provenance snapshot, not a generator. */
export async function recordMedia(root: string, documentId: string, id: string) {
  const entry = await documentEntry(root, documentId);
  const document = resolve(entry, '..');
  const asset = readMedia(document, id);
  const record: GenerationRecord = { version: 1, imageHash: asset.hash, inputs: asset.inputs, recordedAt: new Date().toISOString() };
  // Re-read immediately before publishing so an input change cannot be recorded as reviewed.
  const latest = readMedia(document, id);
  if (latest.hash !== asset.hash || JSON.stringify(latest.inputs) !== JSON.stringify(asset.inputs)) throw new Error('Media inputs changed while recording. Generate and review the current version first.');
  await atomicWrite(resolve(asset.directory, 'generation.json'), JSON.stringify(record, null, 2) + '\n');
  return record;
}
export async function importMedia(root: string, documentId: string, id: string, file: string, title: string, description: string, kind = 'image') {
  const input = resolve(file);
  const inputInfo = await stat(input);
  if (!inputInfo.isFile()) throw new Error('Choose a regular image file.');
  if (inputInfo.size > 50_000_000) throw new Error('Keep an embedding image below 50 MB.');
  const bytes = await readFile(input);
  const info = imageInfo(bytes);
  if (bytes.length > 50_000_000) throw new Error('Keep an embedding image below 50 MB.');
  const name = info.mime === 'image/png' ? 'image.png' : 'image.jpg';
  // Preserve the CLI's content-based input detection while sharing staged publication
  // and full image decoding with the browser upload path.
  const imported = await importMediaUpload(root, documentId, { id, title, description, kind: kind as MediaKind }, { filename: name, bytes });
  return { ...imported, file: `documents/${documentId}/media/${id}/${name}`, hash: hashBytes(bytes) };
}
const usage = 'Usage: npx opendoc media list [<document>] [--json]\n       npx opendoc media import <document> <media-id> --file <image> --title "Title" --description "Description" [--kind photo|illustration|chart|diagram|image]\n       npx opendoc media record <document> <media-id>\n       npx opendoc media check <document> <media-id>';
export async function runMediaCli(args: string[], root = process.cwd()): Promise<void> {
  const { values, positionals } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, allowPositionals: true, options: {
    file: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, kind: { type: 'string' },
    json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) { console.log(values.json ? JSON.stringify({ usage }, null, 2) : usage); return; }
  const [action = 'list', doc, id] = positionals;
  const importFlags = ['file', 'title', 'description', 'kind'];
  if (action !== 'import' && Object.keys(values).some(key => importFlags.includes(key))) throw new Error(usage);
  if (action === 'list' && positionals.length <= 2) {
    if (doc !== undefined && !validId(doc)) throw new Error(usage);
    const ids = doc === undefined ? await discoverDocumentIds(root) : [doc];
    for (const documentId of ids) await documentEntry(root, documentId);
    // Listing should not execute authored TSX. Without a render, usage remains explicitly unknown.
    console.log(JSON.stringify(await scanMaterials(root, ids.map(id => ({ id, status: 'rendering' as const, revision: 0 }))), null, 2));
    return;
  }
  if (!validId(doc ?? '')) throw new Error(usage);
  if (action === 'import' && positionals.length === 3 && values.file && values.title && values.description) {
    console.log(JSON.stringify(await importMedia(root, doc, id, values.file, values.title, values.description, values.kind), null, 2));
  } else if (action === 'record' && positionals.length === 3) {
    console.log(JSON.stringify(await recordMedia(root, doc, id), null, 2));
  } else if (action === 'check' && positionals.length === 3) {
    const entry = await documentEntry(root, doc);
    const media = readMedia(resolve(entry, '..'), id);
    const status = mediaFreshness(media);
    console.log(JSON.stringify({ meta: media.meta, ...status }, null, 2));
    if (status.freshness === 'stale' || status.freshness === 'unrecorded') process.exitCode = 1;
  } else throw new Error(usage);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runMediaCli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
