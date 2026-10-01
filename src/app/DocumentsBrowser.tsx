import { useState, type ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import type { Project } from '../shared/projects';
import { documentName, documentFormat, type DocumentFormat, type DocumentSummary } from '../shared/types';
import { DocumentCard } from './DocumentCard';
import type { DocumentActionHandler } from './DocumentActions';
import { DocumentViewControl, type DocumentView } from './DocumentViewControl';
import { Button, IconButton, SelectControl } from './ui';
import { SearchField } from './SearchField';
import { Icon } from './ui/Icon';
import { matchesTag, TagFilter, type TagState } from './Tags';
import { emptyTags, tagLabel, type TagsManifest } from '../shared/tags';
import './projects.css';

/** Search also matches tag labels, so typing “Finance” finds tagged work. */
function searchText(document: DocumentSummary, tags: TagsManifest, extra = '') {
  return `${documentName(document)} ${document.artifact?.meta.description ?? ''} ${extra} ${(tags.documents[document.id] ?? []).map(tagLabel).join(' ')}`.toLowerCase();
}

type ViewProps = { view: DocumentView; onViewChange: (view: DocumentView) => void };

function DocumentTools({ noun = 'document', query, onQueryChange, view, onViewChange, filter }: ViewProps & { noun?: string; query: string; onQueryChange: (query: string) => void; filter?: ReactNode }) {
  return <div className="library-tools document-browser-tools">
    <SearchField label={`Search ${noun}s`} value={query} onValueChange={onQueryChange} />
    {filter}
    <div className="document-view-tools"><DocumentViewControl value={view} onChange={onViewChange} /></div>
  </div>;
}

export function DocumentsBrowser({ format = 'document', projects, documents, tags, loaded, view, onViewChange, onCreate, onMove, onAction, disabled }: ViewProps & {
  format?: DocumentFormat; projects: Project[]; documents: DocumentSummary[]; tags?: TagState; loaded: boolean; onCreate: () => void; onMove: (document: DocumentSummary) => void; onAction: DocumentActionHandler; disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const manifest = tags?.manifest ?? emptyTags();
  const plural = format === 'presentation' ? 'Presentations' : 'Documents';
  const projectById = new Map(projects.map(project => [project.id, project]));
  const hasFilters = Boolean(query) || Boolean(tag);
  const visible = documents.filter(document => matchesTag(manifest, 'documents', document.id, tag)
    && searchText(document, manifest, projectById.get(document.projectId ?? '')?.name).includes(query.toLowerCase()));
  return <section className="library-content documents-content">
    <div className="library-heading"><h1>{plural}</h1><Button className="primary" aria-label={`Create ${format}`} onClick={onCreate} disabled={!loaded || disabled}><Icon name="plus" size={17} /><span>Create {format}</span></Button></div>
    <DocumentTools noun={format} query={query} onQueryChange={setQuery} view={view} onViewChange={onViewChange}
      filter={<TagFilter manifest={manifest} kind="documents" ids={documents.map(document => document.id)} value={tag} onChange={setTag} />} />
    <div className={view === 'list' ? 'documents-list' : 'document-grid'} role="list">{visible.map(document => {
      const project = projectById.get(document.projectId ?? '');
      return <article className="project-document" key={document.id} role="listitem">
        <DocumentCard document={document} view={view} tags={manifest.documents[document.id]} onAction={onAction} disabled={disabled} onOpen={() => { location.hash = `document/${document.id}`; }} />
        {project ? <a className="document-project-link" href={`#project/${project.id}`}><Icon name="folder" size={15} /><span dir="auto">{project.name}</span></a>
          : <Button className="text-button document-move" onClick={() => onMove(document)} disabled={!projects.length}>Choose a project</Button>}
      </article>;
    })}</div>
    {!visible.length && <div className="empty-state"><h2>{!loaded ? `Loading ${plural.toLowerCase()}…` : hasFilters ? `No matching ${plural.toLowerCase()}` : `Your ${plural.toLowerCase()} start here`}</h2><p>{!loaded ? 'Opening your local workspace.' : hasFilters ? tag ? 'Try another tag, title, or project name.' : 'Try a different title, project, or tag.' : projects.length ? format === 'presentation' ? 'Create a presentation with your agent and review every slide here.' : 'Create a document in a project, or choose a layout from Templates.' : 'Create your first project using the + beside Projects in the sidebar.'}</p>{loaded && hasFilters && <Button onClick={() => { setQuery(''); setTag(''); }}>Clear filters</Button>}</div>}
  </section>;
}

export function ProjectDocuments({ project, documents, tags, loaded, view, onViewChange, onCreate, onCreatePresentation, onSettings, onAction, disabled }: ViewProps & {
  project: Project; documents: DocumentSummary[]; tags?: TagState; loaded: boolean; onCreate: () => void; onCreatePresentation: () => void; onSettings: () => void; onAction: DocumentActionHandler; disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<'all' | DocumentFormat>('all');
  const [tag, setTag] = useState('');
  const manifest = tags?.manifest ?? emptyTags();
  const hasFilters = Boolean(query) || format !== 'all' || Boolean(tag);
  const visible = documents.filter(document => (format === 'all' || documentFormat(document) === format)
    && matchesTag(manifest, 'documents', document.id, tag) && searchText(document, manifest).includes(query.toLowerCase()));
  return <section className="library-content project-documents">
    <div className="library-heading"><h1 dir="auto">{project.name}</h1><div className="project-actions">
      <IconButton label="Project settings" onClick={onSettings}><Icon name="gear" size={18} /></IconButton>
      <Menu.Root><Menu.Trigger render={<Button className="primary project-create-trigger" disabled={!loaded || disabled} />}>
        <Icon name="plus" size={16} /><span>Create</span><Icon name="down" size={14} />
      </Menu.Trigger><Menu.Portal><Menu.Positioner className="ui-positioner" sideOffset={6} align="end"><Menu.Popup className="ui-menu-popup">
        <Menu.Item className="ui-menu-item" onClick={onCreate}><Icon name="document" size={16} />Document</Menu.Item>
        <Menu.Item className="ui-menu-item" onClick={onCreatePresentation}><Icon name="monitor" size={16} />Presentation</Menu.Item>
      </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>
    </div></div>
    <DocumentTools noun="item" query={query} onQueryChange={setQuery} view={view} onViewChange={onViewChange}
      filter={<><SelectControl label="Filter by format" value={format} onValueChange={value => { if (value === 'all' || value === 'document' || value === 'presentation') setFormat(value); }} items={[
        { label: 'All formats', value: 'all' }, { label: 'Documents', value: 'document' }, { label: 'Presentations', value: 'presentation' },
      ]} /><TagFilter manifest={manifest} kind="documents" ids={documents.map(document => document.id)} value={tag} onChange={setTag} /></>} />
    <div className={view === 'list' ? 'documents-list' : 'document-grid'} role="list">{visible.map(document => <article className="project-document" key={document.id} role="listitem"><DocumentCard document={document} view={view} tags={manifest.documents[document.id]} onAction={onAction} disabled={disabled} onOpen={() => { location.hash = `document/${document.id}`; }} /></article>)}</div>
    {!visible.length && <div className="empty-state"><h2>{!loaded ? 'Loading project…' : hasFilters ? 'No matching items' : 'Your project is ready'}</h2><p>{!loaded ? 'Opening your local workspace.' : hasFilters ? 'Try another search, format, or tag.' : 'Create a document or presentation with your agent.'}</p>{loaded && (hasFilters ? <Button onClick={() => { setQuery(''); setFormat('all'); setTag(''); }}>Clear filters</Button> : <a href="#templates" className="project-templates-link">Browse templates<Icon name="arrow" size={16} /></a>)}</div>}
  </section>;
}
