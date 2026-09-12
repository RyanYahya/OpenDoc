import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ThemeSummary } from '../shared/themes';
import type { Project } from '../shared/projects';
import { documentName, type DocumentSummary } from '../shared/types';
import { api } from './api';
import { Button, Dialog, Input, SelectControl } from './ui';
import { Icon } from './ui/Icon';

const noDefaultTheme = '__no_default__';

export function ProjectDialog({ open, project, documentCount, connected, themes, onOpenChange, onSaved, onDeleted }: {
  open: boolean; project: Project | null; documentCount: number; connected: boolean;
  themes: ThemeSummary[];
  onOpenChange: (open: boolean) => void; onSaved: (project: Project) => void; onDeleted: () => void;
}) {
  const [name, setName] = useState('');
  const [theme, setTheme] = useState(noDefaultTheme);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const initialTheme = useRef<string | null>(null);
  useEffect(() => {
    if (open) { initialTheme.current = project?.defaultTheme ?? null; setName(project?.name ?? ''); setTheme(project?.defaultTheme ?? noDefaultTheme); setError(''); setConfirmDelete(false); }
  }, [open, project?.id]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || working.current || !connected) return;
    working.current = true; setBusy(true); setError('');
    try {
      const defaultTheme = theme === noDefaultTheme ? null : theme;
      const saved = await api<Project>(project ? `/api/projects/${project.id}` : '/api/projects', { method: project ? 'PATCH' : 'POST', body: JSON.stringify({ name: name.trim(), ...(!project || defaultTheme !== initialTheme.current ? { defaultTheme } : {}) }) });
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
  const themeItems = [{ value: noDefaultTheme, label: 'No default theme' }, ...themes.filter(theme => !theme.error).map(theme => ({ value: theme.id, label: theme.name }))];
  if (!themeItems.some(item => item.value === theme)) themeItems.push({ value: theme, label: `${theme} (unavailable)` });
  return <Dialog.Root open={open} onOpenChange={value => { if (!working.current) onOpenChange(value); }}>
    <Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" />
      <Dialog.Popup className="help-dialog create-dialog" initialFocus={nameInput}>
        <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close project dialog" disabled={busy} />}><Icon name="close" /></Dialog.Close>
        <Dialog.Title>{project ? 'Project settings' : 'Create a project'}</Dialog.Title>
        <Dialog.Description>{project ? 'Give this project a name and an optional theme for new documents.' : 'Bring related documents together. You can set a default theme now or later.'}</Dialog.Description>
        <form onSubmit={event => void save(event)} aria-busy={busy}>
          <label className="create-field" htmlFor="project-name"><span>Project name</span><Input ref={nameInput} id="project-name" value={name} onChange={event => { setName(event.target.value); setError(''); }} required maxLength={120} placeholder="For example, Studio work" disabled={busy} autoComplete="off" /></label>
          <div className="create-field"><span>Default theme <span className="muted">(optional)</span></span><div className="purpose-select" inert={busy || undefined}><SelectControl label="Default theme" value={theme} onValueChange={setTheme} items={themeItems} /></div><p className="field-hint">Applies to new documents. Each document can use a different theme.</p></div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="dialog-actions"><Dialog.Close render={<Button disabled={busy} />}>Cancel</Dialog.Close><Button className="primary" type="submit" disabled={busy || !connected || !name.trim()}>{busy ? 'Saving…' : project ? 'Save changes' : 'Create project'}</Button></div>
        </form>
        {project && <div className="project-delete">
          {confirmDelete ? <><p>Delete this empty project?</p><div className="dialog-actions"><Button onClick={() => setConfirmDelete(false)} disabled={busy}>Keep project</Button><Button onClick={() => void remove()} disabled={busy || !connected || documentCount > 0}>Delete project</Button></div></>
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
