import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Menu } from '@base-ui/react/menu';
import { documentName, type DocumentSummary } from '../shared/types';
import { api } from './api';
import { Button, Dialog, Input } from './ui';
import { Icon } from './ui/Icon';

export type DocumentAction = 'rename' | 'duplicate' | 'move' | 'delete' | 'exports';
export type DocumentActionHandler = (document: DocumentSummary, action: DocumentAction) => void;

export function DocumentMenuItems({ document, disabled, onAction }: { document: DocumentSummary; disabled?: boolean; onAction: DocumentActionHandler }) {
  return <>
    <Menu.Item className="ui-menu-item" disabled={disabled} onClick={() => onAction(document, 'exports')}><Icon name="history" size={16} /><span>Previous exports</span></Menu.Item>
    <Menu.Separator className="ui-menu-separator" />
    <Menu.Item className="ui-menu-item" disabled={disabled} onClick={() => onAction(document, 'rename')}><Icon name="edit" size={16} /><span>Rename</span></Menu.Item>
    <Menu.Item className="ui-menu-item" disabled={disabled || !document.projectId} onClick={() => onAction(document, 'duplicate')}><Icon name="copy" size={16} /><span>Duplicate</span></Menu.Item>
    <Menu.Item className="ui-menu-item" disabled={disabled} onClick={() => onAction(document, 'move')}><Icon name="folder" size={16} /><span>Move to project…</span></Menu.Item>
    <Menu.Separator className="ui-menu-separator" />
    <Menu.Item className="ui-menu-item ui-menu-item-danger" disabled={disabled} onClick={() => onAction(document, 'delete')}><Icon name="trash" size={16} /><span>Delete</span></Menu.Item>
  </>;
}

export function DocumentMenu({ document, disabled, onAction }: { document: DocumentSummary; disabled?: boolean; onAction: DocumentActionHandler }) {
  return <Menu.Root><Menu.Trigger render={<Button className="icon-button document-menu-trigger" aria-label={`Options for ${documentName(document)}`} />}><Icon name="more" size={14} /></Menu.Trigger>
    <Menu.Portal><Menu.Positioner sideOffset={5} align="end" className="document-menu-positioner"><Menu.Popup className="ui-menu-popup"><DocumentMenuItems document={document} disabled={disabled} onAction={onAction} /></Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}

export function DocumentActionDialog({ selection, connected, onClose, onRenamed, onDeleted }: {
  selection: { document: DocumentSummary; action: 'rename' | 'delete' } | null; connected: boolean; onClose: () => void;
  onRenamed: (id: string, name: string) => void; onDeleted: (document: DocumentSummary, restoreId: string) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const deleting = selection?.action === 'delete';
  useEffect(() => { setName(selection ? documentName(selection.document) : ''); setError(''); }, [selection]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selection || working.current || !connected || (!deleting && !name.trim())) return;
    working.current = true; setBusy(true); setError('');
    try {
      if (deleting) {
        const result = await api<{ restoreId: string }>(`/api/documents/${selection.document.id}`, { method: 'DELETE' });
        onDeleted(selection.document, result.restoreId);
      } else {
        const result = await api<{ name: string }>(`/api/documents/${selection.document.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
        onRenamed(selection.document.id, result.name);
      }
      onClose();
    } catch (error) { setError((error as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  return <Dialog.Root open={Boolean(selection)} onOpenChange={open => { if (!open && !working.current) onClose(); }}>
    <Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" /><Dialog.Popup className="help-dialog create-dialog" initialFocus={deleting ? cancel : input}>
      <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close document dialog" disabled={busy} />}><Icon name="close" /></Dialog.Close>
      <Dialog.Title>{deleting ? 'Delete document?' : 'Rename document'}</Dialog.Title>
      <Dialog.Description>{deleting ? `“${selection ? documentName(selection.document) : ''}” and its saved files will move to local Trash. You can undo this after deleting.` : 'Change the name shown in your library. The title inside the PDF stays as written.'}</Dialog.Description>
      <form onSubmit={event => void submit(event)} aria-busy={busy}>
        {!deleting && <label className="create-field" htmlFor="document-name"><span>Document name</span><Input ref={input} id="document-name" value={name} onChange={event => { setName(event.target.value); setError(''); }} disabled={busy} maxLength={160} required autoComplete="off" /></label>}
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="dialog-actions"><Dialog.Close render={<Button ref={cancel} disabled={busy} />}>Cancel</Dialog.Close><Button type="submit" className={deleting ? 'document-delete-button' : 'primary'} disabled={busy || !connected || (!deleting && !name.trim())}>{busy ? deleting ? 'Deleting…' : 'Saving…' : deleting ? 'Delete document' : 'Save name'}</Button></div>
      </form>
    </Dialog.Popup></Dialog.Portal>
  </Dialog.Root>;
}
