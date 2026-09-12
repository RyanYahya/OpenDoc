import { useEffect, useRef, useState } from 'react';
import type { ThemePreview, ThemeSummary } from '../shared/themes';
import { documentName, type DocumentSummary } from '../shared/types';
import type { Project } from '../shared/projects';
import { api } from './api';
import { catalogPreview } from './catalogPreview';
import { PdfPage, usePdf } from './Pdf';
import { GuideDialog } from './GuideDialog';
import { AssetThemeDefaults } from './AssetThemeDefaults';
import { CreateDocumentDialog } from './CreateDocumentDialog';
import { Button, Dialog, Input } from './ui';
import { Icon } from './ui/Icon';
import './themes.css';

function ThemePdf({ id, preview, allPages, onRetry }: { id: string; preview: ThemePreview; allPages: boolean; onRetry: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(220);
  const { pdf, error } = usePdf(id, preview.artifact?.hash, true, 'themes');
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.min(660, entry.contentRect.width));
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  const firstPage = preview.artifact?.pages[0];
  const pageRatio = (firstPage?.width ?? 595.28) / (firstPage?.height ?? 841.89);
  // Gallery frames stay consistent; contain each paper size without stretching or cropping.
  const pageWidth = allPages ? width : Math.min(width, width * (841.89 / 595.28) * pageRatio);
  return <div className="theme-pdf" ref={frame} style={allPages ? undefined : { aspectRatio: '595.28 / 841.89' }}>
    {error ? <div className="theme-preview-message" role="alert"><p>Could not display this preview.</p><p>{error}</p><Button onClick={onRetry}>Try again</Button></div>
      : pdf ? Array.from({ length: allPages ? pdf.numPages : 1 }, (_, index) => <PdfPage key={index} pdf={pdf} number={index + 1} width={pageWidth} thumbnail={!allPages} onNavigate={page => frame.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ behavior: 'auto', block: 'start' })} />)
        : <p className="theme-preview-message" role="status">Opening PDF…</p>}
  </div>;
}

function ThemeSpecimen({ theme, generation, allPages = false, onRefresh }: { theme: ThemeSummary; generation: number; allPages?: boolean; onRefresh: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(allPages);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; preview: ThemePreview }>();
  const requestKey = `${theme.id}:${theme.revision ?? generation}:${attempt}`;
  useEffect(() => {
    if (allPages || !frame.current) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      setVisible(entries.some(entry => entry.isIntersecting));
    }, { rootMargin: '240px 0px' });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [allPages]);
  useEffect(() => {
    if (!visible || theme.error || state?.key === requestKey) return;
    const controller = new AbortController();
    void catalogPreview<ThemePreview>(`/api/themes/${encodeURIComponent(theme.id)}/preview`, controller.signal)
      .then(preview => { if (!controller.signal.aborted) setState({ key: requestKey, preview }); })
      .catch(error => { if (!controller.signal.aborted) setState({ key: requestKey, preview: { error: error.message } }); });
    return () => controller.abort();
  }, [visible, theme.id, theme.error, requestKey, state?.key]);
  const preview = state?.key === requestKey ? state.preview : undefined;
  const error = theme.error || preview?.error || (preview && !preview.artifact ? 'The theme did not produce a preview.' : '');
  const retry = () => { frame.current?.focus(); setAttempt(value => value + 1); if (theme.error) onRefresh(); };
  return <div ref={frame} tabIndex={-1} role="group" aria-label={`${theme.name} PDF preview`} aria-busy={visible && !preview && !error} className={`theme-specimen ${allPages ? 'theme-specimen-full' : ''}`}>
    {allPages && <div className="theme-proof-label"><span>Print system</span><span>{preview?.artifact ? `${preview.artifact.pages.length} ${preview.artifact.pages.length === 1 ? 'page' : 'pages'}` : 'PDF preview'}</span></div>}
    {error ? <div className="theme-preview-message" role="alert"><p>Preview needs attention.</p><p>{error}</p><Button onClick={retry}>Try again</Button></div>
      : preview?.artifact ? <ThemePdf key={requestKey} id={theme.id} preview={preview} allPages={allPages} onRetry={retry} />
        : <div className="theme-preview-placeholder" role="status"><Icon name="document" size={24} /><p>{visible ? 'Preparing preview…' : 'PDF preview'}</p></div>}
  </div>;
}

function ThemePromptDialog({ open, onOpenChange, theme }: { open: boolean; onOpenChange: (value: boolean) => void; theme?: ThemeSummary }) {
  const field = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const prompt = '$opendoc-create-theme';
  useEffect(() => { if (open) { setCopied(false); setError(''); } }, [open, prompt]);
  async function copy() {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setError(''); }
    catch { setError('Select the skill name and copy it manually.'); field.current?.focus(); field.current?.select(); }
  }
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" />
    <Dialog.Popup className="help-dialog">
      <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close" />}><Icon name="close" /></Dialog.Close>
      <Dialog.Title>{theme ? `Adapt ${theme.name}` : 'Create a theme'}</Dialog.Title>
      <Dialog.Description>Use this skill in your coding agent in the OpenDoc workspace. Describe the theme you want and share any visual references.</Dialog.Description>
      <Input ref={field} className="prompt-example skill-invocation" aria-label="Theme creation skill" readOnly value={prompt} />
      <Button className="primary" onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copied' : 'Copy skill'}</Button>
      <span className="sr-only" role="status">{copied ? 'Skill copied to clipboard.' : ''}</span>
      {error && <p className="comment-error" role="alert">{error}</p>}
    </Dialog.Popup>
  </Dialog.Portal></Dialog.Root>;
}

function ThemePalette({ theme, compact = false }: { theme: ThemeSummary; compact?: boolean }) {
  if (!theme.palette?.length) return null;
  if (compact) return <div className="theme-palette-strip" role="img" aria-label={`Palette: ${theme.palette.map(color => `${color.name} ${color.value}`).join(', ')}`}>
    {theme.palette.map(color => <span key={`${color.name}-${color.value}`} style={{ backgroundColor: color.value }} />)}
  </div>;
  return <section className="theme-palette-section"><h2>Palette</h2><ul className="theme-palette">
    {theme.palette.map(color => <li key={`${color.name}-${color.value}`}>
      <span className="theme-color-swatch" style={{ backgroundColor: color.value }} aria-hidden="true" />
      <div><div className="theme-color-label"><strong>{color.name}</strong><code>{color.value}</code></div><p>{color.role}</p></div>
    </li>)}
  </ul></section>;
}

function ThemeGallery({ themes, generation, onRefresh }: { themes: ThemeSummary[]; generation: number; onRefresh: () => void }) {
  return <div className="theme-gallery">{themes.map(theme => <article className="theme-gallery-card" key={theme.id}>
    <div className="theme-gallery-preview"><ThemeSpecimen theme={theme} generation={generation} onRefresh={onRefresh} /><ThemePalette theme={theme} compact /><a className="theme-preview-link" href={`#themes/${theme.id}`} aria-label={`Explore ${theme.name}`} /></div>
    <h2><a href={`#themes/${theme.id}`}>{theme.name}<Icon name="arrow" size={17} /></a></h2>
  </article>)}</div>;
}

export function ThemesBrowser({ themes, selection, generation, loaded, documents, projects, onRefresh, connected = true }: {
  themes: ThemeSummary[]; selection: string; generation: number; loaded: boolean; documents: DocumentSummary[]; projects: Project[]; onRefresh: () => void; connected?: boolean;
}) {
  const theme = themes.find(theme => theme.id === selection);
  const [promptOpen, setPromptOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => { setPromptOpen(false); setCreateOpen(false); window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }, [selection]);
  useEffect(() => {
    void api('/api/context', { method: 'POST', body: JSON.stringify({ projectId: null, documentId: null, blockId: null, page: 1, themeId: theme?.id ?? null, selectedAsset: null }) }).catch(() => {});
  }, [theme?.id]);
  const usingDocuments = documents.filter(document => document.artifact?.meta.theme === theme?.id && theme);
  const defaultProjects = projects.filter(project => project.defaultTheme === theme?.id && theme);
  const ordered = [...themes].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  return <section className="library-content themes-content">
    {selection ? <>
      <a href="#themes" className="theme-back"><Icon name="left" size={16} />All themes</a>
      {theme ? <div className="theme-detail-layout">
        <ThemeSpecimen key={theme.id} theme={theme} generation={generation} allPages onRefresh={onRefresh} />
        <aside className="theme-options">
          <header><h1>{theme.name}</h1><p className="lead">{theme.description}</p></header>
          <div className="theme-actions"><Button className="primary" disabled={Boolean(theme.error)} onClick={() => setCreateOpen(true)}>Create with this theme<Icon name="arrow" size={16} /></Button><Button onClick={() => setPromptOpen(true)}>Adapt this theme</Button><GuideDialog key={theme.id} kind="theme" id={theme.id} name={theme.name} generation={theme.revision ?? generation} /></div>
          {theme.assetError && <p className="field-error" role="alert">{theme.assetError}</p>}
          <AssetThemeDefaults key={theme.id} themeId={theme.id} generation={generation} connected={connected} />
          <div className="theme-system-details">
            <ThemePalette theme={theme} />
            <section><h2>Typography</h2><dl className="theme-type-details"><div><dt>Headings</dt><dd>{theme.heading}</dd></div><div><dt>Body</dt><dd>{theme.body}</dd></div><div><dt>Page</dt><dd>{theme.pageSize}</dd></div></dl></section>
            {Boolean(theme.geometry?.length) && <section><h2>Geometry &amp; layout</h2><ul>{theme.geometry!.map(rule => <li key={rule}>{rule}</li>)}</ul></section>}
            {theme.principles.length > 0 && <section><h2>System rules</h2><ul>{theme.principles.map(principle => <li key={principle}>{principle}</li>)}</ul></section>}
            {theme.useFor.length > 0 && <section><h2>Works well for</h2><p>{theme.useFor.join(' · ')}</p></section>}
            {usingDocuments.length > 0 && <section className="theme-used-by"><h2>Documents using {theme.name}</h2>{usingDocuments.map(document => <a key={document.id} href={`#document/${document.id}`}><Icon name="document" size={16} /><span>{documentName(document)}</span><Icon name="arrow" size={15} /></a>)}</section>}
            {defaultProjects.length > 0 && <section className="theme-used-by"><h2>Project default</h2>{defaultProjects.map(project => <a key={project.id} href={`#project/${project.id}`}><Icon name="folder" size={16} /><span>{project.name}</span><Icon name="arrow" size={15} /></a>)}</section>}
          </div>
        </aside>
      </div> : <div className="empty-state"><h1>{loaded ? 'Theme not found' : 'Loading theme…'}</h1><p>{loaded ? 'It may have been moved or removed from the workspace.' : 'Reading the local theme folders.'}</p><Button onClick={onRefresh}>Try again</Button></div>}
    </> : <>
      <div className="library-heading"><h1>Themes</h1><Button onClick={() => setPromptOpen(true)}><Icon name="plus" size={17} />Create theme</Button></div>
      <p className="lead theme-intro">Explore complete print systems: color, typography, components, and page layouts.</p>
      <p className="theme-gallery-label" role="status">{loaded ? `${ordered.length} ${ordered.length === 1 ? 'print system' : 'print systems'}` : 'Reading local themes…'}</p>
      <ThemeGallery themes={ordered} generation={generation} onRefresh={onRefresh} />
      {loaded && themes.length === 0 && <div className="empty-state"><h2>No themes yet</h2><p>Create a print system with your coding agent. Its reviewed PDF will appear here.</p><Button onClick={() => setPromptOpen(true)}>Create theme</Button></div>}
    </>}
    <ThemePromptDialog open={promptOpen} onOpenChange={setPromptOpen} theme={selection ? theme : undefined} />
    <CreateDocumentDialog open={createOpen} onOpenChange={setCreateOpen} theme={theme} />
  </section>;
}
