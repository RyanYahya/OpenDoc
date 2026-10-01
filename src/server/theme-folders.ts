import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  emptyThemeFolders, findFolderByPath, folderDescendants, folderNameProblem, folderPath, sameFolderName, themeFolderLimits,
  type ThemeFolder, type ThemeFoldersManifest,
} from '../shared/theme-folders';
import { atomicWrite, withLocalLock } from './files';
import { validId } from './render';
import { themeFile } from './themes';

export const themeFoldersFile = 'themes/folders.json';

export class ThemeFoldersError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) { super(message); this.name = 'ThemeFoldersError'; }
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

/** Validate the stored shape. Unknown theme IDs are kept until a write prunes removed themes. */
export function parseThemeFolders(value: unknown): ThemeFoldersManifest {
  const invalid = (reason: string) => new ThemeFoldersError(`${themeFoldersFile} is invalid: ${reason} Ask your agent to repair it; no organization data was replaced.`);
  if (!record(value) || value.version !== 1 || !Array.isArray(value.folders)) throw invalid('it needs version 1 and a folders list.');
  const unknownKey = Object.keys(value).find(key => !['version', 'folders', 'assignments', 'tags'].includes(key));
  if (unknownKey) throw invalid(`“${unknownKey}” is not a supported field.`);
  if (value.folders.length > themeFolderLimits.folders) throw invalid(`use ${themeFolderLimits.folders} folders or fewer.`);
  const folders: ThemeFolder[] = [];
  for (const entry of value.folders) {
    if (!record(entry) || Object.keys(entry).some(key => !['id', 'name', 'parent'].includes(key))) throw invalid('each folder has only an id, name, and parent.');
    if (typeof entry.id !== 'string' || !validId(entry.id) || entry.id.length > 80 || folders.some(folder => folder.id === entry.id)) throw invalid('folder IDs must be unique lowercase words joined by single hyphens.');
    if (entry.parent !== null && typeof entry.parent !== 'string') throw invalid(`folder “${entry.id}” needs a parent folder ID or null.`);
    let name: string;
    try { name = folderName(entry.name); } catch (error) { throw invalid(`folder “${entry.id}”: ${(error as Error).message}`); }
    folders.push({ id: entry.id, name, parent: entry.parent });
  }
  const manifest: ThemeFoldersManifest = { version: 1, folders, assignments: {} };
  const ids = new Set(folders.map(folder => folder.id));
  for (const folder of folders) {
    if (folder.parent !== null && !ids.has(folder.parent)) throw invalid(`folder “${folder.id}” has a missing parent.`);
    if (folder.parent !== null && folderDescendants(manifest, folder.id).has(folder.parent)) throw invalid(`folder “${folder.id}” is inside itself.`);
    if (folders.some(other => other !== folder && other.parent === folder.parent && sameFolderName(other.name, folder.name))) throw invalid(`two folders in the same place are named “${folder.name}”.`);
  }
  if (value.assignments !== undefined) {
    if (!record(value.assignments)) throw invalid('assignments must map theme IDs to folder IDs.');
    for (const [themeId, folderId] of Object.entries(value.assignments)) {
      if (!validId(themeId) || typeof folderId !== 'string' || !ids.has(folderId)) throw invalid(`theme “${themeId}” is assigned to a missing folder.`);
      manifest.assignments[themeId] = folderId;
    }
  }
  // Legacy tags are carried unchanged until tags.json takes them over; tags.json validates them.
  if (value.tags !== undefined) {
    if (!record(value.tags)) throw invalid('tags must map theme IDs to lists of tags.');
    const legacy: Record<string, string[]> = {};
    for (const [themeId, list] of Object.entries(value.tags)) {
      if (!validId(themeId)) throw invalid(`“${themeId}” is not a theme ID.`);
      if (!Array.isArray(list) || list.some(tag => typeof tag !== 'string')) throw invalid(`theme “${themeId}” needs a list of tags.`);
      if (list.length) legacy[themeId] = [...list];
    }
    if (Object.keys(legacy).length) manifest.tags = legacy;
  }
  return manifest;
}

async function manifestFile(root: string) {
  const file = resolve(await realpath(root), themeFoldersFile);
  const info = await lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (info && (!info.isFile() || info.isSymbolicLink() || info.size > 1_000_000)) throw new ThemeFoldersError(`${themeFoldersFile} must be a regular local file smaller than 1 MB.`);
  return { file, exists: Boolean(info) };
}

/** A missing file means the catalog has no folders or tags. */
export async function readThemeFolders(root: string): Promise<ThemeFoldersManifest> {
  const { file, exists } = await manifestFile(root);
  if (!exists) return emptyThemeFolders();
  let value: unknown;
  try { value = JSON.parse(await readFile(file, 'utf8')); }
  catch { throw new ThemeFoldersError(`Could not read ${themeFoldersFile}. Ask your agent to repair it; no organization data was replaced.`); }
  return parseThemeFolders(value);
}

/** Theme directories that currently exist. Their definitions need not be valid to stay organized. */
export async function themeDirectories(root: string) {
  const entries = await readdir(resolve(root, 'themes'), { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  return new Set(entries.filter(entry => entry.isDirectory() && validId(entry.name)).map(entry => entry.name));
}

/** Serialize browser and CLI changes; each save drops entries for theme folders that no longer exist. */
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

function parentFolder(manifest: ThemeFoldersManifest, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return requireFolder(manifest, value).id;
}

function assertUniqueName(manifest: ThemeFoldersManifest, name: string, parent: string | null, except?: string) {
  if (manifest.folders.some(folder => folder.id !== except && folder.parent === parent && sameFolderName(folder.name, name))) {
    throw new ThemeFoldersError(`A folder named “${name}” already exists here. Choose another name.`, 409);
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
  if (!record(input) || Object.keys(input).some(key => !['name', 'parent'].includes(key))) throw new ThemeFoldersError('Provide a folder name and an optional parent folder.');
  const name = folderName(input.name);
  return withThemeFolders(root, async (manifest, save) => {
    const parent = parentFolder(manifest, input.parent);
    assertUniqueName(manifest, name, parent);
    if (manifest.folders.length >= themeFolderLimits.folders) throw new ThemeFoldersError(`Use ${themeFolderLimits.folders} folders or fewer.`, 409);
    const folder: ThemeFolder = { id: folderId(manifest, name), name, parent };
    manifest.folders.push(folder);
    await save(); return { folder, manifest };
  });
}

/** Rename and/or move a folder. Moving into itself or a nested folder is refused. */
export async function updateThemeFolder(root: string, id: string, input: unknown) {
  if (!record(input) || !Object.keys(input).length || Object.keys(input).some(key => !['name', 'parent'].includes(key))) throw new ThemeFoldersError('Provide a new folder name or parent folder.');
  return withThemeFolders(root, async (manifest, save) => {
    const folder = requireFolder(manifest, id);
    const name = input.name === undefined ? folder.name : folderName(input.name);
    const parent = Object.hasOwn(input, 'parent') ? parentFolder(manifest, input.parent) : folder.parent;
    if (parent !== null && folderDescendants(manifest, folder.id).has(parent)) throw new ThemeFoldersError('A folder cannot move into itself or one of its subfolders.', 409);
    assertUniqueName(manifest, name, parent, folder.id);
    folder.name = name; folder.parent = parent;
    await save(); return { folder, manifest };
  });
}

/** Remove only the grouping: its themes and subfolders move to the parent. Themes are never deleted. */
export async function deleteThemeFolder(root: string, id: string) {
  return withThemeFolders(root, async (manifest, save) => {
    const folder = requireFolder(manifest, id);
    const present = await themeDirectories(root);
    const renamed: { from: string; to: string }[] = [];
    let movedFolders = 0, movedThemes = 0;
    manifest.folders = manifest.folders.filter(item => item.id !== folder.id);
    for (const child of manifest.folders.filter(item => item.parent === folder.id)) {
      child.parent = folder.parent; movedFolders++;
      if (manifest.folders.some(other => other !== child && other.parent === child.parent && sameFolderName(other.name, child.name))) {
        let index = 2, name: string;
        do name = `${child.name.slice(0, themeFolderLimits.name - String(index).length - 1)} ${index++}`;
        while (manifest.folders.some(other => other !== child && other.parent === child.parent && sameFolderName(other.name, name)));
        renamed.push({ from: child.name, to: name }); child.name = name;
      }
    }
    for (const [themeId, assigned] of Object.entries(manifest.assignments)) {
      if (assigned !== folder.id) continue;
      if (folder.parent) manifest.assignments[themeId] = folder.parent;
      else delete manifest.assignments[themeId];
      if (present.has(themeId)) movedThemes++;
    }
    await save();
    return { deleted: folder, parent: folder.parent, movedThemes, movedFolders, renamed, manifest };
  });
}

/** Place a theme in a folder, or at the top level with `null`. */
export async function assignThemeFolder(root: string, themeId: string, folder: unknown) {
  if (typeof themeId !== 'string' || !validId(themeId)) throw new ThemeFoldersError('Invalid theme ID.');
  await requireTheme(root, themeId);
  return withThemeFolders(root, async (manifest, save) => {
    const destination = parentFolder(manifest, folder);
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

/** Resolve a CLI folder path, or `none`/`/` for the top level. */
export function resolveFolderPath(manifest: ThemeFoldersManifest, path: string): ThemeFolder | null {
  if (['none', '/', ''].includes(path.trim())) return null;
  const folder = findFolderByPath(manifest, path);
  if (!folder) throw new ThemeFoldersError(`No theme folder matches “${path}”. Use npx opendoc themes folders to list them.`, 404);
  return folder;
}

/** Create each missing folder along a path, like `mkdir -p`. */
export async function createThemeFolderPath(root: string, path: string) {
  const names = path.split('/').map(name => folderName(name));
  if (!names.length) throw new ThemeFoldersError('Give the folder a name.');
  return withThemeFolders(root, async (manifest, save) => {
    let parent: string | null = null;
    let folder: ThemeFolder | undefined;
    const created: string[] = [];
    for (const name of names) {
      folder = manifest.folders.find(item => item.parent === parent && sameFolderName(item.name, name));
      if (!folder) {
        if (manifest.folders.length >= themeFolderLimits.folders) throw new ThemeFoldersError(`Use ${themeFolderLimits.folders} folders or fewer.`, 409);
        folder = { id: folderId(manifest, name), name, parent };
        manifest.folders.push(folder); created.push(folder.id);
      }
      parent = folder.id;
    }
    if (!created.length) throw new ThemeFoldersError(`The folder “${path}” already exists.`, 409);
    await save();
    return { folder: folder!, path: folderPath(manifest, folder!.id), created };
  });
}
