import { useEffect, useRef, useState } from 'react';
import type { ThemePreview, ThemeSummary } from '../shared/themes';
import { emptyThemeFolders, folderChildren, tagKey, type ThemeFoldersManifest } from '../shared/theme-folders';
import { documentName, documentFormat, formatLabel, type DocumentSummary } from '../shared/types';
import type { Project } from '../shared/projects';
import { api } from './api';
import { catalogPreview } from './catalogPreview';
import { PdfPage, usePdf } from './Pdf';
import { GuideDialog } from './GuideDialog';
import { AssetThemeDefaults } from './AssetThemeDefaults';
import { CreateDocumentDialog } from './CreateDocumentDialog';
import { Button, Dialog, Input } from './ui';
import { Icon } from './ui/Icon';
import {
  displayPath, FolderBreadcrumb, FolderList, FolderMenu, folderSummary, startThemeDrag, TagFilter, ThemeCardMeta, ThemeFolderDialog, ThemeMenu, themesHash, themesHeadingId,
  useThemeFolderMutations, type ThemeFolderAction, type ThemeOrganization,
} from './ThemeFolders';
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
      <Dialog.Description>Use this skill in your coding agent in the OpenDoc workspace. {theme ? `Say whether to revise ${theme.name} or build a new theme from it; a revision also changes documents already using it. Describe the changes and share any visual references.` : 'Describe the theme you want and share any visual references.'}</Dialog.Description>
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

type GalleryOrganization = { manifest: ThemeFoldersManifest; showFolder: boolean; disabled: boolean; onAction: (action: ThemeFolderAction) => void };
function ThemeGallery({ themes, generation, onRefresh, organize }: { themes: ThemeSummary[]; generation: number; onRefresh: () => void; organize?: GalleryOrganization }) {
  return <div className="theme-gallery">{themes.map(theme => <article className="theme-gallery-card" key={theme.id} onDragStart={organize && !organize.disabled ? event => startThemeDrag(event, theme.id) : undefined}>
    <div className="theme-gallery-preview"><ThemeSpecimen theme={theme} generation={generation} onRefresh={onRefresh} /><ThemePalette theme={theme} compact /><a className="theme-preview-link" href={`#themes/${theme.id}`} aria-label={`Explore ${theme.name}`} />{organize && <ThemeMenu theme={theme} disabled={organize.disabled} onAction={organize.onAction} />}</div>
    <h2><a href={`#themes/${theme.id}`}><bdi>{theme.name}</bdi><Icon name="arrow" size={17} /></a></h2>
    {theme.description && <p className="theme-gallery-description" dir="auto">{theme.description}</p>}
    {organize && <ThemeCardMeta theme={theme} manifest={organize.manifest} showFolder={organize.showFolder} />}
  </article>)}</div>;
}

export function ThemesBrowser({ themes, selection, generation, loaded, documents, projects, onRefresh, connected = true, organization, folder = '', tag = '', onOrganizationChange }: {
  themes: ThemeSummary[]; selection: string; generation: number; loaded: boolean; documents: DocumentSummary[]; projects: Project[]; onRefresh: () => void; connected?: boolean;
  /** Optional folders and tags; without them the catalog is one flat gallery. */
  organization?: ThemeOrganization; folder?: string; tag?: string; onOrganizationChange?: (manifest: ThemeFoldersManifest) => void;
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
  const manifest = organization?.manifest ?? emptyThemeFolders();
  const organizing = Boolean(onOrganizationChange) && !organization?.error;
  const [folderAction, setFolderAction] = useState<ThemeFolderAction | null>(null);
  const mutations = useThemeFolderMutations(next => onOrganizationChange?.(next));
  const activeTag = tag ? tagKey(tag) : '';
  const currentFolder = folder ? manifest.folders.find(item => item.id === folder) : undefined;
  const inFolder = Boolean(currentFolder) && !activeTag;
  const missingFolder = Boolean(folder) && !currentFolder && !activeTag;
  const tagLabel = activeTag ? Object.values(manifest.tags).flat().find(item => tagKey(item) === activeTag) ?? tag : '';
  const visible = activeTag ? ordered.filter(theme => (manifest.tags[theme.id] ?? []).some(item => tagKey(item) === activeTag))
    : missingFolder ? [] : ordered.filter(theme => (manifest.assignments[theme.id] ?? '') === (currentFolder?.id ?? ''));
  const subfolders = activeTag || missingFolder ? [] : folderChildren(manifest, currentFolder?.id ?? null);
  const visited = useRef(folder);
  useEffect(() => {
    // Folder navigation is a page change: start at the top and announce the new title.
    if (visited.current === folder) return;
    visited.current = folder;
    if (!selection) { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); document.getElementById(themesHeadingId)?.focus({ preventScroll: true }); }
  }, [folder, selection]);
  const onFolderAction = (action: ThemeFolderAction) => {
    if (action.kind === 'delete' && folderSummary(manifest, themes, action.folder.id).empty) { void mutations.deleteEmptyFolder(action.folder); return; }
    setFolderAction(action);
  };
  const dropTheme = organizing && connected ? (themeId: string, folderId: string | null) => {
    const dragged = themes.find(item => item.id === themeId);
    if (dragged && (manifest.assignments[themeId] ?? null) !== folderId) void mutations.moveTheme(dragged, folderId);
  } : undefined;
  const emptyFolder = loaded && inFolder && !visible.length && !subfolders.length;
  const themeFolder = theme ? manifest.folders.find(item => item.id === manifest.assignments[theme.id]) : undefined;
  const themeTags = theme ? manifest.tags[theme.id] ?? [] : [];
  return <section className="library-content themes-content">
    {selection ? <>
      <a href={themeFolder ? themesHash({ folder: themeFolder.id }) : '#themes'} className="theme-back"><Icon name="left" size={16} />{themeFolder ? themeFolder.name : 'All themes'}</a>
      {theme ? <div className="theme-detail-layout">
        <ThemeSpecimen key={theme.id} theme={theme} generation={generation} allPages onRefresh={onRefresh} />
        <aside className="theme-options">
          <header><h1 dir="auto">{theme.name}</h1><p className="lead" dir="auto">{theme.description}</p></header>
          <div className="theme-actions"><Button className="primary" disabled={Boolean(theme.error)} onClick={() => setCreateOpen(true)}>Create with this theme</Button><Button onClick={() => setPromptOpen(true)} aria-describedby="theme-adapt-hint">Adapt this theme</Button><p id="theme-adapt-hint" className="theme-action-hint">Have your coding agent revise this theme or build a new one from it.</p><GuideDialog key={theme.id} kind="theme" id={theme.id} name={theme.name} generation={theme.revision ?? generation} /></div>
          {theme.assetError && <p className="field-error" role="alert">{theme.assetError}</p>}
          <AssetThemeDefaults key={theme.id} themeId={theme.id} generation={generation} connected={connected} />
          <div className="theme-system-details">
            <ThemePalette theme={theme} />
            <section><h2>Typography</h2><dl className="theme-type-details"><div><dt>Headings</dt><dd>{theme.heading}</dd></div><div><dt>Body</dt><dd>{theme.body}</dd></div><div><dt>Page</dt><dd>{theme.pageSize}</dd></div></dl></section>
            {Boolean(theme.geometry?.length) && <section><h2>Geometry &amp; layout</h2><ul>{theme.geometry!.map(rule => <li key={rule}>{rule}</li>)}</ul></section>}
            {theme.principles.length > 0 && <section><h2>System rules</h2><ul>{theme.principles.map(principle => <li key={principle}>{principle}</li>)}</ul></section>}
            {theme.useFor.length > 0 && <section><h2>Works well for</h2><p>{theme.useFor.join(' · ')}</p></section>}
            {usingDocuments.length > 0 && <section className="theme-used-by"><h2>Documents using {theme.name}</h2>{usingDocuments.map(document => <a key={document.id} href={`#document/${document.id}`}><Icon name={documentFormat(document) === 'presentation' ? 'monitor' : 'document'} size={16} /><span><bdi>{documentName(document)}</bdi><span className="theme-used-format"> · {formatLabel(documentFormat(document))}</span></span><Icon name="arrow" size={15} /></a>)}</section>}
            {defaultProjects.length > 0 && <section className="theme-used-by"><h2>Project default</h2>{defaultProjects.map(project => <a key={project.id} href={`#project/${project.id}`}><Icon name="folder" size={16} /><span dir="auto">{project.name}</span><Icon name="arrow" size={15} /></a>)}</section>}
            {organizing && (themeFolder || themeTags.length > 0) && <section className="theme-organization"><h2>Folder &amp; tags</h2>
              <dl><div><dt>Folder</dt><dd>{themeFolder ? <a href={themesHash({ folder: themeFolder.id })}>{displayPath(manifest, themeFolder.id)}</a> : 'Themes (top level)'}</dd></div><div><dt>Tags</dt><dd>{themeTags.length ? themeTags.join(' · ') : 'None'}</dd></div></dl>
              <div className="theme-organization-actions"><Button className="text-button" data-theme-menu={theme.id} disabled={!connected} onClick={() => setFolderAction({ kind: 'move-theme', theme })}>Move to folder…</Button><Button className="text-button" disabled={!connected} onClick={() => setFolderAction({ kind: 'tags', theme })}>Edit tags…</Button></div>
            </section>}
          </div>
        </aside>
      </div> : <div className="empty-state"><h1>{loaded ? 'Theme not found' : 'Loading theme…'}</h1><p>{loaded ? 'It may have been moved or removed from the workspace.' : 'Reading the local theme folders.'}</p><Button onClick={onRefresh}>Try again</Button></div>}
    </> : <>
      {organization?.error && <p className="field-error" role="alert">{organization.error}</p>}
      {inFolder && <FolderBreadcrumb manifest={manifest} folderId={currentFolder!.id} onDropTheme={dropTheme} />}
      <div className="library-heading">{inFolder
        ? <div className="theme-folder-title"><h1 id={themesHeadingId} tabIndex={-1}>{currentFolder!.name}</h1><FolderMenu folder={currentFolder!} disabled={!connected} onAction={onFolderAction} /></div>
        : <h1 id={themesHeadingId} tabIndex={-1}>Themes</h1>}
        <div className="theme-heading-actions">{organizing && !activeTag && !missingFolder && <Button data-new-folder disabled={!loaded || !connected} onClick={() => setFolderAction({ kind: 'create', parent: currentFolder?.id ?? null })}><Icon name="folderPlus" size={17} />New folder</Button>}<Button onClick={() => setPromptOpen(true)}><Icon name="plus" size={17} />Create theme</Button></div></div>
      {!inFolder && <p className="lead theme-intro">Explore complete print systems: color, typography, components, and page layouts.</p>}
      {organizing && <TagFilter manifest={manifest} themes={themes} tag={tag} onChange={value => { location.hash = themesHash({ folder, tag: value }); }} />}
      {organizing && <FolderList folders={subfolders} manifest={manifest} themes={themes} disabled={!connected} onAction={onFolderAction} onDropTheme={dropTheme} />}
      <p className="theme-gallery-label" role="status" hidden={emptyFolder}>{loaded ? `${visible.length} ${visible.length === 1 ? 'print system' : 'print systems'}${activeTag ? ` tagged “${tagLabel}”` : ''}` : 'Reading local themes…'}</p>
      <ThemeGallery themes={visible} generation={generation} onRefresh={onRefresh} organize={organizing ? { manifest, showFolder: Boolean(activeTag), disabled: !connected, onAction: onFolderAction } : undefined} />
      {loaded && themes.length === 0 && <div className="empty-state"><h2>No themes yet</h2><p>Create a print system with your coding agent. Its reviewed PDF will appear here.</p><Button onClick={() => setPromptOpen(true)}>Create theme</Button></div>}
      {loaded && themes.length > 0 && activeTag && !visible.length && <div className="empty-state"><h2>No themes tagged “{tagLabel}”</h2><p>Choose another tag, or show every theme.</p><Button onClick={() => { location.hash = themesHash({ folder }); }}>Clear filter</Button></div>}
      {loaded && missingFolder && <div className="empty-state"><h2>Folder not found</h2><p>It may have been deleted or moved by another window. Your themes are still in the library.</p><a href={themesHash()} className="project-templates-link">Back to Themes<Icon name="arrow" size={16} /></a></div>}
      {emptyFolder && <div className="empty-state theme-folder-empty"><h2>This folder is empty</h2><p>Choose Move to folder… from any theme’s options menu, or drag a theme card onto this folder from the folder that contains it. Use New folder to nest folders here.</p></div>}
    </>}
    <ThemePromptDialog open={promptOpen} onOpenChange={setPromptOpen} theme={selection ? theme : undefined} />
    <CreateDocumentDialog open={createOpen} onOpenChange={setCreateOpen} theme={theme} />
    {organizing && <ThemeFolderDialog action={folderAction} manifest={manifest} themes={themes} connected={connected} onClose={() => setFolderAction(null)} onChange={next => onOrganizationChange?.(next)} />}
  </section>;
}
