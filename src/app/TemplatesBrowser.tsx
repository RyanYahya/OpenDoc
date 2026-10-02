import { useCallback, useEffect, useRef, useState } from 'react';
import type { TemplateItem, TemplatePreview as Preview } from '../shared/templates';
import { pageUnit, type DocumentFormat } from '../shared/types';
import { api } from './api';
import { catalogPreview } from './catalogPreview';
import { PdfPage, usePdf } from './Pdf';
import { Button, Dialog, Input } from './ui';
import { Icon } from './ui/Icon';
import type { CreatePreset } from './CreateDocumentDialog';
import { GuideDialog } from './GuideDialog';
import { tagText, type TagState, type TagTarget } from './Tags';
import { FilterBar, FilterChoices, useHashQuery, useSortPreference } from './FilterBar';
import { compareNewest, compareText, detailsText, filtering, itemFacets, itemFilterKeys, matchesFilters, matchesSearch, noFilters, readItemFilters, sortItems, splitHash, type SortOption } from './libraryFilters';
import { emptyTags, itemCustomTags, itemType, standardTypes, typeLabel } from '../shared/tags';
import { languageLabel, textLang } from '../shared/language';
import './templates.css';

function TemplatePreview({ item, allPages = false, onReady }: { item: TemplateItem; allPages?: boolean; onReady?: (revision: string, preview: Preview) => void }) {
  const [visible, setVisible] = useState(allPages);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; preview: Preview }>();
  const key = `${item.id}:${item.revision}:${attempt}`;
  const preview = state?.key === key ? state.preview : undefined;
  const { pdf, error: pdfError } = usePdf(item.id, preview?.artifact?.hash, true, 'templates');
  const error = item.error || preview?.error || pdfError;
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(240);
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.min(item.descriptor.documentFormat === 'presentation' ? 960 : 595, entries[0].contentRect.width)));
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [item.descriptor.documentFormat]);
  useEffect(() => {
    if (allPages || !frame.current) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: '240px 0px' });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [allPages]);
  useEffect(() => {
    if (!visible || item.error || state?.key === key) return;
    const controller = new AbortController();
    void catalogPreview<Preview>(`/api/templates/${item.id}/preview`, controller.signal)
      .then(preview => { if (!controller.signal.aborted) setState({ key, preview }); })
      .catch(error => { if (!controller.signal.aborted) setState({ key, preview: { error: error.message } }); });
    return () => controller.abort();
  }, [visible, item.id, item.error, key, state?.key]);
  useEffect(() => { if (preview) onReady?.(item.revision, preview); }, [preview, item.revision, onReady]);
  return <div className={`template-preview ${allPages ? 'template-preview-full' : ''}`} ref={frame}>
    {error ? <div className="template-preview-message" role="alert"><p>{error}</p>{allPages && <Button onClick={() => setAttempt(value => value + 1)}>Try again</Button>}</div>
      : pdf ? Array.from({ length: allPages ? pdf.numPages : 1 }, (_, index) => <PdfPage key={index} pdf={pdf} number={index + 1} width={width} thumbnail={!allPages} />)
        : <p className="template-preview-message" role="status">{visible ? "Preparing preview…" : "PDF preview"}</p>}
  </div>;
}

const customPrompt = '$opendoc-create-template';
/** The gallery filters last shown, so a template page returns to the same view; unset until the gallery is seen. */
let galleryHash: string | undefined;
const sortOptions: SortOption[] = [{ value: 'title', label: 'Name A–Z' }, { value: 'updated', label: 'Last edited' }, { value: 'type', label: 'By type' }];
/** Types in vocabulary order; templates without one follow. */
const typeRank = (type?: string) => { const index = standardTypes.findIndex(item => item.id === type); return index < 0 ? standardTypes.length : index; };

export function TemplatesBrowser({ selection, generation, format = 'all', connected = true, tags, onEditTags, onCreate }: {
  selection: string; generation: number; format?: 'all' | DocumentFormat; connected?: boolean;
  /** Opens the shared creation handoff with this template chosen. */
  onCreate?: (preset: CreatePreset) => void;
  /** Optional workspace tags, filtered here and edited through the shared Details editor. */
  tags?: TagState; onEditTags?: (target: TagTarget) => void;
}) {
  const { params, update } = useHashQuery();
  const query = params.get('q') ?? '';
  const tagManifest = tags?.manifest ?? emptyTags();
  const tagging = Boolean(onEditTags) && !tags?.error;
  // Type and tags come from tags.json, so they filter only while it is readable; language is derived.
  const filters = tagging ? readItemFilters(params) : { ...noFilters, language: params.get('language') ?? '' };
  const [sort, setSort] = useSortPreference('templates', sortOptions, 'title');
  const [proof, setProof] = useState<{ revision: string; preview: Preview }>();
  const previewReady = useCallback((revision: string, preview: Preview) => setProof({ revision, preview }), []);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [custom, setCustom] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const promptField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void api<TemplateItem[]>('/api/templates', { signal: controller.signal }).then(next => {
      setItems(next); setLoaded(true); setLoadError('');
    }).catch(error => { if (!controller.signal.aborted) { setLoadError(error.message); setLoaded(true); } });
    return () => controller.abort();
  }, [generation, attempt]);
  const item = items.find(item => item.id === selection);
  const presentation = item?.descriptor.documentFormat === 'presentation';
  const artifact = item && proof?.revision === item.revision ? proof.preview.artifact : undefined;
  // The gallery shows every template or one format; search, filters, and sort apply within it.
  const ofFormat = (category: DocumentFormat) => items.filter(item => (item.descriptor.documentFormat ?? 'document') === category);
  const inFormat = format === 'all' ? items : ofFormat(format);
  const narrowed = Boolean(query) || filtering(filters);
  const name = (item: TemplateItem) => item.descriptor.name;
  const byType = (a: TemplateItem, b: TemplateItem) => typeRank(itemType(tagManifest, 'templates', a.id)) - typeRank(itemType(tagManifest, 'templates', b.id));
  const newest = (a: TemplateItem, b: TemplateItem) => compareNewest(a.updatedAt, b.updatedAt);
  const visible = sortItems(inFormat.filter(item => matchesFilters(tagManifest, 'templates', item, filters)
    && matchesSearch(`${name(item)} ${item.descriptor.description} ${item.descriptor.format} ${detailsText(tagManifest, 'templates', item.id)}`, query)),
  ...(sort === 'updated' ? [newest] : sort === 'type' ? [byType] : []), (a, b) => compareText(name(a), name(b)));
  const noun = format === 'all' ? '' : `${format} `;
  // The hash can change a render before the selection does, so read the gallery's own address.
  const hashQuery = params.toString();
  useEffect(() => { if (!selection && splitHash(location.hash).path === 'templates') galleryHash = location.hash; }, [selection, hashQuery]);
  // Opened directly, a template page returns to the gallery of its own format.
  const backHash = galleryHash ?? `#templates?format=${presentation ? 'presentation' : 'document'}`;
  // Every template at once keeps each format's cards together, since their pages have different shapes.
  const groups = format === 'all'
    ? (['document', 'presentation'] as const).map(category => ({ format: category, items: visible.filter(item => (item.descriptor.documentFormat ?? 'document') === category) })).filter(group => group.items.length)
    : [{ format, items: visible }];
  const card = (item: TemplateItem, Title: 'h2' | 'h3') => <article className="template-card" key={item.id}>
    <a href={`#templates/${item.id}`} className="template-card-link" aria-labelledby={`template-title-${item.id}`}>
      <div className="template-card-mat" aria-hidden="true"><TemplatePreview item={item} /></div>
      <Title id={`template-title-${item.id}`}><bdi lang={textLang(item.descriptor.name, item.language)}>{item.descriptor.name}</bdi><Icon name="arrow" size={17} /></Title>
    </a>
    <p className="template-format">{tagging && itemType(tagManifest, 'templates', item.id) && <span className="card-type">{typeLabel(itemType(tagManifest, 'templates', item.id)!)} · </span>}{item.descriptor.format}</p>
    {item.error && <p className="comment-error" role="alert">Preview needs attention. Open the template for details.</p>}
  </article>;
  async function copy() {
    try { await navigator.clipboard.writeText(customPrompt); setCopied(true); setCopyError(''); }
    catch { setCopyError('Copying isn’t available here. Select the skill name and copy it manually.'); promptField.current?.focus(); promptField.current?.select(); }
  }
  return <section className="library-content templates-content">
    {selection ? <>
      <a className="back-link" href={backHash}><Icon name="left" size={16} />Templates</a>
      {item ? <>
        <div className={`template-detail-layout${presentation ? ' template-detail-presentation' : ''}`}>
          <div className="template-proof">
            <div className="template-proof-label"><span>Preview in the Neutral theme</span><span>{artifact ? `${artifact.pages.length} ${pageUnit(presentation ? 'presentation' : 'document', artifact.pages.length)}` : 'Preparing preview…'}</span></div>
            <TemplatePreview key={item.id} item={item} allPages onReady={previewReady} />
          </div>
          <div className="template-options">
            <header className="template-options-heading">
              <h1 dir="auto" lang={textLang(item.descriptor.name, item.language)}>{item.descriptor.name}</h1>
              <p className="lead template-intro" dir="auto" lang={textLang(item.descriptor.description, item.language)}>{item.descriptor.description}</p>
            </header>
            <h2>{presentation ? 'The deck structure' : 'The page structure'}</h2>
            <p className="template-format">{item.descriptor.format}</p>
            <ul>{item.descriptor.structure.map(note => <li key={note}>{note}</li>)}</ul>
            <Button className="primary" onClick={() => onCreate?.({ template: { id: item.id, name: item.descriptor.name, format: item.descriptor.documentFormat ?? 'document' } })}>
              Use this template
            </Button>
            <GuideDialog key={item.id} kind="template" id={item.id} name={item.descriptor.name} generation={generation} />
            {tagging && <section className="tag-details template-tags"><h2>Details</h2>
              <dl>
                <div><dt>Type</dt><dd>{itemType(tagManifest, 'templates', item.id) ? typeLabel(itemType(tagManifest, 'templates', item.id)!) : 'None'}</dd></div>
                {item.language && item.language !== 'english' && <div><dt>Language</dt><dd>{languageLabel(item.language)}</dd></div>}
                <div><dt>Tags</dt><dd>{itemCustomTags(tagManifest, 'templates', item.id).length ? tagText(itemCustomTags(tagManifest, 'templates', item.id)) : 'None'}</dd></div>
              </dl>
              <div className="tag-details-actions"><Button className="text-button" data-template-tags={item.id} disabled={!connected} onClick={() => onEditTags?.({ kind: 'templates', id: item.id, name: item.descriptor.name, returnFocus: `[data-template-tags="${item.id}"]` })}>Edit details…</Button></div>
            </section>}
          </div>
        </div>
      </> : <div className="empty-state"><h1>{loaded ? 'Template not found' : 'Loading template…'}</h1><p>{loaded ? 'It may have been moved or removed from the workspace.' : 'Preparing its PDF preview.'}</p></div>}
    </> : <>
      <div className="library-heading"><h1>Templates</h1>
        <Dialog.Root open={custom} onOpenChange={open => { setCustom(open); if (open) { setCopied(false); setCopyError(''); } }}>
          <Dialog.Trigger render={<Button />}><Icon name="plus" size={17} />Create template</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Backdrop className="ui-dialog-backdrop" />
            <Dialog.Popup className="help-dialog">
              <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close" />}><Icon name="close" /></Dialog.Close>
              <Dialog.Title>Create a template</Dialog.Title>
              <Dialog.Description>Copy the skill and paste it into your coding agent in this workspace, then describe the reusable layout you want and share any sample content. The template appears here when it’s ready.</Dialog.Description>
              <Input ref={promptField} className="prompt-example skill-invocation" aria-label="Template creation skill" readOnly value={customPrompt} />
              <Button className="primary copy-prompt" onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copied' : 'Copy skill'}</Button>
              <span className="sr-only" role="status">{copied ? 'Skill copied. Paste it into your agent.' : ''}</span>
              {copyError && <p role="alert" className="comment-error">{copyError}</p>}
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
      <FilterBar search={{ label: 'Search templates', value: query, onChange: value => update({ q: value }, { replace: true }) }}
        primary={<FilterChoices label="Template format" value={format} onChange={value => update({ format: value === 'all' ? null : value })} choices={[
          { value: 'all', label: 'All', count: items.length },
          { value: 'document', label: 'Documents', count: ofFormat('document').length }, { value: 'presentation', label: 'Presentations', count: ofFormat('presentation').length },
        ]} />}
        facets={itemFacets(tagManifest, 'templates', inFormat, filters).filter(facet => tagging || facet.key === 'language')}
        onFacetChange={(key, value) => update({ [key]: value })} onClearFacets={() => update(Object.fromEntries(itemFilterKeys.map(key => [key, null])))}
        sort={{ value: sort, options: sortOptions, onChange: setSort }} />
      <div className="library-count"><span role="status">{loaded ? `${visible.length} ${visible.length === 1 ? 'template' : 'templates'}${narrowed ? ' matching the filters' : ''}` : 'Preparing templates…'}</span><span>Previews use the Neutral theme</span></div>
      {groups.map(group => format === 'all'
        ? <section key={group.format} className="template-group" aria-labelledby={`template-group-${group.format}`}>
          <h2 id={`template-group-${group.format}`} className="template-group-heading">{group.format === 'presentation' ? 'Presentation templates' : 'Document templates'}</h2>
          <div className={`template-grid${group.format === 'presentation' ? ' template-grid-presentations' : ''}`}>{group.items.map(item => card(item, 'h3'))}</div>
        </section>
        : <div key={group.format} className={`template-grid${group.format === 'presentation' ? ' template-grid-presentations' : ''}`}>{group.items.map(item => card(item, 'h2'))}</div>)}
      {loaded && !visible.length && !loadError && (narrowed
        ? <div className="empty-state"><h2>No matching {noun}templates</h2><p>Try another search or filter, or show every template.</p><Button onClick={() => update(Object.fromEntries(['q', ...itemFilterKeys].map(key => [key, null])))}>Clear filters</Button></div>
        : <div className="empty-state"><h2>No {noun}templates yet</h2><p>Choose Create template to find the skill to use in your coding agent.</p></div>)}
    </>}
    {loadError && <div className="error-banner" role="alert"><span>{loadError}</span><Button onClick={() => setAttempt(value => value + 1)}>Try again</Button></div>}
  </section>;
}
