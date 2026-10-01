/** A user-defined grouping. Folders are single-level and never move theme directories or change theme IDs. */
export interface ThemeFolder {
  id: string;
  name: string;
}

/** `themes/folders.json`: optional workspace organization for the theme catalog. */
export interface ThemeFoldersManifest {
  /** Version 1 allowed nested folders; it is flattened when read and saved as version 2 on the next change. */
  version: 2;
  folders: ThemeFolder[];
  /** Theme ID → folder ID. A theme without an entry is not in any folder. */
  assignments: Record<string, string>;
  /**
   * Legacy theme tags from before workspace `tags.json`. They are still read, and the next tag
   * change moves them into `tags.json`; folder changes keep them untouched until then.
   */
  tags?: Record<string, string[]>;
}

export const emptyThemeFolders = (): ThemeFoldersManifest => ({ version: 2, folders: [], assignments: {} });

export const themeFolderLimits = { folders: 1000, name: 80 } as const;

const controlCharacters = /[\u0000-\u001f\u007f\u2028\u2029]/u;

/** Folders are single-level; this explains why a parent or a `/` path is refused. */
export const nestedFolderProblem = 'Theme folders are single-level and cannot be nested.';

/** Returns an error message, or nothing when the trimmed name is usable. */
export function folderNameProblem(name: string) {
  if (!name) return 'Give the folder a name.';
  if (name.length > themeFolderLimits.name || controlCharacters.test(name)) return `Use a folder name of ${themeFolderLimits.name} characters or fewer, on one line.`;
  // “/” once separated nested folder paths; keeping it out avoids reading a name as a path.
  if (name.includes('/') || name === '.' || name === '..') return `Folder names cannot contain “/” or be “.” or “..”. ${nestedFolderProblem}`;
  return undefined;
}

export function sameFolderName(a: string, b: string) {
  return a.normalize('NFC').toLowerCase() === b.normalize('NFC').toLowerCase();
}

export function compareFolderNames(a: string, b: string) {
  return a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
}

/** Folders in display order. */
export function sortedFolders(manifest: ThemeFoldersManifest) {
  return [...manifest.folders].sort((a, b) => compareFolderNames(a.name, b.name));
}

/** The folder holding a theme, if any. */
export function themeFolder(manifest: ThemeFoldersManifest, themeId: string): ThemeFolder | undefined {
  const id = manifest.assignments[themeId];
  return id ? manifest.folders.find(folder => folder.id === id) : undefined;
}

/** Find a folder by name (ignoring case), then by ID. */
export function findFolder(manifest: ThemeFoldersManifest, nameOrId: string): ThemeFolder | undefined {
  const value = nameOrId.normalize('NFC').trim();
  if (!value) return undefined;
  return manifest.folders.find(folder => sameFolderName(folder.name, value)) ?? manifest.folders.find(folder => folder.id === value);
}

/** Folder filter: `undefined` matches every theme, `null` themes outside every folder, an ID that folder's themes. */
export function inFolder(manifest: ThemeFoldersManifest, themeId: string, folder: string | null | undefined) {
  return folder === undefined || (manifest.assignments[themeId] ?? null) === folder;
}

/** Number of listed themes in each folder, by folder ID. */
export function folderCounts(manifest: ThemeFoldersManifest, themeIds: Iterable<string>) {
  const counts = new Map(manifest.folders.map(folder => [folder.id, 0]));
  for (const id of themeIds) {
    const folder = manifest.assignments[id];
    if (folder && counts.has(folder)) counts.set(folder, counts.get(folder)! + 1);
  }
  return counts;
}

/** A name not used by any other folder: `Name`, then `Name 2`, `Name 3`, … within the length limit. */
export function uniqueFolderName(name: string, taken: (candidate: string) => boolean) {
  if (!taken(name)) return name;
  let index = 2, candidate: string;
  do candidate = `${name.slice(0, themeFolderLimits.name - String(index).length - 1).trimEnd()} ${index++}`;
  while (taken(candidate));
  return candidate;
}

/** Choice labels for theme pickers: the theme name, followed by its folder when it has one. */
export function themeChoiceLabel(theme: { id: string; name: string }, manifest?: ThemeFoldersManifest) {
  const folder = manifest && themeFolder(manifest, theme.id);
  return folder ? `${theme.name} (${folder.name})` : theme.name;
}
