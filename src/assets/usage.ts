import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import type { AssetKind, AssetRef, AssetUsage, DocumentAssets } from '../shared/assets';
import type { DocumentState, RenderArtifact } from '../shared/types';
import { assertAssetId, assertKind, readDocumentAssetsAt, readThemeAssetDefaults, safeAssetPath, validAssetId, validRevision } from './files';

async function directories(root: string, folder: string) {
  try {
    const path = safeAssetPath(root, folder, true);
    return (await readdir(path, { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name).sort();
  } catch { return []; }
}
async function localText(root: string, file: string, maximum = 512_000) {
  try { const path = safeAssetPath(root, file); if ((await lstat(path)).size > maximum) return undefined; return await readFile(path, 'utf8'); }
  catch { return undefined; }
}
async function localJson(root: string, file: string, maximum?: number): Promise<any> {
  const text = await localText(root, file, maximum);
  if (text === undefined) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}
function literalName(contents: string | undefined, property: 'name' | 'title', themeId?: string) {
  if (!contents) return undefined;
  const source = ts.createSourceFile('index.tsx', contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: string | undefined;
  function value(node: ts.ObjectLiteralExpression, key: string) {
    for (const field of node.properties) if (ts.isPropertyAssignment(field) && (ts.isIdentifier(field.name) || ts.isStringLiteral(field.name)) && field.name.text === key && (ts.isStringLiteral(field.initializer) || ts.isNoSubstitutionTemplateLiteral(field.initializer))) return field.initializer.text;
  }
  function visit(node: ts.Node) {
    if (found) return;
    if (ts.isObjectLiteralExpression(node) && (themeId ? value(node, 'id') === themeId : ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name) && node.parent.name.text === 'meta')) found = value(node, property)?.trim() || undefined;
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}
function bindingRoles(bindings: DocumentAssets, kind: AssetKind) {
  const entries: [string, AssetRef | undefined][] = kind === 'logo'
    ? [['logo', bindings.logo], ...Object.entries(bindings.logos ?? {}).map(([name, ref]) => [`logo:${name}`, ref] as [string, AssetRef])]
    : [['body', bindings.bodyFont], ['headings', bindings.headingFont]];
  return entries.filter((entry): entry is [string, AssetRef] => !!entry[1]);
}
const choices = (bindings: DocumentAssets, kind: AssetKind, id: string) => bindingRoles(bindings, kind).filter(([, reference]) => reference.id === id);
function actualRevisions(artifact: RenderArtifact | undefined, kind: AssetKind, id: string) {
  return new Set((Array.isArray(artifact?.assets) ? artifact.assets : []).filter(use => use && use.kind === kind && use.id === id && validRevision(use.revision)).map(use => use.revision));
}

/** Read relationships without rendering a theme, evaluating document source, or guessing PDF usage. */
export async function assetUsage(workspace: string, kind: AssetKind, id: string, states?: DocumentState[]): Promise<AssetUsage> {
  assertKind(kind); assertAssetId(id);
  const root = await realpath(workspace);
  const usage: AssetUsage = { themes: [], documents: [] };
  for (const themeId of await directories(root, resolve(root, 'themes'))) {
    if (!validAssetId(themeId)) continue;
    try {
      const defaults = readThemeAssetDefaults(root, themeId);
      const roles = kind === 'logo' ? defaults.logo?.id === id ? ['logo'] : [] : [defaults.bodyFont === id ? 'body' : '', defaults.headingFont === id ? 'headings' : ''].filter(Boolean);
      if (roles.length) usage.themes.push({ id: themeId, name: literalName(await localText(root, resolve(root, 'themes', themeId, 'index.ts')), 'name', themeId) ?? themeId, roles });
    } catch { /* An invalid neighboring theme is reported by its own inspector. */ }
  }
  const projectManifest = await localJson(root, resolve(root, 'projects.json'), 1_000_000);
  const names = projectManifest?.names && typeof projectManifest.names === 'object' ? projectManifest.names as Record<string, unknown> : {};
  const live = new Map((states ?? []).map(state => [state.id, state]));
  const documents: { id: string; folder: string; name?: string; trashed?: boolean; deletedAt?: number }[] = [];
  for (const documentId of await directories(root, resolve(root, 'documents'))) {
    if (!validAssetId(documentId)) continue;
    const folder = resolve(root, 'documents', documentId);
    if (await localText(root, resolve(folder, 'index.tsx')) === undefined) continue;
    documents.push({ id: documentId, folder });
  }
  for (const restoreId of await directories(root, resolve(root, '.opendoc/trash'))) {
    const receipt = await localJson(root, resolve(root, '.opendoc/trash', restoreId, 'receipt.json'), 4096);
    if (!validAssetId(receipt?.id)) continue;
    const folder = resolve(root, '.opendoc/trash', restoreId, 'document');
    if (await localText(root, resolve(folder, 'index.tsx')) === undefined) continue;
    documents.push({ id: receipt.id, folder, trashed: true, ...(Number.isFinite(Date.parse(receipt.deletedAt)) ? { deletedAt: Date.parse(receipt.deletedAt) } : {}), ...(typeof receipt.name === 'string' && receipt.name.trim() ? { name: receipt.name } : {}) });
  }
  // Live states carry the authoritative last successful PDF. CLI readers may use
  // persisted render artifacts as historical evidence, never as current readiness.
  const persisted = new Map<string, RenderArtifact>();
  const needed = documents.filter(doc => doc.trashed || !live.get(doc.id)?.artifact);
  const neededIds = new Set(needed.map(doc => doc.id));
  if (needed.length) for (const folder of await directories(root, resolve(root, '.opendoc/renders'))) {
    const documentId = folder.replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, '');
    if (!neededIds.has(documentId)) continue;
    const artifact = await localJson(root, resolve(root, '.opendoc/renders', folder, 'artifact.json'), 16_000_000) as RenderArtifact | undefined;
    if (artifact?.provenance?.entry !== `documents/${documentId}/index.tsx` || !Number.isFinite(Date.parse(artifact.renderedAt))) continue;
    for (const document of needed.filter(doc => doc.id === documentId)) {
      // IDs can be reused after deleting a document. A newer PDF must never be
      // attributed to the old copy in Trash merely because its path once matched.
      if (document.trashed && (document.deletedAt === undefined || Date.parse(artifact.renderedAt) > document.deletedAt)) continue;
      const previous = persisted.get(document.folder);
      if (!previous || Date.parse(previous.renderedAt) < Date.parse(artifact.renderedAt)) persisted.set(document.folder, artifact);
    }
  }
  for (const document of documents) {
    const state = document.trashed ? undefined : live.get(document.id);
    const artifact = state?.artifact ?? persisted.get(document.folder);
    let bindings: DocumentAssets = { version: 1 };
    try { bindings = readDocumentAssetsAt(root, document.folder); } catch { /* Retain actual PDF evidence even when the saved choices need repair. */ }
    const bound = choices(bindings, kind, id), rendered = actualRevisions(artifact, kind, id);
    const revisions = new Set([...bound.map(([, reference]) => reference.revision), ...rendered]);
    if (!revisions.size) continue;
    const savedName = !document.trashed && typeof names[document.id] === 'string' ? names[document.id] as string : undefined;
    const name = document.name ?? state?.name ?? savedName ?? (typeof artifact?.meta?.title === 'string' ? artifact.meta.title : undefined) ?? literalName(await localText(root, resolve(document.folder, 'index.tsx')), 'title') ?? document.id;
    for (const revision of revisions) {
      const renderedBindings = artifact?.assetBindings;
      const roles = new Set(bound.filter(([, reference]) => reference.revision === revision).map(([role]) => role));
      if (rendered.has(revision) && renderedBindings) for (const [role, reference] of choices(renderedBindings, kind, id)) if (reference.revision === revision) roles.add(role);
      const rebound = [...roles].some(role => !bindingRoles(bindings, kind).some(([currentRole, reference]) => currentRole === role && reference.id === id && reference.revision === revision));
      usage.documents.push({ id: document.id, name, revision, roles: [...roles], rendered: rendered.has(revision), current: !!state && state.status === 'ready' && rendered.has(revision) && !rebound, ...(document.trashed ? { trashed: true } : {}) });
    }
  }
  usage.themes.sort((a, b) => a.name.localeCompare(b.name));
  usage.documents.sort((a, b) => a.name.localeCompare(b.name) || Number(!!a.trashed) - Number(!!b.trashed) || a.revision.localeCompare(b.revision));
  return usage;
}
