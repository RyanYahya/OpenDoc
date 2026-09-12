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
import './projects.css';

type ViewProps = { view: DocumentView; onViewChange: (view: DocumentView) => void };

function DocumentTools({ noun = 'document', query, onQueryChange, view, onViewChange, filter }: ViewProps & { noun?: string; query: string; onQueryChange: (query: string) => void; filter?: ReactNode }) {
  return <div className="library-tools document-browser-tools">
    <SearchField label={`Search ${noun}s`} value={query} onValueChange={onQueryChange} />
    {filter}
    <div className="document-view-tools"><DocumentViewControl value={view} onChange={onViewChange} /></div>
  </div>;
}

export function DocumentsBrowser({ format = 'document', projects, documents, loaded, view, onViewChange, onCreate, onMove, onAction, disabled }: ViewProps & {
  format?: DocumentFormat; projects: Project[]; documents: DocumentSummary[]; loaded: boolean; onCreate: () => void; onMove: (document: DocumentSummary) => void; onAction: DocumentActionHandler; disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const plural = format === 'presentation' ? 'Presentations' : 'Documents';
  const projectById = new Map(projects.map(project => [project.id, project]));
  const visible = documents.filter(document => `${documentName(document)} ${document.artifact?.meta.description ?? ''} ${projectById.get(document.projectId ?? '')?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="library-content documents-content">
    <div className="library-heading"><h1>{plural}</h1><Button className="primary" aria-label={`Create ${format}`} onClick={onCreate} disabled={!loaded || disabled}><Icon name="plus" size={17} /><span>Create {format}</span></Button></div>
    <DocumentTools noun={format} query={query} onQueryChange={setQuery} view={view} onViewChange={onViewChange} />
    <div className={view === 'list' ? 'documents-list' : 'document-grid'} role="list">{visible.map(document => {
      const project = projectById.get(document.projectId ?? '');
      return <article className="project-document" key={document.id} role="listitem">
        <DocumentCard document={document} view={view} onAction={onAction} disabled={disabled} onOpen={() => { location.hash = `document/${document.id}`; }} />
        {project ? <a className="document-project-link" href={`#project/${project.id}`}><Icon name="folder" size={15} /><span>{project.name}</span></a>
          : <Button className="text-button document-move" onClick={() => onMove(document)} disabled={!projects.length}>Choose a project</Button>}
      </article>;
    })}</div>
    {!visible.length && <div className="empty-state"><h2>{!loaded ? `Loading ${plural.toLowerCase()}…` : query ? `No matching ${plural.toLowerCase()}` : `Your ${plural.toLowerCase()} start here`}</h2><p>{!loaded ? 'Opening your local workspace.' : query ? 'Try a different title or project name.' : projects.length ? format === 'presentation' ? 'Create a presentation with your agent and review every slide here.' : 'Create a document in a project, or choose a layout from Templates.' : 'Create your first project using the + beside Projects in the sidebar.'}</p></div>}
  </section>;
}

export function ProjectDocuments({ project, documents, loaded, view, onViewChange, onCreate, onCreatePresentation, onSettings, onAction, disabled }: ViewProps & {
  project: Project; documents: DocumentSummary[]; loaded: boolean; onCreate: () => void; onCreatePresentation: () => void; onSettings: () => void; onAction: DocumentActionHandler; disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<'all' | DocumentFormat>('all');
  const hasFilters = Boolean(query) || format !== 'all';
  const visible = documents.filter(document => (format === 'all' || documentFormat(document) === format)
    && `${documentName(document)} ${document.artifact?.meta.description ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="library-content project-documents">
    <div className="library-heading"><h1>{project.name}</h1><div className="project-actions">
      <IconButton label="Project settings" onClick={onSettings}><Icon name="gear" size={18} /></IconButton>
      <Menu.Root><Menu.Trigger render={<Button className="primary project-create-trigger" disabled={!loaded || disabled} />}>
        <Icon name="plus" size={16} /><span>Create</span><Icon name="down" size={14} />
      </Menu.Trigger><Menu.Portal><Menu.Positioner className="ui-positioner" sideOffset={6} align="end"><Menu.Popup className="ui-menu-popup">
        <Menu.Item className="ui-menu-item" onClick={onCreate}><Icon name="document" size={16} />Document</Menu.Item>
        <Menu.Item className="ui-menu-item" onClick={onCreatePresentation}><Icon name="monitor" size={16} />Presentation</Menu.Item>
      </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>
    </div></div>
    <DocumentTools noun="item" query={query} onQueryChange={setQuery} view={view} onViewChange={onViewChange}
      filter={<SelectControl label="Filter by format" value={format} onValueChange={value => { if (value === 'all' || value === 'document' || value === 'presentation') setFormat(value); }} items={[
        { label: 'All formats', value: 'all' }, { label: 'Documents', value: 'document' }, { label: 'Presentations', value: 'presentation' },
      ]} />} />
    <div className={view === 'list' ? 'documents-list' : 'document-grid'} role="list">{visible.map(document => <article className="project-document" key={document.id} role="listitem"><DocumentCard document={document} view={view} onAction={onAction} disabled={disabled} onOpen={() => { location.hash = `document/${document.id}`; }} /></article>)}</div>
    {!visible.length && <div className="empty-state"><h2>{!loaded ? 'Loading project…' : hasFilters ? 'No matching items' : 'Your project is ready'}</h2><p>{!loaded ? 'Opening your local workspace.' : hasFilters ? 'Try another search or choose a different format.' : 'Create a document or presentation with your agent.'}</p>{loaded && (hasFilters ? <Button onClick={() => { setQuery(''); setFormat('all'); }}>Clear filters</Button> : <a href="#templates" className="project-templates-link">Browse templates<Icon name="arrow" size={16} /></a>)}</div>}
  </section>;
}
