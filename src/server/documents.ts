import type { DocumentFormat } from '../shared/types';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile, copyFile, realpath } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import ts from 'typescript';
import { atomicWrite } from './files';
import { validId } from './render';
import { documentDisplayName, ProjectError, requireProject, withProjects } from './projects';

async function exists(path: string) {
  return lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
}
async function localDirectory(path: string, create = false) {
  if (create) await mkdir(path, { recursive: true });
  const info = await exists(path);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new ProjectError('Document folders must be regular local directories.', 409);
  return path;
}
async function documentFolder(root: string, id: string) {
  if (!validId(id) || id.length > 80) throw new ProjectError('Invalid document ID.');
  const documents = await localDirectory(resolve(await realpath(root), 'documents'));
  const folder = resolve(documents, id);
  if (!await exists(folder)) throw new ProjectError('This document no longer exists.', 404);
  await localDirectory(folder);
  const entry = await exists(resolve(folder, 'index.tsx'));
  if (!entry?.isFile() || entry.isSymbolicLink()) throw new ProjectError('The document needs a regular index.tsx file.', 409);
  return folder;
}
async function trashFolder(root: string) {
  const runtime = await localDirectory(resolve(await realpath(root), '.opendoc'));
  return localDirectory(resolve(runtime, 'trash'), true);
}

export async function renameDocument(root: string, id: string, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'name')) throw new ProjectError('Provide a document name.');
  const name = documentDisplayName((input as { name?: unknown }).name);
  return withProjects(root, async (manifest, save) => {
    await documentFolder(root, id);
    (manifest.names ??= {})[id] = name;
    await save(); return { id, name };
  });
}

/** Rebind local source paths, without replacing words in authored prose or stable block IDs. */
function rebaseSource(text: string, file: string, root: string, from: string, to: string) {
  const prefixes = [[`documents/${from}/`, `documents/${to}/`], [`${resolve(root, 'documents', from)}/`, `${resolve(root, 'documents', to)}/`]];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, extname(file) === '.json' ? ts.ScriptKind.JSON : extname(file) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const changes: { start: number; end: number; value: string }[] = [];
  function visit(node: ts.Node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const match = prefixes.find(([prefix]) => node.text.startsWith(prefix));
      if (match) changes.push({ start: node.getStart(source), end: node.end, value: JSON.stringify(match[1] + node.text.slice(match[0].length)) });
      // Supplied layout starters bind provenance and media through this instance constant.
      else if (node.text === from && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name) && node.parent.name.text === 'documentId') changes.push({ start: node.getStart(source), end: node.end, value: JSON.stringify(to) });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const change of changes.sort((a, b) => b.start - a.start)) text = text.slice(0, change.start) + change.value + text.slice(change.end);
  return text;
}
async function copyDocumentTree(source: string, destination: string, root: string, from: string, to: string) {
  await mkdir(destination);
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const input = resolve(source, entry.name), output = resolve(destination, entry.name);
    if (entry.isDirectory()) await copyDocumentTree(input, output, root, from, to);
    else if (entry.isFile()) {
      if (/\.(?:tsx?|jsx?|mjs|json)$/.test(entry.name)) await writeFile(output, rebaseSource(await readFile(input, 'utf8'), entry.name, root, from, to), { flag: 'wx' });
      else await copyFile(input, output);
    } else throw new ProjectError('This document contains a link or special file. Replace it with a local file before duplicating.', 409);
  }
}

export async function duplicateDocument(root: string, id: string, title: string) {
  return withProjects(root, async (manifest, save) => {
    const source = await documentFolder(root, id);
    const project = requireProject(manifest, manifest.assignments[id]);
    const stem = `${id.slice(0, 65).replace(/-$/, '')}-copy`;
    let copyId = stem, suffix = 2;
    while (await exists(resolve(root, 'documents', copyId)) || Object.hasOwn(manifest.assignments, copyId) || (manifest.names && Object.hasOwn(manifest.names, copyId)) || (manifest.formats && Object.hasOwn(manifest.formats, copyId))) copyId = `${stem}-${suffix++}`;
    const staging = resolve(root, 'documents', `.copy-${randomUUID()}`);
    const name = documentDisplayName(`Copy of ${((manifest.names && Object.hasOwn(manifest.names, id) ? manifest.names[id] : title)).replace(/[\r\n]/g, ' ').trim()}`.slice(0, 160));
    try {
      await copyDocumentTree(source, staging, root, id, copyId);
      manifest.assignments[copyId] = project.id;
      (manifest.names ??= {})[copyId] = name;
      if (manifest.formats && Object.hasOwn(manifest.formats, id)) manifest.formats[copyId] = manifest.formats[id];
      await save();
      try { await rename(staging, resolve(root, 'documents', copyId)); }
      catch (error) { delete manifest.assignments[copyId]; delete manifest.names[copyId]; if (manifest.formats) delete manifest.formats[copyId]; await save(); throw error; }
      return { id: copyId, projectId: project.id, name };
    } finally { await rm(staging, { recursive: true, force: true }); }
  });
}

interface TrashReceipt { format?: DocumentFormat; id: string; projectId: string | null; name?: string; deletedAt: string }

export async function deleteDocument(root: string, id: string) {
  return withProjects(root, async (manifest, save) => {
    const source = await documentFolder(root, id);
    const restoreId = randomUUID();
    const trash = resolve(await trashFolder(root), restoreId);
    await mkdir(trash);
    const receipt: TrashReceipt = { id, format: manifest.formats && Object.hasOwn(manifest.formats, id) ? manifest.formats[id] : 'document', projectId: Object.hasOwn(manifest.assignments, id) ? manifest.assignments[id] : null, name: manifest.names && Object.hasOwn(manifest.names, id) ? manifest.names[id] : undefined, deletedAt: new Date().toISOString() };
    await atomicWrite(resolve(trash, 'receipt.json'), JSON.stringify(receipt, null, 2));
    await rename(source, resolve(trash, 'document'));
    delete manifest.assignments[id];
    if (manifest.names) delete manifest.names[id];
    if (manifest.formats) delete manifest.formats[id];
    try { await save(); }
    catch (error) { await rename(resolve(trash, 'document'), source); await rm(trash, { recursive: true, force: true }); throw error; }
    return { id, restoreId };
  });
}

export async function restoreDocument(root: string, restoreId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(restoreId)) throw new ProjectError('Invalid deleted document.');
  return withProjects(root, async (manifest, save) => {
    const trash = resolve(await trashFolder(root), restoreId);
    if (!await exists(trash)) throw new ProjectError('This document has already been restored or is no longer in Trash.', 404);
    await localDirectory(trash);
    const receiptFile = resolve(trash, 'receipt.json');
    const info = await exists(receiptFile);
    if (!info?.isFile() || info.isSymbolicLink() || info.size > 4096) throw new ProjectError('The deleted document record is invalid.', 409);
    const receipt = JSON.parse(await readFile(receiptFile, 'utf8')) as TrashReceipt;
    if (!receipt || typeof receipt.id !== 'string' || !validId(receipt.id) || receipt.id.length > 80 || (receipt.projectId !== null && typeof receipt.projectId !== 'string')) throw new ProjectError('The deleted document record is invalid.', 409);
    if (receipt.format !== undefined && receipt.format !== 'document' && receipt.format !== 'presentation') throw new ProjectError('The deleted document format is invalid.', 409);
    if (receipt.name !== undefined) documentDisplayName(receipt.name);
    if (receipt.projectId) requireProject(manifest, receipt.projectId);
    const documents = await localDirectory(resolve(root, 'documents'));
    const destination = resolve(documents, receipt.id);
    if (await exists(destination) || Object.hasOwn(manifest.assignments, receipt.id) || (manifest.names && Object.hasOwn(manifest.names, receipt.id)) || (manifest.formats && Object.hasOwn(manifest.formats, receipt.id))) throw new ProjectError('A document already uses this ID. Move it aside before restoring this copy.', 409);
    await localDirectory(resolve(trash, 'document'));
    if (receipt.projectId) manifest.assignments[receipt.id] = receipt.projectId;
    if (receipt.name !== undefined) (manifest.names ??= {})[receipt.id] = receipt.name;
    if (receipt.format !== undefined) (manifest.formats ??= {})[receipt.id] = receipt.format;
    await save();
    try { await rename(resolve(trash, 'document'), destination); }
    catch (error) { delete manifest.assignments[receipt.id]; if (manifest.names) delete manifest.names[receipt.id]; if (manifest.formats) delete manifest.formats[receipt.id]; await save(); throw error; }
    await rm(trash, { recursive: true, force: true });
    return { id: receipt.id, projectId: receipt.projectId, name: receipt.name };
  });
}
