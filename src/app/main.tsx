import { ExportHistoryDialog } from "./ExportHistoryDialog";
import { LoadBoundary, lazyView, preloadLazyViews } from "./LoadBoundary";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
// The reader and catalog views load when first opened. Their styles stay in the
// main stylesheet, imported here in their original order, so the cascade is unchanged.
import "./materials.css";
import "./assets.css";
import "./guides.css";
import "./tags.css";
import "./templates.css";
import "./theme-folders.css";
import "./themes.css";
import "./comment-dock.css";
import "./deleted-comments.css";
import "./history.css";
import "./reader-panel.css";
import "./export.css";
import "./skills.css";
import "./selection.css";
import "./reader-toolbar.css";
import "./edit-workbench.css";
import { CreateDocumentDialog, type CreatePreset } from "./CreateDocumentDialog";
import { PendingHandoffs } from "./PendingHandoffs";
import { dismissHandoff, filteredHandoffs, ignoreDocument, pendingHandoffs, reconcileHandoffs, recordHandoff, savePendingHandoffs, subscribePendingHandoffs, visibleHandoffs, type HandoffFilters } from "./pendingHandoffs";
import { ProjectDialog, MoveDocumentDialog } from "./ProjectDialogs";
import { ProjectDocuments, DocumentsBrowser } from "./DocumentsBrowser";
import { Sidebar } from "./Sidebar";
import { AppMenu } from "./AppMenu";
import { DocumentActionDialog, DocumentMenuItems, type DocumentActionHandler } from "./DocumentActions";
import { useAppearance } from "./appearance";
import { useDocumentView } from "./DocumentViewControl";
import { Icon } from "./ui/Icon";
import { Button, IconButton, UiProvider, useNotifications } from "./ui";
import { api } from "./api";
import type { ThemeSummary } from "../shared/themes";
import { documentName, documentFormat, formatLabel, type DocumentFormat, type DocumentState, type DocumentSummary } from "../shared/types";
import { emptyProjects, type Project, type ProjectsManifest } from "../shared/projects";
import { emptyThemeFolders, type ThemeFoldersManifest } from "../shared/theme-folders";
import type { ThemeOrganization } from "./ThemeFolders";
import { emptyTags, itemStatus, type DocumentStatus, type TagsManifest } from "../shared/tags";
import { textLang } from "../shared/language";
import { splitHash } from "./libraryFilters";
import { DetailsDialog, StatusBadge, TagsProvider, type TagState, type TagTarget } from "./Tags";
import "./style.css";

const AssetsBrowser = lazyView(() => import("./AssetsBrowser").then(module => module.AssetsBrowser));
const TemplatesBrowser = lazyView(() => import("./TemplatesBrowser").then(module => module.TemplatesBrowser));
const ThemesBrowser = lazyView(() => import("./ThemesBrowser").then(module => module.ThemesBrowser));
const Reader = lazyView(() => import("./Reader").then(module => module.Reader));

/** The view and item from the hash; library filters in its query stay with the view they belong to. */
function route() {
  const { path: hash, params } = splitHash(location.hash);
  const query = params.toString() ? `?${params}` : "";
  if (hash === "presentations") return { view: "presentations", id: "", query };
  if (hash === "themes" || hash.startsWith("themes/")) return { view: "themes", id: hash.slice(7), query };
  if (hash === "templates" || hash.startsWith("templates/")) return { view: "templates", id: hash.slice(10), templateFormat: params.get('format') === 'presentation' || params.get('format') === 'document' ? params.get('format') as DocumentFormat : 'all' as const, query };
  if (hash === "assets" || hash.startsWith("assets/")) return { view: "assets", id: hash.slice(7) || "media", query };
  if (hash === "media" || hash.startsWith("media/")) return { view: "assets", id: `media${hash.length > 5 ? `/${hash.slice(6)}` : ""}`, query };
  if (hash.startsWith("project/")) return { view: "project", id: hash.slice(8), query };
  return hash.startsWith("document/")
    ? { view: "document", id: hash.slice(9), query: "" }
    : { view: "library", id: "", query };
}
const go = (hash: string) => { location.hash = hash; };

function App() {
  const { appearance, changeAppearance } = useAppearance();
  const { view: documentView, changeView: changeDocumentView } = useDocumentView();
  const [current, setCurrent] = useState(route);
  const lastBrowseRoute = useRef<ReturnType<typeof route> | null>(null);
  useEffect(() => { if (current.view !== "document") lastBrowseRoute.current = current; }, [current]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [manifest, setManifest] = useState<ProjectsManifest>(emptyProjects);
  const [themeOrganization, setThemeOrganization] = useState<ThemeOrganization>(() => ({ manifest: emptyThemeFolders() }));
  const [tagState, setTagState] = useState<TagState>(() => ({ manifest: emptyTags() }));
  const [tagTarget, setTagTarget] = useState<TagTarget | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createPreset, setCreatePreset] = useState<CreatePreset>({});
  const [projectDialog, setProjectDialog] = useState<{ project: Project | null } | null>(null);
  const notifications = useNotifications();
  const [exportDocument, setExportDocument] = useState<DocumentSummary | null>(null);
  const [documentAction, setDocumentAction] = useState<{ document: DocumentSummary; action: "rename" | "delete" } | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const copying = useRef(false);
  const [moving, setMoving] = useState<DocumentSummary | null>(null);
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const refreshing = useRef<Promise<void> | null>(null);
  const refreshAgain = useRef(false);
  const requestAbort = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    refreshAgain.current = true;
    if (refreshing.current) return refreshing.current;
    refreshing.current = (async () => {
      do {
        refreshAgain.current = false;
        try {
          const [next, projects, nextThemes, organization, nextTags] = await Promise.all([
            api<DocumentSummary[]>("/api/documents?view=summary", { signal: requestAbort.current?.signal }),
            api<ProjectsManifest>("/api/projects", { signal: requestAbort.current?.signal }),
            api<ThemeSummary[]>("/api/themes", { signal: requestAbort.current?.signal }),
            // Folders are optional organization; an unreadable file must not hide the workspace.
            api<ThemeFoldersManifest>("/api/theme-folders", { signal: requestAbort.current?.signal })
              .then((value): ThemeOrganization => ({ manifest: value }), (error): ThemeOrganization => ({ manifest: emptyThemeFolders(), error: (error as Error).message })),
            // Tags only filter; an unreadable tags.json leaves every view usable.
            api<TagsManifest>("/api/tags", { signal: requestAbort.current?.signal })
              .then((value): TagState => ({ manifest: value }), (error): TagState => ({ manifest: emptyTags(), error: (error as Error).message })),
          ]);
          if (requestAbort.current?.signal.aborted) return;
          setManifest(projects);
          setThemes(nextThemes);
          setThemeOrganization(organization);
          setTagState(nextTags);
          setDocuments((previous) => {
            const existing = new Map(previous.map((item) => [item.id, item]));
            const merged = next.map((item) => {
              const before = existing.get(item.id);
              return before && JSON.stringify(before) === JSON.stringify(item) ? before : item;
            });
            return merged.length === previous.length && merged.every((item, index) => item === previous[index]) ? previous : merged;
          });
          setError(""); setLoaded(true); setGeneration((value) => value + 1);
        } catch (error) { if (!requestAbort.current?.signal.aborted) setError((error as Error).message); }
      } while (refreshAgain.current && !requestAbort.current?.signal.aborted);
    })().finally(() => { refreshing.current = null; });
    return refreshing.current;
  }, []);
  // Fetch the on-demand views while the server is reachable, so an outage later cannot strand them.
  useEffect(() => {
    if (!loaded || !connected) return;
    const timer = window.setTimeout(preloadLazyViews, 1500);
    return () => window.clearTimeout(timer);
  }, [loaded, connected]);
  useEffect(() => {
    requestAbort.current = new AbortController();
    void refresh();
    let events: WebSocket;
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelay = 500;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      events = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/events`);
      events.onopen = () => { reconnectDelay = 500; setConnected(true); };
      events.onmessage = (event) => {
        if (stopped || !['connected', 'changed'].includes(event.data)) return;
        // Catch up after every connection, including changes during initial loading.
        clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void refresh(), 80);
      };
      events.onerror = () => { setConnected(false); events.close(); };
      events.onclose = () => {
        if (stopped) return;
        setConnected(false);
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 5_000);
      };
    };
    connect();
    const change = () => setCurrent(route());
    window.addEventListener("hashchange", change);
    return () => { stopped = true; clearTimeout(reconnectTimer); events.close(); clearTimeout(refreshTimer); requestAbort.current?.abort(); window.removeEventListener("hashchange", change); };
  }, [refresh]);
  const activeSummary = current.view === "document" ? documents.find(document => document.id === current.id) : undefined;
  const [detail, setDetail] = useState<{ key: string; state: DocumentState }>();
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [detailError, setDetailError] = useState('');
  const detailKey = activeSummary ? JSON.stringify(activeSummary) : '';
  const activeId = activeSummary?.id;
  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController();
    setDetailError('');
    void api<DocumentState>(`/api/documents/${activeId}`, { signal: controller.signal })
      .then(state => { if (!controller.signal.aborted) setDetail({ key: detailKey, state }); })
      .catch(error => { if (!controller.signal.aborted) setDetailError(error.message); });
    return () => controller.abort();
  }, [activeId, detailKey, detailAttempt]);
  // Keep the previous PDF visible during a refresh, with currentness controls disabled. Opening a document only
  // waits for its details, so it keeps the summary's title and status instead of announcing a render.
  const updating = detail?.state.id === activeSummary?.id;
  const active: DocumentState | undefined = activeSummary ? detail?.key === detailKey ? detail.state : {
    ...activeSummary, name: documentName(activeSummary), status: updating ? 'rendering' : activeSummary.status, artifact: updating ? detail?.state.artifact : undefined,
  } : undefined;
  const routeProjectId = current.view === "project" ? current.id : active?.projectId;
  const project = manifest.projects.find(project => project.id === routeProjectId);
  const origin = lastBrowseRoute.current;
  const originProject = origin?.view === "project" ? manifest.projects.find(project => project.id === origin.id) : undefined;
  // Back returns to the page as it was left, with its filters.
  const backHash = origin
    ? origin.view === "project" ? originProject ? `project/${originProject.id}${origin.query}` : "library" : `${origin.view}${origin.id ? `/${origin.id}` : ""}${origin.query}`
    : project ? `project/${project.id}` : activeSummary && documentFormat(activeSummary) === "presentation" ? "presentations" : "library";
  const backLabel = origin
    ? origin.view === "project" ? originProject?.name ?? "Documents" : ({ library: "Documents", presentations: "Presentations", assets: "Media & Assets", templates: "Templates", themes: "Themes" }[origin.view] ?? "Documents")
    : project?.name ?? (activeSummary && documentFormat(activeSummary) === "presentation" ? "Presentations" : "Documents");
  const projectDocuments = documents.filter(document => document.projectId === project?.id);
  useEffect(() => {
    if (current.view !== "document" && current.view !== "assets" && current.view !== "themes") void api("/api/context", {
      method: "POST", body: JSON.stringify({ projectId: current.view === "project" ? project?.id ?? null : null, documentId: null, blockId: null, page: 1, themeId: null, selectedAsset: null }),
    }).catch(() => {});
  }, [current.view, project?.id]);
  // Name the format only when another item shares this title, e.g. the welcome document and presentation.
  const activeTitle = active ? documentName(active) : undefined;
  const sharedTitle = Boolean(active && documents.some(document => document.id !== active.id && documentName(document) === activeTitle));
  const activeFormat = active ? documentFormat(active) : undefined;
  // Every page names itself in the browser tab: the document, the project, the theme, or the library page.
  const themeName = current.view === "themes" && current.id ? themes.find(theme => theme.id === current.id)?.name : undefined;
  const pageName = current.view === "document" ? undefined : current.view === "project" ? project?.name
    : current.view === "assets" ? "Media & Assets" : current.view === "themes" ? themeName ?? "Themes"
    : current.view === "templates" ? "Templates"
    : current.view === "presentations" ? "Presentations" : "Documents";
  useEffect(() => {
    document.title = activeTitle ? `${activeTitle}${sharedTitle && activeFormat ? ` · ${formatLabel(activeFormat)}` : ''} · OpenDoc` : pageName ? `${pageName} · OpenDoc` : "OpenDoc";
  }, [activeTitle, sharedTitle, activeFormat, pageName]);
  const onDocumentAction: DocumentActionHandler = (document, action) => {
    if (action === "exports") { setExportDocument(document); return; }
    if (action === "move") { setMoving(document); return; }
    if (action === "tags") { setTagTarget({ kind: 'documents', id: document.id, name: documentName(document), returnFocus: `[data-document-menu="${document.id}"]` }); return; }
    if (action !== "duplicate") { setDocumentAction({ document, action }); return; }
    if (copying.current || !connected) return;
    copying.current = true; setDuplicating(true);
    void api<{ id: string; name: string }>(`/api/documents/${document.id}/duplicate`, { method: 'POST' }).then(async copy => {
      ignoreDocument(copy.id);
      await refresh();
      notifications.success(`${copy.name} created`, { label: 'Open', onClick: () => go(`document/${copy.id}`) });
    }).catch(error => notifications.error(error.message)).finally(() => { copying.current = false; setDuplicating(false); });
  };
  // The notification helpers are recreated on each render; keep the status setter stable.
  const notify = useRef(notifications);
  notify.current = notifications;
  const setDocumentStatus = useCallback((document: DocumentSummary, status: DocumentStatus | null) => {
    void api<{ manifest: TagsManifest }>(`/api/tags/documents/${document.id}/status`, { method: 'PUT', body: JSON.stringify({ status }) })
      .then(result => { setTagState({ manifest: result.manifest }); void refresh(); })
      .catch(error => notify.current.error(error.message));
  }, [refresh]);
  // Cards, menus, and the reader read type and status from here; status changes need a connection.
  const tagContext = useMemo(() => ({ manifest: tagState.manifest, setStatus: connected && !tagState.error ? setDocumentStatus : undefined }), [tagState, connected, setDocumentStatus]);
  const createProject = () => setProjectDialog({ project: null });
  const openCreate = (preset: CreatePreset) => { setCreatePreset(preset); setCreating(true); };
  const createDocument = (format: DocumentFormat = 'document') => openCreate({ format, projectId: current.view === "project" ? project?.id : undefined });
  // Copied creation prompts wait in this browser until their document appears in the workspace.
  const handoffs = useSyncExternalStore(subscribePendingHandoffs, pendingHandoffs, () => []);
  const handoffDocuments = useMemo(() => documents.map(document => ({ id: document.id, projectId: document.projectId, format: documentFormat(document) })), [documents]);
  const [handoffClock, setHandoffClock] = useState(Date.now);
  // Cards show their age and expire; the clock only runs while there is something to show.
  useEffect(() => {
    if (!handoffs.length) return;
    setHandoffClock(Date.now());
    const timer = window.setInterval(() => setHandoffClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [handoffs]);
  useEffect(() => {
    if (!loaded) return;
    const { handoffs: next, resolved } = reconcileHandoffs(handoffs, handoffDocuments, Date.now());
    if (next === handoffs) return;
    savePendingHandoffs(next);
    for (const handoff of resolved) {
      const arrived = documents.find(document => document.id === handoff.documentId);
      if (arrived) notify.current.success(`Your ${documentFormat(arrived)} is ready in ${handoff.projectName ?? (documentFormat(arrived) === 'presentation' ? 'Presentations' : 'Documents')}`, { label: 'Open', onClick: () => { dismissHandoff(handoff.id); go(`document/${arrived.id}`); } });
    }
  }, [handoffs, handoffDocuments, documents, loaded, handoffClock]);
  // Each page passes its own format choice and filters, so the cards narrow with the documents.
  const pendingFor = (scope: { projectId: string } | { format: DocumentFormat }) => (filters: HandoffFilters) => <PendingHandoffs handoffs={filteredHandoffs(visibleHandoffs(handoffs, handoffDocuments, scope), handoffDocuments, filters)} documents={documents} now={handoffClock} showProject={!('projectId' in scope)} />;
  return <TagsProvider value={tagContext}><div className={`app ${current.view === "document" ? "reading" : ""}`}>
    {current.view !== "document" && <Sidebar view={current.view} projectId={project?.id} projects={manifest.projects} documents={documents} loaded={loaded} connected={connected} appearance={appearance} onAppearanceChange={changeAppearance} onCreateProject={createProject} onProjectSettings={project => setProjectDialog({ project })} />}
    <main className="main">
      {current.view === "document" && !active && <header className="topbar">
        <IconButton label={`Back to ${backLabel}`} render={<a href={`#${backHash}`} />} nativeButton={false}><Icon name="left" /></IconButton>
        <div className="breadcrumb"><a href={project ? `#project/${project.id}` : "#library"} title={project?.name ?? "Documents"} dir="auto" lang={project && textLang(project.name)}>{project?.name ?? "Documents"}</a><span>/</span><span>Document</span></div>
      </header>}
      {!connected && <div className="connection-banner" role="status">Connection lost. Reconnecting to OpenDoc. Editing and export will resume when the server returns.</div>}
      {detailError && activeSummary && <div className="error-banner" role="alert"><span>{detailError}</span><Button onClick={() => setDetailAttempt(value => value + 1)}>Try again</Button></div>}
      {error && <div className="error-banner" role="alert"><span>{error}</span><Button className="text-button" onClick={() => void refresh()}>Try again</Button></div>}
      {tagState.error && current.view !== "document" && current.view !== "assets" && <div className="error-banner" role="alert"><span>{tagState.error}</span><Button className="text-button" onClick={() => void refresh()}>Try again</Button></div>}
      <LoadBoundary key={current.view} connected={connected}>
      <Suspense fallback={<div className="empty-state" role="status"><div className="loading-mark" /><p>Loading…</p></div>}>
      {current.view === "document" ? active ? <Reader key={active.id} state={active} generation={generation} connected={connected} language={activeSummary?.language} onShowExports={() => setExportDocument(active)}
        identity={<>
          <IconButton label={`Back to ${backLabel}`} className="reader-back" render={<a href={`#${backHash}`} />} nativeButton={false}><Icon name="left" size={17} /></IconButton>
          <div className="reader-document"><a href={project ? `#project/${project.id}` : "#library"} title={project?.name ?? "Documents"} dir="auto" lang={project && textLang(project.name)}>{project?.name ?? "Documents"}</a><span className="reader-context-separator" aria-hidden="true">/</span><h1 className="reader-document-title" title={documentName(active)} dir="auto" lang={textLang(documentName(active), activeSummary?.language)}>{documentName(active)}</h1><StatusBadge status={itemStatus(tagState.manifest, active.id)} className="reader-status" /></div>
        </>}
        options={<DocumentMenuItems document={active} onAction={onDocumentAction} disabled={!connected || duplicating} exports={false} />}
        appMenu={<AppMenu appearance={appearance} onAppearanceChange={changeAppearance} />}
      /> : <div className="empty-state"><h1>{loaded ? "Document not found" : error ? "Workspace unavailable" : "Loading document…"}</h1><p>{loaded ? "Its source may have been moved or removed from this workspace." : "Opening your local workspace."}</p><Button onClick={() => go("library")}>Back to documents</Button></div>
        : current.view === "project" ? project ? <ProjectDocuments key={project.id} project={project} documents={projectDocuments} tags={tagState} loaded={loaded} view={documentView} onViewChange={changeDocumentView} onCreate={() => createDocument()} onCreatePresentation={() => createDocument('presentation')} pending={pendingFor({ projectId: project.id })} onSettings={() => setProjectDialog({ project })} onAction={onDocumentAction} disabled={!connected || duplicating} /> : <div className="empty-state"><h1>{loaded ? "Project not found" : "Loading project…"}</h1><p>{loaded ? "It may have been removed. Your other projects are still available." : "Opening your local workspace."}</p><Button onClick={() => go("library")}>Back to documents</Button></div>
        : current.view === "assets" ? <AssetsBrowser selection={current.id} generation={generation} documents={documents} themes={themes} connected={connected} />
        : current.view === "templates" ? <TemplatesBrowser selection={current.id} generation={generation} format={current.templateFormat} connected={connected} tags={tagState} onEditTags={setTagTarget} onCreate={openCreate} />
        : current.view === "themes" ? <ThemesBrowser connected={connected} themes={themes} selection={current.id} generation={generation} loaded={loaded} documents={documents} projects={manifest.projects} onRefresh={() => void refresh()} onCreate={openCreate}
          organization={themeOrganization} onOrganizationChange={next => { setThemeOrganization({ manifest: next }); void refresh(); }} tags={tagState} onEditTags={setTagTarget} /> : <DocumentsBrowser key={current.view} format={current.view === 'presentations' ? 'presentation' : 'document'} pending={pendingFor({ format: current.view === 'presentations' ? 'presentation' : 'document' })} projects={manifest.projects} documents={documents.filter(document => documentFormat(document) === (current.view === 'presentations' ? 'presentation' : 'document'))} tags={tagState} loaded={loaded} view={documentView} onViewChange={changeDocumentView} onCreate={() => createDocument(current.view === 'presentations' ? 'presentation' : 'document')} onMove={setMoving} onAction={onDocumentAction} disabled={!connected || duplicating} />}
      </Suspense>
      </LoadBoundary>
    </main>
    <CreateDocumentDialog open={creating} onOpenChange={setCreating} preset={createPreset} projects={manifest.projects} themes={themes} themeFolders={themeOrganization.manifest} tags={tagState.manifest} generation={generation}
      onCopied={handoff => { if (loaded) recordHandoff({ ...handoff, knownIds: documents.map(document => document.id) }); }} />
    <ProjectDialog themes={themes} themeFolders={themeOrganization.manifest} open={Boolean(projectDialog)} project={projectDialog?.project ?? null} documentCount={documents.filter(document => document.projectId === projectDialog?.project?.id).length} connected={connected} onOpenChange={open => { if (!open) setProjectDialog(null); }} onSaved={saved => {
      setManifest(previous => ({ ...previous, projects: previous.projects.some(project => project.id === saved.id) ? previous.projects.map(project => project.id === saved.id ? saved : project) : [...previous.projects, saved] }));
      go(`project/${saved.id}`); void refresh();
    }} onDeleted={() => { setManifest(previous => ({ ...previous, projects: previous.projects.filter(project => project.id !== projectDialog?.project?.id) })); go("library"); void refresh(); }} />
    <DetailsDialog target={tagTarget} manifest={tagState.manifest} connected={connected} onClose={() => setTagTarget(null)} onChange={next => { setTagState({ manifest: next }); void refresh(); }} />
    <ExportHistoryDialog document={exportDocument} connected={connected} onClose={() => setExportDocument(null)} />
    <DocumentActionDialog selection={documentAction} connected={connected} onClose={() => setDocumentAction(null)} onRenamed={(id, name) => {
      setDocuments(previous => previous.map(document => document.id === id ? { ...document, name } : document)); void refresh();
    }} onDeleted={(document, restoreId) => {
      setDocuments(previous => previous.filter(item => item.id !== document.id));
      if (current.view === 'document' && current.id === document.id) go(document.projectId ? `project/${document.projectId}` : documentFormat(document) === 'presentation' ? 'presentations' : 'library');
      void refresh();
      notifications.success(`${documentName(document)} deleted`, { label: 'Undo', onClick: async () => {
        await api(`/api/document-trash/${restoreId}/restore`, { method: 'POST' });
        ignoreDocument(document.id);
        await refresh(); notifications.success(`${documentName(document)} restored`);
      } });
    }} />
    <MoveDocumentDialog document={moving} projects={manifest.projects} connected={connected} onClose={() => setMoving(null)} onMoved={projectId => {
      setDocuments(previous => previous.map(document => document.id === moving?.id ? { ...document, projectId } : document)); void refresh();
    }} />
  </div></TagsProvider>;
}

createRoot(document.getElementById("root")!).render(<UiProvider><App /></UiProvider>);
