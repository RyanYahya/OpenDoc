/**
 * Tags organize documents (including presentations), themes, and templates for filtering.
 * OpenDoc ships a standard vocabulary so tags stay consistent across a workspace and its
 * agents; custom tags cover anything the vocabulary does not.
 *
 * A stored tag is either a standard tag ID (a stable lowercase slug, such as `in-review`) or
 * a custom tag's display text (such as `Project Phoenix`). Input that matches a standard tag's
 * ID, label, or alias without regard to case always resolves to that standard tag, so the two
 * never collide.
 */

/** Items that can carry tags. Presentations are documents with a presentation format. */
export const taggedKinds = ['documents', 'themes', 'templates'] as const;
export type TaggedKind = typeof taggedKinds[number];

export type StandardTagGroupId = 'type' | 'area' | 'audience' | 'language' | 'status' | 'style';
export interface StandardTagGroup {
  id: StandardTagGroupId;
  label: string;
  /** What the group describes, shown to agents in `npx opendoc tags`. */
  description: string;
  /** Kinds this group usually fits; every tag can still be applied to any kind. */
  kinds: readonly TaggedKind[];
  /** An item carries at most one tag from this group; a later one replaces an earlier one. */
  exclusive?: boolean;
}
export interface StandardTag {
  id: string;
  label: string;
  group: StandardTagGroupId;
  /** Other spellings that resolve to this tag. */
  aliases?: readonly string[];
}

const all = taggedKinds;
export const standardTagGroups: readonly StandardTagGroup[] = [
  { id: 'type', label: 'Type', description: 'What the item is. The document or presentation format is already known; do not tag it.', kinds: all },
  { id: 'area', label: 'Area', description: 'The subject or business function it serves.', kinds: all },
  { id: 'audience', label: 'Audience', description: 'Who it is written for.', kinds: ['documents', 'templates'] },
  { id: 'language', label: 'Language', description: 'The language of its text.', kinds: all },
  { id: 'status', label: 'Status', description: 'Where the work stands. An item has one status; adding another replaces it.', kinds: ['documents'], exclusive: true },
  { id: 'style', label: 'Style', description: 'The visual character of a theme or layout.', kinds: ['themes', 'templates'] },
];

const tag = (group: StandardTagGroupId, id: string, label: string, aliases?: string[]): StandardTag => ({ id, label, group, ...(aliases ? { aliases } : {}) });
export const standardTags: readonly StandardTag[] = [
  tag('type', 'report', 'Report'),
  tag('type', 'proposal', 'Proposal'),
  tag('type', 'brief', 'Brief'),
  tag('type', 'plan', 'Plan'),
  tag('type', 'minutes', 'Minutes', ['meeting minutes']),
  tag('type', 'memo', 'Memo', ['memorandum']),
  tag('type', 'letter', 'Letter'),
  tag('type', 'policy', 'Policy'),
  tag('type', 'guide', 'Guide', ['manual', 'handbook']),
  tag('type', 'invoice', 'Invoice'),
  tag('type', 'quotation', 'Quotation', ['quote']),
  tag('type', 'contract', 'Contract', ['agreement']),
  tag('type', 'cv', 'CV', ['resume', 'résumé']),
  tag('type', 'profile', 'Profile', ['company profile']),
  tag('type', 'newsletter', 'Newsletter'),
  tag('type', 'case-study', 'Case study'),
  tag('type', 'pitch', 'Pitch', ['pitch deck']),
  tag('type', 'training', 'Training'),
  tag('area', 'finance', 'Finance'),
  tag('area', 'operations', 'Operations'),
  tag('area', 'strategy', 'Strategy'),
  tag('area', 'marketing', 'Marketing'),
  tag('area', 'sales', 'Sales'),
  tag('area', 'product', 'Product'),
  tag('area', 'research', 'Research'),
  tag('area', 'hr', 'HR', ['human resources']),
  tag('area', 'legal', 'Legal'),
  tag('area', 'technical', 'Technical'),
  tag('audience', 'internal', 'Internal'),
  tag('audience', 'client', 'Client', ['customer']),
  tag('audience', 'executive', 'Executive', ['leadership', 'board']),
  tag('audience', 'public', 'Public'),
  tag('language', 'english', 'English'),
  tag('language', 'arabic', 'Arabic', ['العربية']),
  tag('language', 'bilingual', 'Bilingual'),
  tag('status', 'draft', 'Draft'),
  tag('status', 'in-review', 'In review', ['review']),
  tag('status', 'final', 'Final'),
  tag('status', 'archived', 'Archived'),
  tag('style', 'formal', 'Formal'),
  tag('style', 'minimal', 'Minimal'),
  tag('style', 'editorial', 'Editorial'),
  tag('style', 'bold', 'Bold'),
  tag('style', 'playful', 'Playful'),
];

export const tagLimits = { tag: 40, tagsPerItem: 20, custom: 500 } as const;

const controlCharacters = /[\u0000-\u001f\u007f\u2028\u2029]/u;

/** Trim and collapse whitespace while keeping the author's capitalization. */
export function cleanTag(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

/** Case-insensitive identity of a stored tag. Standard IDs are already lowercase. */
export function tagKey(tag: string) {
  return cleanTag(tag).toLowerCase();
}

export function tagProblem(tag: string) {
  if (!tag) return 'Tags cannot be empty.';
  if (tag.length > tagLimits.tag || controlCharacters.test(tag) || tag.includes(',')) return `Use tags of ${tagLimits.tag} characters or fewer, without commas.`;
  return undefined;
}

const standardById = new Map(standardTags.map(item => [item.id, item]));
const standardByKey = new Map<string, StandardTag>();
for (const item of standardTags) for (const key of [item.id, item.label, ...(item.aliases ?? [])]) standardByKey.set(tagKey(key), item);

/** The standard tag for an ID, label, or alias, without regard to case. */
export function standardTag(value: string): StandardTag | undefined {
  return standardById.get(value) ?? standardByKey.get(tagKey(value));
}

export function isStandardTag(tag: string) {
  return standardById.has(tag);
}

/** Display text for a stored tag. */
export function tagLabel(tag: string) {
  return standardById.get(tag)?.label ?? tag;
}

export function sortTagsForDisplay(tags: readonly string[]) {
  const order = new Map(standardTags.map((item, index) => [item.id, index]));
  return [...tags].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || tagLabel(a).localeCompare(tagLabel(b), 'en', { sensitivity: 'base', numeric: true }));
}

const exclusiveGroups = new Set(standardTagGroups.filter(group => group.exclusive).map(group => group.id));

/**
 * Resolve, validate, and deduplicate tags. Standard tags resolve to their IDs, and a later tag
 * from an exclusive group (Status) replaces an earlier one. A custom tag reuses the spelling in
 * `known` when one matches without regard to case; otherwise its own spelling is kept and
 * reported in `created`.
 */
export function normalizeTags(values: readonly string[], known: readonly string[] = []) {
  const spellings = new Map(known.map(item => [tagKey(item), item]));
  const result = new Map<string, string>();
  const created: string[] = [];
  for (const value of values) {
    const cleaned = cleanTag(value);
    const problem = tagProblem(cleaned);
    if (problem) throw new Error(problem);
    const standard = standardTag(cleaned);
    const resolved = standard?.id ?? spellings.get(cleaned.toLowerCase()) ?? cleaned;
    const key = tagKey(resolved);
    if (result.has(key)) continue;
    if (standard && exclusiveGroups.has(standard.group)) {
      for (const [other, value] of result) if (standardById.get(value)?.group === standard.group) result.delete(other);
    }
    result.set(key, resolved);
    if (!standard && !spellings.has(key)) created.push(resolved);
  }
  if (result.size > tagLimits.tagsPerItem) throw new Error(`Use up to ${tagLimits.tagsPerItem} tags for each item.`);
  return { tags: [...result.values()], created };
}

/** `tags.json`: the workspace's custom vocabulary and every item's tags. */
export interface TagsManifest {
  version: 1;
  /** Custom tags available for reuse, in their display spelling. Standard tags are not listed. */
  custom: string[];
  /** Document ID (presentations included) → tags. */
  documents: Record<string, string[]>;
  /** Theme ID → tags. */
  themes: Record<string, string[]>;
  /** Template ID → tags. */
  templates: Record<string, string[]>;
}

export const emptyTags = (): TagsManifest => ({ version: 1, custom: [], documents: {}, themes: {}, templates: {} });

export interface TagCount { tag: string; key: string; label: string; standard: boolean; group: StandardTagGroupId | null; count: number }

/**
 * Tags in use on the chosen kind (optionally only on `ids`), standard tags first in vocabulary
 * order, then custom tags by name. Each entry counts the items carrying it.
 */
export function tagCounts(manifest: TagsManifest, kind: TaggedKind, ids?: Iterable<string>): TagCount[] {
  const include = ids ? new Set(ids) : undefined;
  const counts = new Map<string, TagCount>();
  for (const [id, values] of Object.entries(manifest[kind])) {
    if (include && !include.has(id)) continue;
    for (const value of values) {
      const key = tagKey(value);
      const standard = standardById.get(value);
      const entry = counts.get(key) ?? { tag: value, key, label: tagLabel(value), standard: Boolean(standard), group: standard?.group ?? null, count: 0 };
      entry.count++; counts.set(key, entry);
    }
  }
  const ordered = sortTagsForDisplay([...counts.values()].map(entry => entry.tag));
  return ordered.map(value => counts.get(tagKey(value))!);
}

/** True when the item carries every requested tag. Requested tags may be IDs, labels, or aliases. */
export function hasTags(itemTags: readonly string[] | undefined, wanted: readonly string[]) {
  const keys = new Set((itemTags ?? []).map(tagKey));
  return wanted.every(value => keys.has(tagKey(standardTag(value)?.id ?? value)));
}

/** The stored key used for filtering by a requested tag. */
export function filterKey(value: string) {
  return tagKey(standardTag(value)?.id ?? value);
}
