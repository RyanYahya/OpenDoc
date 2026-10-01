import { createContext, useContext, useId, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { Menu } from '@base-ui/react/menu';
import {
  cleanTag, documentStatus, documentStatuses, emptyTags, hasType, itemStatus, itemType, splitTags, standardType, standardTypes, statusLabel, tagCounts, tagKey,
  tagLabel, tagLimits, tagProblem, taggedKinds, typeCounts, typeLabel, type DocumentStatus, type TaggedKind, type TagsManifest,
} from '../shared/tags';
import { languageLabel, languages, parseLanguage, type Language } from '../shared/language';
import type { DocumentSummary } from '../shared/types';
import { api } from './api';
import { Button, Dialog, Input, SelectControl } from './ui';
import { Icon } from './ui/Icon';
import './tags.css';

/** Workspace tags from `tags.json`; an unreadable file leaves every view usable without them. */
export type TagState = { manifest: TagsManifest; error?: string };
/** The item whose details are being edited, and the control that should regain focus afterward. */
export type TagTarget = { kind: TaggedKind; id: string; name: string; returnFocus?: string };
type Details = { type?: string; status?: DocumentStatus; tags: string[]; manifest: TagsManifest };

/** Isolates user-named text so an Arabic name beside Latin ones keeps its own direction in labels and paths. */
export const isolate = (text: string) => `⁨${text}⁩`;

/** Tags as one compact line. */
export function tagText(tags: readonly string[]) {
  return tags.map(tag => isolate(tagLabel(tag))).join(' · ');
}

/** Muted tag line; renders nothing for an untagged item. */
export function TagSummary({ tags, id, className = '' }: { tags?: readonly string[]; id?: string; className?: string }) {
  if (!tags?.length) return null;
  return <span className={`item-tags ${className}`.trim()} id={id}><span className="sr-only">Tags: </span>{tagText(tags)}</span>;
}

/**
 * Tags shared by every view that shows document details: the manifest, and a status setter when
 * the workspace is connected and its tags are readable.
 */
type TagsContextValue = { manifest: TagsManifest; setStatus?: (document: DocumentSummary, status: DocumentStatus | null) => void };
const TagsContext = createContext<TagsContextValue>({ manifest: emptyTags() });
export const TagsProvider = TagsContext.Provider;

/** A document's type and status from the shared tags. */
export function useDocumentDetails(id: string) {
  const { manifest } = useContext(TagsContext);
  return { type: itemType(manifest, 'documents', id), status: itemStatus(manifest, id) };
}

/** A small labelled status; nothing for a document without one. */
export function StatusBadge({ status, id, className = '' }: { status?: DocumentStatus; id?: string; className?: string }) {
  if (!status) return null;
  return <span id={id} className={`status-badge status-${status} ${className}`.trim()}><span className="status-dot" aria-hidden="true" /><span className="sr-only">Status: </span>{statusLabel(status)}</span>;
}

/** Document options submenu that sets or clears the status. */
export function StatusSubmenu({ document, disabled }: { document: DocumentSummary; disabled?: boolean }) {
  const { manifest, setStatus } = useContext(TagsContext);
  if (!setStatus) return null;
  const current = itemStatus(manifest, document.id);
  return <Menu.SubmenuRoot>
    <Menu.SubmenuTrigger className="ui-menu-item" disabled={disabled}>
      <Icon name="status" size={16} /><span>Status</span><small className="status-menu-value">{current ? statusLabel(current) : 'None'}</small><Icon name="right" size={14} />
    </Menu.SubmenuTrigger>
    <Menu.Portal><Menu.Positioner className="ui-positioner document-menu-positioner" sideOffset={4} alignOffset={-4}><Menu.Popup className="ui-menu-popup">
      <Menu.RadioGroup value={current ?? ''} onValueChange={value => setStatus(document, value ? value as DocumentStatus : null)}>
        {[{ id: '', label: 'No status' }, ...documentStatuses].map(item => <Menu.RadioItem key={item.id} value={item.id} closeOnClick className="ui-menu-item">
          <span>{item.label}</span>
          <Menu.RadioItemIndicator className="ui-menu-check"><Icon name="check" size={14} /></Menu.RadioItemIndicator>
        </Menu.RadioItem>)}
      </Menu.RadioGroup>
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.SubmenuRoot>;
}

/** True when no tag is chosen or the item carries the chosen custom tag key. */
export function matchesTag(manifest: TagsManifest, kind: TaggedKind, id: string, key: string) {
  return !key || (manifest[kind][id] ?? []).some(tag => tagKey(tag) === key);
}

/** The display label for a custom tag filter value, whether or not any item still carries it. */
export function filterLabel(manifest: TagsManifest, key: string) {
  if (!key) return '';
  for (const kind of taggedKinds) for (const tags of Object.values(manifest[kind])) for (const tag of tags) if (tagKey(tag) === key) return tagLabel(tag);
  return manifest.custom.find(tag => tagKey(tag) === key) ?? standardType(key)?.label ?? key;
}

/** One custom tag filter with item counts; hidden when no item of this kind has a custom tag. */
export function TagFilter({ manifest, kind, ids, value, onChange, className = '' }: { manifest: TagsManifest; kind: TaggedKind; ids?: Iterable<string>; value: string; onChange: (key: string) => void; className?: string }) {
  const counts = tagCounts(manifest, kind, ids);
  if (!counts.length && !value) return null;
  const items = [{ value: '', label: 'All tags' }, ...counts.map(entry => ({ value: entry.key, label: `${entry.tag} (${entry.count})` }))];
  if (value && !counts.some(entry => entry.key === value)) items.push({ value, label: `${filterLabel(manifest, value)} (0)` });
  return <div className={`tag-filter ${className}`.trim()}><Icon name="tag" size={16} /><SelectControl label="Filter by tag" value={value} onValueChange={onChange} items={items} /></div>;
}

export interface ItemFilterValue { type: string; status: string; language: string; tag: string }
export const noFilters: ItemFilterValue = { type: '', status: '', language: '', tag: '' };
export const filtering = (value: ItemFilterValue) => Boolean(value.type || value.status || value.language || value.tag);
type FilterItem = { id: string; language?: Language };

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

/**
 * Compact filters for a list: Type and, for documents, Status when any item has one; Language when
 * any item is not in English; custom tags behind More filters when any item has them.
 */
export function ItemFilters({ manifest, kind, items, value, onChange }: { manifest: TagsManifest; kind: TaggedKind; items: FilterItem[]; value: ItemFilterValue; onChange: (value: ItemFilterValue) => void }) {
  const [more, setMore] = useState(Boolean(value.tag));
  const panel = useId();
  const ids = items.map(item => item.id);
  const set = (key: keyof ItemFilterValue) => (next: string) => onChange({ ...value, [key]: next });
  const types = hasType(kind) ? typeCounts(manifest, kind, ids) : [];
  const untyped = items.filter(item => !itemType(manifest, kind, item.id)).length;
  const statuses = kind === 'documents' ? documentStatuses.map(status => ({ ...status, count: items.filter(item => itemStatus(manifest, item.id) === status.id).length })).filter(status => status.count) : [];
  const unset = items.length - statuses.reduce((sum, status) => sum + status.count, 0);
  const found = languages.map(language => ({ ...language, count: items.filter(item => (item.language ?? 'english') === language.id).length })).filter(language => language.count);
  const custom = tagCounts(manifest, kind, ids);
  const showMore = more || Boolean(value.tag);
  return <>
    {(types.length > 0 || value.type) && <SelectControl label="Filter by type" value={value.type} onValueChange={set('type')} items={[
      { value: '', label: 'All types' }, ...types.map(type => ({ value: type.id, label: `${type.label} (${type.count})` })), ...(untyped && types.length ? [{ value: 'none', label: `No type (${untyped})` }] : []),
      ...(value.type && value.type !== 'none' && !types.some(type => type.id === value.type) ? [{ value: value.type, label: `${typeLabel(value.type)} (0)` }] : []),
    ]} />}
    {(statuses.length > 0 || value.status) && <SelectControl label="Filter by status" value={value.status} onValueChange={set('status')} items={[
      { value: '', label: 'Any status' }, ...statuses.map(status => ({ value: status.id, label: `${status.label} (${status.count})` })), ...(unset ? [{ value: 'none', label: `No status (${unset})` }] : []),
      ...(value.status && value.status !== 'none' && !statuses.some(status => status.id === value.status) ? [{ value: value.status, label: `${statusLabel(value.status as DocumentStatus)} (0)` }] : []),
    ]} />}
    {(found.some(language => language.id !== 'english') || value.language) && <SelectControl label="Filter by language" value={value.language} onValueChange={set('language')} items={[
      { value: '', label: 'All languages' }, ...found.map(language => ({ value: language.id, label: `${language.label} (${language.count})` })),
      ...(value.language && !found.some(language => language.id === value.language) ? [{ value: value.language, label: `${languageLabel(parseLanguage(value.language) ?? 'english')} (0)` }] : []),
    ]} />}
    {(custom.length > 0 || value.tag) && <>
      <Button className="text-button more-filters" aria-expanded={showMore} aria-controls={panel} onClick={() => { if (showMore) onChange({ ...value, tag: '' }); setMore(!showMore); }}>
        <Icon name="tag" size={15} />{showMore ? 'Fewer filters' : 'More filters'}
      </Button>
      {showMore && <div id={panel} className="more-filters-panel"><TagFilter manifest={manifest} kind={kind} ids={ids} value={value.tag} onChange={set('tag')} /></div>}
    </>}
  </>;
}

/** Custom spellings the editor suggests; on documents and templates, never a word that names a type. */
function customSuggestions(manifest: TagsManifest, kind: TaggedKind) {
  const spellings = new Map(manifest.custom.map(tag => [tagKey(tag), tag]));
  for (const other of taggedKinds) for (const stored of Object.values(manifest[other])) for (const tag of splitTags(other, stored).custom) if (!spellings.has(tagKey(tag))) spellings.set(tagKey(tag), tag);
  return [...spellings.values()].filter(tag => !hasType(kind) || !standardType(tag)).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }));
}

/** Edits one item's type, status, and custom tags; focus returns to the control that opened it. */
export function DetailsDialog({ target, manifest, connected, onClose, onChange }: {
  target: TagTarget | null; manifest: TagsManifest; connected: boolean; onClose: () => void; onChange: (manifest: TagsManifest) => void;
}) {
  // Each opening gets fresh form state, decided during render so the first keystrokes are kept.
  const [shown, setShown] = useState({ target, opening: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const working = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  if (target && target !== shown.target) { setShown({ target, opening: shown.opening + 1 }); setError(''); }
  const current = target ?? shown.target;
  async function save(details: { type?: string | null; status?: DocumentStatus | null; tags: string[] }) {
    if (!current || working.current || !connected) return;
    working.current = true; setBusy(true); setError('');
    try {
      const result = await api<Details>(`/api/tags/${current.kind}/${current.id}`, { method: 'PUT', body: JSON.stringify(details) });
      onChange(result.manifest); onClose();
    } catch (error) { setError((error as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  const finalFocus = () => (current?.returnFocus ? document.querySelector<HTMLElement>(current.returnFocus) : null) ?? true;
  const typed = current ? hasType(current.kind) : false;
  return <Dialog.Root open={Boolean(target)} onOpenChange={open => { if (!open && !working.current) onClose(); }}>
    <Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" />
      <Dialog.Popup className="help-dialog create-dialog tag-dialog" initialFocus={input} finalFocus={finalFocus}>
        <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close" disabled={busy} />}><Icon name="close" /></Dialog.Close>
        <Dialog.Title>{typed ? 'Details' : 'Tags'}</Dialog.Title>
        <Dialog.Description dir="auto">{current?.name}</Dialog.Description>
        {current && <DetailsForm key={shown.opening} target={current} manifest={manifest} busy={busy} connected={connected} input={input} onSubmit={details => void save(details)} />}
        {error && <p className="field-error" role="alert">{error}</p>}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}

/** Why typed text cannot become a custom tag here, if it cannot. */
function customProblem(kind: TaggedKind, value: string, existing: readonly string[]) {
  if (existing.some(tag => tagKey(tag) === tagKey(value))) return undefined;
  const problem = tagProblem(value);
  if (problem) return problem;
  const type = standardType(value);
  if (type && hasType(kind)) return `“${value}” is the ${type.label} type. Choose it under Type.`;
  const status = documentStatus(value);
  if (status) return kind === 'documents' ? `“${value}” is a status. Choose it under Status.` : 'Only documents and presentations have a status.';
  if (parseLanguage(value)) return 'Language is detected from the text; it is not a tag.';
  return undefined;
}

function DetailsForm({ target, manifest, busy, connected, input, onSubmit }: { target: TagTarget; manifest: TagsManifest; busy: boolean; connected: boolean; input: RefObject<HTMLInputElement | null>; onSubmit: (details: { type?: string | null; status?: DocumentStatus | null; tags: string[] }) => void }) {
  const original = splitTags(target.kind, manifest[target.kind][target.id]);
  const originalStatus = itemStatus(manifest, target.id);
  const typed = hasType(target.kind);
  const documentItem = target.kind === 'documents';
  const [type, setType] = useState(original.type ?? '');
  const [status, setStatus] = useState<string>(originalStatus ?? '');
  const [tags, setTags] = useState(original.custom);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState('');
  const suggestions = customSuggestions(manifest, target.kind);
  const applied = new Set(tags.map(tagKey));
  const query = tagKey(draft);
  const shownSuggestions = suggestions.filter(tag => !applied.has(tagKey(tag)) && (!query || tagKey(tag).includes(query))).slice(0, 12);
  function combine(values: string[]) {
    const next = [...tags];
    for (const raw of values) {
      const value = cleanTag(raw);
      if (!value) continue;
      const reason = customProblem(target.kind, value, [...original.custom, ...suggestions]);
      if (reason) { setProblem(reason); return null; }
      const spelling = suggestions.find(tag => tagKey(tag) === tagKey(value)) ?? value;
      if (!next.some(tag => tagKey(tag) === tagKey(spelling))) next.push(spelling);
    }
    if (next.length + (type ? 1 : 0) > tagLimits.tagsPerItem) { setProblem(`Use up to ${tagLimits.tagsPerItem} tags for each item.`); return null; }
    setProblem(''); return next;
  }
  function add(values: string[]) { const next = combine(values); if (next) { setTags(next); setDraft(''); } }
  function remove(tag: string) { setTags(tags.filter(item => item !== tag)); setProblem(''); input.current?.focus(); }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === 'Enter' || event.key === ',') && draft.trim()) { event.preventDefault(); add(draft.split(',')); }
    else if (event.key === 'Backspace' && !draft && tags.length) { event.preventDefault(); setTags(tags.slice(0, -1)); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim() ? combine(draft.split(',')) : tags;
    if (!next) return;
    onSubmit({ ...(typed ? { type: type || null } : {}), ...(documentItem ? { status: (status || null) as DocumentStatus | null } : {}), tags: next });
  }
  const unchanged = !draft.trim() && type === (original.type ?? '') && status === (originalStatus ?? '') && tags.length === original.custom.length && tags.every((tag, index) => tag === original.custom[index]);
  const selectedType = standardTypes.find(item => item.id === type);
  return <form onSubmit={submit} aria-busy={busy}>
    {typed && <div className="create-field"><span>Type</span><div className="purpose-select" inert={busy || undefined}>
      <SelectControl label="Type" value={type} onValueChange={setType} items={[{ value: '', label: 'No type' }, ...standardTypes.map(item => ({ value: item.id, label: item.label }))]} />
    </div><p className="field-hint">{selectedType ? selectedType.description : 'Choose what this is so agents can find it and similar work.'}</p></div>}
    {documentItem && <div className="create-field"><span>Status</span><div className="purpose-select" inert={busy || undefined}>
      <SelectControl label="Status" value={status} onValueChange={setStatus} items={[{ value: '', label: 'No status' }, ...documentStatuses.map(item => ({ value: item.id, label: item.label }))]} />
    </div></div>}
    <div className="create-field">
      <label htmlFor="tag-input">{typed ? 'Custom tags' : 'Tags'}</label>
      {tags.length > 0 && <ul className="tag-list" aria-label="Current tags">{tags.map(tag => <li key={tag}><span dir="auto">{tag}</span><Button className="icon-button" aria-label={`Remove tag ${tag}`} onClick={() => remove(tag)} disabled={busy}><Icon name="close" size={12} /></Button></li>)}</ul>}
      <div className="tag-entry">
        <Input ref={input} id="tag-input" value={draft} onChange={event => { setDraft(event.target.value); setProblem(''); }} onKeyDown={keyDown} disabled={busy} maxLength={tagLimits.tag * 4} autoComplete="off" placeholder={tags.length ? 'Add another tag' : 'Client, programme, or other name'} aria-describedby="tag-hint" aria-invalid={Boolean(problem) || undefined} />
        <Button onClick={() => add(draft.split(','))} disabled={busy || !draft.trim()}>Add</Button>
      </div>
      <p className="field-hint" id="tag-hint">Press Enter or type a comma to add. Use tags for names you reuse, such as a client or programme.</p>
    </div>
    {shownSuggestions.length > 0 && <section className="tag-suggestions" aria-labelledby="tag-suggestions-title">
      <h3 id="tag-suggestions-title">In use</h3>
      <ul>{shownSuggestions.map(tag => <li key={tag}><Button className="tag-choice" onClick={() => add([tag])} disabled={busy}><Icon name="plus" size={13} /><span dir="auto">{tag}</span></Button></li>)}</ul>
    </section>}
    {problem && <p className="field-error" role="alert">{problem}</p>}
    <div className="dialog-actions">
      <Dialog.Close render={<Button disabled={busy} />}>Cancel</Dialog.Close>
      <Button type="submit" className="primary" disabled={busy || !connected || unchanged}>{busy ? 'Saving…' : 'Save'}</Button>
    </div>
  </form>;
}
