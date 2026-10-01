/**
 * Tags describe documents (including presentations), themes, and templates so people and agents
 * can find, choose, and track them. They are mostly written and read by agents.
 *
 * - **Type**: what a document or template is, from a small standard vocabulary. One per item.
 *   Themes have no type.
 * - **Status**: where a document stands (draft, in review, final, archived). Documents only;
 *   stored apart from tags.
 * - **Language**: derived from the item's text and declared direction, never stored
 *   (see `language.ts`).
 * - **Custom tags**: free text such as a client or programme name.
 *
 * An item's stored tag list holds its type ID (a lowercase slug such as `report`) and its custom
 * tags in their display spelling. Input that matches a type's ID, label, or alias in any letter
 * case selects that type; any other text is a custom tag.
 */

/** Items that can carry tags. Presentations are documents with a presentation format. */
export const taggedKinds = ['documents', 'themes', 'templates'] as const;
export type TaggedKind = typeof taggedKinds[number];

/** Documents and templates have a type; themes carry custom tags only. */
export const typedKinds: readonly TaggedKind[] = ['documents', 'templates'];
export const hasType = (kind: TaggedKind) => typedKinds.includes(kind);

export interface StandardType {
  id: string;
  label: string;
  /** Shown to agents in `npx opendoc tags`. */
  description: string;
  /** Other words that select this type, including the types of earlier versions. */
  aliases: readonly string[];
}

const type = (id: string, label: string, description: string, aliases: string[]): StandardType => ({ id, label, description, aliases });
export const standardTypes: readonly StandardType[] = [
  type('report', 'Report', 'Findings, analysis, research, results, or a periodic update.', ['case study', 'case-study', 'study', 'analysis', 'assessment', 'audit', 'evaluation', 'paper', 'research paper', 'white paper', 'whitepaper']),
  type('proposal', 'Proposal', 'A plan, offer, or pitch that asks for a decision.', ['plan', 'pitch', 'pitch deck', 'bid', 'tender', 'business case', 'business plan', 'roadmap']),
  type('brief', 'Brief', 'A short memo, one-pager, summary, or profile.', ['memo', 'memorandum', 'one-pager', 'one pager', 'briefing', 'summary', 'executive summary', 'overview', 'fact sheet', 'factsheet', 'profile', 'company profile']),
  type('minutes', 'Minutes', 'A record of a meeting: attendance, discussion, decisions, and actions.', ['meeting minutes', 'meeting notes', 'mom', 'agenda']),
  type('letter', 'Letter', 'Formal correspondence to a named recipient.', ['cover letter', 'correspondence', 'circular', 'notice']),
  type('guide', 'Guide', 'Instructions or rules to follow: manuals, policies, procedures, training.', ['manual', 'handbook', 'policy', 'procedure', 'sop', 'training', 'tutorial', 'how-to', 'playbook', 'guidelines', 'brand guidelines']),
  type('article', 'Article', 'Writing for readers: essays, features, stories, and newsletters.', ['essay', 'feature', 'story', 'newsletter', 'blog post', 'op-ed', 'magazine', 'literary text']),
  type('cv', 'CV', 'A curriculum vitae, résumé, or biography.', ['resume', 'résumé', 'curriculum vitae', 'bio', 'biography']),
  type('invoice', 'Invoice', 'A bill, quotation, estimate, or receipt.', ['quotation', 'quote', 'estimate', 'receipt', 'bill', 'pro forma']),
];

export const documentStatuses = [
  { id: 'draft', label: 'Draft', aliases: [] as string[] },
  { id: 'in-review', label: 'In review', aliases: ['in review', 'review', 'reviewing'] },
  { id: 'final', label: 'Final', aliases: ['done', 'delivered'] },
  { id: 'archived', label: 'Archived', aliases: ['archive'] },
] as const;
export type DocumentStatus = typeof documentStatuses[number]['id'];

export const tagLimits = { tag: 40, tagsPerItem: 20, custom: 500 } as const;

const controlCharacters = /[\u0000-\u001f\u007f\u2028\u2029]/u;

/** Trim and collapse whitespace while keeping the author's capitalization. */
export function cleanTag(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

/** Case-insensitive identity of a stored tag. Type IDs are already lowercase. */
export function tagKey(tag: string) {
  return cleanTag(tag).toLowerCase();
}

export function tagProblem(tag: string) {
  if (!tag) return 'Tags cannot be empty.';
  if (tag.length > tagLimits.tag || controlCharacters.test(tag) || tag.includes(',')) return `Use tags of ${tagLimits.tag} characters or fewer, without commas.`;
  return undefined;
}

const typeById = new Map(standardTypes.map(item => [item.id, item]));
const typeByKey = new Map<string, StandardType>();
for (const item of standardTypes) for (const key of [item.id, item.label, ...item.aliases]) typeByKey.set(tagKey(key), item);

/** The type for an ID, label, or alias, without regard to case. */
export function standardType(value: string): StandardType | undefined {
  return typeById.get(value) ?? typeByKey.get(tagKey(value));
}
/** True only for a stored type ID such as `report`, not a label or alias. */
export function isTypeId(tag: string) {
  return typeById.has(tag);
}
export function typeLabel(id: string) {
  return typeById.get(id)?.label ?? id;
}

const statusByKey = new Map<string, DocumentStatus>();
for (const item of documentStatuses) for (const key of [item.id, item.label, ...item.aliases]) statusByKey.set(tagKey(key), item.id);
/** The status for an ID, label, or alias such as `review`, without regard to case. */
export function documentStatus(value: string): DocumentStatus | undefined {
  return statusByKey.get(tagKey(value));
}
export function statusLabel(status: DocumentStatus) {
  return documentStatuses.find(item => item.id === status)!.label;
}
export function isDocumentStatus(value: unknown): value is DocumentStatus {
  return documentStatuses.some(item => item.id === value);
}

/** Display text for a stored tag. */
export function tagLabel(tag: string) {
  return typeLabel(tag);
}

const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });

/** An item's type and custom tags, read from its stored list. Themes have custom tags only. */
export function splitTags(kind: TaggedKind, stored: readonly string[] | undefined): { type?: string; custom: string[] } {
  const typed = hasType(kind);
  let found: string | undefined;
  const custom: string[] = [];
  for (const tag of stored ?? []) {
    if (typed && !found && isTypeId(tag)) found = tag;
    else custom.push(tag);
  }
  return { ...(found ? { type: found } : {}), custom };
}

/** The stored list for a type and custom tags: the type first, then custom tags. */
export function joinTags(type: string | undefined, custom: readonly string[]) {
  return type ? [type, ...custom] : [...custom];
}

/** Words that name a status or a language, which are no longer tags. */
function retiredTagProblem(value: string) {
  const status = documentStatus(value);
  if (status) return `“${value}” is a status, not a tag. Set it with npx opendoc tags status <document-id> ${status}.`;
  if (['english', 'arabic', 'bilingual', 'العربية'].includes(tagKey(value))) return `Language is detected from each item's text; “${value}” is not a tag.`;
  return undefined;
}

/**
 * Resolve tags typed by a person or agent. On documents and templates a type spelling selects
 * the type, and a later type replaces an earlier one; on themes it becomes a custom tag with the
 * type's label. Custom tags reuse a spelling in `known` that matches without regard to case;
 * otherwise their own spelling is kept and reported in `created`. Status and language words are
 * refused because they are no longer tags; `keep` lists existing custom tags that may still use
 * such a word.
 */
export function resolveTags(kind: TaggedKind, values: readonly string[], known: readonly string[] = [], keep: readonly string[] = []) {
  const spellings = new Map(known.map(item => [tagKey(item), item]));
  const kept = new Map(keep.map(item => [tagKey(item), item]));
  const typed = hasType(kind);
  let resolvedType: string | undefined;
  const custom = new Map<string, string>();
  const created: string[] = [];
  for (const value of values) {
    const cleaned = cleanTag(value);
    const problem = tagProblem(cleaned);
    if (problem) throw new Error(problem);
    const key = tagKey(cleaned);
    const existing = kept.get(key);
    const standard = existing ? undefined : standardType(cleaned);
    if (standard && typed) { resolvedType = standard.id; continue; }
    if (!existing && !standard) { const retired = retiredTagProblem(cleaned); if (retired) throw new Error(retired); }
    const text = existing ?? standard?.label ?? cleaned;
    const textKey = tagKey(text);
    if (custom.has(textKey)) continue;
    const resolved = existing ?? spellings.get(textKey) ?? text;
    custom.set(textKey, resolved);
    if (!existing && !spellings.has(textKey)) created.push(resolved);
  }
  const tags = joinTags(resolvedType, [...custom.values()]);
  if (tags.length > tagLimits.tagsPerItem) throw new Error(`Use up to ${tagLimits.tagsPerItem} tags for each item.`);
  return { type: resolvedType, custom: [...custom.values()], tags, created };
}

/** `tags.json`: the custom vocabulary, every item's tags, and each document's status. */
export interface TagsManifest {
  version: 2;
  /** Custom tags available for reuse, in their display spelling. */
  custom: string[];
  /** Document ID (presentations included) → its type ID, if any, then custom tags. */
  documents: Record<string, string[]>;
  /** Theme ID → custom tags. */
  themes: Record<string, string[]>;
  /** Template ID → its type ID, if any, then custom tags. */
  templates: Record<string, string[]>;
  /** Document ID → status. A document without an entry has no status yet. */
  status: Record<string, DocumentStatus>;
}

export const emptyTags = (): TagsManifest => ({ version: 2, custom: [], documents: {}, themes: {}, templates: {}, status: {} });

export function itemType(manifest: TagsManifest, kind: TaggedKind, id: string) {
  return splitTags(kind, Object.hasOwn(manifest[kind], id) ? manifest[kind][id] : undefined).type;
}
export function itemCustomTags(manifest: TagsManifest, kind: TaggedKind, id: string) {
  return splitTags(kind, Object.hasOwn(manifest[kind], id) ? manifest[kind][id] : undefined).custom;
}
export function itemStatus(manifest: TagsManifest, id: string): DocumentStatus | undefined {
  return Object.hasOwn(manifest.status, id) ? manifest.status[id] : undefined;
}

export interface TagCount { tag: string; key: string; count: number }

/** Custom tags in use on one kind (optionally only on `ids`), by name, with item counts. */
export function tagCounts(manifest: TagsManifest, kind: TaggedKind, ids?: Iterable<string>): TagCount[] {
  const include = ids ? new Set(ids) : undefined;
  const counts = new Map<string, TagCount>();
  for (const [id, stored] of Object.entries(manifest[kind])) {
    if (include && !include.has(id)) continue;
    for (const tag of splitTags(kind, stored).custom) {
      const key = tagKey(tag);
      const entry = counts.get(key) ?? { tag, key, count: 0 };
      entry.count++; counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => byName(a.tag, b.tag));
}

/** Items of one kind per type, in vocabulary order; only types in use are listed. */
export function typeCounts(manifest: TagsManifest, kind: TaggedKind, ids?: Iterable<string>) {
  const include = ids ? new Set(ids) : undefined;
  const counts = new Map<string, number>();
  for (const [id, stored] of Object.entries(manifest[kind])) {
    if (include && !include.has(id)) continue;
    const found = splitTags(kind, stored).type;
    if (found) counts.set(found, (counts.get(found) ?? 0) + 1);
  }
  return standardTypes.filter(item => counts.has(item.id)).map(item => ({ id: item.id, label: item.label, count: counts.get(item.id)! }));
}

/**
 * True when the item carries every requested tag. A request may name a type by ID, label, or
 * alias, or a custom tag in any letter case; a theme's custom tag such as “Report” also matches.
 */
export function hasTags(itemTags: readonly string[] | undefined, wanted: readonly string[]) {
  const keys = new Set((itemTags ?? []).map(tagKey));
  return wanted.every(value => keys.has(tagKey(value)) || [standardType(value)].some(found => found && (keys.has(found.id) || keys.has(tagKey(found.label)))));
}

/** The stored key used for filtering by a requested custom tag or type. */
export function filterKey(value: string) {
  return tagKey(standardType(value)?.id ?? value);
}
