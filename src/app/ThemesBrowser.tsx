import { useEffect, useRef, useState } from 'react';
import type { ThemePreview, ThemeSummary } from '../shared/themes';
import { textLang } from '../shared/language';
import { emptyThemeFolders, folderCounts, inFolder, themeFolder as folderOf, type ThemeFoldersManifest } from '../shared/theme-folders';
import { emptyTags, filterKey, itemCustomTags } from '../shared/tags';
import { documentName, documentFormat, formatLabel, type DocumentSummary } from '../shared/types';
import { projectThemeDefaults, type Project } from '../shared/projects';
import { api } from './api';
import { catalogPreview } from './catalogPreview';
import { PdfPage, usePdf } from './Pdf';
import { GuideDialog } from './GuideDialog';
import { AssetThemeDefaults } from './AssetThemeDefaults';
import type { CreatePreset } from './CreateDocumentDialog';
import { Button, Dialog, Input } from './ui';
import { Icon } from './ui/Icon';
import {
  FolderFilter, isolate, startThemeDrag, ThemeCardMeta, ThemeFolderDialog, ThemeMenu, themesHash, themesHeadingId,
  useThemeFolderMutations, type ThemeFolderAction, type ThemeOrganization,
} from './ThemeFolders';
import { tagText, type TagState, type TagTarget } from './Tags';
import { FilterBar, useHashQuery, useSortPreference } from './FilterBar';
import { compareNewest, compareText, filtering, hashWith, itemFacets, splitHash, matchesFilters, matchesSearch, noFilters, sortItems, type ItemFilterValue, type SortOption } from './libraryFilters';
import './themes.css';

/** The one loading state of a theme preview, from before its PDF arrives until a card's first page is drawn. */
function PreviewPlaceholder() {
  return <div className="theme-preview-placeholder" role="status"><Icon name="document" size={24} /><p>Preparing preview…</p></div>;
}

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
      : pdf ? <>
        {Array.from({ length: allPages ? pdf.numPages : 1 }, (_, index) => <PdfPage key={index} pdf={pdf} number={index + 1} width={pageWidth} thumbnail={!allPages} onNavigate={page => frame.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ behavior: 'auto', block: 'start' })} />)}
        {/* A gallery card keeps the placeholder over its page until the page is drawn; see themes.css. */}
        {!allPages && <PreviewPlaceholder />}
      </> : <PreviewPlaceholder />}
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
        : <PreviewPlaceholder />}
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
    catch { setError('Copying isn’t available here. Select the skill name and copy it manually.'); field.current?.focus(); field.current?.select(); }
  }
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" />
    <Dialog.Popup className="help-dialog">
      <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close" />}><Icon name="close" /></Dialog.Close>
      <Dialog.Title>{theme ? `Adapt ${theme.name}` : 'Create a theme'}</Dialog.Title>
      <Dialog.Description>Copy the skill and paste it into your coding agent in this workspace. {theme ? `Then say whether to revise ${theme.name} or build a new theme from it; a revision also changes documents already using it. Describe the changes and share any visual references.` : 'Then describe the theme you want and share any visual references. It appears here when it’s ready.'}</Dialog.Description>
      <Input ref={field} className="prompt-example skill-invocation" aria-label="Theme creation skill" readOnly value={prompt} />
      <Button className="primary" onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copied' : 'Copy skill'}</Button>
      <span className="sr-only" role="status">{copied ? 'Skill copied. Paste it into your agent.' : ''}</span>
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

type GalleryOrganization = { manifest: ThemeFoldersManifest; tags: Record<string, string[]>; folders: boolean; tagging: boolean; showFolder: boolean; tag: string; disabled: boolean; onAction: (action: ThemeFolderAction) => void };
function ThemeGallery({ themes, generation, onRefresh, organize }: { themes: ThemeSummary[]; generation: number; onRefresh: () => void; organize?: GalleryOrganization }) {
  return <div className="theme-gallery">{themes.map(theme => <article className="theme-gallery-card" key={theme.id} onDragStart={organize?.folders && !organize.disabled ? event => startThemeDrag(event, theme.id) : undefined}>
    <div className="theme-gallery-preview"><ThemeSpecimen theme={theme} generation={generation} onRefresh={onRefresh} /><ThemePalette theme={theme} compact /><a className="theme-preview-link" href={`#themes/${theme.id}`} aria-label={`Explore ${theme.name}`} />{organize && <ThemeMenu theme={theme} disabled={organize.disabled} folders={organize.folders} tags={organize.tagging} onAction={organize.onAction} />}</div>
    <h2><a href={`#themes/${theme.id}`}><bdi lang={textLang(theme.name, theme.language)}>{theme.name}</bdi><Icon name="arrow" size={17} /></a></h2>
    {theme.description && <p className="theme-gallery-description" dir="auto" lang={textLang(theme.description, theme.language)}>{theme.description}</p>}
    {organize && <ThemeCardMeta theme={theme} manifest={organize.manifest} tags={organize.tags[theme.id] ?? []} showFolder={organize.showFolder} tag={organize.tag} />}
  </article>)}</div>;
}

/** The gallery filters last shown, so a theme page returns to the same view. */
let galleryHash = themesHash();

const sortOptions: SortOption[] = [{ value: 'title', label: 'Name A–Z' }, { value: 'updated', label: 'Last edited' }];

export function ThemesBrowser({ themes, selection, generation, loaded, documents, projects, onRefresh, onCreate, connected = true, organization, onOrganizationChange, tags, onEditTags }: {
  themes: ThemeSummary[]; selection: string; generation: number; loaded: boolean; documents: DocumentSummary[]; projects: Project[]; onRefresh: () => void; connected?: boolean;
  /** Opens the shared creation handoff with this theme chosen. */
  onCreate?: (preset: CreatePreset) => void;
  /** Optional folders; without them the catalog is one flat gallery. The folder and filters come from the hash query. */
  organization?: ThemeOrganization; onOrganizationChange?: (manifest: ThemeFoldersManifest) => void;
  /** Optional workspace tags, filtered here and edited through the shared tag editor. */
  tags?: TagState; onEditTags?: (target: TagTarget) => void;
}) {
  const theme = themes.find(theme => theme.id === selection);
  const [promptOpen, setPromptOpen] = useState(false);
  useEffect(() => { setPromptOpen(false); window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }, [selection]);
  useEffect(() => {
    void api('/api/context', { method: 'POST', body: JSON.stringify({ projectId: null, documentId: null, blockId: null, page: 1, themeId: theme?.id ?? null, selectedAsset: null }) }).catch(() => {});
  }, [theme?.id]);
  const usingDocuments = documents.filter(document => document.artifact?.meta.theme === theme?.id && theme);
  // A project can name this theme for documents, presentations, or both.
  const defaultProjects = theme ? projects.flatMap(project => {
    const defaults = projectThemeDefaults(project);
    const label = defaults.document === theme.id ? defaults.presentation === theme.id ? 'Documents and presentations' : 'Documents' : defaults.presentation === theme.id ? 'Presentations' : '';
    return label ? [{ project, label }] : [];
  }) : [];
  const { params, update } = useHashQuery();
  const folder = params.get('folder') ?? '';
  const query = params.get('q') ?? '';
  const [sort, setSort] = useSortPreference('themes', sortOptions, 'title');
  const manifest = organization?.manifest ?? emptyThemeFolders();
  const organizing = Boolean(onOrganizationChange) && !organization?.error;
  const tagManifest = tags?.manifest ?? emptyTags();
  const tagging = Boolean(onEditTags) && !tags?.error;
  const editTags = (theme: ThemeSummary, returnFocus: string) => onEditTags?.({ kind: 'themes', id: theme.id, name: theme.name, returnFocus });
  const [folderAction, setFolderAction] = useState<ThemeFolderAction | null>(null);
  const mutations = useThemeFolderMutations(next => onOrganizationChange?.(next));
  // Older links name a tag by its label; both resolve to the stored key.
  const tag = params.get('tag') ?? '';
  const filters: ItemFilterValue = { ...noFilters, tag: tag && tagging ? filterKey(tag) : '', language: params.get('language') ?? '' };
  // Every theme is listed; a folder, the search, and the filters narrow the gallery together.
  const folderFilter = organizing ? folder : '';
  const currentFolder = folderFilter ? manifest.folders.find(item => item.id === folderFilter) : undefined;
  const missingFolder = Boolean(folderFilter) && !currentFolder;
  const inCurrentFolder = missingFolder ? [] : themes.filter(theme => inFolder(manifest, theme.id, currentFolder?.id));
  const narrowed = Boolean(query) || filtering(filters);
  const visible = sortItems(inCurrentFolder.filter(theme => matchesFilters(tagManifest, 'themes', theme, filters)
    && matchesSearch(`${theme.name} ${theme.description} ${itemCustomTags(tagManifest, 'themes', theme.id).join(' ')}`, query)),
  ...(sort === 'updated' ? [(a: ThemeSummary, b: ThemeSummary) => compareNewest(a.updatedAt, b.updatedAt)] : []), (a, b) => compareText(a.name, b.name));
  // Tags are offered only while they can be edited; language is always derived.
  const facets = itemFacets(tagManifest, 'themes', inCurrentFolder, filters).filter(facet => facet.key !== 'tag' || tagging);
  const folderEmpty = Boolean(currentFolder) && !folderCounts(manifest, themes.map(item => item.id)).get(currentFolder!.id);
  const clearFilters = () => update({ q: null, tag: null, language: null });
  const showAllHash = () => hashWith(location.hash, { folder: null });
  // The hash can change a render before the selection does, so read the gallery's own address.
  const hashQuery = params.toString();
  useEffect(() => { if (!selection && splitHash(location.hash).path === 'themes') galleryHash = location.hash; }, [selection, hashQuery]);
  const onFolderAction = (action: ThemeFolderAction) => {
    if (action.kind === 'tags') { editTags(action.theme, `[data-theme-menu="${action.theme.id}"]`); return; }
    if (action.kind === 'delete' && !folderCounts(manifest, themes.map(item => item.id)).get(action.folder.id)) { void mutations.deleteEmptyFolder(action.folder); return; }
    setFolderAction(action);
  };
  const dropTheme = organizing && connected ? (themeId: string, folderId: string | null) => {
    const dragged = themes.find(item => item.id === themeId);
    if (dragged && (manifest.assignments[themeId] ?? null) !== folderId) void mutations.moveTheme(dragged, folderId);
  } : undefined;
  const themeFolder = theme ? folderOf(manifest, theme.id) : undefined;
  const themeTags = theme ? tagManifest.themes[theme.id] ?? [] : [];
  // Custom tags appear on a theme's page and in its Tags editor, not on gallery cards.
  const cardTags: Record<string, string[]> = {};
  const summary = `${visible.length} ${visible.length === 1 ? 'print system' : 'print systems'}${currentFolder ? ` in “${isolate(currentFolder.name)}”` : ''}${narrowed ? ' matching the filters' : ''}`;
  return <section className="library-content themes-content">
    {selection ? <>
      <a href={galleryHash} className="theme-back"><Icon name="left" size={16} />Themes</a>
      {theme ? <div className="theme-detail-layout">
        <ThemeSpecimen key={theme.id} theme={theme} generation={generation} allPages onRefresh={onRefresh} />
        <aside className="theme-options">
          <header><h1 dir="auto" lang={textLang(theme.name, theme.language)}>{theme.name}</h1><p className="lead" dir="auto" lang={textLang(theme.description, theme.language)}>{theme.description}</p></header>
          <div className="theme-actions"><Button className="primary" disabled={Boolean(theme.error)} onClick={() => onCreate?.({ themeId: theme.id })}>Create with this theme</Button><Button onClick={() => setPromptOpen(true)} aria-describedby="theme-adapt-hint">Adapt this theme</Button><p id="theme-adapt-hint" className="theme-action-hint">Have your coding agent revise this theme or build a new one from it.</p><GuideDialog key={theme.id} kind="theme" id={theme.id} name={theme.name} generation={theme.revision ?? generation} /></div>
          {theme.assetError && <p className="field-error" role="alert">{theme.assetError}</p>}
          <AssetThemeDefaults key={theme.id} themeId={theme.id} generation={generation} connected={connected} />
          <div className="theme-system-details">
            <ThemePalette theme={theme} />
            <section><h2>Typography</h2><dl className="theme-type-details"><div><dt>Headings</dt><dd>{theme.heading}</dd></div><div><dt>Body</dt><dd>{theme.body}</dd></div><div><dt>Page</dt><dd>{theme.pageSize}</dd></div></dl></section>
            {Boolean(theme.geometry?.length) && <section><h2>Geometry &amp; layout</h2><ul>{theme.geometry!.map(rule => <li key={rule}>{rule}</li>)}</ul></section>}
            {theme.principles.length > 0 && <section><h2>System rules</h2><ul>{theme.principles.map(principle => <li key={principle}>{principle}</li>)}</ul></section>}
            {theme.useFor.length > 0 && <section><h2>Works well for</h2><p>{theme.useFor.join(' · ')}</p></section>}
            {usingDocuments.length > 0 && <section className="theme-used-by"><h2>Documents using {theme.name}</h2>{usingDocuments.map(document => <a key={document.id} href={`#document/${document.id}`}><Icon name={documentFormat(document) === 'presentation' ? 'monitor' : 'document'} size={16} /><span><bdi>{documentName(document)}</bdi><span className="theme-used-format"> · {formatLabel(documentFormat(document))}</span></span><Icon name="arrow" size={15} /></a>)}</section>}
            {defaultProjects.length > 0 && <section className="theme-used-by"><h2>Project default</h2>{defaultProjects.map(({ project, label }) => <a key={project.id} href={`#project/${project.id}`}><Icon name="folder" size={16} /><span><bdi lang={textLang(project.name)}>{project.name}</bdi><span className="theme-used-format"> · {label}</span></span><Icon name="arrow" size={15} /></a>)}</section>}
            {(organizing || tagging) && (themeFolder || themeTags.length > 0) && <section className="theme-organization"><h2>{organizing && tagging ? <>Folder &amp; tags</> : organizing ? 'Folder' : 'Tags'}</h2>
              <dl>{organizing && <div><dt>Folder</dt><dd>{themeFolder ? <a href={themesHash({ folder: themeFolder.id })} dir="auto" lang={textLang(themeFolder.name)}>{themeFolder.name}</a> : 'None'}</dd></div>}{tagging && <div><dt>Tags</dt><dd>{themeTags.length ? tagText(themeTags) : 'None'}</dd></div>}</dl>
              <div className="theme-organization-actions">{organizing && <Button className="text-button" data-theme-menu={theme.id} disabled={!connected} onClick={() => setFolderAction({ kind: 'move-theme', theme })}>Move to folder…</Button>}{tagging && <Button className="text-button" data-theme-tags={theme.id} disabled={!connected} onClick={() => editTags(theme, `[data-theme-tags="${theme.id}"]`)}>Edit tags…</Button>}</div>
            </section>}
          </div>
        </aside>
      </div> : <div className="empty-state"><h1>{loaded ? 'Theme not found' : 'Loading theme…'}</h1><p>{loaded ? 'It may have been moved or removed from the workspace.' : 'Reading the local theme folders.'}</p><Button onClick={onRefresh}>Try again</Button></div>}
    </> : <>
      {organization?.error && <p className="field-error" role="alert">{organization.error}</p>}
      <div className="library-heading"><h1 id={themesHeadingId} tabIndex={-1}>Themes</h1>
        <div className="theme-heading-actions"><Button onClick={() => setPromptOpen(true)}><Icon name="plus" size={17} />Create theme</Button></div></div>
      <FilterBar search={{ label: 'Search themes', value: query, onChange: value => update({ q: value }, { replace: true }) }}
        primary={organizing && <FolderFilter manifest={manifest} themes={themes} value={folderFilter} disabled={!loaded || !connected} onChange={value => update({ folder: value })} onAction={onFolderAction} onDropTheme={dropTheme} />}
        facets={facets} onFacetChange={(key, value) => update({ [key]: value })} onClearFacets={() => update({ tag: null, language: null })}
        sort={{ value: sort, options: sortOptions, onChange: setSort }} />
      <p className="theme-gallery-label" role="status">{loaded ? summary : 'Reading local themes…'}</p>
      <ThemeGallery themes={visible} generation={generation} onRefresh={onRefresh} organize={organizing || tagging ? { manifest, tags: cardTags, folders: organizing, tagging, showFolder: organizing && !currentFolder, tag: filters.tag, disabled: !connected, onAction: onFolderAction } : undefined} />
      {loaded && themes.length === 0 && <div className="empty-state"><h2>No themes yet</h2><p>Create a print system with your coding agent. Its reviewed PDF will appear here.</p><Button onClick={() => setPromptOpen(true)}>Create theme</Button></div>}
      {loaded && missingFolder && <div className="empty-state"><h2>Folder not found</h2><p>It may have been deleted or renamed in another window. Your themes are still in the library.</p><a href={showAllHash()} className="project-templates-link">Show all themes<Icon name="arrow" size={16} /></a></div>}
      {loaded && folderEmpty && <div className="empty-state theme-folder-empty"><h2><bdi lang={textLang(currentFolder!.name)}>{currentFolder!.name}</bdi> is empty</h2><p>Drag a theme card onto the <bdi lang={textLang(currentFolder!.name)}>{currentFolder!.name}</bdi> button, or choose Move to folder… from a theme’s options menu.</p><a href={showAllHash()} className="project-templates-link">Show all themes<Icon name="arrow" size={16} /></a></div>}
      {loaded && themes.length > 0 && !missingFolder && !folderEmpty && narrowed && !visible.length && <div className="empty-state"><h2>No matching themes{currentFolder && <> in <bdi lang={textLang(currentFolder.name)}>{currentFolder.name}</bdi></>}</h2><p>{currentFolder ? 'Try another search or filter, or choose another folder.' : 'Try another search or filter.'}</p><Button onClick={clearFilters}>Clear filters</Button></div>}
    </>}
    <ThemePromptDialog open={promptOpen} onOpenChange={setPromptOpen} theme={selection ? theme : undefined} />
    {organizing && <ThemeFolderDialog action={folderAction?.kind === 'tags' ? null : folderAction} manifest={manifest} themes={themes} connected={connected} onClose={() => setFolderAction(null)} onChange={next => onOrganizationChange?.(next)} />}
  </section>;
}
