import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { documentName, type DocumentSummary } from '../shared/types';
import { groupMedia, type Materials, type MediaItem, type MediaKind, type MediaMeta } from '../shared/media';
import { api, ApiError } from './api';
import { Button, Dialog, SelectControl, useNotifications } from './ui';
import { SearchField } from './SearchField';
import { Icon } from './ui/Icon';
import './materials.css';

const imageUrl = (item: MediaItem) => `/api/materials/${item.documentId}/image?item=${encodeURIComponent(item.id)}&hash=${item.hash}`;
const fileUrl = (doc: string, path: string) => `/api/materials/${doc}/file?path=${encodeURIComponent(path)}`;
const bytes = (value: number) => value < 1000 ? `${value} B` : value < 1_000_000 ? `${Math.round(value / 1000)} KB` : `${(value / 1_000_000).toFixed(1)} MB`;
const labels = { original: 'Original image', current: 'Inputs unchanged', unrecorded: 'Generation not recorded', stale: 'Needs regeneration' };
const kinds: { label: string; value: MediaKind }[] = [{ label: 'Image', value: 'image' }, { label: 'Photo', value: 'photo' }, { label: 'Illustration', value: 'illustration' }, { label: 'Chart', value: 'chart' }, { label: 'Diagram', value: 'diagram' }];
const rootPath = '#assets/media';
type MediaEditor = { item: MediaItem };

function MediaEditorDialog({ editor, connected, onClose, onSaved }: {
  editor: MediaEditor; connected: boolean; onClose: () => void;
  onSaved: (documentId: string, itemId?: string) => void;
}) {
  const item = editor.item;
  const documentId = item.documentId;
  const [title, setTitle] = useState(item?.meta?.title ?? '');
  const [description, setDescription] = useState(item?.meta?.description ?? '');
  const [kind, setKind] = useState<MediaKind>(item?.meta?.kind ?? 'image');
  const [alt, setAlt] = useState(item?.meta?.alt ?? '');
  const [attribution, setAttribution] = useState(item?.meta?.attribution ?? '');
  const [sources, setSources] = useState(item?.meta?.sources?.join('\n') ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const alive = useRef(true);
  const id = useId();
  const notifications = useNotifications();
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const field = (name: string) => `${id}-${name}`;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (working.current || !connected) return;
    if (!documentId) { setError('Choose the document this image belongs to.'); return; }
    if (!title.trim() || !description.trim()) { setError('Add a title and a short description.'); return; }
    working.current = true; setBusy(true); setError('');
    const edits = {
      title: title.trim(), description: description.trim(), kind,
      alt: alt.trim() || undefined, attribution: attribution.trim() || undefined,
      sources: sources.split('\n').map(note => note.trim()).filter(Boolean),
    };
    try {
      const meta: MediaMeta = { ...item.meta!, ...edits };
      await api(`/api/materials/${encodeURIComponent(documentId)}/meta?item=${encodeURIComponent(item.id)}`, {
        method: 'PATCH', body: JSON.stringify({ expectedRevision: item.metadataRevision, meta }), signal: AbortSignal.timeout(30_000),
      });
      notifications.success('Media details updated');
      if (alive.current) onSaved(documentId, item.id);
    } catch (failure) {
      if (alive.current) setError(failure instanceof ApiError && failure.status === 409 ? `${failure.message} Close and reopen these details to use the latest version.` : (failure as Error).message);
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !working.current) onClose(); }}>
    <Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" /><Dialog.Popup className="help-dialog media-editor-dialog">
      <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close media details" disabled={busy} />}><Icon name="close" /></Dialog.Close>
      <Dialog.Title>Edit media details</Dialog.Title>
      <Dialog.Description>{`For ${item.documentTitle}. Your image and prepared files stay together.`}</Dialog.Description>
      <form onSubmit={event => void save(event)} aria-busy={busy}>
        <fieldset disabled={busy || !connected} className="media-editor-fields">
          <div className="media-editor-field"><label htmlFor={field('title')}>Title</label><input id={field('title')} value={title} onChange={event => setTitle(event.target.value)} maxLength={200} required /></div>
          <div className="media-editor-field"><label htmlFor={field('description')}>Description</label><textarea id={field('description')} value={description} onChange={event => setDescription(event.target.value)} rows={3} maxLength={4000} required placeholder="What does this image show?" /></div>
          <div className="media-editor-field"><span>Kind</span><SelectControl label="Media kind" value={kind} onValueChange={value => setKind(value as MediaKind)} items={kinds} /></div>
          <details className="media-editor-optional" open={!!(item?.meta?.alt || item?.meta?.attribution || item?.meta?.sources?.length)}>
            <summary>Accessibility & sources <span>Optional</span></summary>
            <div className="media-editor-field"><label htmlFor={field('alt')}>Alternative text</label><textarea id={field('alt')} value={alt} onChange={event => setAlt(event.target.value)} rows={2} placeholder="A useful description for someone who cannot see the image." /></div>
            <div className="media-editor-field"><label htmlFor={field('attribution')}>Attribution</label><textarea id={field('attribution')} value={attribution} onChange={event => setAttribution(event.target.value)} rows={2} placeholder="Creator, credit, or evidence limitations." /></div>
            <div className="media-editor-field"><label htmlFor={field('sources')}>Source notes</label><textarea id={field('sources')} value={sources} onChange={event => setSources(event.target.value)} rows={3} placeholder="One note or source location per line." /><p className="field-hint">Notes for you and your agent. Links and files are not opened or copied.</p></div>
          </details>
          {(item?.meta?.data || item?.meta?.recipe || kind === 'chart' || kind === 'diagram') && <p className="field-hint media-review-note">Your agent manages prepared data, recipes, and review. Saving details does not review or regenerate the image.</p>}
        </fieldset>
        {!connected && <p className="field-error" role="status">Reconnect to edit media details. Your entries are kept here.</p>}
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="dialog-actions"><Button type="button" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" className="primary" disabled={busy || !connected || !documentId}>{busy ? 'Saving…' : 'Save details'}</Button></div>
      </form>
    </Dialog.Popup></Dialog.Portal>
  </Dialog.Root>;
}
function MediaImage({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.hash]);
  return item.hash && !item.error && !failed
    ? <img src={imageUrl(item)} alt={item.meta?.alt ?? item.meta?.description ?? item.id} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <span className="media-unavailable"><Icon name="image" size={30} /><span>{item.error ? 'Image unavailable' : 'Image changed. Refresh to load it.'}</span></span>;
}
function Ownership({ item, connected, onEdit }: { item: MediaItem; connected: boolean; onEdit: (item: MediaItem) => void }) {
  return <section className="media-ownership">
    <h3><a href={`#document/${item.documentId}`}>{item.documentTitle}<Icon name="arrow" size={16} /></a></h3>
    <p className="small muted">{item.folder}</p>
    <div className="media-item-heading"><h4>{item.meta?.title ?? item.id}</h4>{item.meta && <Button className="text-button" disabled={!connected || !item.metadataRevision} onClick={() => onEdit(item)}>Edit details</Button>}</div>
    {item.meta?.description && <p>{item.meta.description}</p>}
    {item.error ? <p role="alert" className="media-problem">{item.error}</p> : <p className={item.freshness === 'stale' || item.freshness === 'unrecorded' ? 'media-problem' : 'small muted'}>{labels[item.freshness]}{item.changedInputs?.length ? `: ${item.changedInputs.join(', ')}` : ''}</p>}
    <p className="small">{!item.usageKnown ? 'Usage reflects the last successful preview; the current document is not ready.' : item.usedIn.length ? `Used${item.usedIn.flatMap(use => use.pages).length ? ` on ${[...new Set(item.usedIn.flatMap(use => use.pages))].map(page => `page ${page}`).join(', ')}` : ' in this document'}.` : 'Belongs to this document; not used in its current PDF.'}</p>
    {item.meta?.attribution && <p className="small">{item.meta.attribution}</p>}
    {(item.meta?.sources?.length ?? 0) > 0 && <div className="media-file-group"><h4>Source notes</h4>{item.meta!.sources!.map(note => <p className="small muted" key={note}>{note}</p>)}</div>}
    {(item.meta?.data || item.meta?.recipe) && <div className="media-file-group"><h4>Prepared for this image</h4>{[[item.meta?.kind === 'chart' ? 'Chart data' : 'Prepared data', item.meta?.data], ['Recipe', item.meta?.recipe]].map(([label,path]) => path && <a className="material-file" key={label} href={fileUrl(item.documentId, `media/${item.id}/${path}`)} download><Icon name="document" size={16}/><span>{label} · {path}</span><Icon name="download" size={16}/></a>)}</div>}
    <a className="material-file" href={fileUrl(item.documentId, `media/${item.id}/meta.json`)} download><Icon name="document" size={16}/><span>Media metadata</span><Icon name="download" size={16}/></a>
  </section>;
}
export function MaterialsBrowser({ selection, generation, documents, connected }: { selection: string; generation: number; documents: DocumentSummary[]; connected: boolean }) {
  const [materials, setMaterials] = useState<Materials>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState('all');
  const [editor, setEditor] = useState<MediaEditor | null>(null);
  useEffect(() => {
    if (!connected) return;
    const abort = new AbortController();
    api<Materials>('/api/materials', {signal: abort.signal}).then(value => {setMaterials(value);setError('');}).catch(error => {if (!abort.signal.aborted)setError(error.message);});
    return () => abort.abort();
  }, [generation, retry, connected]);
  const selected = materials?.media.find(item => `${item.documentId}/${item.id}` === selection);
  useEffect(() => {
    if (!connected) return;
    void api('/api/context', {method: 'POST', body: JSON.stringify({documentId: selected?.documentId ?? null, blockId: null, page:1, mediaId:selected?.id ?? null, themeId: null, selectedAsset: null})}).catch(() => {});
  }, [selected?.documentId, selected?.id, connected]);
  const filtered = materials?.media.filter(item => (owner === 'all' || item.documentId === owner) && `${item.meta?.title ?? item.id} ${item.meta?.description ?? ''} ${item.documentTitle} ${item.meta?.kind ?? ''}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const groups = groupMedia(filtered);

  const duplicates = selected ? materials!.media.filter(item => selected.hash && !selected.error ? item.hash === selected.hash && !item.error : item === selected) : [];
  return <section className="materials-content">
    {!connected && <p className="media-problem materials-issue" role="status">Reconnect to edit media details.</p>}
    {error && <div className="error-banner" role="alert"><span>{error}</span><Button onClick={() => setRetry(value => value+1)} className="text-button">Try again</Button></div>}
    {materials?.issues.map(issue => <p className="media-problem materials-issue" role="status" key={issue}>{issue}</p>)}
    {selection ? <>
      <a className="media-back" href={rootPath}><Icon name="left" size={16}/>All media</a>
      {!selected ? <div className="empty-state"><h2>{materials ? 'Media not found' : 'Loading media…'}</h2><p>{materials ? 'Its owning folder may have been moved or removed.' : 'Reading the local media folders.'}</p></div> : <div className="media-detail">
        <div className="media-detail-visual"><div className="media-large-image"><MediaImage item={selected}/></div><div className="media-image-info"><span>{selected.width && selected.height ? `${selected.width} × ${selected.height} px` : 'No readable image'}</span>{selected.bytes !== undefined && <span>{bytes(selected.bytes)} · {selected.mime === 'image/png' ? 'PNG' : 'JPEG'}</span>}{selected.meta && !selected.error && <a href={fileUrl(selected.documentId, `media/${selected.id}/${selected.meta.file}`)} download>Download image<Icon name="download" size={16}/></a>}</div>{duplicates.length > 1 && <p className="small muted">Identical image in {duplicates.length} folders. Each copy keeps its own metadata and source relationships.</p>}</div>
        <div className="media-detail-info">{duplicates.map(item => <Ownership key={`${item.documentId}/${item.id}`} item={item} connected={connected} onEdit={item => setEditor({ item })}/>)}</div>
      </div>}
    </> : <>
      <div className="asset-collection-toolbar materials-toolbar"><SearchField label="Search media" value={query} onValueChange={setQuery} /><SelectControl label="Filter by document" value={owner} onValueChange={setOwner} items={[{label:'All documents',value:'all'},...documents.map(doc => ({label:documentName(doc),value:doc.id}))]}/></div>
      {!materials && !error && <p className="asset-collection-status" role="status">Reading local folders…</p>}
      <div className="media-grid">{groups.map(group => {const item=group[0];const owners=[...new Map(group.map(item=>[item.documentId,item.documentTitle])).values()];return <Button static className="media-card" key={`${item.documentId}/${item.id}`} onClick={() => {location.hash=`${rootPath}/${item.documentId}/${item.id}`;}} aria-label={`Open ${item.meta?.title ?? item.id}`}><span className="media-card-image"><MediaImage item={item}/></span><span className="media-card-caption"><strong>{item.meta?.title ?? item.id}</strong><span>{owners.length > 1 ? `${owners.length} documents` : owners[0]}{group.length > owners.length ? ` · ${group.length} copies` : ''}</span><span className={group.some(item=>item.error || item.freshness==='stale' || item.freshness==='unrecorded') ? 'media-problem' : 'muted'}>{item.error ? 'Check media metadata' : group.some(item=>item.freshness==='stale') ? 'Needs regeneration' : group.some(item=>item.freshness==='unrecorded') ? 'Generation not recorded' : group.every(item=>item.usageKnown && !item.usedIn.length) ? 'Not used in a PDF' : item.meta?.kind}</span></span></Button>;})}</div>
      {materials && !groups.length && <div className="empty-state"><h2>{query || owner !== 'all' ? 'No matching files' : 'A place for your visuals'}</h2><p>{query || owner !== 'all' ? 'Try another search or choose all documents.' : 'Share images with your agent, or ask it to generate or download visuals. They appear here when added to a document.'}</p>{(query || owner !== 'all') ? <Button onClick={()=>{setQuery('');setOwner('all');}}>Clear filters</Button> : null}</div>}
    </>}
    {editor && <MediaEditorDialog editor={editor} connected={connected} onClose={() => setEditor(null)} onSaved={(documentId, itemId) => { setEditor(null); setRetry(value => value + 1); if (itemId) location.hash = `${rootPath}/${documentId}/${itemId}`; }} />}
  </section>;
}
