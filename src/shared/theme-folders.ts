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
  /** Theme ID → display tags, unique without regard to case. */
  tags: Record<string, string[]>;
}

export const emptyThemeFolders = (): ThemeFoldersManifest => ({ version: 1, folders: [], assignments: {}, tags: {} });

export const themeFolderLimits = { folders: 1000, name: 80, tag: 40, tagsPerTheme: 20 } as const;

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

/** Trim and collapse whitespace while keeping the author's capitalization. */
export function cleanTag(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

export function tagKey(tag: string) {
  return cleanTag(tag).toLowerCase();
}

export function tagProblem(tag: string) {
  if (!tag) return 'Tags cannot be empty.';
  if (tag.length > themeFolderLimits.tag || controlCharacters.test(tag) || tag.includes(',')) return `Use tags of ${themeFolderLimits.tag} characters or fewer, without commas.`;
  return undefined;
}

/**
 * Clean, validate, and deduplicate tags without regard to case. When another theme already
 * uses a tag with different capitalization, reuse that spelling so the filter stays tidy.
 */
export function normalizeTags(values: readonly string[], vocabulary: readonly string[] = []) {
  const known = new Map(vocabulary.map(tag => [tagKey(tag), tag]));
  const result = new Map<string, string>();
  for (const value of values) {
    const tag = cleanTag(value);
    const problem = tagProblem(tag);
    if (problem) throw new Error(problem);
    const key = tag.toLowerCase();
    if (!result.has(key)) result.set(key, known.get(key) ?? tag);
  }
  if (result.size > themeFolderLimits.tagsPerTheme) throw new Error(`Use up to ${themeFolderLimits.tagsPerTheme} tags for each theme.`);
  return [...result.values()];
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

/** Every tag in use, with one display spelling and a count of themes, ordered by name. */
export function tagCatalog(manifest: ThemeFoldersManifest, themeIds?: Iterable<string>) {
  const include = themeIds ? new Set(themeIds) : undefined;
  const tags = new Map<string, { key: string; label: string; count: number }>();
  for (const [themeId, values] of Object.entries(manifest.tags)) {
    if (include && !include.has(themeId)) continue;
    for (const label of values) {
      const key = tagKey(label);
      const entry = tags.get(key) ?? { key, label, count: 0 };
      entry.count++; tags.set(key, entry);
    }
  }
  return [...tags.values()].sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base', numeric: true }));
}

/** Choice labels for theme pickers: the theme name, followed by its folder when it has one. */
export function themeChoiceLabel(theme: { id: string; name: string }, manifest?: ThemeFoldersManifest) {
  const path = manifest && folderPath(manifest, manifest.assignments[theme.id]);
  return path ? `${theme.name} (${path.split(folderPathSeparator).join(' / ')})` : theme.name;
}
