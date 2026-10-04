import { useEffect, useRef, type ReactNode } from 'react';
import type { HandoffFilters } from './pendingHandoffs';
import { Menu } from '@base-ui/react/menu';
import type { Project } from '../shared/projects';
import { documentName, documentFormat, type DocumentFormat, type DocumentSummary } from '../shared/types';
import { DocumentCard } from './DocumentCard';
import type { DocumentActionHandler } from './DocumentActions';
import type { DocumentView } from './DocumentViewControl';
import { Button, HintButton, IconButton } from './ui';
import { createShortcutKeys, createShortcutLabel, isCreateShortcut } from './createShortcut';
import { Icon } from './ui/Icon';
import type { TagState } from './Tags';
import { FilterBar, FilterChoices, useHashQuery, useSortPreference } from './FilterBar';
import {
  compareNewest, compareText, detailsText, filtering, itemFacets, itemFilterKeys, matchesFilters, matchesSearch, readItemFilters, sortItems, statusRank, type SortOption,
} from './libraryFilters';
import { emptyTags, itemStatus, type TagsManifest } from '../shared/tags';
import { textLang } from '../shared/language';
import './projects.css';

/** Search also matches the type, status, and custom tags, so typing “Minutes” or a client name finds work. */
function searchText(document: DocumentSummary, tags: TagsManifest, extra = '') {
  return `${documentName(document)} ${document.artifact?.meta.description ?? ''} ${extra} ${detailsText(tags, 'documents', document.id)}`;
}

type ViewProps = { view: DocumentView; onViewChange: (view: DocumentView) => void };

const shortcutHint = `Shortcut: ${createShortcutLabel(typeof navigator !== 'undefined' && navigator.platform.includes('Mac'))}`;

/** Alt+N (Option+N on a Mac) does what the page's Create button does, unless something else has the keyboard. */
function useCreateShortcut(onCreate: () => void, enabled: boolean) {
  const create = useRef(onCreate);
  create.current = onCreate;
  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent) => {
      if (!isCreateShortcut(event, event.target as Element | null)) return;
      event.preventDefault();
      create.current();
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [enabled]);
}

const lastEdited: SortOption = { value: 'updated', label: 'Last edited' };
const byTitle: SortOption = { value: 'title', label: 'Title A–Z' };
const byStatus: SortOption = { value: 'status', label: 'By status' };
const byProject: SortOption = { value: 'project', label: 'By project' };

/** Documents in the chosen order; ties fall back to the most recently edited, then the title. */
function sortDocuments(documents: DocumentSummary[], sort: string, manifest: TagsManifest, projectName: (document: DocumentSummary) => string = () => '') {
  const title = (a: DocumentSummary, b: DocumentSummary) => compareText(documentName(a), documentName(b));
  const newest = (a: DocumentSummary, b: DocumentSummary) => compareNewest(a.updatedAt, b.updatedAt);
  if (sort === 'title') return sortItems(documents, title);
  if (sort === 'status') return sortItems(documents, (a, b) => statusRank(itemStatus(manifest, a.id)) - statusRank(itemStatus(manifest, b.id)), newest, title);
  if (sort === 'project') return sortItems(documents, (a, b) => Number(!projectName(a)) - Number(!projectName(b)) || compareText(projectName(a), projectName(b)), newest, title);
  return sortItems(documents, newest, title);
}

/** Filters from the hash query, and the updates that keep it in step. */
function useDocumentFilters() {
  const { params, update } = useHashQuery();
  const filters = readItemFilters(params);
  const query = params.get('q') ?? '';
  return {
    params, filters, query,
    setQuery: (value: string) => update({ q: value }, { replace: true }),
    setFacet: (key: string, value: string) => update({ [key]: value }),
    clearFacets: () => update(Object.fromEntries(itemFilterKeys.map(key => [key, null]))),
    clearAll: (extra: string[] = []) => update(Object.fromEntries(['q', ...itemFilterKeys, ...extra].map(key => [key, null]))),
    update,
  };
}

export function DocumentsBrowser({ format = 'document', projects, documents, tags, loaded, view, onViewChange, onCreate, pending, onMove, onAction, disabled }: ViewProps & {
  format?: DocumentFormat; projects: Project[]; documents: DocumentSummary[]; tags?: TagState; loaded: boolean; onCreate: () => void; onMove: (document: DocumentSummary) => void; onAction: DocumentActionHandler; disabled: boolean;
  /** Creation prompts still waiting for the user's agent, narrowed by this page's filters. */
  pending?: (filters: HandoffFilters) => ReactNode;
}) {
  const { filters, query, setQuery, setFacet, clearFacets, clearAll } = useDocumentFilters();
  const sortOptions = [lastEdited, byTitle, byProject, byStatus];
  const [sort, setSort] = useSortPreference(format === 'presentation' ? 'presentations' : 'documents', sortOptions, 'updated');
  const manifest = tags?.manifest ?? emptyTags();
  const plural = format === 'presentation' ? 'Presentations' : 'Documents';
  const projectById = new Map(projects.map(project => [project.id, project]));
  const projectName = (document: DocumentSummary) => projectById.get(document.projectId ?? '')?.name ?? '';
  const hasFilters = Boolean(query) || filtering(filters);
  const visible = sortDocuments(documents.filter(document => matchesFilters(manifest, 'documents', document, filters)
    && matchesSearch(searchText(document, manifest, projectName(document)), query)), sort, manifest, projectName);
  useCreateShortcut(onCreate, loaded && !disabled);
  return <section className="library-content documents-content">
    <div className="library-heading"><h1>{plural}</h1><HintButton className="primary" data-create-trigger aria-label={`Create ${format}`} aria-keyshortcuts={createShortcutKeys} hint={shortcutHint} onClick={onCreate} disabled={!loaded || disabled}><Icon name="plus" size={17} /><span>Create {format}</span></HintButton></div>
    <FilterBar search={{ label: `Search ${format}s`, value: query, onChange: setQuery }}
      facets={itemFacets(manifest, 'documents', documents, filters)} onFacetChange={setFacet} onClearFacets={clearFacets}
      sort={{ value: sort, options: sortOptions, onChange: setSort }} view={{ value: view, onChange: onViewChange }} />
    {loaded && documents.length > 0 && <p className="library-count" role="status">{visible.length} {visible.length === 1 ? format : plural.toLowerCase()}{hasFilters ? ' matching the filters' : ''}</p>}
    {pending?.({ format, narrowed: hasFilters })}
    <div className={view === 'list' ? 'documents-list' : 'document-grid'} role="list">{visible.map(document => {
      const project = projectById.get(document.projectId ?? '');
      return <article className="project-document" key={document.id} role="listitem">
        <DocumentCard document={document} view={view} onAction={onAction} disabled={disabled} />
        {project ? <a className="document-project-link" href={`#project/${project.id}`}><Icon name="folder" size={15} /><span dir="auto" lang={textLang(project.name)}>{project.name}</span></a>
          : <Button className="text-button document-move" onClick={() => onMove(document)} disabled={!projects.length}>Choose a project</Button>}
      </article>;
    })}</div>
    {!visible.length && <div className="empty-state"><h2>{!loaded ? `Loading ${plural.toLowerCase()}…` : hasFilters ? `No matching ${plural.toLowerCase()}` : `Your ${plural.toLowerCase()} start here`}</h2><p>{!loaded ? 'Opening your local workspace.' : hasFilters ? filtering(filters) ? 'Try other filters, or another title or project name.' : 'Try a different title, project, or tag.' : projects.length ? format === 'presentation' ? 'Create a presentation with your agent and review every slide here.' : 'Create a document in a project, or choose a layout from Templates.' : 'Create your first project using the + beside Projects in the sidebar.'}</p>{loaded && hasFilters && <Button onClick={() => clearAll()}>Clear filters</Button>}</div>}
  </section>;
}

export function ProjectDocuments({ project, documents, tags, loaded, view, onViewChange, onCreate, onCreatePresentation, pending, onSettings, onAction, disabled }: ViewProps & {
  project: Project; documents: DocumentSummary[]; tags?: TagState; loaded: boolean; onCreate: () => void; onCreatePresentation: () => void; onSettings: () => void; onAction: DocumentActionHandler; disabled: boolean;
  /** Creation prompts still waiting for the user's agent, narrowed by this page's filters. */
  pending?: (filters: HandoffFilters) => ReactNode;
}) {
  const { params, filters, query, setQuery, setFacet, clearFacets, clearAll, update } = useDocumentFilters();
  const sortOptions = [lastEdited, byTitle, byStatus];
  const [sort, setSort] = useSortPreference('project', sortOptions, 'updated');
  const requested = params.get('format');
  const format: 'all' | DocumentFormat = requested === 'document' || requested === 'presentation' ? requested : 'all';
  const manifest = tags?.manifest ?? emptyTags();
  // Facets count the documents of the chosen format, so their numbers match what a choice shows.
  const inFormat = documents.filter(document => format === 'all' || documentFormat(document) === format);
  const hasFilters = Boolean(query) || format !== 'all' || filtering(filters);
  const visible = sortDocuments(inFormat.filter(document => matchesFilters(manifest, 'documents', document, filters) && matchesSearch(searchText(document, manifest), query)), sort, manifest);
  const formatCount = (value: DocumentFormat) => documents.filter(document => documentFormat(document) === value).length;
  // Formats are worth a choice only when the project holds both, or one is already chosen.
  const formats = format !== 'all' || (formatCount('document') > 0 && formatCount('presentation') > 0);
  // The shortcut opens Create with the format the page shows, as its menu's first choice does.
  useCreateShortcut(format === 'presentation' ? onCreatePresentation : onCreate, loaded && !disabled);
  return <section className="library-content project-documents">
    <div className="library-heading"><h1 dir="auto" lang={textLang(project.name)}>{project.name}</h1><div className="project-actions">
      <IconButton label="Project settings" onClick={onSettings}><Icon name="gear" size={18} /></IconButton>
      <Menu.Root><Menu.Trigger render={<HintButton className="primary project-create-trigger" data-create-trigger hint={shortcutHint} disabled={!loaded || disabled} />}>
        <Icon name="plus" size={16} /><span>Create</span><Icon name="down" size={14} />
      </Menu.Trigger><Menu.Portal><Menu.Positioner className="ui-positioner" sideOffset={6} align="end"><Menu.Popup className="ui-menu-popup">
        <Menu.Item className="ui-menu-item" onClick={onCreate}><Icon name="document" size={16} />Document</Menu.Item>
        <Menu.Item className="ui-menu-item" onClick={onCreatePresentation}><Icon name="monitor" size={16} />Presentation</Menu.Item>
      </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>
    </div></div>
    <FilterBar search={{ label: 'Search this project', value: query, onChange: setQuery }}
      primary={formats && <FilterChoices label="Format" value={format} onChange={value => update({ format: value === 'all' ? null : value })} choices={[
        { value: 'all', label: 'All', count: documents.length },
        { value: 'document', label: 'Documents', count: formatCount('document') },
        { value: 'presentation', label: 'Presentations', count: formatCount('presentation') },
      ]} />}
      facets={itemFacets(manifest, 'documents', inFormat, filters)} onFacetChange={setFacet} onClearFacets={clearFacets}
      sort={{ value: sort, options: sortOptions, onChange: setSort }} view={{ value: view, onChange: onViewChange }} />
    {loaded && documents.length > 0 && <p className="library-count" role="status">{visible.length} {format === 'all' ? visible.length === 1 ? 'item' : 'items' : visible.length === 1 ? format : `${format}s`}{hasFilters ? ' matching the filters' : ''}</p>}
    {pending?.({ format, narrowed: Boolean(query) || filtering(filters) })}
    <div className={view === 'list' ? 'documents-list' : 'document-grid'} role="list">{visible.map(document => <article className="project-document" key={document.id} role="listitem"><DocumentCard document={document} view={view} onAction={onAction} disabled={disabled} /></article>)}</div>
    {!visible.length && <div className="empty-state"><h2>{!loaded ? 'Loading project…' : hasFilters ? 'No matching items' : 'Your project is ready'}</h2><p>{!loaded ? 'Opening your local workspace.' : hasFilters ? 'Try another search, format, or filter.' : 'Create a document or presentation with your agent.'}</p>{loaded && (hasFilters ? <Button onClick={() => clearAll(['format'])}>Clear filters</Button> : <a href="#templates" className="project-templates-link">Browse templates<Icon name="arrow" size={16} /></a>)}</div>}
  </section>;
}
