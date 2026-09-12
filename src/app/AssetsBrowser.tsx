import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Menu } from '@base-ui/react/menu';
import type { AssetCatalog, AssetFile, AssetInspection, AssetKind, AssetSummary, FontRevision, LogoVariation } from '../shared/assets';
import type { DocumentSummary } from '../shared/types';
import type { ThemeSummary } from '../shared/themes';
import { api } from './api';
import { CreateLogoDialog, AddLogoVariationsDialog } from './LogoUploadDialog';
import { MaterialsBrowser } from './MaterialsBrowser';
import { AssetThemeDialog } from './AssetThemeDefaults';
import { PdfPage, usePdf } from './Pdf';
import { SearchField } from './SearchField';
import { Button, Dialog, Input, SelectControl, useNotifications } from './ui';
import { Icon } from './ui/Icon';
import './assets.css';

const collection = (kind: AssetKind) => kind === 'logo' ? 'logos' : 'fonts';
const endpoint = (kind: AssetKind, id: string) => `/api/assets/${kind}/${encodeURIComponent(id)}`;
export const assetFileUrl = (kind: AssetKind, id: string, revision: string, file: AssetFile) => `${endpoint(kind, id)}/file?revision=${encodeURIComponent(revision)}&file=${encodeURIComponent(file.file)}`;
const dateLabel = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const weightLabel = (weight: number) => ({ 100: 'Thin', 200: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' }[weight] ?? String(weight));
const fontStyle = (face: { weight: number; style: string }) => `${weightLabel(face.weight)}${face.style === 'italic' ? ' italic' : ''}`;

function LogoImage({ id, revision, file, name }: { id: string; revision: string; file?: AssetFile; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [file?.hash]);
  return file && !failed ? <img src={assetFileUrl('logo', id, revision, file)} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <span className="asset-preview-missing"><Icon name="image" size={28} /><span>{failed ? 'Preview unavailable' : 'No preview'}</span></span>;
}

function FontCardPreview({ item }: { item: AssetSummary }) {
  const frame = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [family, setFamily] = useState('');
  useEffect(() => {
    if (!frame.current) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '180px' });
    observer.observe(frame.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || item.error) return;
    const controller = new AbortController(); let loaded: FontFace | undefined;
    void api<AssetInspection>(`${endpoint('font', item.id)}?revision=${encodeURIComponent(item.revision)}`, { signal: controller.signal }).then(async value => {
      if (value.asset.kind !== 'font') return;
      const face = value.asset.faces.find(face => face.weight === 400 && face.style === 'normal') ?? value.asset.faces[0];
      if (!face) return;
      const name = `OpenDocCard-${face.file.hash}`;
      const font = new FontFace(name, `url("${assetFileUrl('font', item.id, item.revision, face.file)}")`, { weight: '400', style: 'normal' });
      await font.load(); if (controller.signal.aborted) return;
      document.fonts.add(font); loaded = font; setFamily(name);
    }).catch(() => {});
    return () => { controller.abort(); if (loaded) document.fonts.delete(loaded); };
  }, [visible, item.id, item.revision, item.error]);
  return <div ref={frame} className="asset-font-card-preview"><span aria-hidden="true" style={family ? { fontFamily: family, letterSpacing: '-.04em' } : undefined}>{family ? 'Aa' : <Icon name="document" size={36} />}</span><small>{item.count} {item.count === 1 ? 'style' : 'styles'}</small></div>;
}

function FontSpecimen({ asset }: { asset: FontRevision }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
  const { pdf, error } = usePdf(asset.id, asset.specimen?.hash, true, 'documents', asset.specimen ? assetFileUrl('font', asset.id, asset.revision, asset.specimen) : undefined);
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(Math.min(780, entry.contentRect.width)); });
    observer.observe(frame.current); return () => observer.disconnect();
  }, []);
  return <section className="asset-specimen" aria-label={`${asset.name} PDF specimen`} ref={frame}>
    <div className="asset-specimen-heading"><span>PDF specimen</span>{asset.specimen && <a href={assetFileUrl('font', asset.id, asset.revision, asset.specimen)} target="_blank" rel="noreferrer">Open PDF<Icon name="arrow" size={15} /></a>}</div>
    {error ? <p className="asset-preview-message" role="alert">Could not display this specimen. {error}</p> : pdf ? Array.from({ length: pdf.numPages }, (_, index) => <PdfPage key={`${asset.revision}/${index}`} pdf={pdf} number={index + 1} width={width} thumbnail />) : <p className="asset-preview-message" role="status">{asset.specimen ? 'Opening specimen…' : 'No PDF specimen is available for this version.'}</p>}
  </section>;
}

type AssetFormEdit = { action: 'create'; kind: 'font' } | { action: 'edit' | 'replace' | 'faces' | 'archive' | 'remove'; inspection: AssetInspection; variation?: LogoVariation };
type AssetEdit = AssetFormEdit | { action: 'create'; kind: 'logo' } | { action: 'variation'; inspection: AssetInspection };

function AssetEditDialog({ edit, connected, onClose, onSaved, onArchived }: {
  edit: AssetFormEdit | null; connected: boolean; onClose: () => void; onSaved: (value: AssetInspection) => void; onArchived: (value: AssetInspection) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [replacementDefault, setReplacementDefault] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [clearDefaults, setClearDefaults] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!edit) return;
    const source = edit.action === 'create' ? undefined : edit.inspection.asset;
    setName(edit.action !== 'create' && edit.variation ? edit.variation.name : source?.name ?? '');
    setDescription(edit.action !== 'create' && edit.variation ? edit.variation.description : source?.description ?? '');
    setReplacementDefault(''); setFiles([]); setError(''); setClearDefaults(false);
  }, [edit]);
  if (!edit) return null;
  const kind = edit.action === 'create' ? edit.kind : edit.inspection.asset.kind;
  const adding = edit.action === 'create';
  const archive = edit.action === 'archive';
  const removing = edit.action === 'remove';
  const logo = !adding && edit.inspection.asset.kind === 'logo' ? edit.inspection.asset : undefined;
  const removingDefault = removing && edit.variation?.id === logo?.defaultVariation;
  const upload = adding || edit.action === 'replace' || edit.action === 'faces';
  const showName = edit.action === 'edit';
  const nameRequired = showName;
  const themes = !adding ? edit.inspection.usage.themes : [];
  const title = removing ? `Remove ${edit.variation?.name}?` : adding ? 'Add a font family' : edit.action === 'replace' ? 'Replace logo artwork' : edit.action === 'faces' ? 'Add font styles' : archive ? `Archive ${edit.inspection.asset.name}?` : edit.variation ? 'Edit variation' : 'Edit name & guidance';
  const hint = removing ? 'This variation will be removed from the logo. Existing documents keep their saved artwork.' : archive ? 'Existing documents keep using their saved versions. You can restore this asset at any time.' : adding ? 'Select TTF or OTF files from one family. The name, description, and styles are read from the files.' : edit.action === 'replace' ? 'The new artwork will be used by future choices. Documents already using this version keep the original.' : edit.action === 'faces' ? 'Add static TTF or OTF files from this family. Existing documents keep their saved styles.' : 'Give your agent practical guidance. This saves a new version; existing documents keep their saved guidance.';
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!edit || working.current || !connected || (nameRequired && !name.trim()) || (upload && !files.length) || (removingDefault && !replacementDefault)) return;
    working.current = true; setBusy(true); setError('');
    try {
      let value: AssetInspection;
      if (upload) {
        const form = new FormData();
        const metadata = adding ? {}
          : edit.action === 'faces' ? { expectedRevision: edit.inspection.head.revision }
          : { expectedRevision: edit.inspection.head.revision, name: edit.action === 'replace' ? edit.variation?.name : name.trim(), description: edit.action === 'replace' ? edit.variation?.description : description, ...(edit.action === 'replace' ? { replaceId: edit.variation?.id } : {}) };
        form.set('metadata', JSON.stringify(metadata)); files.forEach(file => form.append(kind === 'logo' ? 'file' : 'files', file));
        const url = adding ? `/api/assets/${kind}` : `${endpoint(kind, edit.inspection.asset.id)}/${kind === 'logo' ? 'variations' : 'faces'}`;
        value = await api<AssetInspection>(url, { method: 'POST', body: form });
      } else if (edit.action === 'archive') {
        value = await api<AssetInspection>(`${endpoint(kind, edit.inspection.asset.id)}/archive`, { method: 'POST', body: JSON.stringify({ expectedRevision: edit.inspection.head.revision, clearDefaults }) });
      } else if (edit.action === 'remove') {
        value = await api<AssetInspection>(endpoint(kind, edit.inspection.asset.id), { method: 'PATCH', body: JSON.stringify({ expectedRevision: edit.inspection.head.revision, removeVariation: edit.variation?.id, ...(removingDefault ? { defaultVariation: replacementDefault } : {}) }) });
      } else if (edit.action === 'edit') {
        value = await api<AssetInspection>(endpoint(kind, edit.inspection.asset.id), { method: 'PATCH', body: JSON.stringify({ expectedRevision: edit.inspection.head.revision, ...(edit.variation ? { variation: { id: edit.variation.id, name: name.trim(), description } } : { name: name.trim(), description }) }) });
      } else { return; }
      if (archive) onArchived(value); else onSaved(value);
      onClose();
    } catch (error) { setError((error as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  return <Dialog.Root open onOpenChange={value => { if (!value && !working.current) onClose(); }}><Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" /><Dialog.Popup className="help-dialog create-dialog asset-dialog" initialFocus={upload ? fileInput : archive || removing ? undefined : input}>
    <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close asset dialog" disabled={busy} />}><Icon name="close" /></Dialog.Close>
    <Dialog.Title>{title}</Dialog.Title><Dialog.Description>{hint}</Dialog.Description>
    <form onSubmit={event => void submit(event)} aria-busy={busy}>
      {showName && <label className="create-field"><span>{edit.action === 'edit' && edit.variation ? 'Variation name' : kind === 'logo' ? 'Logo name' : 'Family name'}</span><Input ref={input} value={name} onChange={event => setName(event.target.value)} required={nameRequired} maxLength={120} disabled={busy} autoComplete="off" placeholder={edit.action === 'edit' && edit.variation ? 'For example, On dark backgrounds' : kind === 'logo' ? 'For example, Northstar' : 'Read from the font files'} /></label>}
      {showName && <label className="create-field"><span>{edit.action === 'edit' && edit.variation ? 'When to use' : 'Guidance for your agent'} <span className="muted">(optional)</span></span><textarea value={description} onChange={event => setDescription(event.target.value)} disabled={busy} rows={3} placeholder="Describe where this asset fits, and anything to avoid." /></label>}
      {removingDefault && <div className="create-field"><span>New default</span><SelectControl label="New default" value={replacementDefault} onValueChange={setReplacementDefault} items={[{ value: '', label: 'Choose a variation' }, ...(logo?.variations.filter(item => item.id !== edit.variation?.id).map(item => ({ value: item.id, label: item.name })) ?? [])]} /></div>}
      {upload && <label className="create-field asset-upload"><span>{kind === 'logo' ? 'Logo artwork' : 'Font files'}</span><input ref={fileInput} type="file" accept={kind === 'logo' ? '.svg,.png,image/svg+xml,image/png' : '.ttf,.otf,font/ttf,font/otf'} multiple={kind === 'font'} onChange={event => setFiles(Array.from(event.target.files ?? []))} disabled={busy} required /><span className="field-hint">{kind === 'logo' ? 'SVG or PNG. Transparency and proportions are preserved.' : 'Static TTF or OTF. Select multiple styles together.'}</span>{files.length > 0 && <ul className="asset-upload-files">{files.map((file, index) => <li key={`${file.name}/${index}`}>{file.name}<span>{Math.max(1, Math.round(file.size / 1024))} KB</span></li>)}</ul>}</label>}
      {archive && themes.length > 0 && <div className="asset-archive-relationships"><p>Used as a default by:</p><ul>{themes.map(theme => <li key={theme.id}><a href={`#themes/${theme.id}`}>{theme.name}</a><span>{theme.roles.join(', ')}</span></li>)}</ul><label className="asset-checkbox"><input type="checkbox" checked={clearDefaults} onChange={event => setClearDefaults(event.target.checked)} disabled={busy} /><span>Clear these theme defaults when archiving</span></label></div>}
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="dialog-actions"><Dialog.Close render={<Button disabled={busy} />}>Cancel</Dialog.Close><Button type="submit" className="primary" disabled={busy || !connected || (nameRequired && !name.trim()) || (upload && !files.length) || (archive && themes.length > 0 && !clearDefaults) || (removingDefault && !replacementDefault)}>{busy ? upload ? 'Checking & saving…' : archive ? 'Archiving…' : 'Saving…' : removing ? 'Remove variation' : archive ? 'Archive' : adding ? 'Add fonts' : edit.action === 'replace' ? 'Replace file' : edit.action === 'faces' ? 'Add styles' : 'Save changes'}</Button></div>
    </form>
  </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}

function AssetRelationships({ inspection }: { inspection: AssetInspection }) {
  const { usage } = inspection;
  return <section className="asset-relationships"><h2>Used with</h2>
    {!usage.themes.length && !usage.documents.length ? <p className="muted small">No theme defaults or saved document choices yet.</p> : <>
      {usage.themes.map(theme => <a className="asset-relationship" href={`#themes/${theme.id}`} key={`theme/${theme.id}`}><Icon name="theme" size={16} /><span><strong>{theme.name}</strong><small>For new documents · {theme.roles.join(', ')}</small></span><Icon name="arrow" size={15} /></a>)}
      {usage.documents.map(document => <div className="asset-relationship" key={`document/${document.id}/${document.revision}`}><Icon name={document.trashed ? 'trash' : 'document'} size={16} /><span>{document.trashed ? <strong>{document.name}</strong> : <a href={`#document/${document.id}`}><strong>{document.name}</strong></a>}<small>{document.trashed ? 'In Trash · ' : ''}{document.revision !== inspection.asset.revision ? inspection.asset.revision === inspection.head.revision ? 'Earlier saved version · ' : 'Another saved version · ' : ''}{document.rendered ? document.current ? 'Used in current PDF' : 'Used in last successful PDF' : 'Available to document'} · {document.roles.join(', ')}</small></span></div>)}
    </>}
  </section>;
}

function AssetVersions({ inspection, open, onClose, onSelect }: { inspection: AssetInspection; open: boolean; onClose: () => void; onSelect: (revision: string) => void }) {
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}><Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" /><Dialog.Popup className="help-dialog asset-dialog asset-versions-dialog">
    <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close previous versions" />}><Icon name="close" /></Dialog.Close><Dialog.Title>Previous versions</Dialog.Title><Dialog.Description>{inspection.asset.name}. Saved artwork and guidance stay available to documents that use them.</Dialog.Description>
    <div className="asset-version-list">{inspection.versions.map((version, index) => <Button className="asset-version" key={version.revision} onClick={() => { onSelect(version.revision); onClose(); }}><span><strong>Version {inspection.versions.length - index}</strong><small>{dateLabel(version.createdAt)} · {version.name}</small></span>{version.revision === inspection.head.revision ? <span className="asset-badge">Current</span> : <Icon name="arrow" size={16} />}</Button>)}</div>
  </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}

function AssetCollection({ kind, catalog, query, setQuery, archived, setArchived, onAdd, error }: { kind: AssetKind; catalog?: AssetCatalog; error?: string; query: string; setQuery: (value: string) => void; archived: boolean; setArchived: (value: boolean) => void; onAdd: () => void }) {
  const items = catalog?.items.filter(item => item.archived === archived && `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  return <>
    <div className="asset-collection-toolbar"><SearchField label={`Search ${collection(kind)}`} value={query} onValueChange={setQuery} /><SelectControl label="Asset status" value={archived ? 'archived' : 'active'} onValueChange={value => setArchived(value === 'archived')} items={[{ value: 'active', label: `All ${collection(kind)}` }, { value: 'archived', label: 'Archived' }]} /></div>
    {!catalog && <p className="asset-collection-status" role="status">{error ? 'Could not read local assets.' : `Reading ${collection(kind)}…`}</p>}
    <div className="asset-grid">{items.map(item => <a href={`#assets/${collection(kind)}/${item.id}`} className={`asset-card ${item.error ? 'asset-card-error' : ''}`} key={item.id}>
      {kind === 'logo' ? <div className="asset-card-preview asset-background-transparent"><LogoImage id={item.id} revision={item.revision} file={item.preview} name={item.name} /></div> : <FontCardPreview item={item} />}
      <div className="asset-card-caption"><strong>{item.name}<Icon name="arrow" size={16} /></strong><span>{(kind === 'logo' ? `${item.count} ${item.count === 1 ? 'variation' : 'variations'}` : item.builtIn ? 'Built-in family' : item.description || 'Local font family')}</span>{item.error ? <span className="media-problem">{item.error}</span> : kind === 'font' && item.compatibility && !item.compatibility.defaultEligible ? <span className="asset-health-note">{item.compatibility.status === 'needs-attention' ? 'Needs attention' : 'Additional styles needed for theme defaults'}</span> : null}{item.builtIn && kind === 'logo' && <span>Built in</span>}</div>
    </a>)}</div>
    {catalog && !items.length && <div className="empty-state"><div className="asset-empty-mark" aria-hidden="true">{kind === 'logo' ? <Icon name="image" size={28} /> : 'Aa'}</div><h2>{query ? `No matching ${collection(kind)}` : archived ? 'Nothing archived' : kind === 'logo' ? 'Your logos' : 'Typography, ready to use.'}</h2><p>{query ? 'Try another name or clear your search.' : archived ? 'Archived assets remain available to existing documents.' : kind === 'logo' ? 'Add a logo, then keep all its variations inside.' : 'Add a family’s font files together, then explore its styles in a real PDF.'}</p>{query ? <Button onClick={() => setQuery('')}>Clear search</Button> : !archived && <Button onClick={onAdd}><Icon name="plus" size={16} />{kind === 'logo' ? 'Add your first logo' : 'Add fonts'}</Button>}</div>}
  </>;
}

export function AssetsBrowser({ selection, generation, documents, themes, connected }: { selection: string; generation: number; documents: DocumentSummary[]; themes: ThemeSummary[]; connected: boolean }) {
  const [tabPart, ...parts] = selection.split('/');
  const tab = tabPart === 'logos' || tabPart === 'fonts' ? tabPart : 'media';
  const id = parts.join('/');
  const kind: AssetKind = tab === 'fonts' ? 'font' : 'logo';
  const [catalog, setCatalog] = useState<{ kind: AssetKind; value: AssetCatalog }>();
  const [inspectionState, setInspectionState] = useState<{ key: string; value: AssetInspection }>();
  const [selectedRevision, setSelectedRevision] = useState('');
  const [variationId, setVariationId] = useState('');
  const [background, setBackground] = useState('transparent');
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [edit, setEdit] = useState<AssetEdit | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const notifications = useNotifications();
  const requestKey = `${kind}/${id}/${selectedRevision}`;
  const inspection = inspectionState?.key === requestKey ? inspectionState.value : undefined;
  useEffect(() => { setSelectedRevision(''); setVariationId(''); setError(''); setEdit(null); setVersionsOpen(false); setThemeOpen(false); setQuery(''); }, [tab, id]);
  useEffect(() => {
    if (tab === 'media') return;
    const controller = new AbortController();
    void api<AssetCatalog>(`/api/assets?kind=${kind}&archived=true`, { signal: controller.signal }).then(value => { setCatalog({ kind, value }); if (!id) setError(''); }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [tab, kind, id, generation, retry]);
  useEffect(() => {
    if (tab === 'media' || !id) return;
    const controller = new AbortController();
    void api<AssetInspection>(`${endpoint(kind, id)}${selectedRevision ? `?revision=${encodeURIComponent(selectedRevision)}` : ''}`, { signal: controller.signal }).then(value => { setInspectionState({ key: requestKey, value }); setError(''); }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [tab, kind, id, selectedRevision, requestKey, generation, retry]);
  const asset = inspection?.asset;
  const variation = asset?.kind === 'logo' ? asset.variations.find(item => item.id === variationId) ?? asset.variations.find(item => item.id === asset.defaultVariation) ?? asset.variations[0] : undefined;
  useEffect(() => {
    if (tab === 'media') return;
    void api('/api/context', { method: 'POST', body: JSON.stringify({ projectId: null, documentId: null, blockId: null, page: 1, mediaId: null, themeId: null, selectedAsset: asset ? { kind: asset.kind, id: asset.id, revision: asset.revision, ...(variation ? { variation: variation.id } : {}) } : null }) }).catch(() => {});
  }, [tab, asset?.kind, asset?.id, asset?.revision, variation?.id]);
  const historical = Boolean(inspection && inspection.asset.revision !== inspection.head.revision);
  const editable = Boolean(inspection && !historical && !inspection.head.archived && !inspection.head.builtIn && connected && !busy);
  function saved(value: AssetInspection) { setSelectedRevision(''); setInspectionState({ key: `${value.asset.kind}/${value.asset.id}/`, value }); setRetry(value => value + 1); notifications.success('Asset saved'); if (id !== value.asset.id || tab !== collection(value.asset.kind)) location.hash = `assets/${collection(value.asset.kind)}/${value.asset.id}`; }
  function archivedAsset(value: AssetInspection) {
    setInspectionState({ key: requestKey, value }); setRetry(value => value + 1);
    notifications.success(`${value.asset.name} archived`, { label: 'Undo', onClick: async () => {
      await api<AssetInspection>(`${endpoint(value.asset.kind, value.asset.id)}/restore`, { method: 'POST', body: JSON.stringify({ expectedRevision: value.head.revision }) });
      setRetry(value => value + 1); notifications.success(`${value.asset.name} restored`);
    } });
  }
  async function quickAction(action: 'default' | 'restore') {
    if (!inspection || working.current || !connected) return;
    working.current = true; setBusy(true); setError('');
    try {
      const result = await api<AssetInspection>(`${endpoint(kind, inspection.asset.id)}${action === 'restore' ? '/restore' : ''}`, { method: action === 'restore' ? 'POST' : 'PATCH', body: JSON.stringify({ expectedRevision: inspection.head.revision, ...(action === 'default' ? { defaultVariation: variation?.id } : {}) }) });
      setInspectionState({ key: requestKey, value: result }); setRetry(value => value + 1); notifications.success(action === 'restore' ? 'Asset restored' : 'Default variation saved');
    } catch (error) { setError((error as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  return <section className="library-content assets-content">
    <div className="library-heading assets-heading"><h1>Media &amp; Assets</h1>{tab !== 'media' && !id && <Button onClick={() => setEdit({ action: 'create', kind })} disabled={!connected}><Icon name="plus" size={17} />{kind === 'logo' ? 'Add logo' : 'Add fonts'}</Button>}</div>
    <nav className="assets-tabs" aria-label="Media and assets categories">{(['media', 'logos', 'fonts'] as const).map(value => <a key={value} href={`#assets/${value}`} aria-current={tab === value ? 'page' : undefined}>{value === 'media' ? 'Media' : value === 'logos' ? 'Logos' : 'Fonts'}</a>)}</nav>
    {tab === 'media' ? <MaterialsBrowser connected={connected} selection={id} generation={generation} documents={documents} /> : <>
      {error && <div className="error-banner" role="alert"><span>{error}</span><Button className="text-button" onClick={() => setRetry(value => value + 1)}>Try again</Button></div>}
      {catalog?.kind === kind && catalog.value.issues.map(issue => <p className="media-problem materials-issue" role="status" key={issue}>{issue}</p>)}
      {!id ? <AssetCollection error={error} kind={kind} catalog={catalog?.kind === kind ? catalog.value : undefined} query={query} setQuery={setQuery} archived={archived} setArchived={setArchived} onAdd={() => setEdit({ action: 'create', kind })} /> : <>
        <a className="media-back" href={`#assets/${collection(kind)}`}><Icon name="left" size={16} />All {collection(kind)}</a>
        {!asset || !inspection ? <div className="empty-state"><h2>{error ? 'Asset unavailable' : 'Loading asset…'}</h2><p>{error ? 'Check the local files or return to the library.' : 'Opening its saved artwork and guidance.'}</p></div> : <>
          {historical && <div className="asset-state-banner" role="status"><span>Viewing a previous version · {dateLabel(asset.createdAt)}</span><Button className="text-button" onClick={() => setSelectedRevision('')}>View current version</Button></div>}
          {inspection.head.archived && <div className="asset-state-banner" role="status"><span>Archived. Existing documents can still use this asset.</span><Button onClick={() => void quickAction('restore')} disabled={!connected || busy || inspection.head.builtIn}>{busy ? 'Restoring…' : 'Restore'}</Button></div>}
          <header className="asset-detail-heading"><div><h2>{asset.name}</h2>{asset.description ? <p>{asset.description}</p> : <p className="muted">{asset.kind === 'logo' ? 'A shared logo for your documents.' : 'A shared font family for your documents.'}</p>}</div><div className="asset-detail-actions"><Button onClick={() => setThemeOpen(true)} disabled={!connected || inspection.head.archived || historical || (asset.kind === 'font' && !asset.compatibility.defaultEligible)}>Use with theme</Button><Menu.Root><Menu.Trigger render={<Button className="icon-button" aria-label={`Options for ${asset.name}`} />}><Icon name="more" /></Menu.Trigger><Menu.Portal><Menu.Positioner className="ui-positioner" align="end" sideOffset={6}><Menu.Popup className="ui-menu-popup"><Menu.Item className="ui-menu-item" disabled={!editable} onClick={() => setEdit({ action: 'edit', inspection })}><Icon name="edit" size={16} />Edit name &amp; guidance</Menu.Item><Menu.Item className="ui-menu-item" onClick={() => setVersionsOpen(true)}><Icon name="history" size={16} />Previous versions</Menu.Item><Menu.Separator className="ui-menu-separator" /><Menu.Item className="ui-menu-item" disabled={!editable} onClick={() => setEdit({ action: 'archive', inspection })}><Icon name="trash" size={16} />Archive</Menu.Item></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root></div></header>
          {asset.kind === 'logo' && <>
              <section className="asset-variations logo-folder-contents"><div className="asset-section-heading"><h3>Files <span>{asset.variations.length}</span></h3><Button className="text-button" disabled={!editable} onClick={() => setEdit({ action: 'variation', inspection })}><Icon name="plus" size={16} />Add variations</Button></div>
                <div className="asset-variation-list">{asset.variations.map(item => <Button static className={`asset-variation-choice ${variation?.id === item.id ? 'selected' : ''}`} key={item.id} aria-pressed={variation?.id === item.id} onClick={() => setVariationId(item.id)}><span className={`asset-variation-thumb asset-background-${background}`} aria-hidden="true"><LogoImage id={asset.id} revision={asset.revision} file={item.image} name={item.name} /></span><span><strong>{item.name}</strong><small>{item.id === asset.defaultVariation ? 'Default variation' : item.original.mime === 'image/svg+xml' ? 'SVG' : 'PNG'}</small></span>{variation?.id === item.id && <Icon name="check" size={16} />}</Button>)}</div>
              </section>
          </>}
          <div className="asset-detail-grid"><div className="asset-main-column">
            {asset.kind === 'logo' ? <>
              <div className={`asset-logo-stage asset-background-${background}`}><LogoImage id={asset.id} revision={asset.revision} file={variation?.image} name={`${asset.name} · ${variation?.name ?? ''}`} /></div>
              <div className="asset-preview-tools"><div className="asset-backgrounds" role="group" aria-label="Preview background">{(['light', 'dark', 'transparent'] as const).map(value => <Button className={`asset-background-choice asset-background-${value}`} key={value} aria-label={`${value === 'transparent' ? 'Transparency' : value === 'light' ? 'Light' : 'Dark'} preview background`} aria-pressed={background === value} onClick={() => setBackground(value)}><span aria-hidden="true">{background === value ? <Icon name="check" size={14} /> : null}</span></Button>)}</div><span className="small muted">Preview background only</span>{variation && <a href={assetFileUrl('logo', asset.id, asset.revision, variation.original)} download>Original {variation.original.mime === 'image/svg+xml' ? 'SVG' : 'PNG'}<Icon name="download" size={15} /></a>}</div>

            </> : <FontSpecimen key={`${asset.id}/${asset.revision}`} asset={asset} />}
          </div><aside className="asset-side-column">
            {asset.kind === 'logo' && variation && <section className="asset-variation-details"><div className="asset-section-heading"><h3>{variation.name}</h3>{variation.id === asset.defaultVariation && <span className="asset-badge">Default</span>}</div><h4>When to use</h4><p>{variation.description || 'No guidance yet. Describe which backgrounds or layouts suit this variation.'}</p><div className="asset-action-stack"><Button className="text-button" onClick={() => setEdit({ action: 'edit', inspection, variation })} disabled={!editable}><Icon name="edit" size={15} />Edit guidance</Button><Button className="text-button" onClick={() => setEdit({ action: 'replace', inspection, variation })} disabled={!editable}>Replace file</Button>{variation.id !== asset.defaultVariation && <Button className="text-button" disabled={!editable} onClick={() => void quickAction('default')}>Make default</Button>}{asset.variations.length > 1 && <Button className="text-button" disabled={!editable} onClick={() => setEdit({ action: 'remove', inspection, variation })}><Icon name="trash" size={15} />Remove variation</Button>}</div><p className="small muted asset-variation-size">{variation.image.width} × {variation.image.height} px · Prepared for PDF</p></section>}
            {asset.kind === 'font' && <><section className="asset-font-health"><h3>{asset.compatibility.defaultEligible ? 'Ready for theme defaults' : 'Font compatibility'}</h3><p className={asset.compatibility.status === 'needs-attention' ? 'media-problem' : ''}>{asset.compatibility.message || (asset.compatibility.defaultEligible ? 'This family includes regular and semibold or bold, and passed the PDF checks.' : 'Add regular and semibold or bold before using this family as a theme default.')}</p></section><section className="asset-font-styles"><div className="asset-section-heading"><h3>Styles <span>{asset.faces.length}</span></h3><Button className="text-button" onClick={() => setEdit({ action: 'faces', inspection })} disabled={!editable}><Icon name="plus" size={15} />Add</Button></div>{!asset.faces.some(face => face.style === 'italic') && <p className="small muted asset-missing-style">No italic styles included. Add them if your documents use italics.</p>}{!asset.faces.some(face => face.weight === 600 && face.style === 'normal') && asset.faces.some(face => face.weight === 700 && face.style === 'normal') && <p className="small muted asset-missing-style">Semibold requests use the family’s Bold face.</p>}<ul>{asset.faces.map(face => <li key={face.id}><span><strong>{fontStyle(face)}</strong><small>{face.weight} · {face.file.file.toLowerCase().endsWith('.otf') ? 'OTF' : 'TTF'}</small></span><a href={assetFileUrl('font', asset.id, asset.revision, face.file)} aria-label={`Download ${fontStyle(face)}`} download><Icon name="download" size={16} /></a></li>)}</ul></section><Button className="text-button" disabled={!editable} onClick={() => setEdit({ action: 'edit', inspection })}><Icon name="edit" size={15} />Edit guidance</Button></>}
            <AssetRelationships inspection={inspection} />
            {inspection.head.builtIn && <p className="small muted">Built-in asset. Its original files stay in the workspace.</p>}
          </aside></div>
          <AssetVersions inspection={inspection} open={versionsOpen} onClose={() => setVersionsOpen(false)} onSelect={setSelectedRevision} />
          <AssetThemeDialog open={themeOpen} onClose={() => setThemeOpen(false)} themes={themes} generation={generation + retry} connected={connected} asset={asset} />
        </>}
      </>}
      {edit?.action === 'create' && edit.kind === 'logo' ? <CreateLogoDialog connected={connected} onClose={() => setEdit(null)} onSaved={saved} /> : edit?.action === 'variation' ? <AddLogoVariationsDialog inspection={edit.inspection} connected={connected} onClose={() => setEdit(null)} onSaved={saved} /> : <AssetEditDialog edit={edit} connected={connected} onClose={() => setEdit(null)} onSaved={saved} onArchived={archivedAsset} />}
    </>}
  </section>;
}
