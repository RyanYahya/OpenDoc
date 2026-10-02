import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ThemeSummary } from '../shared/themes';
import { projectThemeDefaults, type Project, type ProjectThemeDefaults } from '../shared/projects';
import { themeChoiceLabel, type ThemeFoldersManifest } from '../shared/theme-folders';
import { documentName, type DocumentFormat, type DocumentSummary } from '../shared/types';
import { api } from './api';
import { Button, Dialog, Input, SelectControl } from './ui';
import { Icon } from './ui/Icon';

const noDefaultTheme = '__no_default__';
const formats: { format: DocumentFormat; label: string; key: 'defaultDocumentTheme' | 'defaultPresentationTheme' }[] = [
  { format: 'document', label: 'Default theme for documents', key: 'defaultDocumentTheme' },
  { format: 'presentation', label: 'Default theme for presentations', key: 'defaultPresentationTheme' },
];
const noDefaults: ProjectThemeDefaults = { document: null, presentation: null };

export function ProjectDialog({ open, project, documentCount, connected, themes, themeFolders, onOpenChange, onSaved, onDeleted }: {
  open: boolean; project: Project | null; documentCount: number; connected: boolean;
  themes: ThemeSummary[]; themeFolders?: ThemeFoldersManifest;
  onOpenChange: (open: boolean) => void; onSaved: (project: Project) => void; onDeleted: () => void;
}) {
  const [name, setName] = useState('');
  const [themeDefaults, setThemeDefaults] = useState<ProjectThemeDefaults>(noDefaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const initialDefaults = useRef<ProjectThemeDefaults>(noDefaults);
  useEffect(() => {
    if (open) { const defaults = project ? projectThemeDefaults(project) : noDefaults; initialDefaults.current = defaults; setName(project?.name ?? ''); setThemeDefaults(defaults); setError(''); setConfirmDelete(false); }
  }, [open, project?.id]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || working.current || !connected) return;
    working.current = true; setBusy(true); setError('');
    try {
      // Send only changed formats, so an untouched default (even an unavailable one) is preserved.
      const changes = Object.fromEntries(formats.filter(({ format }) => !project || themeDefaults[format] !== initialDefaults.current[format]).map(({ format, key }) => [key, themeDefaults[format]]));
      const saved = await api<Project>(project ? `/api/projects/${project.id}` : '/api/projects', { method: project ? 'PATCH' : 'POST', body: JSON.stringify({ name: name.trim(), ...changes }) });
      onSaved(saved); onOpenChange(false);
    } catch (error) { setError((error as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  async function remove() {
    if (!project || documentCount || working.current || !connected) return;
    working.current = true; setBusy(true); setError('');
    try { await api(`/api/projects/${project.id}`, { method: 'DELETE' }); onDeleted(); onOpenChange(false); }
    catch (error) { setError((error as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  const availableThemes = [{ value: noDefaultTheme, label: 'No default theme' }, ...themes.filter(theme => !theme.error).map(theme => ({ value: theme.id, label: themeChoiceLabel(theme, themeFolders) }))];
  return <Dialog.Root open={open} onOpenChange={value => { if (!working.current) onOpenChange(value); }}>
    <Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" />
      <Dialog.Popup className="help-dialog create-dialog" initialFocus={nameInput}>
        <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close project dialog" disabled={busy} />}><Icon name="close" /></Dialog.Close>
        <Dialog.Title>{project ? 'Project settings' : 'Create a project'}</Dialog.Title>
        <Dialog.Description>{project ? 'Give this project a name and optional themes for new documents and presentations.' : 'Bring related documents together. You can set default themes now or later.'}</Dialog.Description>
        <form onSubmit={event => void save(event)} aria-busy={busy}>
          <label className="create-field" htmlFor="project-name"><span>Project name</span><Input ref={nameInput} id="project-name" value={name} onChange={event => { setName(event.target.value); setError(''); }} required maxLength={120} placeholder="For example, Studio work" disabled={busy} autoComplete="off" /></label>
          {formats.map(({ format, label }) => {
            const value = themeDefaults[format] ?? noDefaultTheme;
            const unavailable = !availableThemes.some(item => item.value === value);
            return <div className="create-field" key={format}><span>{label}</span><div className="purpose-select" inert={busy || undefined}><SelectControl label={label} value={value} onValueChange={next => { setThemeDefaults(previous => ({ ...previous, [format]: next === noDefaultTheme ? null : next })); setError(''); }} items={unavailable ? [...availableThemes, { value, label: `${value} (unavailable)` }] : availableThemes} /></div>
              {unavailable && themes.length > 0 && <p className="field-hint">This theme is no longer in the workspace. Choose another before creating {format === 'presentation' ? 'presentations' : 'documents'} in this project.</p>}</div>;
          })}
          <p className="field-hint project-theme-hint">Optional. Defaults apply to new work; each document or presentation can still use a different theme.</p>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="dialog-actions"><Dialog.Close render={<Button disabled={busy} />}>Cancel</Dialog.Close><Button className="primary" type="submit" disabled={busy || !connected || !name.trim()}>{busy ? 'Saving…' : project ? 'Save changes' : 'Create project'}</Button></div>
        </form>
        {project && <div className="project-delete">
          {confirmDelete ? <><p>Delete this empty project?</p><div className="dialog-actions"><Button onClick={() => setConfirmDelete(false)} disabled={busy}>Keep project</Button><Button className="destructive" onClick={() => void remove()} disabled={busy || !connected || documentCount > 0}>{busy ? 'Deleting…' : 'Delete project'}</Button></div></>
            : <><Button className="text-button" onClick={() => setConfirmDelete(true)} disabled={busy || documentCount > 0}>Delete project</Button>{documentCount > 0 && <p className="field-hint">Move its documents to another project before deleting it.</p>}</>}
        </div>}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function MoveDocumentDialog({ document, projects, connected, onClose, onMoved }: {
  document: DocumentSummary | null; projects: Project[]; connected: boolean; onClose: () => void; onMoved: (projectId: string) => void;
}) {
  const [destination, setDestination] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  useEffect(() => { setDestination(''); setError(''); }, [document?.id]);
  const available = projects.filter(project => project.id !== document?.projectId);
  async function move(event: FormEvent) {
    event.preventDefault();
    if (!document || !destination || working.current || !connected) return;
    working.current = true; setBusy(true); setError('');
    try { await api(`/api/documents/${document.id}/project`, { method: 'PUT', body: JSON.stringify({ projectId: destination }) }); onMoved(destination); onClose(); }
    catch (error) { setError((error as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  return <Dialog.Root open={Boolean(document)} onOpenChange={open => { if (!open && !working.current) onClose(); }}>
    <Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" />
      <Dialog.Popup className="help-dialog create-dialog">
        <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close move dialog" disabled={busy} />}><Icon name="close" /></Dialog.Close>
        <Dialog.Title>Move to a project</Dialog.Title>
        <Dialog.Description>{document ? documentName(document) : ''}</Dialog.Description>
        <form onSubmit={event => void move(event)} aria-busy={busy}>
          <div className="create-field"><span>Destination</span><div className="purpose-select" inert={busy || undefined}><SelectControl label="Destination project" value={destination} onValueChange={setDestination} items={[{ value: '', label: 'Choose a project' }, ...available.map(project => ({ value: project.id, label: project.name }))]} /></div><p className="field-hint">The document keeps its current theme, media, and comments.</p></div>
          {!available.length && <p className="field-hint">Create another project first.</p>}
          {error && <p role="alert" className="field-error">{error}</p>}
          <div className="dialog-actions"><Dialog.Close render={<Button disabled={busy} />}>Cancel</Dialog.Close><Button className="primary" type="submit" disabled={busy || !connected || !available.some(project => project.id === destination)}>{busy ? 'Moving…' : 'Move document'}</Button></div>
        </form>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
