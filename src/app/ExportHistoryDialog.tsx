import { useCallback, useEffect, useRef, useState } from 'react';
import { documentName, type DocumentSummary } from '../shared/types';
import { exportInfo, type ExportHistoryEntry } from '../shared/export';
import { api } from './api';
import { Button, Dialog, IconButton, useNotifications } from './ui';
import { Icon } from './ui/Icon';
import './export-history.css';

const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
function fileSize(bytes: number) { return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / (bytes >= 1048576 ? 1048576 : 1024))} ${bytes >= 1048576 ? 'MB' : 'KB'}`; }

export function ExportHistoryDialog({ document, connected, onClose }: { document: DocumentSummary | null; connected: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<ExportHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [canCopy, setCanCopy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const working = useRef(false);
  const request = useRef(0);
  const selected = useRef(document?.id);
  selected.current = document?.id;
  const notifications = useNotifications();
  const refresh = useCallback(async () => {
    if (!document || !connected) return;
    const sequence = ++request.current;
    setLoading(true); setError('');
    try {
      const rows = await api<ExportHistoryEntry[]>(`/api/documents/${document.id}/exports`, { signal: AbortSignal.timeout(12_000) });
      if (sequence === request.current) setEntries(rows);
    } catch (failure) { if (sequence === request.current) setError((failure as Error).message); }
    finally { if (sequence === request.current) setLoading(false); }
  }, [document?.id, connected]);
  useEffect(() => {
    setEntries([]); setError(''); setCanCopy(false);
    void refresh();
    if (document && connected) {
      api<{ copyFile: boolean }>('/api/exports/capabilities', { signal: AbortSignal.timeout(5_000) }).then(value => { if (selected.current === document.id) setCanCopy(value.copyFile); }).catch(() => {});
    }
    const focus = () => { if (!working.current) void refresh(); };
    window.addEventListener('focus', focus);
    return () => { request.current++; window.removeEventListener('focus', focus); };
  }, [refresh]);
  async function act(entry: ExportHistoryEntry, action: 'copy' | 'reveal' | 'delete') {
    if (working.current || !connected) return;
    working.current = true; setBusy(entry.id); setError('');
    try {
      await api(`/api/exports/${entry.id}${action === 'delete' ? '' : `/${action}`}`, { method: action === 'delete' ? 'DELETE' : 'POST', signal: AbortSignal.timeout(12_000) });
      if (action === 'delete') {
        request.current++; setLoading(false);
        setEntries(rows => rows.filter(row => row.id !== entry.id));
        notifications.success(`${entry.filename} removed`, { label: 'Undo', onClick: async () => {
          await api(`/api/exports/${entry.id}/restore`, { method: 'POST', signal: AbortSignal.timeout(12_000) });
          if (selected.current === entry.documentId) await refresh();
          notifications.success('Export restored');
        } });
      } else if (action === 'copy') notifications.success(`${exportInfo(entry.format).label} file copied to clipboard`);
    } catch (failure) { setError((failure as Error).message); }
    finally { working.current = false; setBusy(null); }
  }
  return <Dialog.Root open={!!document} onOpenChange={open => { if (!open && !working.current) onClose(); }}>
    <Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" /><Dialog.Popup className="help-dialog export-history-dialog">
      <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close export history" disabled={!!busy} />}><Icon name="close" /></Dialog.Close>
      <div className="export-history-heading"><span className="export-history-symbol"><Icon name="history" size={22} /></span><div><Dialog.Title>Previous exports</Dialog.Title><Dialog.Description>{document ? documentName(document) : ''}</Dialog.Description></div></div>
      <div className="export-history-summary"><span>{loading ? 'Checking saved files…' : `${entries.length} ${entries.length === 1 ? 'export' : 'exports'} · Newest first`}</span><Button className="text-button" disabled={loading || !!busy || !connected} onClick={() => void refresh()}>Refresh</Button></div>
      {!connected && <p className="field-error" role="status">Reconnect to view and manage exports.</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="export-history-content" aria-busy={loading || !!busy}>
        {!entries.length && !loading && !error && connected && <div className="export-history-empty"><Icon name="document" size={34} /><strong>No exports yet</strong><p>Export this document and it will appear here.</p></div>}
        {!!entries.length && <ul className="export-history-list">{entries.map(entry => <li key={entry.id} className={`export-history-row${entry.available ? '' : ' unavailable'}`}>
          <span className="export-history-paper" aria-hidden="true"><Icon name="document" size={24} /><span>{(entry.format ?? 'pdf').toUpperCase()}</span></span>
          <div className="export-history-details">
            {entry.available ? <a href={`/api/exports/${entry.id}/open`} target="_blank" rel="noreferrer" title={`Open ${entry.filename}`}>{entry.filename}</a> : <strong>{entry.filename}</strong>}
            <span><time dateTime={entry.createdAt}>{date.format(new Date(entry.createdAt))}</time><span aria-hidden="true"> · </span>{fileSize(entry.bytes)}</span>
            {!entry.available && <span className="export-history-unavailable">File moved, removed, or changed</span>}
          </div>
          <div className="export-history-actions" aria-label={`Actions for ${entry.filename}`}>
            {canCopy && <IconButton label={`Copy ${entry.filename}`} disabled={!!busy || !connected || !entry.available} onClick={() => void act(entry, 'copy')}><Icon name="copy" size={17} /></IconButton>}
            <IconButton label={`${canCopy ? 'Show in Finder' : 'Show in folder'}: ${entry.filename}`} disabled={!!busy || !connected || !entry.available} onClick={() => void act(entry, 'reveal')}><Icon name="folder" size={17} /></IconButton>
            <IconButton label={`Delete export: ${entry.filename}`} className="export-history-delete" disabled={!!busy || !connected} onClick={() => void act(entry, 'delete')}><Icon name="trash" size={17} /></IconButton>
          </div>
        </li>)}</ul>}
      </div>
      <p className="export-history-footnote">Saved files are independent of later document edits. Deleting an export offers Undo.</p>
    </Dialog.Popup></Dialog.Portal>
  </Dialog.Root>;
}
