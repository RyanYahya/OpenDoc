import { useEffect, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { documentName, documentFormat, type DocumentState } from '../shared/types';
import { suggestedExportName, exportInfo, type ExportFormat, type SavedExport } from '../shared/export';
import { api, ApiError } from './api';
import { Button, Input, SelectControl } from './ui';
import { Icon } from './ui/Icon';
import './export.css';

type Attempt = { id: string; hash: string; filename: string; format?: ExportFormat };
function remembered(id: string): Attempt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(`opendoc:export:${id}`) ?? 'null');
    return value && typeof value.id === 'string' && typeof value.hash === 'string' && typeof value.filename === 'string' && (value.format === undefined || value.format === 'pdf' || value.format === 'pptx') ? value : null;
  } catch { return null; }
}

export function ExportMenu({ state, connected, ready, unsaved, saving, correctionError, canSave, onSave, onShowExports }: {
  state: DocumentState; connected: boolean; ready: boolean; unsaved: number; saving: boolean; correctionError: string;
  canSave: boolean; onSave: () => Promise<boolean | undefined>; onShowExports: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>(() => remembered(state.id)?.format ?? 'pdf');
  const [filename, setFilename] = useState(() => suggestedExportName(documentName(state), format));
  const [attempt, setAttempt] = useState<Attempt | null>(() => remembered(state.id));
  const [result, setResult] = useState<SavedExport | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [canCopy, setCanCopy] = useState(false);
  const [copying, setCopying] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const showFile = useRef<HTMLButtonElement>(null);
  const showHistory = useRef(false);
  const activeFormat = result?.format ?? attempt?.format ?? format;
  const formatLabel = exportInfo(activeFormat).label;
  useEffect(() => { if (open && result) showFile.current?.focus(); }, [open, result]);
  useEffect(() => {
    if (!open || !connected) return;
    let current = true;
    api<{ copyFile: boolean }>('/api/exports/capabilities', { signal: AbortSignal.timeout(5_000) })
      .then(value => { if (current) setCanCopy(value.copyFile); })
      .catch(() => { if (current) setCanCopy(false); });
    return () => { current = false; };
  }, [open, connected]);
  function remember(value: Attempt | null) {
    setAttempt(value);
    try { if (value) sessionStorage.setItem(`opendoc:export:${state.id}`, JSON.stringify(value)); else sessionStorage.removeItem(`opendoc:export:${state.id}`); } catch { /* The open reader retains its request. */ }
  }
  async function perform() {
    if (working.current || !connected || (!attempt && (!ready || unsaved || saving || correctionError))) return;
    working.current = true; setBusy(true); setError(''); setNotice('');
    const request = attempt ?? { id: crypto.randomUUID(), hash: state.artifact!.hash, filename, format };
    remember(request);
    try {
      // Retrying the same receipt never creates a second output, including after a restart.
      const saved = await api<SavedExport>(`/api/documents/${state.id}/exports`, { method: 'POST', body: JSON.stringify(request), signal: AbortSignal.timeout(20_000) });
      setResult(saved); remember(null);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500) { remember(null); setError(failure.message); }
      else setError('OpenDoc could not confirm whether the file was saved. Check the export to recover it without creating another copy.');
    } finally { working.current = false; setBusy(false); }
  }
  async function reveal() {
    if (!result || working.current) return;
    working.current = true; setBusy(true); setError('');
    try { await api(`/api/exports/${result.id}/reveal`, { method: 'POST', signal: AbortSignal.timeout(12_000) }); }
    catch (failure) { setError((failure as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  async function saveChanges() {
    if (await onSave()) setOpen(false);
  }
  async function copy() {
    if (!result || working.current || !connected || !canCopy) return;
    working.current = true; setBusy(true); setCopying(true); setError(''); setNotice('');
    try {
      await api(`/api/exports/${result.id}/copy`, { method: 'POST', signal: AbortSignal.timeout(12_000) });
      setNotice(`${formatLabel} file copied. Paste it into Finder or an app that accepts file attachments.`);
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : 'OpenDoc could not confirm the copy. Check your connection and try again.'); }
    finally { working.current = false; setBusy(false); setCopying(false); }
  }
  return <Popover.Root open={open} onOpenChange={next => {
    setOpen(next);
    if (!next && result && !working.current) { setResult(null); setError(''); setNotice(''); setFilename(suggestedExportName(documentName(state), format)); }
  }} onOpenChangeComplete={next => {
    // Let the dropdown restore focus to Export before the history dialog opens.
    if (!next && showHistory.current) { showHistory.current = false; onShowExports(); }
  }}>
    <Popover.Trigger render={<Button className="primary export-button" aria-label={`Export ${documentFormat(state)}`} />}><Icon name="download" size={16} /><span>Export</span><Icon name="down" size={12} /></Popover.Trigger>
    <Popover.Portal><Popover.Positioner className="ui-positioner" align="end" sideOffset={8} collisionPadding={8}>
    <Popover.Popup className="ui-popover-popup export-dropdown" initialFocus={interaction => interaction === 'touch' ? true : result || attempt ? true : input.current}>
      <form onSubmit={event => { event.preventDefault(); if (!result) void perform(); }}>
      <div className="export-dropdown-body">
      <div className="export-dropdown-heading">
        <Popover.Title>{result ? `${formatLabel} saved` : `Export ${formatLabel}`}</Popover.Title>
        <Popover.Close render={<Button className="icon-button" aria-label="Close export menu" />}><Icon name="close" size={16} /></Popover.Close>
      </div>
      <Popover.Description>{result ? 'Saved in your workspace’s output folder.' : activeFormat === 'pptx' ? 'Editable text and shapes · Embedded fonts' : `Original quality · All ${documentFormat(state) === 'presentation' ? 'slides' : 'pages'}`}</Popover.Description>
      {result ? <>
        <div className="export-file" role="status"><Icon name="document" size={24} /><div><strong>{result.filename}</strong><span>{new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(result.bytes / 1024)} KB · {activeFormat.toUpperCase()}</span></div><Icon name="check" size={18} /></div>
      </> : <>
        {documentFormat(state) === 'presentation' && !attempt && <div className="create-field export-format"><span>Format</span><SelectControl label="Export format" value={format} disabled={busy} items={[{ value: 'pdf', label: 'PDF' }, { value: 'pptx', label: 'PowerPoint (.pptx)' }]} onValueChange={value => { const next = value as ExportFormat; setFormat(next); setFilename(name => name.trim() ? name.replace(/\.(pdf|pptx)$/i, '') + exportInfo(next).extension : suggestedExportName(documentName(state), next)); setError(''); }} /></div>}
        <label className="create-field export-filename" htmlFor="export-filename"><span>Filename</span><Input ref={input} id="export-filename" value={attempt?.filename ?? filename} onChange={event => { setFilename(event.target.value); setError(''); }} disabled={busy || !!attempt} maxLength={120} autoComplete="off" /></label>
        {attempt && !busy && <p className="export-status" role="status">An export is awaiting confirmation. Check it to recover the saved file or finish the same request.</p>}
        {!attempt && (unsaved > 0 || correctionError || saving) && <div className="export-status" role="status"><strong>{saving ? 'Saving your changes…' : 'Save your corrections first'}</strong><p>{correctionError || 'Save your changes and review the updated PDF before exporting.'}</p>{unsaved > 0 && <Button disabled={!canSave || saving} onClick={() => void saveChanges()}>Save changes first</Button>}</div>}
        {!attempt && !unsaved && !saving && !correctionError && !ready && <p className="export-status" role="status">{!connected ? 'Reconnect to the local workspace before exporting.' : state.status === 'error' ? 'Fix the document’s render error before exporting.' : 'Waiting for the current PDF preview…'}</p>}
      </>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {notice && <p className="export-notice" role="status">{notice}</p>}
      {busy && <p className="export-notice" role="status">{copying ? 'Copying the file…' : result ? 'Opening the export folder…' : `Saving ${formatLabel}… You can close this menu and return to check it.`}</p>}
      {!result && <Button type="submit" className="primary export-save" disabled={busy || !connected || (!attempt && (!ready || !!unsaved || !!correctionError || saving || !filename.trim()))}>{busy ? 'Saving…' : attempt ? 'Check export' : `Save ${formatLabel}`}</Button>}
      </div>
      </form>
      {result && <div className="ui-menu-group">
        <Button ref={showFile} className="ui-menu-item" onClick={() => void reveal()} disabled={busy || !connected}><Icon name="folder" size={16} />Show in folder</Button>
        <a className="ui-menu-item" href={`/api/exports/${result.id}/download`} download={result.filename} onClick={() => setNotice('Download requested. Your browser handles where the copy is saved.')}><Icon name="download" size={16} />Download a copy</a>
        {canCopy && <Button className="ui-menu-item" onClick={() => void copy()} disabled={busy || !connected} focusableWhenDisabled={copying}><Icon name="copy" size={16} />Copy to clipboard</Button>}
        {activeFormat === 'pdf' && <a className="ui-menu-item" href={`/api/exports/${result.id}/open`} target="_blank" rel="noreferrer"><Icon name="arrow" size={16} />Open PDF to print</a>}
        <Button className="ui-menu-item" disabled={busy} onClick={() => { setResult(null); setError(''); setNotice(''); setFilename(suggestedExportName(documentName(state), format)); }}><Icon name="plus" size={16} />Export another copy</Button>
      </div>}
      <div className="ui-menu-separator" />
      <Button className="ui-menu-item" onClick={() => { showHistory.current = true; setOpen(false); }}><Icon name="history" size={16} />Previous exports</Button>
    </Popover.Popup></Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
