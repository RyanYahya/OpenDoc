import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AssetInspection } from '../shared/assets';
import { api } from './api';
import { Button, Dialog, Input } from './ui';
import { Icon } from './ui/Icon';

function UploadPreview({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  return <span className="logo-upload-preview asset-background-transparent">{url && <img src={url} alt="" />}</span>;
}
const accept = '.svg,.png,image/svg+xml,image/png';

/** Creation asks only for the folder name and its default artwork. */
export function CreateLogoDialog({ connected, onClose, onSaved }: { connected: boolean; onClose: () => void; onSaved: (value: AssetInspection) => void }) {
  const [name, setName] = useState('');
  const [step, setStep] = useState<'name' | 'default'>('name');
  const [file, setFile] = useState<File>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (step === 'default') { if (file && fileInput.current) { const selection = new DataTransfer(); selection.items.add(file); fileInput.current.files = selection.files; } fileInput.current?.focus(); } else nameInput.current?.focus(); }, [step, file]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working.current || !connected || !name.trim()) return;
    if (step === 'name') { setStep('default'); return; }
    if (!file) return;
    working.current = true; setBusy(true); setError('');
    try {
      const form = new FormData(); form.set('metadata', JSON.stringify({ name: name.trim() })); form.set('file', file);
      const result = await api<AssetInspection>('/api/assets/logo', { method: 'POST', body: form });
      onSaved(result); onClose();
    } catch (failure) { setError((failure as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !working.current) onClose(); }}><Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" /><Dialog.Popup className="help-dialog create-dialog asset-dialog logo-create-dialog" initialFocus={nameInput}>
    <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close add logo" disabled={busy} />}><Icon name="close" /></Dialog.Close>
    <Dialog.Title>{step === 'name' ? 'Add logo' : 'Upload default logo'}</Dialog.Title>
    <Dialog.Description>{step === 'name' ? 'Give this logo a name. Its variations will live together inside.' : `${name.trim()} · You can add more variations after this.`}</Dialog.Description>
    <form onSubmit={event => void submit(event)} aria-busy={busy}>
      {step === 'name' ? <label className="create-field"><span>Name</span><Input ref={nameInput} value={name} onChange={event => setName(event.target.value)} maxLength={120} required autoComplete="off" placeholder="For example, Northstar" /></label> : <label className="create-field asset-upload logo-default-upload"><span>Default logo</span>{file && <UploadPreview file={file} />}<input ref={fileInput} type="file" accept={accept} required={!file} disabled={busy} onChange={event => { setFile(event.target.files?.[0]); setError(''); }} /><span className="field-hint">SVG or PNG</span></label>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="dialog-actions"><Button disabled={busy} onClick={() => { if (step === 'name') onClose(); else { setStep('name'); setError(''); } }}>{step === 'name' ? 'Cancel' : 'Back'}</Button><Button type="submit" className="primary" disabled={busy || !connected || !name.trim() || (step === 'default' && !file)}>{busy ? 'Uploading…' : step === 'name' ? 'Next' : 'Create logo'}</Button></div>
    </form>
  </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}

type PendingVariation = { id: number; file: File; name: string };
export function AddLogoVariationsDialog({ inspection, connected, onClose, onSaved }: { inspection: AssetInspection; connected: boolean; onClose: () => void; onSaved: (value: AssetInspection) => void }) {
  const [pending, setPending] = useState<PendingVariation[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const current = useRef(inspection);
  const counter = useRef(0);
  const working = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const count = current.current.asset.kind === 'logo' ? current.current.asset.variations.length : 0;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!connected || working.current || !pending.length || pending.some(item => !item.name.trim())) return;
    working.current = true; setBusy(true); setError('');
    let saved = 0;
    try {
      for (const item of pending) {
        setProgress(`Uploading ${saved + 1} of ${pending.length}…`);
        const form = new FormData(); form.set('metadata', JSON.stringify({ expectedRevision: current.current.head.revision, name: item.name.trim() })); form.set('file', item.file);
        current.current = await api<AssetInspection>(`/api/assets/logo/${encodeURIComponent(inspection.asset.id)}/variations`, { method: 'POST', body: form });
        saved++; setPending(list => list.filter(value => value.id !== item.id));
      }
      onSaved(current.current); onClose();
    } catch (failure) {
      if (saved) onSaved(current.current);
      setError(`${saved ? `${saved} ${saved === 1 ? 'variation was' : 'variations were'} added. The remaining files are still here. ` : ''}${(failure as Error).message}`);
    } finally { working.current = false; setBusy(false); setProgress(''); }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !working.current) onClose(); }}><Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" /><Dialog.Popup className="help-dialog create-dialog asset-dialog" initialFocus={input}>
    <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close add variations" disabled={busy} />}><Icon name="close" /></Dialog.Close>
    <Dialog.Title>Add variations</Dialog.Title><Dialog.Description>{inspection.asset.name} · Select one or more SVG or PNG files.</Dialog.Description>
    <form onSubmit={event => void submit(event)} aria-busy={busy}>
      <label className="create-field asset-upload"><span>Upload variations</span><input ref={input} type="file" accept={accept} multiple disabled={busy} onChange={event => {
        const files = Array.from(event.target.files ?? []); setError('');
        if (count + pending.length + files.length > 64) { setError('A logo can hold up to 64 variations. Choose fewer files.'); return; }
        setPending(list => [...list, ...files.map(file => ({ id: counter.current++, file, name: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 120) || 'Variation' }))]); event.target.value = '';
      }} /></label>
      {pending.length > 0 && <div className="logo-upload-list">{pending.map(item => <div className="logo-upload-row" key={item.id}><UploadPreview file={item.file} /><label className="create-field"><span>Variation name</span><Input value={item.name} required maxLength={120} disabled={busy} onChange={event => setPending(list => list.map(value => value.id === item.id ? { ...value, name: event.target.value } : value))} /><small>{item.file.name}</small></label><Button className="icon-button" aria-label={`Remove ${item.file.name} from upload`} disabled={busy} onClick={() => { setPending(list => list.filter(value => value.id !== item.id)); setError(''); }}><Icon name="close" size={16} /></Button></div>)}</div>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="dialog-actions"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" className="primary" disabled={busy || !connected || !pending.length || pending.some(item => !item.name.trim())}>{busy ? progress : pending.length ? `Add ${pending.length} ${pending.length === 1 ? 'variation' : 'variations'}` : 'Add variations'}</Button></div>
    </form>
  </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
