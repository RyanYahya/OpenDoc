import {
  documentStatuses, hasType, itemStatus, splitTags, standardType, statusLabel, tagCounts, tagKey, typeCounts, typeLabel,
  type DocumentStatus, type TaggedKind, type TagsManifest,
} from '../shared/tags';
import { languageLabel, languages, parseLanguage, type Language } from '../shared/language';

/**
 * Library filter state shared by Documents, Presentations, projects, Themes, Templates, and Media &
 * Assets. Filters live in the hash query (`#project/q3?status=draft&tag=acme`) so back and forward
 * restore them; the sort order is a per-page preference kept in browser storage. Everything here is
 * pure so it can be tested without a browser.
 */

// ---------------------------------------------------------------------------------------------
// Hash query

/** The route part and query of a hash such as `#themes?folder=narra`. */
export function splitHash(hash: string): { path: string; params: URLSearchParams } {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  const index = value.indexOf('?');
  return index < 0 ? { path: value, params: new URLSearchParams() } : { path: value.slice(0, index), params: new URLSearchParams(value.slice(index + 1)) };
}

/**
 * The same route with some query values changed. Empty values are removed so a cleared filter
 * leaves a clean link; other values keep their order. The documents library is `#library` when it
 * needs a query.
 */
export function hashWith(hash: string, changes: Record<string, string | null | undefined>): string {
  const { path, params } = splitHash(hash);
  for (const [key, value] of Object.entries(changes)) {
    if (value) params.set(key, value); else params.delete(key);
  }
  const query = params.toString();
  return `#${path || (query ? 'library' : '')}${query ? `?${query}` : ''}`;
}

// ---------------------------------------------------------------------------------------------
// Type, status, language, and custom tag filters

export interface ItemFilterValue { type: string; status: string; language: string; tag: string }
export const noFilters: ItemFilterValue = { type: '', status: '', language: '', tag: '' };
export const itemFilterKeys = ['type', 'status', 'language', 'tag'] as const;
export const filtering = (value: ItemFilterValue) => Boolean(value.type || value.status || value.language || value.tag);
export type FilterItem = { id: string; language?: Language };

/** Item filters named in a hash query. */
export function readItemFilters(params: URLSearchParams): ItemFilterValue {
  return { type: params.get('type') ?? '', status: params.get('status') ?? '', language: params.get('language') ?? '', tag: params.get('tag') ?? '' };
}

/** True when the item passes every chosen filter. `none` selects items without a type or status. */
export function matchesFilters(manifest: TagsManifest, kind: TaggedKind, item: FilterItem, value: ItemFilterValue) {
  const { type, custom } = splitTags(kind, Object.hasOwn(manifest[kind], item.id) ? manifest[kind][item.id] : undefined);
  if (value.type && (type ?? 'none') !== value.type) return false;
  if (value.status && (itemStatus(manifest, item.id) ?? 'none') !== value.status) return false;
  if (value.language && (item.language ?? 'english') !== value.language) return false;
  return !value.tag || custom.some(tag => tagKey(tag) === value.tag);
}

/** Words a person can search for: the type, status, and custom tags. */
export function detailsText(manifest: TagsManifest, kind: TaggedKind, id: string) {
  const { type, custom } = splitTags(kind, manifest[kind][id]);
  const status = kind === 'documents' ? itemStatus(manifest, id) : undefined;
  return [type ? typeLabel(type) : '', status ? statusLabel(status) : '', ...custom].join(' ');
}

/** True when every word of the query appears in the text, in any order and letter case. */
export function matchesSearch(text: string, query: string) {
  const haystack = text.toLocaleLowerCase();
  return query.toLocaleLowerCase().split(/\s+/u).every(word => !word || haystack.includes(word));
}

// ---------------------------------------------------------------------------------------------
// Facets: the secondary dimensions behind the Filter button

export interface FacetOption { value: string; label: string; count: number }
export interface Facet {
  key: string;
  /** The dimension's name, such as “Status”. */
  label: string;
  /** What no choice means, such as “Any status”. */
  anyLabel: string;
  options: FacetOption[];
  /** The chosen value, or '' for any. */
  value: string;
  /** How many items the facet looks at, so a choice that keeps everything does not count as a split. */
  total: number;
  /** Decides whether the facet is offered, for one whose empty value is itself a choice. */
  offer?: boolean;
}

/**
 * A facet is offered only when choosing one of its values would narrow the list, that is when its
 * items fall into at least two groups. A chosen value always stays visible so it can be changed.
 */
export const offered = (facet: Facet) => Boolean(facet.value) || (facet.offer ?? facet.options.some(option => option.count > 0 && option.count < facet.total));

/** The label of a facet's chosen value, kept even when no item carries it any more. */
export function chosenLabel(facet: Facet) {
  return facet.options.find(option => option.value === facet.value)?.label ?? facet.value;
}

/** A chosen value that no longer matches an item still appears, with a zero count. */
function withChosen(options: FacetOption[], value: string, label: () => string) {
  return value && !options.some(option => option.value === value) ? [...options, { value, label: label(), count: 0 }] : options;
}

/** The display label for a custom tag filter value, whether or not any item still carries it. */
export function customTagLabel(manifest: TagsManifest, key: string) {
  if (!key) return '';
  for (const kind of ['documents', 'themes', 'templates'] as const) for (const tags of Object.values(manifest[kind])) for (const tag of tags) if (tagKey(tag) === key) return typeLabel(tag);
  return manifest.custom.find(tag => tagKey(tag) === key) ?? standardType(key)?.label ?? key;
}

/**
 * Type (documents and templates), Status (documents), Language, and custom Tag facets for a list
 * of items, with counts. Pages show only the facets `offered` returns.
 */
export function itemFacets(manifest: TagsManifest, kind: TaggedKind, items: readonly FilterItem[], value: ItemFilterValue): Facet[] {
  const ids = items.map(item => item.id);
  const total = items.length;
  const facets: Facet[] = [];
  if (hasType(kind)) {
    const types = typeCounts(manifest, kind, ids);
    const untyped = total - types.reduce((sum, type) => sum + type.count, 0);
    const options = [...types.map(type => ({ value: type.id, label: type.label, count: type.count })), ...(untyped && types.length ? [{ value: 'none', label: 'No type', count: untyped }] : [])];
    facets.push({ key: 'type', label: 'Type', anyLabel: 'Any type', total, value: value.type, options: withChosen(options, value.type, () => value.type === 'none' ? 'No type' : typeLabel(value.type)) });
  }
  if (kind === 'documents') {
    const statuses = documentStatuses.map(status => ({ value: status.id as string, label: status.label as string, count: items.filter(item => itemStatus(manifest, item.id) === status.id).length })).filter(status => status.count);
    const unset = total - statuses.reduce((sum, status) => sum + status.count, 0);
    const options = [...statuses, ...(unset && statuses.length ? [{ value: 'none', label: 'No status', count: unset }] : [])];
    facets.push({ key: 'status', label: 'Status', anyLabel: 'Any status', total, value: value.status, options: withChosen(options, value.status, () => value.status === 'none' ? 'No status' : statusLabel(value.status as DocumentStatus)) });
  }
  const found = languages.map(language => ({ value: language.id as string, label: language.label as string, count: items.filter(item => (item.language ?? 'english') === language.id).length })).filter(language => language.count);
  facets.push({ key: 'language', label: 'Language', anyLabel: 'Any language', total, value: value.language, options: withChosen(found, value.language, () => languageLabel(parseLanguage(value.language) ?? 'english')) });
  const custom = tagCounts(manifest, kind, ids).map(entry => ({ value: entry.key, label: entry.tag, count: entry.count }));
  facets.push({ key: 'tag', label: 'Tag', anyLabel: 'Any tag', total, value: value.tag, options: withChosen(custom, value.tag, () => customTagLabel(manifest, value.tag)) });
  return facets;
}

/** A facet over any list, counting each item's single value; `none` collects items without one. */
export function countFacet<T>({ key, label, anyLabel, items, value, valueOf, labelOf, order }: {
  key: string; label: string; anyLabel: string; items: readonly T[]; value: string;
  valueOf: (item: T) => string | undefined; labelOf: (value: string) => string;
  /** Option order; by label when omitted. */
  order?: readonly string[];
}): Facet {
  const counts = new Map<string, number>();
  for (const item of items) { const found = valueOf(item); if (found) counts.set(found, (counts.get(found) ?? 0) + 1); }
  const rank = (option: string) => order ? (order.indexOf(option) + 1 || order.length + 1) : 0;
  const options = [...counts].map(([option, count]) => ({ value: option, label: labelOf(option), count }))
    .sort((a, b) => rank(a.value) - rank(b.value) || compareText(a.label, b.label));
  return { key, label, anyLabel, total: items.length, value, options: withChosen(options, value, () => labelOf(value)) };
}

// ---------------------------------------------------------------------------------------------
// Sorting

export interface SortOption { value: string; label: string }

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
/** Titles and names in a stable, case-insensitive, number-aware order. */
export const compareText = (a: string, b: string) => collator.compare(a, b);

/** Newest first; items without a time follow, in their original order. */
export function compareNewest(a?: string, b?: string) {
  const first = a ? Date.parse(a) : NaN, second = b ? Date.parse(b) : NaN;
  if (Number.isNaN(first) || Number.isNaN(second)) return Number.isNaN(first) ? Number.isNaN(second) ? 0 : 1 : -1;
  return second - first;
}

/** Workflow order: draft, in review, final, archived, then documents without a status. */
export function statusRank(status?: string) {
  const index = documentStatuses.findIndex(item => item.id === status);
  return index < 0 ? documentStatuses.length : index;
}

/** A sorted copy: each comparator breaks the previous one's ties, and full ties keep their order. */
export function sortItems<T>(items: readonly T[], ...comparators: ((a: T, b: T) => number)[]): T[] {
  return items.map((item, index) => ({ item, index }))
    .sort((a, b) => { for (const compare of comparators) { const result = compare(a.item, b.item); if (result) return result; } return a.index - b.index; })
    .map(entry => entry.item);
}

const sortKey = (page: string) => `opendoc-sort:${page}`;
/** The sort order last chosen on a page, when it is still offered there. */
export function readSort(storage: Pick<Storage, 'getItem'> | undefined, page: string, options: readonly SortOption[], fallback: string) {
  try {
    const stored = storage?.getItem(sortKey(page));
    if (stored && options.some(option => option.value === stored)) return stored;
  } catch { /* Sorting still works without browser storage. */ }
  return fallback;
}
export function storeSort(storage: Pick<Storage, 'setItem'> | undefined, page: string, value: string) {
  try { storage?.setItem(sortKey(page), value); } catch { /* Keep the choice for this visit. */ }
}
export const isSortKey = (key: string | null, page: string) => key === sortKey(page);
