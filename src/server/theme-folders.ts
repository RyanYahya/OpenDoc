import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  emptyThemeFolders, findFolder, folderNameProblem, nestedFolderProblem, sameFolderName, themeFolderLimits, uniqueFolderName,
  type ThemeFolder, type ThemeFoldersManifest,
} from '../shared/theme-folders';
import { atomicWrite, withLocalLock } from './files';
import { validId } from './render';
import { themeFile } from './themes';

export const themeFoldersFile = 'themes/folders.json';

export class ThemeFoldersError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) { super(message); this.name = 'ThemeFoldersError'; }
}

/**
 * How a version 1 file with nested folders was flattened. Reading never writes; the flat result is
 * saved as version 2 by the next folder, assignment, or tag change.
 */
export interface ThemeFoldersMigration {
  from: 1;
  /** Formerly nested folders, now listed on their own under their own name. `from` is the old path. */
  flattened: { id: string; name: string; from: string }[];
  /** Folders renamed with a numeric suffix because another folder already had the name. */
  renamed: { id: string; from: string; to: string }[];
  /** Parent folders that held only subfolders and no themes, so nothing was left in them. */
  removed: { id: string; name: string }[];
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function folderName(value: unknown) {
  const name = typeof value === 'string' ? value.normalize('NFC').trim() : '';
  const problem = folderNameProblem(name);
  if (problem) throw new ThemeFoldersError(problem);
  return name;
}

type StoredFolder = ThemeFolder & { parent: string | null };

/**
 * Flatten version 1 nesting without losing a theme assignment. Each nested folder keeps its ID (so
 * assignments and links still resolve) and its own name; a parent left without themes is removed;
 * a clashing name gets the next free numeric suffix. Shallower folders keep their names first.
 */
export function flattenThemeFolders(stored: StoredFolder[], assignments: Record<string, string>): { folders: ThemeFolder[]; migration?: ThemeFoldersMigration } {
  const byId = new Map(stored.map(folder => [folder.id, folder]));
  /** The folder and its ancestors, outermost first. Parsing has already refused cycles. */
  const ancestry = (folder: StoredFolder) => {
    const chain = [folder];
    for (let parent = folder.parent ? byId.get(folder.parent) : undefined; parent; parent = parent.parent ? byId.get(parent.parent) : undefined) chain.unshift(parent);
    return chain;
  };
  if (!stored.some(folder => folder.parent !== null)) return { folders: stored.map(({ id, name }) => ({ id, name })) };
  const parents = new Set(stored.map(folder => folder.parent).filter(Boolean));
  const filed = new Set(Object.values(assignments));
  const removed = stored.filter(folder => parents.has(folder.id) && !filed.has(folder.id));
  const kept = stored.filter(folder => !removed.includes(folder));
  // Shallower folders claim their names first; file order breaks ties.
  const order = kept.map((folder, index) => ({ folder, index, depth: ancestry(folder).length })).sort((a, b) => a.depth - b.depth || a.index - b.index).map(entry => entry.folder);
  const names = new Map<string, string>();
  const clashing: StoredFolder[] = [];
  for (const folder of order) {
    if ([...names.values()].some(name => sameFolderName(name, folder.name))) clashing.push(folder);
    else names.set(folder.id, folder.name);
  }
  const renamed: ThemeFoldersMigration['renamed'] = [];
  for (const folder of clashing) {
    const name = uniqueFolderName(folder.name, candidate => [...names.values()].some(taken => sameFolderName(taken, candidate)));
    names.set(folder.id, name); renamed.push({ id: folder.id, from: folder.name, to: name });
  }
  return {
    folders: kept.map(folder => ({ id: folder.id, name: names.get(folder.id)! })),
    migration: {
      from: 1,
      flattened: kept.filter(folder => folder.parent !== null).map(folder => ({ id: folder.id, name: names.get(folder.id)!, from: ancestry(folder).map(item => item.name).join('/') })),
      renamed,
      removed: removed.map(({ id, name }) => ({ id, name })),
    },
  };
}

/** Validate the stored shape and flatten version 1 nesting. Unknown theme IDs are kept until a write prunes removed themes. */
export function parseThemeFoldersFile(value: unknown): { manifest: ThemeFoldersManifest; migration?: ThemeFoldersMigration } {
  const invalid = (reason: string) => new ThemeFoldersError(`${themeFoldersFile} is invalid: ${reason} Ask your agent to repair it; no organization data was replaced.`);
  if (!record(value) || (value.version !== 1 && value.version !== 2) || !Array.isArray(value.folders)) throw invalid('it needs version 2 and a folders list.');
  const legacy = value.version === 1;
  const unknownKey = Object.keys(value).find(key => !['version', 'folders', 'assignments', 'tags'].includes(key));
  if (unknownKey) throw invalid(`“${unknownKey}” is not a supported field.`);
  if (value.folders.length > themeFolderLimits.folders) throw invalid(`use ${themeFolderLimits.folders} folders or fewer.`);
  const stored: StoredFolder[] = [];
  for (const entry of value.folders) {
    if (!legacy && record(entry) && 'parent' in entry) throw invalid(`folder “${String(entry.id)}” has a parent. ${nestedFolderProblem}`);
    if (!record(entry) || Object.keys(entry).some(key => !['id', 'name', ...(legacy ? ['parent'] : [])].includes(key))) throw invalid(`each folder has only an id${legacy ? ', name, and parent' : ' and a name'}.`);
    if (typeof entry.id !== 'string' || !validId(entry.id) || entry.id.length > 80 || stored.some(folder => folder.id === entry.id)) throw invalid('folder IDs must be unique lowercase words joined by single hyphens.');
    const parent = legacy ? entry.parent : null;
    if (parent !== null && typeof parent !== 'string') throw invalid(`folder “${entry.id}” needs a parent folder ID or null.`);
    let name: string;
    try { name = folderName(entry.name); } catch (error) { throw invalid(`folder “${entry.id}”: ${(error as Error).message}`); }
    stored.push({ id: entry.id, name, parent });
  }
  const byId = new Map(stored.map(folder => [folder.id, folder]));
  for (const folder of stored) if (folder.parent !== null && !byId.has(folder.parent)) throw invalid(`folder “${folder.id}” has a missing parent.`);
  for (const folder of stored) {
    const seen = new Set([folder.id]);
    for (let parent = folder.parent; parent !== null; parent = byId.get(parent)!.parent) {
      if (seen.has(parent)) throw invalid(`folder “${folder.id}” is inside itself.`);
      seen.add(parent);
    }
    // Version 1 names were unique among siblings; version 2 folders share one level.
    if (stored.some(other => other !== folder && (!legacy || other.parent === folder.parent) && sameFolderName(other.name, folder.name))) throw invalid(`two folders${legacy ? ' in the same place' : ''} are named “${folder.name}”.`);
  }
  const assignments: Record<string, string> = {};
  if (value.assignments !== undefined) {
    if (!record(value.assignments)) throw invalid('assignments must map theme IDs to folder IDs.');
    for (const [themeId, folderId] of Object.entries(value.assignments)) {
      if (!validId(themeId) || typeof folderId !== 'string' || !byId.has(folderId)) throw invalid(`theme “${themeId}” is assigned to a missing folder.`);
      assignments[themeId] = folderId;
    }
  }
  const { folders, migration } = flattenThemeFolders(stored, assignments);
  const manifest: ThemeFoldersManifest = { version: 2, folders, assignments };
  // Legacy tags are carried unchanged until tags.json takes them over; tags.json validates them.
  if (value.tags !== undefined) {
    if (!record(value.tags)) throw invalid('tags must map theme IDs to lists of tags.');
    const tags: Record<string, string[]> = {};
    for (const [themeId, list] of Object.entries(value.tags)) {
      if (!validId(themeId)) throw invalid(`“${themeId}” is not a theme ID.`);
      if (!Array.isArray(list) || list.some(tag => typeof tag !== 'string')) throw invalid(`theme “${themeId}” needs a list of tags.`);
      if (list.length) tags[themeId] = [...list];
    }
    if (Object.keys(tags).length) manifest.tags = tags;
  }
  return { manifest, ...(migration ? { migration } : {}) };
}

export function parseThemeFolders(value: unknown): ThemeFoldersManifest {
  return parseThemeFoldersFile(value).manifest;
}

async function manifestFile(root: string) {
  const file = resolve(await realpath(root), themeFoldersFile);
  const info = await lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (info && (!info.isFile() || info.isSymbolicLink() || info.size > 1_000_000)) throw new ThemeFoldersError(`${themeFoldersFile} must be a regular local file smaller than 1 MB.`);
  return { file, exists: Boolean(info) };
}

/** The flat organization plus, for a nested version 1 file, how it was flattened. */
export async function readThemeFoldersFile(root: string): Promise<{ manifest: ThemeFoldersManifest; migration?: ThemeFoldersMigration }> {
  const { file, exists } = await manifestFile(root);
  if (!exists) return { manifest: emptyThemeFolders() };
  let value: unknown;
  try { value = JSON.parse(await readFile(file, 'utf8')); }
  catch { throw new ThemeFoldersError(`Could not read ${themeFoldersFile}. Ask your agent to repair it; no organization data was replaced.`); }
  return parseThemeFoldersFile(value);
}

/** A missing file means the catalog has no folders or tags. */
export async function readThemeFolders(root: string): Promise<ThemeFoldersManifest> {
  return (await readThemeFoldersFile(root)).manifest;
}

/** Theme directories that currently exist. Their definitions need not be valid to stay organized. */
export async function themeDirectories(root: string) {
  const entries = await readdir(resolve(root, 'themes'), { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  return new Set(entries.filter(entry => entry.isDirectory() && validId(entry.name)).map(entry => entry.name));
}

/** Serialize browser and CLI changes; each save writes version 2 and drops entries for theme folders that no longer exist. */
export async function withThemeFolders<T>(root: string, change: (manifest: ThemeFoldersManifest, save: () => Promise<void>) => Promise<T>): Promise<T> {
  const workspace = await realpath(root);
  return withLocalLock(workspace, 'theme-folders.lock', () => new ThemeFoldersError('Theme folders are busy. Try again when the other operation finishes.', 409), async () => {
    const manifest = await readThemeFolders(workspace);
    return change(manifest, async () => {
      const present = await themeDirectories(workspace);
      for (const key of ['assignments', 'tags'] as const) for (const id of Object.keys(manifest[key] ?? {})) if (!present.has(id)) delete manifest[key]![id];
      const { file } = await manifestFile(workspace);
      await atomicWrite(file, `${JSON.stringify(parseThemeFolders(manifest), null, 2)}\n`);
    });
  });
}

function requireFolder(manifest: ThemeFoldersManifest, id: unknown): ThemeFolder {
  const folder = typeof id === 'string' ? manifest.folders.find(folder => folder.id === id) : undefined;
  if (!folder) throw new ThemeFoldersError('This folder no longer exists. Reload the themes.', 404);
  return folder;
}

/** Earlier clients sent a parent; `null` still means a plain folder, and anything else is refused. */
function refuseParent(input: Record<string, unknown>) {
  if (input.parent !== undefined && input.parent !== null) throw new ThemeFoldersError(`${nestedFolderProblem} Create or rename the folder without a parent.`);
}

function assertUniqueName(manifest: ThemeFoldersManifest, name: string, except?: string) {
  if (manifest.folders.some(folder => folder.id !== except && sameFolderName(folder.name, name))) {
    throw new ThemeFoldersError(`A folder named “${name}” already exists. Choose another name.`, 409);
  }
}

function folderId(manifest: ThemeFoldersManifest, name: string) {
  const base = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72).replace(/-$/, '') || 'folder';
  const ids = new Set(manifest.folders.map(folder => folder.id));
  let id = base;
  for (let index = 2; ids.has(id); index++) id = `${base}-${index}`;
  return id;
}

async function requireTheme(root: string, id: string) {
  try { await themeFile(root, id, 'index.ts'); }
  catch { throw new ThemeFoldersError('This theme no longer exists. Reload the themes.', 404); }
}

export async function createThemeFolder(root: string, input: unknown) {
  if (!record(input) || Object.keys(input).some(key => !['name', 'parent'].includes(key))) throw new ThemeFoldersError('Provide a folder name.');
  refuseParent(input);
  const name = folderName(input.name);
  return withThemeFolders(root, async (manifest, save) => {
    assertUniqueName(manifest, name);
    if (manifest.folders.length >= themeFolderLimits.folders) throw new ThemeFoldersError(`Use ${themeFolderLimits.folders} folders or fewer.`, 409);
    const folder: ThemeFolder = { id: folderId(manifest, name), name };
    manifest.folders.push(folder);
    await save(); return { folder, manifest };
  });
}

/** Rename a folder. Its ID, and so its themes and links, stay the same. */
export async function renameThemeFolder(root: string, id: string, input: unknown) {
  if (!record(input) || Object.keys(input).some(key => !['name', 'parent'].includes(key))) throw new ThemeFoldersError('Provide a new folder name.');
  refuseParent(input);
  if (input.name === undefined) throw new ThemeFoldersError('Provide a new folder name.');
  const name = folderName(input.name);
  return withThemeFolders(root, async (manifest, save) => {
    const folder = requireFolder(manifest, id);
    assertUniqueName(manifest, name, folder.id);
    folder.name = name;
    await save(); return { folder, manifest };
  });
}

/** Remove only the grouping: its themes are no longer in a folder. Themes are never deleted. */
export async function deleteThemeFolder(root: string, id: string) {
  return withThemeFolders(root, async (manifest, save) => {
    const folder = requireFolder(manifest, id);
    const present = await themeDirectories(root);
    let unfiledThemes = 0;
    manifest.folders = manifest.folders.filter(item => item.id !== folder.id);
    for (const [themeId, assigned] of Object.entries(manifest.assignments)) {
      if (assigned !== folder.id) continue;
      delete manifest.assignments[themeId];
      if (present.has(themeId)) unfiledThemes++;
    }
    await save();
    return { deleted: folder, unfiledThemes, manifest };
  });
}

/** Place a theme in a folder, or in none with `null`. */
export async function assignThemeFolder(root: string, themeId: string, folder: unknown) {
  if (typeof themeId !== 'string' || !validId(themeId)) throw new ThemeFoldersError('Invalid theme ID.');
  await requireTheme(root, themeId);
  return withThemeFolders(root, async (manifest, save) => {
    const destination = folder === null || folder === undefined || folder === '' ? null : requireFolder(manifest, folder).id;
    if (destination) manifest.assignments[themeId] = destination;
    else delete manifest.assignments[themeId];
    await save(); return { id: themeId, folder: destination, manifest };
  });
}

/** Drop legacy theme tags once tags.json holds them. Called inside the tags lock. */
export async function removeLegacyThemeTags(root: string) {
  return withThemeFolders(root, async (manifest, save) => {
    if (!manifest.tags) return;
    delete manifest.tags;
    await save();
  });
}

/** Resolve a CLI folder name (or ID), or `none` for themes outside every folder. */
export function resolveFolderName(manifest: ThemeFoldersManifest, value: string): ThemeFolder | null {
  if (value.trim().toLowerCase() === 'none') return null;
  const folder = findFolder(manifest, value);
  if (folder) return folder;
  const last = value.split('/').map(part => part.trim()).filter(Boolean).at(-1);
  const hint = value.includes('/') && last ? ` ${nestedFolderProblem} Use the folder’s own name, such as “${last}”.` : '';
  throw new ThemeFoldersError(`No theme folder is named “${value}”.${hint} Use npx opendoc themes folders to list them.`, 404);
}

/** A CLI folder name for creation: a `/` path is refused with the name to use instead. */
export function cliFolderName(value: string) {
  const parts = value.split('/').map(part => part.trim()).filter(Boolean);
  if (parts.length > 1) throw new ThemeFoldersError(`${nestedFolderProblem} Create “${parts.at(-1)}” instead of “${value}”.`);
  return folderName(value);
}
