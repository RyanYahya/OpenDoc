import { EventEmitter } from 'node:events';
import { access, readdir, rm } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { renderOnce, validId, documentEntry } from './render';
import { atomicWrite } from './files';
import { themePaths, readThemePaths } from './themes';
import { readProjects } from './projects';
import { readComments } from './comments';
import { documentDependencies, includesDependency, type DocumentDependencies, isRenderRuntimePath, isThemeAssetDefaultsPath } from './dependencies';
import { readMedia, mediaFreshness } from '../media/files';
import { readAssetHead, readAssetRevision, readDocumentAssets, readThemeAssetDefaults } from '../assets/files';
import { documentName, getBlock, type DocumentState, type WorkspaceContext, type RenderArtifact } from '../shared/types';
import { getEditableSelection, getTextTarget, resolveCommentAnchor } from '../shared/anchors';
import type { ManualEditSummary } from '../shared/selection';

export class Workspace extends EventEmitter {
  states = new Map<string, DocumentState>();
  outputs = new Map<string, { directory: string; artifact: RenderArtifact }[]>();
  context: WorkspaceContext = { documentId: null, blockId: null, page: 1 };
  manualEditSummary?: (id: string) => Promise<ManualEditSummary | undefined>;
  private running = new Set<string>();
  private pending = new Set<string>();
  private scheduled = new Set<string>();
  private dependencies = new Map<string, DocumentDependencies>();
  private debounce?: ReturnType<typeof setTimeout>;
  private contextWrites = Promise.resolve();
  private closed = false;
  constructor(public root: string, public timeoutMs = 30_000) { super(); }
  list() { return [...this.states.values()].sort((a, b) => documentName(a).localeCompare(documentName(b))); }
  async discover() {
    const manifest = await readProjects(this.root);
    const entries = await readdir(resolve(this.root, 'documents'), { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    const found = new Set<string>();
    for (const dir of entries) {
      if (!dir.isDirectory() || !validId(dir.name)) continue;
      try { await access(resolve(this.root, 'documents', dir.name, 'index.tsx')); await documentEntry(this.root, dir.name); } catch { continue; }
      found.add(dir.name);
      if (!this.states.has(dir.name)) this.states.set(dir.name, { id: dir.name, status: 'rendering', revision: 0 });
      const state = this.states.get(dir.name)!;
      const format = manifest.formats && Object.hasOwn(manifest.formats, dir.name) ? manifest.formats[dir.name] : 'document';
      const formatChanged = state.format !== undefined && state.format !== format;
      state.format = format;
      if (formatChanged) this.invalidate(dir.name);
      this.states.get(dir.name)!.projectId = Object.hasOwn(manifest.assignments, dir.name) ? manifest.assignments[dir.name] : null;
      this.states.get(dir.name)!.name = manifest.names && Object.hasOwn(manifest.names, dir.name) ? manifest.names[dir.name] : undefined;
    }
    for (const id of this.states.keys()) if (!found.has(id)) {
      this.states.delete(id); this.pending.delete(id); this.scheduled.delete(id); this.dependencies.delete(id);
      for (const out of this.outputs.get(id) ?? []) await rm(out.directory, { recursive: true, force: true });
      this.outputs.delete(id);
      if (this.context.documentId === id) this.context = { documentId: null, blockId: null, page: 1 };
    }
    return found;
  }
  async refresh() {
    if (this.closed) return;
    clearTimeout(this.debounce); this.scheduled.clear();
    for (const id of await this.discover()) this.invalidate(id);
    this.changed();
  }
  async refreshProjects() { await this.discover(); this.changed(); }
  private stale(id: string) {
    const state = this.states.get(id);
    if (!state) return;
    state.revision++; state.status = 'rendering'; delete state.error;
    // The edited entry may now import files absent from its previous graph.
    this.dependencies.delete(id);
  }
  invalidate(id: string) {
    if (!this.states.has(id)) return;
    this.stale(id); this.pending.add(id); this.pump();
  }
  /** Disable affected exports immediately; queue costly discovery and rendering after a short quiet period. */
  noteChange(file: string) {
    if (this.closed) return [];
    const path = resolve(this.root, file);
    const parts = relative(this.root, path).split(sep);
    const owner = parts[0] === 'documents' && validId(parts[1] ?? '') ? parts[1] : undefined;
    const sharedRuntime = isRenderRuntimePath(this.root, path) || (parts[0] === 'documents' && parts.length === 1);
    const affected: string[] = [];
    const dependencyUsers = [...this.dependencies].filter(([, dependencies]) => includesDependency(dependencies, path)).map(([id]) => id);
    for (const id of this.states.keys()) {
      const dependencies = this.dependencies.get(id);
      const themeInput = parts[0] === 'themes' && parts[1] === this.states.get(id)?.artifact?.meta.theme && !isThemeAssetDefaultsPath(this.root, path);
      const match = owner
        ? id === owner || !dependencies || dependencies.readsFiles || dependencyUsers.includes(id)
        : sharedRuntime || themeInput || !dependencies || dependencies.readsFiles || dependencyUsers.includes(id);
      if (match) {
        this.stale(id); this.pending.delete(id); this.scheduled.add(id); affected.push(id);
      }
    }
    // A new document has no state yet; discovery picks it up when changes settle.
    if (owner) this.scheduled.add(owner);
    if (!affected.length && !owner) return affected;
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => { void this.flushChanges().catch(error => this.emit('workspace-error', error)); }, 180);
    this.changed();
    return affected;
  }
  async flushChanges() {
    if (this.closed) return;
    clearTimeout(this.debounce); this.debounce = undefined;
    const scheduled = new Set(this.scheduled); this.scheduled.clear();
    const known = new Set(this.states.keys());
    const found = await this.discover();
    for (const id of found) if ((scheduled.has(id) || !known.has(id)) && !this.scheduled.has(id)) this.pending.add(id);
    this.changed(); this.pump();
  }
  private pump() {
    if (this.closed) return;
    for (const id of this.pending) {
      if (this.running.size >= 2) break;
      if (this.running.has(id)) continue;
      this.pending.delete(id); this.running.add(id);
      void this.run(id);
    }
  }
  private async run(id: string) {
    const state = this.states.get(id)!;
    const revision = state.revision;
    const dependencyResult = documentEntry(this.root, id).then(entry => documentDependencies(this.root, entry)).catch(() => null);
    try {
      const result = await renderOnce(this.root, id, this.timeoutMs);
      const dependencies = await dependencyResult;
      if (this.closed || this.states.get(id) !== state || revision !== state.revision) {
        await rm(result.directory, { recursive: true, force: true });
      } else {
        const previous = this.outputs.get(id) ?? [];
        this.outputs.set(id, [result, ...previous].slice(0, 2));
        if (dependencies) {
          for (const file of result.artifact.assetDependencies ?? []) dependencies.files.add(resolve(this.root, file));
          this.dependencies.set(id, dependencies);
        } else this.dependencies.delete(id);
        state.artifact = result.artifact; state.status = 'ready'; delete state.error;
        // Publish state before asynchronous cleanup; a newer invalidation must stay authoritative.
        for (const old of previous.slice(1)) await rm(old.directory, { recursive: true, force: true }).catch(error => this.emit('workspace-error', error));
      }
    } catch (error) {
      const dependencies = await dependencyResult;
      if (this.states.get(id) === state && revision === state.revision) {
        // Retain a completed current graph even after a missing/corrupt pinned asset fails rendering.
        // An unresolved import has no trustworthy graph and remains conservatively invalidatable.
        if (dependencies) this.dependencies.set(id, dependencies); else this.dependencies.delete(id);
        state.status = 'error'; state.error = error instanceof Error ? error.message : String(error);
      }
    } finally { this.running.delete(id); this.changed(); this.pump(); }
  }
  output(id: string, hash: string) { return this.outputs.get(id)?.find(out => out.artifact.hash === hash); }
  changed() { this.emit('change'); void this.writeContext().catch(error => this.emit('workspace-error', error)); }
  async setContext(context: WorkspaceContext) { this.context = context; await this.writeContext(); }
  writeContext() {
    this.contextWrites = this.contextWrites.catch(() => {}).then(async () => {
      const state = this.context.documentId ? this.states.get(this.context.documentId) : undefined;
      if (state && this.manualEditSummary) state.manualEdit = await this.manualEditSummary(state.id);
      const manifest = await readProjects(this.root);
      const projectId = state ? state.projectId : this.context.documentId ? null : this.context.projectId;
      const project = manifest.projects.find(project => project.id === projectId) ?? null;
      let comments: unknown[] = [], commentsError: string | undefined;
      if (state) try { comments = (await readComments(this.root, state.id)).filter(c => c.status === 'open').map(c => {
        const resolved = resolveCommentAnchor(state.artifact, c);
        return { ...c, targetAvailable: resolved.status !== 'missing', anchorStatus: resolved.status, selection: resolved.selection };
      }); }
      catch (e) { commentsError = String(e); }
      let selectedMedia: unknown = null;
      if (state && this.context.mediaId) {
        const folder = `documents/${state.id}/media/${this.context.mediaId}`;
        try { const asset = readMedia(resolve(this.root, 'documents', state.id), this.context.mediaId); selectedMedia = { folder, meta: asset.meta, ...mediaFreshness(asset) }; }
        catch (error) { selectedMedia = { folder, error: (error as Error).message }; }
      }
      let selectedAsset: unknown = null;
      if (this.context.selectedAsset) {
        const selection = this.context.selectedAsset;
        const folder = `assets/${selection.kind === 'logo' ? 'logos' : 'fonts'}/${selection.id}`;
        try {
          const head = await readAssetHead(this.root, selection.kind, selection.id);
          const asset = await readAssetRevision(this.root, selection.kind, selection.id, selection.revision ?? head.revision);
          selectedAsset = { ...selection, folder, asset, head,
            variation: asset.kind === 'logo' && selection.variation ? asset.variations.find(item => item.id === selection.variation) ?? null : undefined,
            face: asset.kind === 'font' && selection.face ? asset.faces.find(item => item.id === selection.face) ?? null : undefined,
          };
        } catch (error) { selectedAsset = { ...selection, folder, error: (error as Error).message }; }
      }
      let documentAssets: unknown = null;
      if (state) {
        const file = `documents/${state.id}/assets.json`;
        try { documentAssets = { file, bindings: await readDocumentAssets(this.root, state.id), saved: await access(resolve(this.root, file)).then(() => true, () => false) }; }
        catch (error) { documentAssets = { file, error: (error as Error).message }; }
      }
      const selectedBlock = getBlock(state?.artifact, this.context.blockId);
      const selection = this.context.selection;
      const selectedTarget = getTextTarget(state?.artifact, selection?.targetId);
      const selectionCurrent = !!state && !!selection && (!selection?.renderHash || selection.renderHash === state.artifact?.hash)
        && (selection?.revision === undefined || selection.revision === state.revision) && state.status === 'ready';
      const editable = selectionCurrent ? getEditableSelection(state?.artifact, selection) : undefined;
      const themeId = state?.artifact?.meta.theme ?? this.context.themeId ?? project?.defaultTheme ?? null;
      const theme = themeId ? await readThemePaths(this.root, themeId).then(
        paths => ({ id: themeId, ...paths, available: true }),
        () => ({ id: themeId, ...themePaths(themeId), available: false }),
      ) : null;
      const assetDefaults = themeId ? await Promise.resolve().then(() => readThemeAssetDefaults(this.root, themeId)).then(
        choices => ({ file: `themes/${themeId}/assets.json`, choices, appliesTo: 'new-documents' }),
        error => ({ file: `themes/${themeId}/assets.json`, error: (error as Error).message, appliesTo: 'new-documents' }),
      ) : undefined;
      await atomicWrite(resolve(this.root, '.opendoc/current.json'), JSON.stringify({
        ...this.context, updatedAt: new Date().toISOString(),
        projectId: project?.id ?? null, project,
        themeId, theme: theme ? { ...theme, assetDefaults } : null,
        status: state?.status ?? 'idle', error: state?.error, revision: state?.revision,
        format: state?.format,
        slides: state?.artifact?.slides,
        title: state?.artifact?.meta.title,
        name: state ? documentName(state) : undefined,
        provenance: state ? state.artifact?.provenance ?? { entry: `documents/${state.id}/index.tsx` } : null,
        renderHash: state?.artifact?.hash, source: selectedBlock?.source ?? null,
        selectedBlock: selectedBlock ?? null,
        selection: selection ?? null,
        selectionCurrent,
        selectedText: selectedTarget ? {
          targetId: selectedTarget.id, blockId: selectedTarget.blockId, slot: selectedTarget.slot,
          text: selectedTarget.text.slice(0, 1200),
          editable: !!editable,
          source: editable ? { file: editable.source.file, digest: editable.source.digest, start: editable.source.start, end: editable.source.end, linkedOccurrences: editable.source.linkedOccurrences } : null,
        } : null,
        manualEdit: { editing: this.context.editing ?? false, pendingEdits: this.context.pendingEdits ?? 0, draftPreview: this.context.draftPreview ?? false, lastCorrection: state?.manualEdit ?? null, renderStatus: state?.status ?? 'idle' },
        selectedMedia,
        selectedAsset,
        documentAssets,
        renderedAssets: state?.artifact ? { uses: state.artifact.assets ?? [], bindings: state.artifact.assetBindings ?? null, current: state.status === 'ready', renderHash: state.artifact.hash } : null,
        materials: state ? { media: `documents/${state.id}/media`, usedMedia: state.artifact?.media ?? [] } : null,
        pendingComments: comments, commentsError,
      }, null, 2) + '\n');
    });
    return this.contextWrites;
  }
  async close() {
    this.closed = true; clearTimeout(this.debounce); this.pending.clear(); this.scheduled.clear();
    while (this.running.size) await new Promise(r => setTimeout(r, 30));
    await this.contextWrites;
    await Promise.all([...this.outputs.values()].flat().map(output => rm(output.directory, { recursive: true, force: true })));
    this.outputs.clear();
  }
}
