import { useEffect, useState } from 'react';
import type { Project } from '../shared/projects';
import { documentFormat, type DocumentSummary } from '../shared/types';
import { Button, Dialog, IconButton } from './ui';
import { Icon } from './ui/Icon';
import { AppearanceControl } from './AppearanceControl';
import { SkillIndex } from './SkillIndex';
import type { Appearance } from './appearance';
import './sidebar.css';

const wordmark = new URL('../../assets/brand/wordmark.png', import.meta.url).href;

type SidebarProps = {
  view: string;
  projectId?: string;
  projects: Project[];
  documents: DocumentSummary[];
  loaded: boolean;
  connected: boolean;
  appearance: Appearance;
  onAppearanceChange: (value: Appearance) => void;
  onCreateProject: () => void;
  onProjectSettings: (project: Project) => void;
};

function SidebarContent({ view, projectId, projects, documents, loaded, connected, appearance, onAppearanceChange, onCreateProject, onProjectSettings, onNavigate, onClose }: SidebarProps & { onNavigate?: () => void; onClose?: () => void }) {
  return <>
    <div className="sidebar-brand-row">
      <a className="sidebar-brand" href="#library" onClick={onNavigate}><img className="brand-wordmark" src={wordmark} alt="OpenDoc" width={112} height={37.333} /></a>
      {onClose && <IconButton label="Close sidebar" onClick={onClose}><Icon name="close" /></IconButton>}
    </div>
    <nav className="workspace-nav" aria-label="Workspace">
      {[
        { id: 'library', label: 'Documents', icon: 'documents' },
        { id: 'presentations', label: 'Presentations', icon: 'monitor' },
        { id: 'assets', label: 'Media & Assets', icon: 'image' },
        { id: 'templates', label: 'Templates', icon: 'layout' },
        { id: 'themes', label: 'Themes', icon: 'theme' },
      ].map(item => <a key={item.id} href={`#${item.id}`} aria-label={item.label} onClick={onNavigate} className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined}>
        <Icon name={item.icon} size={18} /><span>{item.label}</span>{['library', 'presentations'].includes(item.id) && loaded && <span className="nav-count" aria-hidden="true">{documents.filter(document => documentFormat(document) === (item.id === 'presentations' ? 'presentation' : 'document')).length}</span>}
      </a>)}
    </nav>
    <section className="sidebar-projects" aria-label="Projects">
      <div className="sidebar-section-heading"><h2>Projects</h2><IconButton label="Create project" disabled={!loaded || !connected} onClick={onCreateProject}><Icon name="plus" size={17} /></IconButton></div>
      <nav className="project-nav" aria-label="Projects">
        {projects.map(project => <div className={`sidebar-project-row ${project.id === projectId ? 'selected' : ''}`} key={project.id}>
          <a href={`#project/${project.id}`} onClick={onNavigate} aria-label={project.name} title={project.name} aria-current={view === 'project' && project.id === projectId ? 'page' : undefined}>
            <Icon name="folder" size={17} /><span className="project-nav-name">{project.name}</span><span className="nav-count" aria-hidden="true">{documents.filter(document => document.projectId === project.id).length}</span>
          </a>
          <IconButton label={`Settings for ${project.name}`} className="project-settings-shortcut" onClick={() => onProjectSettings(project)}><Icon name="settings" size={16} /></IconButton>
        </div>)}
        {!projects.length && <p className="sidebar-empty">{loaded ? 'Create a project to organize your documents.' : 'Loading projects…'}</p>}
      </nav>
    </section>
    <div className="sidebar-footer"><span className="workspace-status" role="status"><span className={`status-dot ${connected ? '' : 'offline'}`} />{connected ? 'Local workspace' : 'Reconnecting…'}</span><div className="sidebar-footer-actions"><SkillIndex /><AppearanceControl value={appearance} onChange={onAppearanceChange} /></div></div>
  </>;
}

export function Sidebar(props: SidebarProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 761px)');
    const closeOnWide = () => { if (wide.matches) setOpen(false); };
    wide.addEventListener('change', closeOnWide);
    return () => wide.removeEventListener('change', closeOnWide);
  }, []);
  const close = () => setOpen(false);
  return <>
    <aside className="sidebar" aria-label="Sidebar"><SidebarContent {...props} /></aside>
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <header className="mobile-workspace-header">
        <Dialog.Trigger render={<Button className="icon-button" aria-label="Open sidebar" />}><Icon name="sidebar" size={21} /></Dialog.Trigger>
        <a className="mobile-brand" href="#library"><img className="brand-wordmark" src={wordmark} alt="OpenDoc" width={112} height={37.333} /></a>
      </header>
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-dialog-backdrop" />
        <Dialog.Popup className="sidebar-drawer">
          <Dialog.Title className="visually-hidden">Workspace navigation</Dialog.Title>
          <SidebarContent {...props} onNavigate={close} onClose={close}
            onCreateProject={() => { close(); props.onCreateProject(); }}
            onProjectSettings={project => { close(); props.onProjectSettings(project); }} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
