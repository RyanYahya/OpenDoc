import { useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import {
  cleanTag, normalizeTags, sortTagsForDisplay, standardTag, standardTagGroups, standardTags, tagCounts, tagKey, tagLabel, tagLimits, taggedKinds,
  type TaggedKind, type TagsManifest,
} from '../shared/tags';
import { api } from './api';
import { Button, Dialog, Input, SelectControl } from './ui';
import { Icon } from './ui/Icon';
import './tags.css';

/** Workspace tags from `tags.json`; an unreadable file leaves every view usable without them. */
export type TagState = { manifest: TagsManifest; error?: string };
/** The item whose tags are being edited, and the control that should regain focus afterward. */
export type TagTarget = { kind: TaggedKind; id: string; name: string; returnFocus?: string };
type Mutation = { tags: string[]; manifest: TagsManifest };

/** Isolates user-named text so an Arabic name beside Latin ones keeps its own direction in labels and paths. */
export const isolate = (text: string) => `⁨${text}⁩`;

/** Tags in vocabulary order, as one compact line. */
export function tagText(tags: readonly string[]) {
  return sortTagsForDisplay(tags).map(tag => isolate(tagLabel(tag))).join(' · ');
}

/** Muted tag line for cards and rows; renders nothing for an untagged item. */
export function TagSummary({ tags, id, className = '' }: { tags?: readonly string[]; id?: string; className?: string }) {
  if (!tags?.length) return null;
  return <span className={`item-tags ${className}`.trim()} id={id}><span className="sr-only">Tags: </span>{tagText(tags)}</span>;
}

/** True when no tag is chosen or the item carries the chosen tag key. */
export function matchesTag(manifest: TagsManifest, kind: TaggedKind, id: string, key: string) {
  return !key || (manifest[kind][id] ?? []).some(tag => tagKey(tag) === key);
}

/** The display label for a filter value, whether or not any item still carries it. */
export function filterLabel(manifest: TagsManifest, key: string) {
  if (!key) return '';
  const standard = standardTag(key);
  if (standard) return standard.label;
  for (const kind of taggedKinds) for (const tags of Object.values(manifest[kind])) for (const tag of tags) if (tagKey(tag) === key) return tag;
  return manifest.custom.find(tag => tagKey(tag) === key) ?? key;
}

/** One tag filter for every catalog, grouped like the standard vocabulary, with item counts. */
export function TagFilter({ manifest, kind, ids, value, onChange, className = '' }: { manifest: TagsManifest; kind: TaggedKind; ids?: Iterable<string>; value: string; onChange: (key: string) => void; className?: string }) {
  const counts = tagCounts(manifest, kind, ids);
  if (!counts.length && !value) return null;
  const groupLabel = (group: string | null) => standardTagGroups.find(item => item.id === group)?.label ?? 'Custom';
  const items: { value: string; label: string; group?: string }[] = [{ value: '', label: 'All tags' }, ...counts.map(entry => ({ value: entry.key, label: `${entry.label} (${entry.count})`, group: groupLabel(entry.group) }))];
  if (value && !counts.some(entry => entry.key === value)) items.push({ value, label: `${filterLabel(manifest, value)} (0)` });
  return <div className={`tag-filter ${className}`.trim()}><Icon name="tag" size={16} /><SelectControl label="Filter by tag" value={value} onValueChange={onChange} items={items} /></div>;
}

/** Custom spellings the editor reuses: the vocabulary and every custom tag in use. */
function customSpellings(manifest: TagsManifest) {
  const spellings = new Map(manifest.custom.map(tag => [tagKey(tag), tag]));
  for (const kind of taggedKinds) for (const tags of Object.values(manifest[kind])) for (const tag of tags) if (!standardTag(tag) && !spellings.has(tagKey(tag))) spellings.set(tagKey(tag), tag);
  return [...spellings.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }));
}

/** Edits one item's tags; focus returns to the control that opened it when it still exists. */
export function TagEditorDialog({ target, manifest, connected, onClose, onChange }: {
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
  async function save(tags: string[]) {
    if (!current || working.current || !connected) return;
    working.current = true; setBusy(true); setError('');
    try {
      const result = await api<Mutation>(`/api/tags/${current.kind}/${current.id}`, { method: 'PUT', body: JSON.stringify({ tags }) });
      onChange(result.manifest); onClose();
    } catch (error) { setError((error as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  const finalFocus = () => (current?.returnFocus ? document.querySelector<HTMLElement>(current.returnFocus) : null) ?? true;
  return <Dialog.Root open={Boolean(target)} onOpenChange={open => { if (!open && !working.current) onClose(); }}>
    <Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" />
      <Dialog.Popup className="help-dialog create-dialog tag-dialog" initialFocus={input} finalFocus={finalFocus}>
        <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close" disabled={busy} />}><Icon name="close" /></Dialog.Close>
        <Dialog.Title>Edit tags</Dialog.Title>
        <Dialog.Description dir="auto">{current?.name}</Dialog.Description>
        {current && <TagsForm key={shown.opening} target={current} manifest={manifest} busy={busy} connected={connected} input={input} onSubmit={tags => void save(tags)} />}
        {error && <p className="field-error" role="alert">{error}</p>}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}

const filterHint: Record<TaggedKind, string> = { documents: 'documents and presentations across every project', themes: 'themes across every folder', templates: 'templates in both tabs' };

function TagsForm({ target, manifest, busy, connected, input, onSubmit }: { target: TagTarget; manifest: TagsManifest; busy: boolean; connected: boolean; input: RefObject<HTMLInputElement | null>; onSubmit: (tags: string[]) => void }) {
  const original = manifest[target.kind][target.id] ?? [];
  const [tags, setTags] = useState(original);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState('');
  const custom = customSpellings(manifest);
  const applied = new Set(tags.map(tagKey));
  function combine(values: string[]) {
    try { const next = normalizeTags([...tags, ...values.filter(value => cleanTag(value))], custom).tags; setProblem(''); return next; }
    catch (error) { setProblem((error as Error).message); return null; }
  }
  function add(values: string[]) { const next = combine(values); if (next) { setTags(next); setDraft(''); } }
  function remove(tag: string) { setTags(tags.filter(item => item !== tag)); setProblem(''); input.current?.focus(); }
  function toggle(tag: string) {
    if (applied.has(tagKey(tag))) { setTags(tags.filter(item => tagKey(item) !== tagKey(tag))); setProblem(''); }
    else add([tag]);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === 'Enter' || event.key === ',') && draft.trim()) { event.preventDefault(); add(draft.split(',')); }
    else if (event.key === 'Backspace' && !draft && tags.length) { event.preventDefault(); setTags(tags.slice(0, -1)); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim() ? combine(draft.split(',')) : tags;
    if (next) onSubmit(next);
  }
  const unchanged = !draft.trim() && tags.length === original.length && tags.every((tag, index) => tag === original[index]);
  // Groups that suit this kind of item; any other standard tag can still be typed.
  const groups = standardTagGroups.filter(group => group.kinds.includes(target.kind));
  const chip = (tag: string, label: string) => <li key={tag}><Button className="tag-choice" aria-pressed={applied.has(tagKey(tag))} onClick={() => toggle(tag)} disabled={busy}>
    <Icon name={applied.has(tagKey(tag)) ? 'check' : 'plus'} size={13} /><span dir="auto">{label}</span>
  </Button></li>;
  return <form onSubmit={submit} aria-busy={busy}>
    <div className="create-field">
      <label htmlFor="tag-input">Tags</label>
      {tags.length > 0 && <ul className="tag-list" aria-label="Current tags">{sortTagsForDisplay(tags).map(tag => <li key={tag}><span dir="auto">{tagLabel(tag)}</span><Button className="icon-button" aria-label={`Remove tag ${tagLabel(tag)}`} onClick={() => remove(tag)} disabled={busy}><Icon name="close" size={12} /></Button></li>)}</ul>}
      <div className="tag-entry">
        <Input ref={input} id="tag-input" value={draft} onChange={event => { setDraft(event.target.value); setProblem(''); }} onKeyDown={keyDown} disabled={busy} maxLength={tagLimits.tag * 4} autoComplete="off" placeholder={tags.length ? 'Add another tag' : 'Type a tag, or choose below'} aria-describedby="tag-hint" aria-invalid={Boolean(problem) || undefined} />
        <Button onClick={() => add(draft.split(','))} disabled={busy || !draft.trim()}>Add</Button>
      </div>
      <p className="field-hint" id="tag-hint">Press Enter or type a comma to add. Tags let you filter {filterHint[target.kind]}.</p>
    </div>
    <div className="tag-suggestions">
      {groups.map(group => <section key={group.id} aria-labelledby={`tag-group-${group.id}`}>
        <h3 id={`tag-group-${group.id}`}>{group.label}{group.exclusive && <span className="tag-group-note"> · one at a time</span>}</h3>
        <ul>{standardTags.filter(tag => tag.group === group.id).map(tag => chip(tag.id, tag.label))}</ul>
      </section>)}
      {custom.length > 0 && <section aria-labelledby="tag-group-custom"><h3 id="tag-group-custom">Custom</h3><ul>{custom.map(tag => chip(tag, tag))}</ul></section>}
    </div>
    {problem && <p className="field-error" role="alert">{problem}</p>}
    <div className="dialog-actions">
      <Dialog.Close render={<Button disabled={busy} />}>Cancel</Dialog.Close>
      <Button type="submit" className="primary" disabled={busy || !connected || unchanged}>{busy ? 'Saving…' : 'Save tags'}</Button>
    </div>
  </form>;
}
