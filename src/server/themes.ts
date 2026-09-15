import { lstat, readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import type { LayoutInfo } from '@formepdf/core';
import { validateTheme, type DocTheme } from '../themes/index';
import type { ThemePreview, ThemeSummary } from '../shared/themes';
import { containedFile } from './files';
import { RenderFailure } from './render-error';
import { renderEntry, validId } from './render';
import { bindingDependencies, readAssetRevision, readThemeAssetDefaults, resolveThemeAssets } from '../assets/files';
import { documentDependencies, includesDependency, type DocumentDependencies, isRenderRuntimePath, isManagedAssetPath } from './dependencies';
import { authoringResolutionPlugin } from './source-overrides';

export async function themeFile(root: string, id: string, name: 'index.ts' | 'design.md' | 'preview.tsx' | 'components.tsx') {
  if (typeof id !== 'string' || !validId(id)) throw new Error('Invalid theme ID.');
  const folder = await containedFile(resolve(root, 'themes'), resolve(root, 'themes', id));
  const file = await containedFile(folder, resolve(folder, name));
  const info = await stat(file);
  if (!info.isFile() || info.size > (name === 'design.md' ? 64_000 : 256_000)) throw new Error(`Theme ${name} must be a regular, reasonably sized local file.`);
  return file;
}

/** Bundle the current definition, including local imports. No long-lived Node module cache or restart needed. */
export async function readTheme(root: string, id: string): Promise<DocTheme> {
  const [entry] = await Promise.all(['index.ts', 'design.md', 'preview.tsx'].map(name => themeFile(root, id, name as 'index.ts' | 'design.md' | 'preview.tsx')));
  await readThemePaths(root, id);
  const result = await build({ absWorkingDir: root, entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', plugins: [authoringResolutionPlugin()] });
  await readThemeGuide(root, id);
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
  const theme = module.theme as DocTheme;
  validateTheme(theme);
  if (theme.id !== id) throw new Error(`Theme ID ${JSON.stringify(theme.id)} must match its folder ${JSON.stringify(id)}.`);
  return theme;
}

export async function readThemeGuide(root: string, id: string) {
  const markdown = await readFile(await themeFile(root, id, 'design.md'), 'utf8');
  if (!markdown.trim()) throw new Error('This theme needs a design guide.');
  return markdown;
}

export function themePaths(id: string) {
  return { definition: `themes/${id}/index.ts`, guide: `themes/${id}/design.md`, preview: `themes/${id}/preview.tsx` };
}

/** Components are optional native PDF code, discovered without executing them. */
export async function readThemePaths(root: string, id: string): Promise<ReturnType<typeof themePaths> & { components?: string }> {
  const definition = await themeFile(root, id, 'index.ts');
  const components = resolve(dirname(definition), 'components.tsx');
  const exists = await lstat(components).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (!exists) return themePaths(id);
  await themeFile(root, id, 'components.tsx');
  return { ...themePaths(id), components: `themes/${id}/components.tsx` };
}
function summarize(theme: DocTheme): ThemeSummary {
  return { id: theme.id, name: theme.name, description: theme.description, body: theme.body, heading: theme.heading, pageSize: theme.pageSize, useFor: theme.useFor ?? [], principles: theme.principles ?? [], palette: theme.palette ?? [], geometry: theme.geometry ?? [] };
}
async function summarizeWithAssets(root: string, theme: DocTheme): Promise<ThemeSummary> {
  const summary = summarize(theme);
  try {
    summary.assetDefaults = await readThemeAssetDefaults(root, theme.id);
    const bindings = await resolveThemeAssets(root, theme.id);
    summary.baseBody = theme.body; summary.baseHeading = theme.heading;
    if (bindings.bodyFont) summary.body = (await readAssetRevision(root, 'font', bindings.bodyFont.id, bindings.bodyFont.revision)).name;
    if (bindings.headingFont) summary.heading = (await readAssetRevision(root, 'font', bindings.headingFont.id, bindings.headingFont.revision)).name;
  } catch (error) { summary.assetError = error instanceof Error ? error.message : String(error); }
  return summary;
}

type RenderedPreview = ThemePreview & { directory?: string };
/** Small discovery records; PDF work starts only when a specimen is requested, with at most two workers. */
export class ThemeCatalog {
  private version = 0;
  private globalVersion = 0;
  private themeVersions = new Map<string, number>();
  private session = randomUUID();
  private summaries?: { version: number; result: Promise<ThemeSummary[]> };
  private previews = new Map<string, { version: string; result: Promise<RenderedPreview> }>();
  private dependencies = new Map<string, DocumentDependencies>();
  private definitions = new Map<string, DocumentDependencies>();
  private active = 0;
  private waiting: (() => void)[] = [];
  private closed = false;
  constructor(private root: string) {}
  invalidate(id?: string) {
    this.version++;
    if (id) { this.dependencies.delete(id); this.definitions.delete(id); }
    else { this.dependencies.clear(); this.definitions.clear(); }
    if (id) this.themeVersions.set(id, (this.themeVersions.get(id) ?? 0) + 1);
    else this.globalVersion++;
  }
  private revision(id: string) { return `${this.session}:${this.globalVersion}:${this.themeVersions.get(id) ?? 0}`; }
  /** Catalog publications affect only specimens whose current defaults depend on those bytes. */
  async noteChange(file: string): Promise<string[]> {
    const path = resolve(this.root, file);
    const parts = relative(this.root, path).split(sep);
    if (parts[0] === 'themes') this.version++;
    if (!isManagedAssetPath(this.root, path)) {
      const entries = await readdir(resolve(this.root, 'themes'), { withFileTypes: true }).catch(() => []);
      const ids = new Set([...entries.filter(entry => entry.isDirectory() && validId(entry.name)).map(entry => entry.name), ...this.previews.keys()]);
      const affected: string[] = [];
      for (const id of ids) {
        const graphs = [this.definitions.get(id), this.dependencies.get(id)].filter(Boolean) as DocumentDependencies[];
        if (isRenderRuntimePath(this.root, path) || (parts[0] === 'themes' && (!parts[1] || parts[1] === id)) || !graphs.length || (this.previews.has(id) && !this.dependencies.has(id))
          || graphs.some(graph => graph.readsFiles || includesDependency(graph, path))) { this.invalidate(id); affected.push(id); }
      }
      return affected;
    }
    const entries = await readdir(resolve(this.root, 'themes'), { withFileTypes: true }).catch(() => []);
    const affected: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !validId(entry.name)) continue;
      const graphs = [this.definitions.get(entry.name), this.dependencies.get(entry.name)].filter(Boolean) as DocumentDependencies[];
      if (graphs.some(graph => graph.readsFiles || includesDependency(graph, path)) || (this.previews.has(entry.name) && !this.dependencies.has(entry.name))) {
        affected.push(entry.name); this.invalidate(entry.name); continue;
      }
      try {
        const defaults = await readThemeAssetDefaults(this.root, entry.name);
        const references = [defaults.logo && ['logos', defaults.logo.id], defaults.bodyFont && ['fonts', defaults.bodyFont], defaults.headingFont && ['fonts', defaults.headingFont]].filter(Boolean) as string[][];
        if (!references.some(([kind, id]) => parts[1] === kind && (!parts[2] || parts[2] === id))) continue;
        let relevant = parts.length <= 3 || parts[3] === 'asset.json';
        try {
          const bindings = await resolveThemeAssets(this.root, entry.name);
          const files = (await bindingDependencies(this.root, bindings)).map(file => resolve(this.root, file));
          relevant ||= files.some(file => file === path || file.startsWith(path + sep));
        } catch { relevant = true; }
        if (relevant) { affected.push(entry.name); this.invalidate(entry.name); }
      } catch { /* Invalid neighboring defaults do not prevent other catalogs refreshing. */ }
    }
    return affected;
  }
  async list(): Promise<ThemeSummary[]> {
    if (!this.summaries || this.summaries.version !== this.version) {
      const version = this.version;
      const result = (async () => {
        const entries = await readdir(resolve(this.root, 'themes'), { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
        const items: ThemeSummary[] = [];
        for (const folder of entries.sort((a, b) => a.name.localeCompare(b.name))) {
          if (!folder.isDirectory() || !validId(folder.name)) continue;
          try {
            const entry = await themeFile(this.root, folder.name, 'index.ts');
            const dependencies = await documentDependencies(this.root, entry).catch(() => undefined);
            items.push(await summarizeWithAssets(this.root, await readTheme(this.root, folder.name)));
            if (dependencies && version === this.version) this.definitions.set(folder.name, dependencies);
          }
          catch (error) { items.push({ id: folder.name, name: folder.name, description: 'This theme needs attention.', body: '', heading: '', pageSize: '', useFor: [], principles: [], error: error instanceof Error ? error.message : String(error) }); }
        }
        return items.map(item => ({ ...item, revision: this.revision(item.id) }));
      })();
      this.summaries = { version, result };
    }
    const snapshot = this.summaries;
    const items = await snapshot.result;
    return snapshot.version === this.version ? items : this.list();
  }
  private async render(id: string, version: string): Promise<RenderedPreview> {
    if (this.active >= 2) await new Promise<void>(accept => this.waiting.push(accept));
    else this.active++;
    let directory: string | undefined;
    try {
      if (this.closed) throw new Error('The theme catalog is closed.');
      await readTheme(this.root, id);
      await readThemeGuide(this.root, id);
      const entry = await themeFile(this.root, id, 'preview.tsx');
      const dependencies = await documentDependencies(this.root, entry).catch(() => undefined);
      const rendered = await renderEntry(this.root, entry, `theme-${id}`);
      directory = rendered.directory;
      if (rendered.artifact.meta.theme !== id) throw new Error('The specimen must use its own theme ID.');
      if (dependencies && version === this.revision(id)) {
        for (const file of rendered.artifact.assetDependencies ?? []) dependencies.files.add(resolve(this.root, file));
        this.dependencies.set(id, dependencies);
      }
      return rendered;
    } catch (error) {
      if (directory) await rm(directory, { recursive: true, force: true });
      return { error: error instanceof Error ? error.message : String(error), ...(error instanceof RenderFailure ? { issues: error.issues } : {}) };
    } finally { const next = this.waiting.shift(); if (next) next(); else this.active--; }
  }
  private async current(id: string): Promise<RenderedPreview> {
    if (typeof id !== 'string' || !validId(id)) throw new Error('Invalid theme ID.');
    if (this.closed) throw new Error('The theme catalog is closed.');
    let snapshot = this.previews.get(id);
    if (!snapshot || snapshot.version !== this.revision(id)) {
      const previous = snapshot;
      const version = this.revision(id);
      const result = (async () => {
        const old = await previous?.result;
        const next = await this.render(id, version);
        if (old?.directory) await rm(old.directory, { recursive: true, force: true });
        return next;
      })();
      snapshot = { version, result }; this.previews.set(id, snapshot);
    }
    const result = await snapshot.result;
    if (snapshot.version !== this.revision(id)) return this.current(id);
    // A failed preview is retryable even before a file watcher observes a repair.
    if (result.error && this.previews.get(id) === snapshot) this.previews.delete(id);
    return result;
  }
  async preview(id: string): Promise<ThemePreview> {
    const { directory: _directory, ...preview } = await this.current(id);
    return preview;
  }
  async pdf(id: string, hash: string) {
    const item = await this.current(id);
    if (!item.directory || item.artifact?.hash !== hash) throw new Error('This theme preview changed. Reload the theme.');
    return readFile(resolve(item.directory, 'document.pdf'));
  }
  async layout(id: string, hash: string): Promise<LayoutInfo> {
    const item = await this.current(id);
    if (!item.directory || item.artifact?.hash !== hash) throw new Error('This theme preview changed. Reload the theme.');
    return JSON.parse(await readFile(resolve(item.directory, 'layout.json'), 'utf8'));
  }
  async close() {
    this.closed = true;
    const entries = await Promise.all([...this.previews.values()].map(item => item.result));
    await Promise.all(entries.map(item => item.directory && rm(item.directory, { recursive: true, force: true })));
    this.previews.clear();
  }
}
