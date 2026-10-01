import { useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Menu } from '@base-ui/react/menu';
import type { ThemeSummary } from '../shared/themes';
import {
  cleanTag, folderAncestors, folderDescendants, folderNameProblem, folderPath, folderPathSeparator, normalizeTags, tagCatalog, tagKey, themeFolderLimits,
  type ThemeFolder, type ThemeFoldersManifest,
} from '../shared/theme-folders';
import { api } from './api';
import { Button, Dialog, Input, SelectControl, useNotifications } from './ui';
import { Icon } from './ui/Icon';
import './theme-folders.css';

/** Optional organization from `themes/folders.json`; an unreadable file leaves the flat catalog usable. */
export type ThemeOrganization = { manifest: ThemeFoldersManifest; error?: string };
export type ThemeFolderAction =
  | { kind: 'create'; parent: string | null }
  | { kind: 'rename'; folder: ThemeFolder } | { kind: 'move'; folder: ThemeFolder } | { kind: 'delete'; folder: ThemeFolder }
  | { kind: 'move-theme'; theme: ThemeSummary } | { kind: 'tags'; theme: ThemeSummary };
type Mutation = { manifest: ThemeFoldersManifest };

export const themesHeadingId = 'themes-heading';

export function themesHash({ folder, tag }: { folder?: string | null; tag?: string | null } = {}) {
  const params = new URLSearchParams();
  if (folder) params.set('folder', folder);
  if (tag) params.set('tag', tag);
  const query = params.toString();
  return `#themes${query ? `?${query}` : ''}`;
}

export function displayPath(manifest: ThemeFoldersManifest, id: string | null | undefined) {
  return folderPath(manifest, id)?.split(folderPathSeparator).join(' / ') ?? null;
}

export function folderSummary(manifest: ThemeFoldersManifest, themes: ThemeSummary[], folderId: string) {
  const folders = manifest.folders.filter(folder => folder.parent === folderId).length;
  const items = themes.filter(theme => manifest.assignments[theme.id] === folderId).length;
  return { folders, themes: items, empty: !folders && !items };
}

function describeContents({ folders, themes }: { folders: number; themes: number }) {
  return [themes && `${themes} ${themes === 1 ? 'theme' : 'themes'}`, folders && `${folders} ${folders === 1 ? 'folder' : 'folders'}`].filter(Boolean).join(' and ');
}

const themeDragType = 'application/x-opendoc-theme';
export function startThemeDrag(event: DragEvent, id: string) {
  event.dataTransfer.setData(themeDragType, id);
  event.dataTransfer.effectAllowed = 'move';
}

/** Drag-and-drop is a shortcut; every move is also available from menus and dialogs. */
function useThemeDrop(onDrop?: (themeId: string) => void) {
  const [over, setOver] = useState(false);
  if (!onDrop) return { over: false, handlers: {} };
  return { over, handlers: {
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(themeDragType)) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(true);
    },
    onDragLeave: (event: DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false); },
    onDrop: (event: DragEvent) => {
      const id = event.dataTransfer.getData(themeDragType);
      setOver(false);
      if (id) { event.preventDefault(); onDrop(id); }
    },
  } };
}

export function FolderMenu({ folder, disabled, onAction }: { folder: ThemeFolder; disabled?: boolean; onAction: (action: ThemeFolderAction) => void }) {
  return <Menu.Root><Menu.Trigger render={<Button className="icon-button theme-folder-menu-trigger" aria-label={`Options for folder ${folder.name}`} data-folder-menu={folder.id} />}><Icon name="more" size={14} /></Menu.Trigger>
    <Menu.Portal><Menu.Positioner sideOffset={5} align="end" className="ui-positioner"><Menu.Popup className="ui-menu-popup">
      <Menu.Item className="ui-menu-item" disabled={disabled} onClick={() => onAction({ kind: 'rename', folder })}><Icon name="edit" size={16} /><span>Rename</span></Menu.Item>
      <Menu.Item className="ui-menu-item" disabled={disabled} onClick={() => onAction({ kind: 'move', folder })}><Icon name="folder" size={16} /><span>Move to folder…</span></Menu.Item>
      <Menu.Separator className="ui-menu-separator" />
      <Menu.Item className="ui-menu-item ui-menu-item-danger" disabled={disabled} onClick={() => onAction({ kind: 'delete', folder })}><Icon name="trash" size={16} /><span>Delete</span></Menu.Item>
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}

export function ThemeMenu({ theme, disabled, onAction }: { theme: ThemeSummary; disabled?: boolean; onAction: (action: ThemeFolderAction) => void }) {
  return <Menu.Root><Menu.Trigger render={<Button className="icon-button theme-card-menu-trigger" aria-label={`Options for ${theme.name}`} data-theme-menu={theme.id} />}><Icon name="more" size={14} /></Menu.Trigger>
    <Menu.Portal><Menu.Positioner sideOffset={5} align="end" className="ui-positioner"><Menu.Popup className="ui-menu-popup">
      <Menu.Item className="ui-menu-item" disabled={disabled} onClick={() => onAction({ kind: 'move-theme', theme })}><Icon name="folder" size={16} /><span>Move to folder…</span></Menu.Item>
      <Menu.Item className="ui-menu-item" disabled={disabled} onClick={() => onAction({ kind: 'tags', theme })}><Icon name="tag" size={16} /><span>Edit tags…</span></Menu.Item>
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}

function Crumb({ href, label, onDropTheme }: { href: string; label: string; onDropTheme?: (themeId: string) => void }) {
  const drop = useThemeDrop(onDropTheme);
  return <li><a href={href} className={drop.over ? 'is-drop-target' : undefined} {...drop.handlers}>{label}</a><span aria-hidden="true">/</span></li>;
}

/** Ancestors of the current folder; the folder itself is the page title. */
export function FolderBreadcrumb({ manifest, folderId, onDropTheme }: { manifest: ThemeFoldersManifest; folderId: string; onDropTheme?: (themeId: string, folderId: string | null) => void }) {
  const ancestors = folderAncestors(manifest, folderId).slice(0, -1);
  return <nav className="theme-breadcrumb" aria-label="Folder path"><ol>
    <Crumb href={themesHash()} label="Themes" onDropTheme={onDropTheme && (id => onDropTheme(id, null))} />
    {ancestors.map(folder => <Crumb key={folder.id} href={themesHash({ folder: folder.id })} label={folder.name} onDropTheme={onDropTheme && (id => onDropTheme(id, folder.id))} />)}
  </ol></nav>;
}

function FolderRow({ folder, manifest, themes, disabled, onAction, onDropTheme }: { folder: ThemeFolder; manifest: ThemeFoldersManifest; themes: ThemeSummary[]; disabled?: boolean; onAction: (action: ThemeFolderAction) => void; onDropTheme?: (themeId: string, folderId: string) => void }) {
  const drop = useThemeDrop(onDropTheme && (id => onDropTheme(id, folder.id)));
  const contents = folderSummary(manifest, themes, folder.id);
  return <li className={`theme-folder-row${drop.over ? ' is-drop-target' : ''}`} {...drop.handlers}>
    <a href={themesHash({ folder: folder.id })} data-folder-link={folder.id}>
      <Icon name="folder" size={18} /><span className="theme-folder-name" title={folder.name}>{folder.name}</span>
      <span className="theme-folder-count">{contents.empty ? 'Empty' : describeContents(contents)}</span>
    </a>
    <FolderMenu folder={folder} disabled={disabled} onAction={onAction} />
  </li>;
}

export function FolderList(props: { folders: ThemeFolder[]; manifest: ThemeFoldersManifest; themes: ThemeSummary[]; disabled?: boolean; onAction: (action: ThemeFolderAction) => void; onDropTheme?: (themeId: string, folderId: string) => void }) {
  if (!props.folders.length) return null;
  return <ul className="theme-folder-list" aria-label="Folders">{props.folders.map(folder => <FolderRow key={folder.id} {...props} folder={folder} />)}</ul>;
}

/** Card metadata: the containing folder (when results span folders) and the theme's tags. */
export function ThemeCardMeta({ theme, manifest, showFolder }: { theme: ThemeSummary; manifest: ThemeFoldersManifest; showFolder: boolean }) {
  const folder = manifest.assignments[theme.id];
  const path = showFolder ? displayPath(manifest, folder) : null;
  const tags = manifest.tags[theme.id] ?? [];
  if (!path && !tags.length) return null;
  return <div className="theme-card-meta">
    {path && <a className="theme-card-folder" href={themesHash({ folder })}><Icon name="folder" size={15} /><span>{path}</span></a>}
    {tags.length > 0 && <p className="theme-card-tags"><span className="sr-only">Tags: </span>{tags.join(' · ')}</p>}
  </div>;
}

export function TagFilter({ manifest, themes, tag, onChange }: { manifest: ThemeFoldersManifest; themes: ThemeSummary[]; tag: string; onChange: (tag: string) => void }) {
  const tags = tagCatalog(manifest, themes.map(theme => theme.id));
  if (!tags.length && !tag) return null;
  const items = [{ value: '', label: 'All tags' }, ...tags.map(item => ({ value: item.key, label: `${item.label} (${item.count})` }))];
  if (tag && !tags.some(item => item.key === tagKey(tag))) items.push({ value: tagKey(tag), label: `${tag} (0)` });
  return <div className="theme-tools"><Icon name="tag" size={16} /><SelectControl label="Filter by tag" value={tag ? tagKey(tag) : ''} onValueChange={onChange} items={items} /></div>;
}

function focusAfterChange(selector: string | null) {
  return (selector ? document.querySelector<HTMLElement>(selector) : null) ?? document.getElementById(themesHeadingId);
}

/** One dialog surface for folder and theme organization, with focus returned to a surviving control. */
export function ThemeFolderDialog({ action, manifest, themes, connected, onClose, onChange }: {
  action: ThemeFolderAction | null; manifest: ThemeFoldersManifest; themes: ThemeSummary[]; connected: boolean;
  onClose: () => void; onChange: (manifest: ThemeFoldersManifest) => void;
}) {
  // Each opening gets fresh form state, decided during render so the first keystrokes are kept.
  const [shown, setShown] = useState({ action, opening: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const working = useRef(false);
  const focusTarget = useRef<string | null>(null);
  const notifications = useNotifications();
  if (action && action !== shown.action) { setShown({ action, opening: shown.opening + 1 }); setError(''); }
  const current = action ?? shown.action;
  const opening = shown.opening;
  async function run(task: () => Promise<Mutation>, after?: (result: any) => void) {
    if (working.current || !connected) return;
    working.current = true; setBusy(true); setError(''); focusTarget.current = null;
    try { const result = await task(); onChange(result.manifest); after?.(result); onClose(); }
    catch (error) { setError((error as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  const opener = !current ? null : current.kind === 'create' ? '[data-new-folder]' : 'theme' in current ? `[data-theme-menu="${current.theme.id}"]` : `[data-folder-menu="${current.folder.id}"]`;
  const finalFocus = () => focusAfterChange(focusTarget.current ?? opener);
  const shell = (title: string, description: ReactNode, body: ReactNode, initialFocus?: RefObject<HTMLElement | null>) => <Dialog.Root open={Boolean(action)} onOpenChange={open => { if (!open && !working.current) onClose(); }}>
    <Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" />
      <Dialog.Popup className="help-dialog create-dialog theme-folder-dialog" initialFocus={initialFocus} finalFocus={finalFocus}>
        <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close" disabled={busy} />}><Icon name="close" /></Dialog.Close>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description>{description}</Dialog.Description>
        {body}
        {error && <p className="field-error" role="alert">{error}</p>}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
  if (!current) return null;
  const actions = (label: string, busyLabel: string, disabled: boolean, danger = false, cancel?: RefObject<HTMLButtonElement | null>) => <div className="dialog-actions">
    <Dialog.Close render={<Button ref={cancel} disabled={busy} />}>Cancel</Dialog.Close>
    <Button type="submit" className={danger ? 'theme-folder-delete-button' : 'primary'} disabled={busy || !connected || disabled}>{busy ? busyLabel : label}</Button>
  </div>;

  if (current.kind === 'create' || current.kind === 'rename') {
    return <FolderNameForm key={opening} action={current} manifest={manifest} busy={busy} actions={actions} shell={shell}
      onSubmit={name => void run(
        () => current.kind === 'create'
          ? api<Mutation>('/api/theme-folders', { method: 'POST', body: JSON.stringify({ name, parent: current.parent }) })
          : api<Mutation>(`/api/theme-folders/${current.folder.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
        (result: { folder: ThemeFolder }) => { focusTarget.current = current.kind === 'create' ? `[data-folder-link="${result.folder.id}"]` : null; },
      )} />;
  }
  if (current.kind === 'move' || current.kind === 'move-theme') {
    const subject = current.kind === 'move' ? current.folder : current.theme;
    return <MoveForm key={opening} action={current} manifest={manifest} busy={busy} actions={actions} shell={shell}
      onSubmit={destination => void run(
        () => current.kind === 'move'
          ? api<Mutation>(`/api/theme-folders/${current.folder.id}`, { method: 'PATCH', body: JSON.stringify({ parent: destination }) })
          : api<Mutation>(`/api/themes/${current.theme.id}/folder`, { method: 'PUT', body: JSON.stringify({ folderId: destination }) }),
        (result: Mutation) => notifications.success(`Moved ${subject.name} to ${displayPath(result.manifest, destination) ?? 'Themes'}`),
      )} />;
  }
  if (current.kind === 'tags') {
    return <TagsForm key={opening} theme={current.theme} manifest={manifest} busy={busy} actions={actions} shell={shell}
      onSubmit={tags => void run(() => api<Mutation>(`/api/themes/${current.theme.id}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) }))} />;
  }
  return <DeleteForm key={opening} folder={current.folder} manifest={manifest} themes={themes} actions={actions} shell={shell}
    onSubmit={() => void run(() => api<Mutation>(`/api/theme-folders/${current.folder.id}`, { method: 'DELETE' }), (result: Mutation & { parent: string | null }) => {
      notifications.success(`Deleted ${current.folder.name}`);
      if (new URLSearchParams(location.hash.split('?')[1]).get('folder') === current.folder.id) location.hash = themesHash({ folder: result.parent });
    })} />;
}

type Shell = (title: string, description: ReactNode, body: ReactNode, initialFocus?: RefObject<HTMLElement | null>) => ReactNode;
type Actions = (label: string, busyLabel: string, disabled: boolean, danger?: boolean, cancel?: RefObject<HTMLButtonElement | null>) => ReactNode;

function FolderNameForm({ action, manifest, busy, actions, shell, onSubmit }: { action: { kind: 'create'; parent: string | null } | { kind: 'rename'; folder: ThemeFolder }; manifest: ThemeFoldersManifest; busy: boolean; actions: Actions; shell: Shell; onSubmit: (name: string) => void }) {
  const creating = action.kind === 'create';
  const [name, setName] = useState(creating ? '' : action.folder.name);
  const [problem, setProblem] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const place = displayPath(manifest, creating ? action.parent : action.folder.parent);
  function submit(event: FormEvent) {
    event.preventDefault();
    const issue = folderNameProblem(name.trim());
    if (issue) { setProblem(issue); input.current?.focus(); return; }
    onSubmit(name.trim());
  }
  return shell(creating ? 'New folder' : 'Rename folder',
    creating ? 'Group related themes. Folders only organize this view; theme files and IDs stay the same.' : 'Change the name shown in Themes. Its themes and subfolders stay inside it.',
    <form onSubmit={submit} aria-busy={busy}>
      <label className="create-field" htmlFor="theme-folder-name"><span>Folder name</span>
        <Input ref={input} id="theme-folder-name" value={name} onChange={event => { setName(event.target.value); setProblem(''); }} disabled={busy} maxLength={themeFolderLimits.name} required autoComplete="off" placeholder="For example, Client work" aria-invalid={Boolean(problem) || undefined} aria-describedby={problem ? 'theme-folder-name-problem' : 'theme-folder-location'} />
      </label>
      <p className="field-hint" id="theme-folder-location">Location: {place ?? 'Themes'}</p>
      {problem && <p className="field-error" id="theme-folder-name-problem" role="alert">{problem}</p>}
      {actions(creating ? 'Create folder' : 'Save name', 'Saving…', !name.trim() || (!creating && name.trim() === action.folder.name))}
    </form>, input);
}

const topLevel = '__top_level__';
function MoveForm({ action, manifest, busy, actions, shell, onSubmit }: { action: { kind: 'move'; folder: ThemeFolder } | { kind: 'move-theme'; theme: ThemeSummary }; manifest: ThemeFoldersManifest; busy: boolean; actions: Actions; shell: Shell; onSubmit: (folderId: string | null) => void }) {
  const moving = action.kind === 'move' ? action.folder : action.theme;
  const current = (action.kind === 'move' ? action.folder.parent : manifest.assignments[action.theme.id]) ?? topLevel;
  const [destination, setDestination] = useState(current);
  const excluded = action.kind === 'move' ? folderDescendants(manifest, action.folder.id) : new Set<string>();
  const choices = manifest.folders.filter(folder => !excluded.has(folder.id)).map(folder => ({ value: folder.id, label: displayPath(manifest, folder.id)! }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base', numeric: true }));
  const items = [{ value: topLevel, label: 'Themes (top level)' }, ...choices].map(item => item.value === current ? { ...item, label: `${item.label} (current)` } : item);
  return shell(action.kind === 'move' ? 'Move folder' : 'Move to folder', moving.name,
    <form onSubmit={event => { event.preventDefault(); if (destination !== current) onSubmit(destination === topLevel ? null : destination); }} aria-busy={busy}>
      <div className="create-field"><span>Destination</span><div className="purpose-select" inert={busy || undefined}><SelectControl label="Destination folder" value={destination} onValueChange={setDestination} items={items} /></div>
        <p className="field-hint">{action.kind === 'move' ? 'Its themes and subfolders move with it.' : 'The theme’s files and ID stay the same, so documents using it are unaffected.'}</p></div>
      {!choices.length && <p className="field-hint">Create a folder first using New folder in Themes.</p>}
      {actions('Move', 'Moving…', destination === current)}
    </form>);
}

function DeleteForm({ folder, manifest, themes, actions, shell, onSubmit }: { folder: ThemeFolder; manifest: ThemeFoldersManifest; themes: ThemeSummary[]; actions: Actions; shell: Shell; onSubmit: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const contents = folderSummary(manifest, themes, folder.id);
  const destination = displayPath(manifest, folder.parent) ?? 'Themes';
  return shell(`Delete “${folder.name}”?`,
    contents.empty ? 'This folder is empty. No themes are deleted.' : `Its ${describeContents(contents)} will move to ${destination}. No themes are deleted.`,
    <form onSubmit={event => { event.preventDefault(); onSubmit(); }}>{actions('Delete folder', 'Deleting…', false, true, cancel)}</form>, cancel);
}

function TagsForm({ theme, manifest, busy, actions, shell, onSubmit }: { theme: ThemeSummary; manifest: ThemeFoldersManifest; busy: boolean; actions: Actions; shell: Shell; onSubmit: (tags: string[]) => void }) {
  const original = manifest.tags[theme.id] ?? [];
  const [tags, setTags] = useState(original);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const others = tagCatalog({ ...manifest, tags: Object.fromEntries(Object.entries(manifest.tags).filter(([id]) => id !== theme.id)) }).map(tag => tag.label);
  const suggestions = others.filter(label => !tags.some(tag => tagKey(tag) === tagKey(label))).slice(0, 12);
  function combine(values: string[]) {
    try { const next = normalizeTags([...tags, ...values.filter(value => cleanTag(value))], others); setProblem(''); return next; }
    catch (error) { setProblem((error as Error).message); return null; }
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
    if (next) onSubmit(next);
  }
  const unchanged = !draft.trim() && tags.length === original.length && tags.every((tag, index) => tag === original[index]);
  return shell('Edit tags', theme.name,
    <form onSubmit={submit} aria-busy={busy}>
      <div className="create-field">
        <label htmlFor="theme-tag-input">Tags</label>
        {tags.length > 0 && <ul className="theme-tag-list" aria-label="Current tags">{tags.map(tag => <li key={tag}><span>{tag}</span><Button className="icon-button" aria-label={`Remove tag ${tag}`} onClick={() => remove(tag)} disabled={busy}><Icon name="close" size={12} /></Button></li>)}</ul>}
        <div className="theme-tag-entry">
          <Input ref={input} id="theme-tag-input" value={draft} onChange={event => { setDraft(event.target.value); setProblem(''); }} onKeyDown={keyDown} disabled={busy} maxLength={themeFolderLimits.tag * 4} autoComplete="off" placeholder={tags.length ? 'Add another tag' : 'For example, Reports'} aria-describedby="theme-tag-hint" aria-invalid={Boolean(problem) || undefined} />
          <Button onClick={() => add(draft.split(','))} disabled={busy || !draft.trim()}>Add</Button>
        </div>
        <p className="field-hint" id="theme-tag-hint">Press Enter or type a comma to add. Tags let you filter themes across every folder.</p>
      </div>
      {suggestions.length > 0 && <div className="theme-tag-suggestions"><span>Used on other themes</span><ul>{suggestions.map(label => <li key={label}><Button onClick={() => add([label])} disabled={busy} aria-label={`Add tag ${label}`}><Icon name="plus" size={13} />{label}</Button></li>)}</ul></div>}
      {problem && <p className="field-error" role="alert">{problem}</p>}
      {actions('Save tags', 'Saving…', unchanged)}
    </form>, input);
}

/** Organization mutations that need no confirmation: drag-and-drop moves and deleting an empty folder. */
export function useThemeFolderMutations(onChange: (manifest: ThemeFoldersManifest) => void) {
  const notifications = useNotifications();
  return {
    moveTheme: (theme: ThemeSummary, folderId: string | null) => api<Mutation>(`/api/themes/${theme.id}/folder`, { method: 'PUT', body: JSON.stringify({ folderId }) })
      .then(result => { onChange(result.manifest); notifications.success(`Moved ${theme.name} to ${displayPath(result.manifest, folderId) ?? 'Themes'}`); })
      .catch(error => notifications.error(error.message)),
    deleteEmptyFolder: (folder: ThemeFolder) => api<Mutation & { parent: string | null }>(`/api/theme-folders/${folder.id}`, { method: 'DELETE' })
      .then(result => {
        onChange(result.manifest); notifications.success(`Deleted ${folder.name}`);
        if (new URLSearchParams(location.hash.split('?')[1]).get('folder') === folder.id) location.hash = themesHash({ folder: result.parent });
        requestAnimationFrame(() => document.getElementById(themesHeadingId)?.focus());
      })
      .catch(error => notifications.error(error.message)),
  };
}
