import { useRef, useState, type DragEvent, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import type { ThemeSummary } from '../shared/themes';
import {
  folderCounts, folderNameProblem, sortedFolders, themeFolder, themeFolderLimits,
  type ThemeFolder, type ThemeFoldersManifest,
} from '../shared/theme-folders';
import { api } from './api';
import { Button, Dialog, Input, SelectControl, useNotifications } from './ui';
import { Icon } from './ui/Icon';
import { isolate, TagSummary } from './Tags';
import './theme-folders.css';

export { isolate };

/** Optional organization from `themes/folders.json`; an unreadable file leaves the flat catalog usable. */
export type ThemeOrganization = { manifest: ThemeFoldersManifest; error?: string };
export type ThemeFolderAction =
  | { kind: 'create' } | { kind: 'rename'; folder: ThemeFolder } | { kind: 'delete'; folder: ThemeFolder }
  | { kind: 'move-theme'; theme: ThemeSummary } | { kind: 'tags'; theme: ThemeSummary };
/** Folder actions handled by ThemeFolderDialog; tags open the shared tag editor. */
type FolderDialogAction = Exclude<ThemeFolderAction, { kind: 'tags' }>;
type Mutation = { manifest: ThemeFoldersManifest };

export const themesHeadingId = 'themes-heading';
/** The value of the “All” folder filter button; folder IDs are lowercase words, so it cannot clash. */
const allFolders = 'All';

export function themesHash({ folder, tag }: { folder?: string | null; tag?: string | null } = {}) {
  const params = new URLSearchParams();
  if (folder) params.set('folder', folder);
  if (tag) params.set('tag', tag);
  const query = params.toString();
  return `#themes${query ? `?${query}` : ''}`;
}

/** The current gallery filters, read from the hash when a change happens outside React. */
function currentFilters() {
  const query = new URLSearchParams(location.hash.split('?')[1] ?? '');
  return { folder: query.get('folder'), tag: query.get('tag') };
}

const themeCount = (count: number) => `${count} ${count === 1 ? 'theme' : 'themes'}`;

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

/** Folders and tags are independent: either file can be unreadable without hiding the other. */
export function ThemeMenu({ theme, disabled, folders = true, tags = true, onAction }: { theme: ThemeSummary; disabled?: boolean; folders?: boolean; tags?: boolean; onAction: (action: ThemeFolderAction) => void }) {
  return <Menu.Root><Menu.Trigger render={<Button className="icon-button theme-card-menu-trigger" aria-label={`Options for ${theme.name}`} data-theme-menu={theme.id} />}><Icon name="more" size={14} /></Menu.Trigger>
    <Menu.Portal><Menu.Positioner sideOffset={5} align="end" className="ui-positioner"><Menu.Popup className="ui-menu-popup">
      {folders && <Menu.Item className="ui-menu-item" disabled={disabled} onClick={() => onAction({ kind: 'move-theme', theme })}><Icon name="folder" size={16} /><span>Move to folder…</span></Menu.Item>}
      {tags && <Menu.Item className="ui-menu-item" disabled={disabled} onClick={() => onAction({ kind: 'tags', theme })}><Icon name="tag" size={16} /><span>Edit tags…</span></Menu.Item>}
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}

function FolderToggle({ value, name, count, icon, onDropTheme }: { value: string; name: string; count: number; icon: boolean; onDropTheme?: (themeId: string) => void }) {
  const drop = useThemeDrop(onDropTheme);
  return <Toggle value={value} data-folder-filter={value} aria-label={`${name}, ${themeCount(count)}`} title={icon ? name : undefined}
    className={`ui-button theme-folder-toggle${drop.over ? ' is-drop-target' : ''}`} {...drop.handlers}>
    {icon && <Icon name="folder" size={15} />}<span className="theme-folder-toggle-name" dir="auto">{name}</span><span className="theme-folder-toggle-count" aria-hidden="true">{count}</span>
  </Toggle>;
}

/** Folder actions apply to the folder chosen in the filter, so the menu stays short and predictable. */
function ManageFoldersMenu({ selected, hasFolders, disabled, onAction }: { selected?: ThemeFolder; hasFolders: boolean; disabled: boolean; onAction: (action: ThemeFolderAction) => void }) {
  if (!hasFolders) return <Button className="tool-button theme-manage-folders" data-manage-folders disabled={disabled} onClick={() => onAction({ kind: 'create' })}><Icon name="folderPlus" size={16} />New folder</Button>;
  return <Menu.Root><Menu.Trigger disabled={disabled} render={<Button className="tool-button theme-manage-folders" data-manage-folders />}>Manage folders<Icon name="down" size={14} /></Menu.Trigger>
    <Menu.Portal><Menu.Positioner sideOffset={5} align="end" className="ui-positioner"><Menu.Popup className="ui-menu-popup">
      <Menu.Item className="ui-menu-item" onClick={() => onAction({ kind: 'create' })}><Icon name="folderPlus" size={16} /><span>New folder…</span></Menu.Item>
      <Menu.Separator className="ui-menu-separator" />
      {selected ? <>
        <Menu.Item className="ui-menu-item" onClick={() => onAction({ kind: 'rename', folder: selected })}><Icon name="edit" size={16} /><span>Rename <bdi>{selected.name}</bdi>…</span></Menu.Item>
        <Menu.Item className="ui-menu-item ui-menu-item-danger" onClick={() => onAction({ kind: 'delete', folder: selected })}><Icon name="trash" size={16} /><span>Delete <bdi>{selected.name}</bdi>…</span></Menu.Item>
      </> : <Menu.Group>
        <Menu.GroupLabel className="ui-menu-label theme-manage-hint">Choose a folder to rename or delete it.</Menu.GroupLabel>
        <Menu.Item className="ui-menu-item" disabled><Icon name="edit" size={16} /><span>Rename folder…</span></Menu.Item>
        <Menu.Item className="ui-menu-item" disabled><Icon name="trash" size={16} /><span>Delete folder…</span></Menu.Item>
      </Menu.Group>}
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}

/**
 * Folder filter: All plus one button per folder, each with its theme count. It combines with the
 * tag filter; dropping a theme card on a folder button files the theme there.
 */
export function FolderFilter({ manifest, themes, value, disabled, onChange, onAction, onDropTheme }: {
  manifest: ThemeFoldersManifest; themes: ThemeSummary[]; value: string; disabled: boolean;
  onChange: (folderId: string) => void; onAction: (action: ThemeFolderAction) => void; onDropTheme?: (themeId: string, folderId: string) => void;
}) {
  const folders = sortedFolders(manifest);
  const counts = folderCounts(manifest, themes.map(theme => theme.id));
  const selected = folders.find(folder => folder.id === value);
  return <div className="theme-folder-filter">
    {folders.length > 0 && <ToggleGroup className="theme-folder-toggles" aria-label="Filter by folder" value={selected ? [selected.id] : value ? [] : [allFolders]}
      onValueChange={values => onChange(values[0] && values[0] !== allFolders ? values[0] : '')}>
      <FolderToggle value={allFolders} name="All" count={themes.length} icon={false} />
      {folders.map(folder => <FolderToggle key={folder.id} value={folder.id} name={folder.name} count={counts.get(folder.id) ?? 0} icon onDropTheme={onDropTheme && (id => onDropTheme(id, folder.id))} />)}
    </ToggleGroup>}
    <ManageFoldersMenu selected={selected} hasFolders={folders.length > 0} disabled={disabled} onAction={onAction} />
  </div>;
}

/** Card metadata: the theme's folder (when the gallery spans folders) and its tags. */
export function ThemeCardMeta({ theme, manifest, tags, showFolder, tag }: { theme: ThemeSummary; manifest: ThemeFoldersManifest; tags: readonly string[]; showFolder: boolean; tag?: string }) {
  const folder = showFolder ? themeFolder(manifest, theme.id) : undefined;
  if (!folder && !tags.length) return null;
  return <div className="theme-card-meta">
    {folder && <a className="theme-card-folder" href={themesHash({ folder: folder.id, tag })}><Icon name="folder" size={15} /><span className="sr-only">Folder: </span><span dir="auto">{folder.name}</span></a>}
    <TagSummary tags={tags} />
  </div>;
}

function focusAfterChange(selector: string | null) {
  return (selector ? document.querySelector<HTMLElement>(selector) : null) ?? document.getElementById(themesHeadingId);
}
const folderButton = (id: string) => `[data-folder-filter="${id}"]`;

/** One dialog surface for folder and theme organization, with focus returned to a surviving control. */
export function ThemeFolderDialog({ action, manifest, themes, connected, onClose, onChange }: {
  action: FolderDialogAction | null; manifest: ThemeFoldersManifest; themes: ThemeSummary[]; connected: boolean;
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
  const opener = !current ? null : current.kind === 'move-theme' ? `[data-theme-menu="${current.theme.id}"]` : '[data-manage-folders]';
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
    return <FolderNameForm key={opening} action={current} busy={busy} actions={actions} shell={shell}
      onSubmit={name => void run(
        () => current.kind === 'create'
          ? api<Mutation>('/api/theme-folders', { method: 'POST', body: JSON.stringify({ name }) })
          : api<Mutation>(`/api/theme-folders/${current.folder.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
        (result: { folder: ThemeFolder }) => { focusTarget.current = folderButton(result.folder.id); },
      )} />;
  }
  if (current.kind === 'move-theme') {
    return <MoveForm key={opening} theme={current.theme} manifest={manifest} busy={busy} actions={actions} shell={shell}
      onSubmit={destination => void run(
        () => api<Mutation>(`/api/themes/${current.theme.id}/folder`, { method: 'PUT', body: JSON.stringify({ folderId: destination }) }),
        (result: Mutation) => notifications.success(movedMessage(current.theme, result.manifest)),
      )} />;
  }
  return <DeleteForm key={opening} folder={current.folder} manifest={manifest} themes={themes} actions={actions} shell={shell}
    onSubmit={() => void run(() => api<Mutation>(`/api/theme-folders/${current.folder.id}`, { method: 'DELETE' }), () => {
      notifications.success(`Deleted ${isolate(current.folder.name)}`);
      focusTarget.current = folderButton(allFolders);
      showAllIfSelected(current.folder);
    })} />;
}

function movedMessage(theme: ThemeSummary, manifest: ThemeFoldersManifest) {
  const folder = themeFolder(manifest, theme.id);
  return folder ? `Moved ${isolate(theme.name)} to ${isolate(folder.name)}` : `Removed ${isolate(theme.name)} from its folder`;
}

/** A deleted folder can no longer filter the gallery; keep the tag filter. */
function showAllIfSelected(folder: ThemeFolder) {
  const { folder: selected, tag } = currentFilters();
  if (selected === folder.id) location.hash = themesHash({ tag });
}

type Shell = (title: string, description: ReactNode, body: ReactNode, initialFocus?: RefObject<HTMLElement | null>) => ReactNode;
type Actions = (label: string, busyLabel: string, disabled: boolean, danger?: boolean, cancel?: RefObject<HTMLButtonElement | null>) => ReactNode;

function FolderNameForm({ action, busy, actions, shell, onSubmit }: { action: { kind: 'create' } | { kind: 'rename'; folder: ThemeFolder }; busy: boolean; actions: Actions; shell: Shell; onSubmit: (name: string) => void }) {
  const creating = action.kind === 'create';
  const [name, setName] = useState(creating ? '' : action.folder.name);
  const [problem, setProblem] = useState('');
  const input = useRef<HTMLInputElement>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    const issue = folderNameProblem(name.trim());
    if (issue) { setProblem(issue); input.current?.focus(); return; }
    onSubmit(name.trim());
  }
  return shell(creating ? 'New folder' : 'Rename folder',
    creating ? 'Group related themes. Folders only organize this view; theme files and IDs stay the same.' : 'Its themes stay in it, and links to it keep working.',
    <form onSubmit={submit} aria-busy={busy}>
      <label className="create-field" htmlFor="theme-folder-name"><span>Folder name</span>
        <Input ref={input} id="theme-folder-name" value={name} onChange={event => { setName(event.target.value); setProblem(''); }} disabled={busy} maxLength={themeFolderLimits.name} required autoComplete="off" placeholder="For example, Client work" aria-invalid={Boolean(problem) || undefined} aria-describedby={problem ? 'theme-folder-name-problem' : undefined} />
      </label>
      {problem && <p className="field-error" id="theme-folder-name-problem" role="alert">{problem}</p>}
      {actions(creating ? 'Create folder' : 'Save name', 'Saving…', !name.trim() || (!creating && name.trim() === action.folder.name))}
    </form>, input);
}

const noFolder = '__no_folder__';
function MoveForm({ theme, manifest, busy, actions, shell, onSubmit }: { theme: ThemeSummary; manifest: ThemeFoldersManifest; busy: boolean; actions: Actions; shell: Shell; onSubmit: (folderId: string | null) => void }) {
  const current = manifest.assignments[theme.id] ?? noFolder;
  const [destination, setDestination] = useState(current);
  const folders = sortedFolders(manifest);
  const items = [{ value: noFolder, label: 'No folder' }, ...folders.map(folder => ({ value: folder.id, label: isolate(folder.name) }))]
    .map(item => item.value === current ? { ...item, label: `${item.label} (current)` } : item);
  return shell('Move to folder', <bdi>{theme.name}</bdi>,
    <form onSubmit={event => { event.preventDefault(); if (destination !== current) onSubmit(destination === noFolder ? null : destination); }} aria-busy={busy}>
      <div className="create-field"><span>Folder</span><div className="purpose-select" inert={busy || undefined}><SelectControl label="Folder" value={destination} onValueChange={setDestination} items={items} /></div>
        <p className="field-hint">The theme’s files and ID stay the same, so documents using it are unaffected.</p></div>
      {!folders.length && <p className="field-hint">Create a folder first with New folder, next to the folder filter in Themes.</p>}
      {actions('Move', 'Moving…', destination === current)}
    </form>);
}

function DeleteForm({ folder, manifest, themes, actions, shell, onSubmit }: { folder: ThemeFolder; manifest: ThemeFoldersManifest; themes: ThemeSummary[]; actions: Actions; shell: Shell; onSubmit: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const count = folderCounts(manifest, themes.map(theme => theme.id)).get(folder.id) ?? 0;
  return shell(`Delete “${folder.name}”?`,
    `Its ${themeCount(count)} will no longer be in a folder. No themes are deleted.`,
    <form onSubmit={event => { event.preventDefault(); onSubmit(); }}>{actions('Delete folder', 'Deleting…', false, true, cancel)}</form>, cancel);
}

/** Organization changes that need no confirmation: drag-and-drop moves and deleting an empty folder. */
export function useThemeFolderMutations(onChange: (manifest: ThemeFoldersManifest) => void) {
  const notifications = useNotifications();
  return {
    moveTheme: (theme: ThemeSummary, folderId: string | null) => api<Mutation>(`/api/themes/${theme.id}/folder`, { method: 'PUT', body: JSON.stringify({ folderId }) })
      .then(result => { onChange(result.manifest); notifications.success(movedMessage(theme, result.manifest)); })
      .catch(error => notifications.error(error.message)),
    deleteEmptyFolder: (folder: ThemeFolder) => api<Mutation>(`/api/theme-folders/${folder.id}`, { method: 'DELETE' })
      .then(result => {
        onChange(result.manifest); notifications.success(`Deleted ${isolate(folder.name)}`);
        showAllIfSelected(folder);
        requestAnimationFrame(() => focusAfterChange(folderButton(allFolders))?.focus());
      })
      .catch(error => notifications.error(error.message)),
  };
}
