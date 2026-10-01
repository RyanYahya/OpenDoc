import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  cleanTag, documentStatus, documentStatuses, emptyTags, filterKey, hasType, isDocumentStatus, isTypeId, joinTags, resolveTags, splitTags, standardType,
  tagKey, tagLimits, tagProblem, taggedKinds, typeLabel, type DocumentStatus, type TaggedKind, type TagsManifest,
} from '../shared/tags';
import { atomicWrite, containedFile, withLocalLock } from './files';
import { validId } from './render';
import { readThemeFolders, removeLegacyThemeTags } from './theme-folders';
import { migrateItemTags } from './tags-legacy';

/** One workspace file for every tag and status; theme folders stay in `themes/folders.json`. */
export const tagsFile = 'tags.json';

export class TagsError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) { super(message); this.name = 'TagsError'; }
}

const kindNames: Record<string, TaggedKind> = {
  document: 'documents', documents: 'documents', presentation: 'documents', presentations: 'documents',
  theme: 'themes', themes: 'themes', template: 'templates', templates: 'templates',
};
export const singularKind: Record<TaggedKind, string> = { documents: 'document', themes: 'theme', templates: 'template' };

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

/** Custom vocabulary entries: cleaned and unique without regard to case. */
function addCustom(custom: string[], values: readonly string[]) {
  for (const value of values) if (!custom.some(item => tagKey(item) === tagKey(value))) custom.push(value);
  if (custom.length > tagLimits.custom) throw new TagsError(`Use ${tagLimits.custom} custom tags or fewer.`, 409);
}

const statusList = documentStatuses.map(item => item.id).join(', ');

/** A stored item list: one type ID at most (documents and templates), then unique custom tags. */
function storedItemTags(kind: TaggedKind, list: string[]) {
  let type: string | undefined;
  const custom = new Map<string, string>();
  for (const item of list) {
    const tag = cleanTag(item);
    const problem = tagProblem(tag);
    if (problem) throw new Error(problem);
    if (hasType(kind) && isTypeId(tag)) {
      if (type && type !== tag) throw new Error(`it has two types, ${type} and ${tag}; keep one.`);
      type = tag; continue;
    }
    if (!custom.has(tagKey(tag))) custom.set(tagKey(tag), tag);
  }
  const tags = joinTags(type, [...custom.values()]);
  if (tags.length > tagLimits.tagsPerItem) throw new Error(`Use up to ${tagLimits.tagsPerItem} tags for each item.`);
  return tags;
}

const invalid = (reason: string) => new TagsError(`${tagsFile} is invalid: ${reason} Ask your agent to repair it; no tags were replaced.`);

function parseCustomList(value: unknown, manifest: TagsManifest) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw invalid('custom must be a list of tags.');
  for (const item of value as string[]) {
    const tag = cleanTag(item);
    const problem = tagProblem(tag);
    if (problem) throw invalid(`custom tag “${item}”: ${problem}`);
    try { addCustom(manifest.custom, [tag]); } catch (error) { throw invalid((error as Error).message); }
  }
}

function itemEntries(value: Record<string, unknown>, kind: TaggedKind) {
  const entries = value[kind];
  if (entries === undefined) return [];
  if (!record(entries)) throw invalid(`${kind} must map ${singularKind[kind]} IDs to lists of tags.`);
  return Object.entries(entries).map(([id, list]) => {
    if (!validItemId(id)) throw invalid(`“${id}” is not a ${singularKind[kind]} ID.`);
    if (!Array.isArray(list) || list.some(item => typeof item !== 'string')) throw invalid(`${singularKind[kind]} “${id}” needs a list of tags.`);
    return [id, list as string[]] as const;
  });
}

/**
 * Validate a version 2 file. Item lists hold a type ID and custom tags; custom tags used by an
 * item join the custom vocabulary. Unknown item IDs are kept until a write prunes them.
 */
export function parseTags(value: unknown): TagsManifest {
  if (!record(value) || value.version !== 2) throw invalid('it needs version 2.');
  const unknownKey = Object.keys(value).find(key => !['version', 'custom', 'status', ...taggedKinds].includes(key));
  if (unknownKey) throw invalid(`“${unknownKey}” is not a supported field.`);
  const manifest = emptyTags();
  parseCustomList(value.custom, manifest);
  for (const kind of taggedKinds) for (const [id, list] of itemEntries(value, kind)) {
    try {
      const tags = storedItemTags(kind, list);
      addCustom(manifest.custom, splitTags(kind, tags).custom);
      if (tags.length) manifest[kind][id] = tags;
    } catch (error) { throw invalid(`${singularKind[kind]} “${id}”: ${(error as Error).message}`); }
  }
  if (value.status !== undefined) {
    if (!record(value.status)) throw invalid('status must map document IDs to a status.');
    for (const [id, status] of Object.entries(value.status)) {
      if (!validItemId(id)) throw invalid(`“${id}” is not a document ID.`);
      if (!isDocumentStatus(status)) throw invalid(`document “${id}” needs a status of ${statusList}.`);
      manifest.status[id] = status;
    }
  }
  return manifest;
}

/**
 * Read a version 1 file into the version 2 model without writing it; the next change saves the
 * result. See `migrateItemTags` for how each old tag moves.
 */
export function migrateTags(value: unknown): TagsManifest {
  if (!record(value) || value.version !== 1) throw invalid('it needs version 2.');
  const unknownKey = Object.keys(value).find(key => !['version', 'custom', ...taggedKinds].includes(key));
  if (unknownKey) throw invalid(`“${unknownKey}” is not a supported field.`);
  const manifest = emptyTags();
  // Version 1 never listed standard tags as custom, so its vocabulary carries over unchanged.
  parseCustomList(value.custom, manifest);
  for (const kind of taggedKinds) for (const [id, list] of itemEntries(value, kind)) {
    const problem = list.map(item => tagProblem(cleanTag(item))).find(Boolean);
    if (problem) throw invalid(`${singularKind[kind]} “${id}”: ${problem}`);
    if (list.length > tagLimits.tagsPerItem) throw invalid(`${singularKind[kind]} “${id}”: Use up to ${tagLimits.tagsPerItem} tags for each item.`);
    const { tags, status } = migrateItemTags(kind, list);
    try { addCustom(manifest.custom, splitTags(kind, tags).custom); } catch (error) { throw invalid((error as Error).message); }
    if (tags.length) manifest[kind][id] = tags;
    if (status) manifest.status[id] = status;
  }
  return manifest;
}

/** Version 2 files as they are; version 1 files through the migration. */
export function tagsFromJson(value: unknown): TagsManifest {
  return record(value) && value.version === 1 ? migrateTags(value) : parseTags(value);
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
  return tagsFromJson(value);
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
    const usable = list.filter(item => !tagProblem(cleanTag(item))).slice(0, tagLimits.tagsPerItem);
    const { tags } = migrateItemTags('themes', usable);
    addCustom(manifest.custom, tags);
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
  if (!validItemId(id)) throw new TagsError(`Invalid ${singularKind[kind]} ID.`);
  try {
    const folder = await containedFile(resolve(root, folders[kind]), resolve(root, folders[kind], id));
    const info = await lstat(await containedFile(folder, resolve(folder, itemFiles[kind])));
    if (!info.isFile()) throw new Error();
  } catch { throw new TagsError(`This ${singularKind[kind]} no longer exists. Reload and try again.`, 404); }
  return id;
}

function sortedEntries<T>(entries: Record<string, T>) {
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b, 'en')));
}

/** Serialize browser and CLI changes; each save drops entries for items that no longer exist. */
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
        if (kind === 'documents') {
          for (const id of Object.keys(manifest.status)) if (!present.has(id)) delete manifest.status[id];
          manifest.status = sortedEntries(manifest.status);
        }
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

/** Store an item's tags, updating the custom vocabulary with any new or corrected spelling. */
function storeItemTags(manifest: TagsManifest, kind: TaggedKind, id: string, tags: string[]) {
  const { custom } = splitTags(kind, tags);
  for (const tag of custom) {
    const index = manifest.custom.findIndex(item => tagKey(item) === tagKey(tag));
    if (index >= 0) manifest.custom[index] = tag;
  }
  addCustom(manifest.custom, custom);
  if (tags.length) manifest[kind][id] = tags;
  else delete manifest[kind][id];
  return tags;
}

/** Resolve typed tags for an item; existing custom tags keep their meaning even when retired words. */
function resolveFor(manifest: TagsManifest, kind: TaggedKind, id: string, values: string[]) {
  try { return resolveTags(kind, values, establishedSpellings(manifest, kind, id), splitTags(kind, manifest[kind][id]).custom); }
  catch (error) { throw new TagsError((error as Error).message); }
}

export interface ItemDetails { kind: TaggedKind; id: string; type?: string; tags: string[]; status?: DocumentStatus }

/** An item's type, custom tags, and (for documents) status. */
export function detailsOf(manifest: TagsManifest, kind: TaggedKind, id: string): ItemDetails {
  const { type, custom } = splitTags(kind, Object.hasOwn(manifest[kind], id) ? manifest[kind][id] : undefined);
  const status = kind === 'documents' && Object.hasOwn(manifest.status, id) ? manifest.status[id] : undefined;
  return { kind, id, ...(type ? { type } : {}), tags: custom, ...(status ? { status } : {}) };
}

/** Replace an item's tags from typed input; a type spelling selects the item's type. */
export async function setItemTags(root: string, kindName: unknown, id: unknown, input: unknown) {
  const kind = taggedKind(kindName);
  const values = tagList(input);
  const itemId = await requireItem(root, kind, id);
  return withTags(root, async (manifest, save) => {
    storeItemTags(manifest, kind, itemId, resolveFor(manifest, kind, itemId, values).tags);
    await save(); return { ...detailsOf(manifest, kind, itemId), manifest };
  });
}

function parseStatus(value: unknown): DocumentStatus | null {
  if (value === null || value === '') return null;
  const status = typeof value === 'string' ? documentStatus(value) : undefined;
  if (!status) throw new TagsError(`Choose a status of ${statusList}, or clear it.`);
  return status;
}

function parseType(kind: TaggedKind, value: unknown): string | null {
  if (value === null || value === '') return null;
  if (!hasType(kind)) throw new TagsError('Themes have no type; use custom tags instead.');
  const found = typeof value === 'string' ? standardType(value) : undefined;
  if (!found) throw new TagsError(`“${String(value)}” is not a type. Run npx opendoc tags to list them.`);
  return found.id;
}

/**
 * The Details editor: one type, custom tags, and a document's status, each replaced as given.
 * Custom tags are taken as written, except that a new one spelled like a type is refused so the
 * type is chosen as the type.
 */
export async function setItemDetails(root: string, kindName: unknown, id: unknown, input: { type?: unknown; tags?: unknown; status?: unknown }) {
  const kind = taggedKind(kindName);
  const itemId = await requireItem(root, kind, id);
  if (input.status !== undefined && kind !== 'documents') throw new TagsError('Only documents and presentations have a status.');
  const type = input.type === undefined ? undefined : parseType(kind, input.type);
  const status = input.status === undefined ? undefined : parseStatus(input.status);
  const values = input.tags === undefined ? undefined : tagList(input.tags);
  return withTags(root, async (manifest, save) => {
    const current = splitTags(kind, manifest[kind][itemId]);
    let custom = current.custom;
    if (values) {
      const typeWord = values.map(cleanTag).find(value => standardType(value) && !current.custom.some(tag => tagKey(tag) === tagKey(value)) && !manifest.custom.some(tag => tagKey(tag) === tagKey(value)));
      if (hasType(kind) && typeWord) throw new TagsError(`“${typeWord}” is the ${typeLabel(standardType(typeWord)!.id)} type. Choose it as the type instead.`);
      // Resolve as a theme so type words stay custom text; typed kinds were checked above.
      custom = resolveTagsAsCustom(manifest, kind, itemId, values);
    }
    const tags = joinTags(type === undefined ? current.type : type ?? undefined, custom);
    if (tags.length > tagLimits.tagsPerItem) throw new TagsError(`Use up to ${tagLimits.tagsPerItem} tags for each item.`);
    storeItemTags(manifest, kind, itemId, tags);
    if (status !== undefined) { if (status) manifest.status[itemId] = status; else delete manifest.status[itemId]; }
    await save(); return { ...detailsOf(manifest, kind, itemId), manifest };
  });
}

function resolveTagsAsCustom(manifest: TagsManifest, kind: TaggedKind, id: string, values: string[]) {
  try {
    const existing = splitTags(kind, manifest[kind][id]).custom;
    // A known custom spelling (such as a theme's “Report”) is reused as written.
    const known = [...existing, ...manifest.custom.filter(tag => standardType(tag))];
    return resolveTags('themes', values, establishedSpellings(manifest, kind, id), known).custom;
  } catch (error) { throw new TagsError((error as Error).message); }
}

/** Set or clear a document's status. Presentations are documents. */
export async function setDocumentStatus(root: string, id: unknown, value: unknown) {
  const itemId = await requireItem(root, 'documents', id);
  const status = parseStatus(value);
  return withTags(root, async (manifest, save) => {
    if (status) manifest.status[itemId] = status; else delete manifest.status[itemId];
    await save(); return { ...detailsOf(manifest, 'documents', itemId), manifest };
  });
}

/**
 * Command-line edits: replace, then remove and add. Removing a missing tag is not an error. A
 * type spelling replaces the type; removing one clears the type it names.
 */
export async function changeItemTags(root: string, kindName: unknown, id: unknown, change: { set?: string[]; add?: string[]; remove?: string[] }) {
  const kind = taggedKind(kindName);
  const itemId = await requireItem(root, kind, id);
  return withTags(root, async (manifest, save) => {
    const current = splitTags(kind, manifest[kind][itemId]);
    const base = change.set ? resolveFor(manifest, kind, itemId, change.set) : { type: current.type, custom: current.custom };
    const removed = new Set((change.remove ?? []).map(value => tagKey(value)));
    const removedTypes = new Set((change.remove ?? []).map(value => standardType(value)?.id).filter(Boolean));
    const keptType = base.type && !removedTypes.has(base.type) && !removed.has(base.type) ? base.type : undefined;
    // Custom tags already on the item keep their spelling and meaning, even when they name a type.
    const keptCustom = base.custom.filter(tag => !removed.has(tagKey(tag)) && !(kind === 'themes' && removedTypes.has(filterKey(tag))));
    const added = change.add?.length ? resolveFor(manifest, kind, itemId, change.add) : { type: undefined, custom: [] };
    const custom = [...keptCustom];
    for (const tag of added.custom) if (!custom.some(item => tagKey(item) === tagKey(tag))) custom.push(tag);
    const tags = joinTags(added.type ?? keptType, custom);
    if (tags.length > tagLimits.tagsPerItem) throw new TagsError(`Use up to ${tagLimits.tagsPerItem} tags for each item.`);
    storeItemTags(manifest, kind, itemId, tags);
    await save(); return { ...detailsOf(manifest, kind, itemId), manifest };
  });
}

/** An item's details, after confirming it exists. */
export async function itemTags(root: string, kindName: unknown, id: unknown) {
  const kind = taggedKind(kindName);
  const itemId = await requireItem(root, kind, id);
  return detailsOf(await readTags(root), kind, itemId);
}

/**
 * Restore a document's stored tags and status, as kept in a Trash receipt or copied by a
 * duplicate. Receipts written before version 2 hold version 1 tags and migrate here.
 */
export async function restoreDocumentTags(root: string, id: string, saved: { tags?: unknown; status?: unknown; version?: unknown }) {
  const list = Array.isArray(saved.tags) && saved.tags.every(tag => typeof tag === 'string') ? saved.tags as string[] : [];
  const migrated = saved.version === 2 ? { tags: list, status: isDocumentStatus(saved.status) ? saved.status : undefined } : migrateItemTags('documents', list);
  if (!migrated.tags.length && !migrated.status) return;
  await requireItem(root, 'documents', id);
  await withTags(root, async (manifest, save) => {
    let tags: string[];
    try { tags = storedItemTags('documents', migrated.tags); } catch (error) { throw new TagsError((error as Error).message); }
    storeItemTags(manifest, 'documents', id, tags);
    if (migrated.status) manifest.status[id] = migrated.status;
    await save();
  });
}

/** Add a custom tag to the vocabulary before any item uses it. */
export async function createCustomTag(root: string, label: unknown) {
  const tag = typeof label === 'string' ? cleanTag(label) : '';
  const problem = tagProblem(tag);
  if (problem) throw new TagsError(problem);
  const type = standardType(tag);
  if (type) throw new TagsError(`“${tag}” is the type ${type.id}; use it directly.`, 409);
  if (documentStatus(tag)) throw new TagsError(`“${tag}” is a status; set it with npx opendoc tags status <document-id> ${documentStatus(tag)}.`, 409);
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
  return withTags(root, async (manifest, save) => {
    const key = tagKey(tag);
    const users = taggedKinds.flatMap(kind => Object.entries(manifest[kind]).filter(([, tags]) => splitTags(kind, tags).custom.some(item => tagKey(item) === key)).map(([id]) => ({ kind, id })));
    const known = manifest.custom.some(item => tagKey(item) === key);
    if (!known && !users.length) {
      if (standardType(tag)) throw new TagsError('Types are part of OpenDoc and cannot be deleted. Remove them from items instead.', 409);
      throw new TagsError(`No custom tag matches “${tag}”.`, 404);
    }
    if (users.length && !options.untag) throw new TagsError(`“${tag}” is used by ${users.length} ${users.length === 1 ? 'item' : 'items'}. Remove it from them first, or delete it with --untag.`, 409);
    manifest.custom = manifest.custom.filter(item => tagKey(item) !== key);
    for (const { kind, id } of users) {
      const { type, custom } = splitTags(kind, manifest[kind][id]);
      storeItemTags(manifest, kind, id, joinTags(type, custom.filter(item => tagKey(item) !== key)));
    }
    await save(); return { deleted: tag, untagged: users, manifest };
  });
}
