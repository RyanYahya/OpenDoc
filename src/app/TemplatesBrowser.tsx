import { useCallback, useEffect, useRef, useState } from 'react';
import type { TemplateItem, TemplatePreview as Preview } from '../shared/templates';
import type { DocumentFormat } from '../shared/types';
import { api } from './api';
import { catalogPreview } from './catalogPreview';
import { PdfPage, usePdf } from './Pdf';
import { Button, Dialog, Input, Tabs } from './ui';
import { Icon } from './ui/Icon';
import { CreateDocumentDialog } from './CreateDocumentDialog';
import { GuideDialog } from './GuideDialog';
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

export function TemplatesBrowser({ selection, generation, format = 'document' }: { selection: string; generation: number; format?: DocumentFormat }) {
  const [proof, setProof] = useState<{ revision: string; preview: Preview }>();
  const previewReady = useCallback((revision: string, preview: Preview) => setProof({ revision, preview }), []);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [custom, setCustom] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const promptField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void api<TemplateItem[]>('/api/templates', { signal: controller.signal }).then(next => {
      setItems(next); setLoaded(true); setLoadError('');
    }).catch(error => { if (!controller.signal.aborted) { setLoadError(error.message); setLoaded(true); } });
    return () => controller.abort();
  }, [generation, attempt]);
  useEffect(() => setCreateOpen(false), [selection]);
  const item = items.find(item => item.id === selection);
  const presentation = item?.descriptor.documentFormat === 'presentation';
  const artifact = item && proof?.revision === item.revision ? proof.preview.artifact : undefined;
  async function copy() {
    try { await navigator.clipboard.writeText(customPrompt); setCopied(true); setCopyError(''); }
    catch { setCopyError('Select the skill name and copy it manually.'); promptField.current?.focus(); promptField.current?.select(); }
  }
  return <section className="library-content templates-content">
    {selection ? <>
      <a className="template-back" href={presentation ? '#templates?format=presentation' : '#templates'}><Icon name="left" size={15} /> {presentation ? 'Presentation templates' : 'Document templates'}</a>
      {item ? <>
        <div className={`template-detail-layout${presentation ? ' template-detail-presentation' : ''}`}>
          <div className="template-proof">
            <div className="template-proof-label"><span>Neutral preview</span><span>{artifact ? `${artifact.pages.length} ${presentation ? artifact.pages.length === 1 ? 'slide' : 'slides' : artifact.pages.length === 1 ? 'page' : 'pages'}` : 'Preparing preview…'}</span></div>
            <TemplatePreview key={item.id} item={item} allPages onReady={previewReady} />
          </div>
          <div className="template-options">
            <header className="template-options-heading">
              <h1>{item.descriptor.name}</h1>
              <p className="lead template-intro">{item.descriptor.description}</p>
            </header>
            <h2>{presentation ? 'The deck structure' : 'The page structure'}</h2>
            <p className="template-format">{item.descriptor.format}</p>
            <ul>{item.descriptor.structure.map(note => <li key={note}>{note}</li>)}</ul>
            <Button className="primary" onClick={() => setCreateOpen(true)}>
              Use this template<Icon name="arrow" size={16} />
            </Button>
            <CreateDocumentDialog open={createOpen} onOpenChange={setCreateOpen} template={item} />
            <GuideDialog key={item.id} kind="template" id={item.id} name={item.descriptor.name} generation={generation} />
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
              <Dialog.Description>Use this skill in your coding agent in the OpenDoc workspace. Describe the reusable layout you want and share any sample content.</Dialog.Description>
              <Input ref={promptField} className="prompt-example skill-invocation" aria-label="Template creation skill" readOnly value={customPrompt} />
              <Button className="primary copy-prompt" onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copied' : 'Copy skill'}</Button>
              <span className="sr-only" role="status">{copied ? 'Skill copied to clipboard.' : ''}</span>
              {copyError && <p role="alert" className="comment-error">{copyError}</p>}
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
      <p className="lead template-intro">Choose a structure for your work. Apply a theme when you make it yours.</p>
      <Tabs.Root value={format} onValueChange={value => { location.hash = value === 'presentation' ? 'templates?format=presentation' : 'templates'; }}>
        <Tabs.List className="ui-tabs" aria-label="Template format">
          <Tabs.Tab className="ui-tab" value="document">Documents</Tabs.Tab>
          <Tabs.Tab className="ui-tab" value="presentation">Presentations</Tabs.Tab>
        </Tabs.List>
        {(['document', 'presentation'] as const).map(category => {
          const visible = items.filter(item => (item.descriptor.documentFormat ?? 'document') === category);
          return <Tabs.Panel key={category} value={category}>
      <div className="template-gallery-label"><span>{loaded ? `${visible.length} ${visible.length === 1 ? 'template' : 'templates'}` : 'Preparing templates…'}</span><span>All previews use Neutral</span></div>
      <div className={`template-grid${category === 'presentation' ? ' template-grid-presentations' : ''}`}>{visible.map(item => <article className="template-card" key={item.id}>
        <a href={`#templates/${item.id}`} className="template-card-link" aria-labelledby={`template-title-${item.id}`}>
          <div className="template-card-mat" aria-hidden="true"><TemplatePreview item={item} /></div>
          <h2 id={`template-title-${item.id}`}>{item.descriptor.name}<Icon name="arrow" size={17} /></h2>
        </a>
        <p className="template-format">{item.descriptor.format}</p>
        {item.error && <p className="comment-error" role="alert">Preview needs attention. Open the template for details.</p>}
      </article>)}</div>
      {loaded && !visible.length && !loadError && <div className="empty-state"><h2>No {category === 'presentation' ? 'presentation' : 'document'} templates yet</h2><p>Choose Create template to find the skill to use in your coding agent.</p></div>}
          </Tabs.Panel>;
        })}
      </Tabs.Root>
    </>}
    {loadError && <div className="error-banner" role="alert"><span>{loadError}</span><Button onClick={() => setAttempt(value => value + 1)}>Try again</Button></div>}
  </section>;
}
