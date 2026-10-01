import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  cleanTag, emptyTags, filterKey, normalizeTags, standardTag, tagKey, tagLimits, tagProblem, taggedKinds,
  type TaggedKind, type TagsManifest,
} from '../shared/tags';
import { atomicWrite, containedFile, withLocalLock } from './files';
import { validId } from './render';
import { readThemeFolders, removeLegacyThemeTags } from './theme-folders';

/** One workspace file for every tag; theme folders stay in `themes/folders.json`. */
export const tagsFile = 'tags.json';

export class TagsError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) { super(message); this.name = 'TagsError'; }
}

const kindNames: Record<string, TaggedKind> = {
  document: 'documents', documents: 'documents', presentation: 'documents', presentations: 'documents',
  theme: 'themes', themes: 'themes', template: 'templates', templates: 'templates',
};
const singular: Record<TaggedKind, string> = { documents: 'document', themes: 'theme', templates: 'template' };

/** Accepts `document`, `presentation`, `theme`, or `template`, singular or plural. */
export function taggedKind(value: unknown): TaggedKind {
  const kind = typeof value === 'string' ? kindNames[value.toLowerCase()] : undefined;
  if (!kind) throw new TagsError('Choose document, presentation, theme, or template.');
  return kind;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validItemId(id: unknown): id is string {
  return typeof id === 'string' && validId(id) && id.length <= 80;
}

/** Custom vocabulary entries: cleaned, unique without regard to case, never standard tags. */
function addCustom(custom: string[], values: readonly string[]) {
  for (const value of values) {
    if (standardTag(value)) continue;
    const index = custom.findIndex(item => tagKey(item) === tagKey(value));
    if (index < 0) custom.push(value);
  }
  if (custom.length > tagLimits.custom) throw new TagsError(`Use ${tagLimits.custom} custom tags or fewer.`, 409);
}

/**
 * Validate the stored shape. Tags that name a standard tag resolve to its ID, and custom tags
 * used by an item join the custom vocabulary. Unknown item IDs are kept until a write prunes them.
 */
export function parseTags(value: unknown): TagsManifest {
  const invalid = (reason: string) => new TagsError(`${tagsFile} is invalid: ${reason} Ask your agent to repair it; no tags were replaced.`);
  if (!record(value) || value.version !== 1) throw invalid('it needs version 1.');
  const unknownKey = Object.keys(value).find(key => !['version', 'custom', ...taggedKinds].includes(key));
  if (unknownKey) throw invalid(`“${unknownKey}” is not a supported field.`);
  const manifest = emptyTags();
  if (value.custom !== undefined) {
    if (!Array.isArray(value.custom) || value.custom.some(item => typeof item !== 'string')) throw invalid('custom must be a list of tags.');
    for (const item of value.custom as string[]) {
      const tag = cleanTag(item);
      const problem = tagProblem(tag);
      if (problem) throw invalid(`custom tag “${item}”: ${problem}`);
      try { addCustom(manifest.custom, [tag]); } catch (error) { throw invalid((error as Error).message); }
    }
  }
  for (const kind of taggedKinds) {
    const entries = value[kind];
    if (entries === undefined) continue;
    if (!record(entries)) throw invalid(`${kind} must map ${singular[kind]} IDs to lists of tags.`);
    for (const [id, list] of Object.entries(entries)) {
      if (!validItemId(id)) throw invalid(`“${id}” is not a ${singular[kind]} ID.`);
      if (!Array.isArray(list) || list.some(item => typeof item !== 'string')) throw invalid(`${singular[kind]} “${id}” needs a list of tags.`);
      try {
        const { tags, created } = normalizeTags(list as string[], manifest.custom);
        addCustom(manifest.custom, created);
        if (tags.length) manifest[kind][id] = tags;
      } catch (error) { throw invalid(`${singular[kind]} “${id}”: ${(error as Error).message}`); }
    }
  }
  return manifest;
}

async function manifestFile(root: string) {
  const file = resolve(await realpath(root), tagsFile);
  const info = await lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (info && (!info.isFile() || info.isSymbolicLink() || info.size > 1_000_000)) throw new TagsError(`${tagsFile} must be a regular local file smaller than 1 MB.`);
  return { file, exists: Boolean(info) };
}

/** Only `tags.json`; a missing file has no tags. */
export async function readTagsFile(root: string): Promise<TagsManifest> {
  const { file, exists } = await manifestFile(root);
  if (!exists) return emptyTags();
  let value: unknown;
  try { value = JSON.parse(await readFile(file, 'utf8')); }
  catch { throw new TagsError(`Could not read ${tagsFile}. Ask your agent to repair it; no tags were replaced.`); }
  return parseTags(value);
}

/**
 * Theme tags written before `tags.json` existed live in `themes/folders.json`. They count for any
 * theme `tags.json` does not mention yet, and move on the next tag change. An unreadable folders
 * file is reported by Themes; tags still work without its legacy entries.
 */
async function withLegacyThemeTags(root: string, manifest: TagsManifest) {
  const legacy = await readThemeFolders(root).then(folders => folders.tags, () => undefined);
  if (!legacy) return false;
  for (const [id, list] of Object.entries(legacy)) {
    if (Object.hasOwn(manifest.themes, id)) continue;
    // Keep every usable tag even when one legacy entry no longer validates.
    const usable = list.filter(item => { try { normalizeTags([item]); return true; } catch { return false; } }).slice(0, tagLimits.tagsPerItem);
    const { tags, created } = normalizeTags(usable, manifest.custom);
    addCustom(manifest.custom, created);
    if (tags.length) manifest.themes[id] = tags;
  }
  return true;
}

/** Every tag in the workspace, including legacy theme tags that have not moved yet. */
export async function readTags(root: string): Promise<TagsManifest> {
  const manifest = await readTagsFile(root);
  await withLegacyThemeTags(root, manifest);
  return manifest;
}

const folders: Record<TaggedKind, string> = { documents: 'documents', themes: 'themes', templates: 'templates' };

/** Item folders that currently exist. Their source need not be valid to keep its tags. */
export async function presentItems(root: string, kind: TaggedKind) {
  const entries = await readdir(resolve(root, folders[kind]), { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  return new Set(entries.filter(entry => entry.isDirectory() && validItemId(entry.name)).map(entry => entry.name));
}

const itemFiles: Record<TaggedKind, string> = { documents: 'index.tsx', themes: 'index.ts', templates: 'template.json' };

async function requireItem(root: string, kind: TaggedKind, id: unknown): Promise<string> {
  if (!validItemId(id)) throw new TagsError(`Invalid ${singular[kind]} ID.`);
  try {
    const folder = await containedFile(resolve(root, folders[kind]), resolve(root, folders[kind], id));
    const info = await lstat(await containedFile(folder, resolve(folder, itemFiles[kind])));
    if (!info.isFile()) throw new Error();
  } catch { throw new TagsError(`This ${singular[kind]} no longer exists. Reload and try again.`, 404); }
  return id;
}

function sortedEntries(entries: Record<string, string[]>) {
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b, 'en')));
}

/** Serialize browser and CLI changes; each save drops tags for items that no longer exist. */
export async function withTags<T>(root: string, change: (manifest: TagsManifest, save: () => Promise<void>) => Promise<T>): Promise<T> {
  const workspace = await realpath(root);
  return withLocalLock(workspace, 'tags.lock', () => new TagsError('Tags are busy. Try again when the other operation finishes.', 409), async () => {
    const manifest = await readTagsFile(workspace);
    const legacy = await withLegacyThemeTags(workspace, manifest);
    return change(manifest, async () => {
      for (const kind of taggedKinds) {
        const present = await presentItems(workspace, kind);
        for (const id of Object.keys(manifest[kind])) if (!present.has(id) || !manifest[kind][id].length) delete manifest[kind][id];
        manifest[kind] = sortedEntries(manifest[kind]);
      }
      const { file } = await manifestFile(workspace);
      await atomicWrite(file, `${JSON.stringify(parseTags(manifest), null, 2)}\n`);
      // tags.json now holds the legacy theme tags, so the folders file no longer needs them.
      if (legacy) await removeLegacyThemeTags(workspace).catch(() => {});
    });
  });
}

function tagList(input: unknown): string[] {
  if (!Array.isArray(input) || input.some(value => typeof value !== 'string')) throw new TagsError('Provide tags as a list of short labels.');
  return input;
}

/** Custom tags used by items other than this one; their spelling is established. */
function establishedSpellings(manifest: TagsManifest, kind: TaggedKind, id: string) {
  const usedElsewhere = new Set<string>();
  const usedHere = new Set((manifest[kind][id] ?? []).map(tagKey));
  for (const other of taggedKinds) for (const [itemId, tags] of Object.entries(manifest[other])) {
    if (other === kind && itemId === id) continue;
    for (const tag of tags) usedElsewhere.add(tagKey(tag));
  }
  // An unused vocabulary entry keeps its spelling; the only item using a tag may recapitalize it.
  return manifest.custom.filter(tag => usedElsewhere.has(tagKey(tag)) || !usedHere.has(tagKey(tag)));
}

function applyItemTags(manifest: TagsManifest, kind: TaggedKind, id: string, values: string[]) {
  let result;
  try { result = normalizeTags(values, establishedSpellings(manifest, kind, id)); }
  catch (error) { throw new TagsError((error as Error).message); }
  for (const tag of result.tags) {
    if (standardTag(tag)) continue;
    const index = manifest.custom.findIndex(item => tagKey(item) === tagKey(tag));
    if (index >= 0) manifest.custom[index] = tag;
  }
  addCustom(manifest.custom, result.tags);
  if (result.tags.length) manifest[kind][id] = result.tags;
  else delete manifest[kind][id];
  return result.tags;
}

/** Replace an item's tags. */
export async function setItemTags(root: string, kindName: unknown, id: unknown, input: unknown) {
  const kind = taggedKind(kindName);
  const values = tagList(input);
  const itemId = await requireItem(root, kind, id);
  return withTags(root, async (manifest, save) => {
    const tags = applyItemTags(manifest, kind, itemId, values);
    await save(); return { kind, id: itemId, tags, manifest };
  });
}

/** Command-line edits: replace, then remove and add. Removing a missing tag is not an error. */
export async function changeItemTags(root: string, kindName: unknown, id: unknown, change: { set?: string[]; add?: string[]; remove?: string[] }) {
  const kind = taggedKind(kindName);
  const itemId = await requireItem(root, kind, id);
  return withTags(root, async (manifest, save) => {
    const removed = new Set((change.remove ?? []).map(filterKey));
    const base = change.set ?? manifest[kind][itemId] ?? [];
    const tags = applyItemTags(manifest, kind, itemId, [...base, ...(change.add ?? [])].filter(tag => !removed.has(filterKey(tag))));
    await save(); return { kind, id: itemId, tags, manifest };
  });
}

/** An item's tags, after confirming it exists. */
export async function itemTags(root: string, kindName: unknown, id: unknown) {
  const kind = taggedKind(kindName);
  const itemId = await requireItem(root, kind, id);
  return { kind, id: itemId, tags: (await readTags(root))[kind][itemId] ?? [] };
}

/** Add a custom tag to the vocabulary before any item uses it. */
export async function createCustomTag(root: string, label: unknown) {
  const tag = typeof label === 'string' ? cleanTag(label) : '';
  const problem = tagProblem(tag);
  if (problem) throw new TagsError(problem);
  const standard = standardTag(tag);
  if (standard) throw new TagsError(`“${tag}” is already the standard tag ${standard.id}; use it directly.`, 409);
  return withTags(root, async (manifest, save) => {
    const existing = manifest.custom.find(item => tagKey(item) === tagKey(tag));
    if (existing) throw new TagsError(`The custom tag “${existing}” already exists.`, 409);
    addCustom(manifest.custom, [tag]);
    await save(); return { tag, manifest };
  });
}

/** Remove a custom tag. A tag still in use needs `untag` to remove it from those items too. */
export async function deleteCustomTag(root: string, label: unknown, options: { untag?: boolean } = {}) {
  const tag = typeof label === 'string' ? cleanTag(label) : '';
  if (!tag) throw new TagsError('Name the custom tag to delete.');
  if (standardTag(tag)) throw new TagsError('Standard tags are part of OpenDoc and cannot be deleted. Remove them from items instead.', 409);
  return withTags(root, async (manifest, save) => {
    const key = tagKey(tag);
    const users = taggedKinds.flatMap(kind => Object.entries(manifest[kind]).filter(([, tags]) => tags.some(item => tagKey(item) === key)).map(([id]) => ({ kind, id })));
    const known = manifest.custom.some(item => tagKey(item) === key);
    if (!known && !users.length) throw new TagsError(`No custom tag matches “${tag}”.`, 404);
    if (users.length && !options.untag) throw new TagsError(`“${tag}” is used by ${users.length} ${users.length === 1 ? 'item' : 'items'}. Remove it from them first, or delete it with --untag.`, 409);
    manifest.custom = manifest.custom.filter(item => tagKey(item) !== key);
    for (const { kind, id } of users) {
      manifest[kind][id] = manifest[kind][id].filter(item => tagKey(item) !== key);
      if (!manifest[kind][id].length) delete manifest[kind][id];
    }
    await save(); return { deleted: tag, untagged: users, manifest };
  });
}
