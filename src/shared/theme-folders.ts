/** A user-defined grouping. Folders never move theme directories or change theme IDs. */
export interface ThemeFolder {
  id: string;
  name: string;
  parent: string | null;
}

/** `themes/folders.json`: optional workspace organization for the theme catalog. */
export interface ThemeFoldersManifest {
  version: 1;
  folders: ThemeFolder[];
  /** Theme ID → folder ID. A theme without an entry is at the top level. */
  assignments: Record<string, string>;
  /**
   * Legacy theme tags from before workspace `tags.json`. They are still read, and the next tag
   * change moves them into `tags.json`; folder changes keep them untouched until then.
   */
  tags?: Record<string, string[]>;
}

export const emptyThemeFolders = (): ThemeFoldersManifest => ({ version: 1, folders: [], assignments: {} });

export const themeFolderLimits = { folders: 1000, name: 80 } as const;

/** Separates folder names in paths such as `Clients/Acme`; folder names cannot contain it. */
export const folderPathSeparator = '/';

const controlCharacters = /[\u0000-\u001f\u007f\u2028\u2029]/u;

/** Returns an error message, or nothing when the trimmed name is usable. */
export function folderNameProblem(name: string) {
  if (!name) return 'Give the folder a name.';
  if (name.length > themeFolderLimits.name || controlCharacters.test(name)) return `Use a folder name of ${themeFolderLimits.name} characters or fewer, on one line.`;
  if (name.includes(folderPathSeparator) || name === '.' || name === '..') return 'Folder names cannot contain “/” or be “.” or “..”.';
  return undefined;
}

export function sameFolderName(a: string, b: string) {
  return a.normalize('NFC').toLowerCase() === b.normalize('NFC').toLowerCase();
}

export function folderChildren(manifest: ThemeFoldersManifest, parent: string | null) {
  return manifest.folders.filter(folder => folder.parent === parent).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }));
}

/** The folder and its ancestors, outermost first. Stops safely on unexpected cycles. */
export function folderAncestors(manifest: ThemeFoldersManifest, id: string | null | undefined): ThemeFolder[] {
  const byId = new Map(manifest.folders.map(folder => [folder.id, folder]));
  const chain: ThemeFolder[] = [];
  const seen = new Set<string>();
  let current = id ? byId.get(id) : undefined;
  while (current && !seen.has(current.id)) { seen.add(current.id); chain.unshift(current); current = current.parent ? byId.get(current.parent) : undefined; }
  return chain;
}

export function folderPath(manifest: ThemeFoldersManifest, id: string | null | undefined): string | null {
  const chain = folderAncestors(manifest, id);
  return chain.length ? chain.map(folder => folder.name).join(folderPathSeparator) : null;
}

/** The folder and every folder nested inside it. */
export function folderDescendants(manifest: ThemeFoldersManifest, id: string) {
  const result = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of manifest.folders) if (folder.parent && result.has(folder.parent) && !result.has(folder.id)) { result.add(folder.id); grew = true; }
  }
  return result;
}

/** Resolve a `/`-separated path, ignoring case and surrounding slashes. */
export function findFolderByPath(manifest: ThemeFoldersManifest, path: string): ThemeFolder | undefined {
  const names = path.split(folderPathSeparator).map(name => name.trim()).filter(Boolean);
  if (!names.length) return undefined;
  let parent: string | null = null;
  let found: ThemeFolder | undefined;
  for (const name of names) {
    found = manifest.folders.find(folder => folder.parent === parent && sameFolderName(folder.name, name));
    if (!found) return undefined;
    parent = found.id;
  }
  return found;
}

/** Choice labels for theme pickers: the theme name, followed by its folder when it has one. */
export function themeChoiceLabel(theme: { id: string; name: string }, manifest?: ThemeFoldersManifest) {
  const path = manifest && folderPath(manifest, manifest.assignments[theme.id]);
  return path ? `${theme.name} (${path.split(folderPathSeparator).join(' / ')})` : theme.name;
}
