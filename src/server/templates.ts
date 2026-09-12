import { lstat, readdir, readFile, rm, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { documentDependencies, includesDependency, type DocumentDependencies, isRenderRuntimePath } from './dependencies';
import type { TemplateDescriptor, TemplateItem, TemplatePreview } from '../shared/templates';
import { containedFile } from './files';
import { RenderFailure } from './render-error';
import { renderEntry, validId } from './render';
import { createDocumentFromFiles } from './create';

export async function templateFile(root: string, id: string, name: string) {
  if (!validId(id)) throw new Error('Invalid template ID.');
  const folder = await containedFile(resolve(root, 'templates'), resolve(root, 'templates', id));
  return containedFile(folder, resolve(folder, name));
}

export async function readTemplateGuide(root: string, id: string): Promise<string> {
  const file = await templateFile(root, id, 'AGENTS.md');
  const info = await stat(file);
  if (!info.isFile()) throw new Error('The template guide must be a Markdown file.');
  if (info.size > 128_000) throw new Error('This template guide is too large to display.');
  return readFile(file, 'utf8');
}

export async function readTemplate(root: string, id: string): Promise<TemplateDescriptor> {
  const path = await templateFile(root, id, 'template.json');
  if ((await stat(path)).size > 32_000) throw new Error('Template description is too large.');
  const data = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => !['name', 'description', 'format', 'structure', 'documentFormat'].includes(key))) throw new Error('Invalid template description.');
  if (data.documentFormat !== undefined && data.documentFormat !== 'document' && data.documentFormat !== 'presentation') throw new Error('template.documentFormat must be document or presentation.');
  for (const key of ['name', 'description', 'format']) {
    if (typeof data[key] !== 'string' || !(data[key] as string).trim() || (data[key] as string).length > (key === 'description' ? 600 : 120)) throw new Error(`template.${key} needs a short, nonempty description.`);
  }
  if (!Array.isArray(data.structure) || !data.structure.length || data.structure.length > 8 || data.structure.some(item => typeof item !== 'string' || !item.trim() || item.length > 240)) throw new Error('template.structure needs one to eight short layout notes.');
  await Promise.all(['index.tsx', 'preview.tsx', 'starter.tsx', 'AGENTS.md'].map(name => templateFile(root, id, name)));
  return data as unknown as TemplateDescriptor;
}

type Preview = TemplatePreview & { directory?: string };

/** Discover descriptions immediately; render only requested previews, with two workers. */
export class TemplateCatalog {
  private version = 0;
  private globalVersion = 0;
  private versions = new Map<string, number>();
  private session = randomUUID();
  private summaries?: { version: number; result: Promise<TemplateItem[]> };
  private previews = new Map<string, { version: string; result: Promise<Preview> }>();
  private dependencies = new Map<string, DocumentDependencies>();
  private active = 0;
  private waiting: (() => void)[] = [];
  private closed = false;
  constructor(private root: string) {}
  invalidate(id?: string) {
    this.version++;
    if (id) this.dependencies.delete(id); else this.dependencies.clear();
    if (id) this.versions.set(id, (this.versions.get(id) ?? 0) + 1);
    else this.globalVersion++;
  }
  private revision(id: string) { return `${this.session}:${id}:${this.globalVersion}:${this.versions.get(id) ?? 0}`; }
  async noteChange(file: string) {
    const path = resolve(this.root, file);
    const parts = relative(this.root, path).split(sep);
    if (parts[0] === 'templates') this.version++;
    const entries = await readdir(resolve(this.root, 'templates'), { withFileTypes: true }).catch(() => []);
    const ids = new Set([...entries.filter(entry => entry.isDirectory() && validId(entry.name)).map(entry => entry.name), ...this.previews.keys()]);
    for (const id of ids) {
      const dependencies = this.dependencies.get(id);
      if (isRenderRuntimePath(this.root, path) || (parts[0] === 'themes' && parts[1] === 'neutral') || (parts[0] === 'templates' && (!parts[1] || parts[1] === id))
        || !dependencies || dependencies.readsFiles || includesDependency(dependencies, path)) this.invalidate(id);
    }
  }
  async list(): Promise<TemplateItem[]> {
    if (!this.summaries || this.summaries.version !== this.version) {
      const version = this.version;
      const result = (async () => {
        const entries = await readdir(resolve(this.root, 'templates'), { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
        return Promise.all(entries.filter(folder => folder.isDirectory() && validId(folder.name)).sort((a, b) => a.name.localeCompare(b.name)).map(async folder => {
          try { return { id: folder.name, descriptor: await readTemplate(this.root, folder.name), revision: this.revision(folder.name) }; }
          catch (error) { return { id: folder.name, descriptor: { name: folder.name, description: 'This template needs attention.', format: '', structure: [] }, revision: this.revision(folder.name), error: error instanceof Error ? error.message : String(error) }; }
        }));
      })();
      this.summaries = { version, result };
    }
    const snapshot = this.summaries;
    try {
      const items = await snapshot.result;
      return snapshot.version === this.version ? items : this.list();
    } catch (error) { if (this.summaries === snapshot) this.summaries = undefined; throw error; }
  }
  private async render(id: string, version: string): Promise<Preview> {
    if (this.active >= 2) await new Promise<void>(accept => this.waiting.push(accept));
    else this.active++;
    let directory: string | undefined;
    try {
      if (this.closed) throw new Error('The template catalog is closed.');
      const descriptor = await readTemplate(this.root, id);
      const entry = await templateFile(this.root, id, 'preview.tsx');
      const dependencies = await documentDependencies(this.root, entry).catch(() => undefined);
      const rendered = await renderEntry(this.root, entry, `template-${id}`);
      directory = rendered.directory;
      if (rendered.artifact.meta.theme !== 'neutral') throw new Error('Template previews must use the Neutral theme.');
      if (rendered.artifact.format !== (descriptor.documentFormat ?? 'document')) throw new Error('The template preview must use the root matching its documentFormat.');
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
  private async current(id: string): Promise<Preview> {
    if (!validId(id)) throw new Error('Invalid template ID.');
    if (this.closed) throw new Error('The template catalog is closed.');
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
    if (result.error && this.previews.get(id) === snapshot) this.previews.delete(id);
    return result;
  }
  async preview(id: string): Promise<TemplatePreview> {
    const { directory: _directory, ...item } = await this.current(id);
    return item;
  }
  async pdf(id: string, hash: string) {
    const item = await this.current(id);
    if (!item.directory || item.artifact?.hash !== hash) throw new Error('This template preview changed. Reload Templates.');
    return readFile(resolve(item.directory, 'document.pdf'));
  }
  async close() {
    this.closed = true;
    const entries = await Promise.all([...this.previews.values()].map(item => item.result));
    await Promise.all(entries.map(item => item.directory && rm(item.directory, { recursive: true, force: true })));
    this.previews.clear();
  }
}

export async function createFromTemplate(root: string, id: string, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Provide a title and a project.');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['title', 'theme', 'id', 'projectId', 'format'].includes(key))) throw new Error('Only title, project, theme, format, and an optional document ID are accepted.');
  if (typeof value.title !== 'string' || (value.id !== undefined && typeof value.id !== 'string')) throw new Error('Give your document a title.');
  const descriptor = await readTemplate(root, id);
  const format = descriptor.documentFormat ?? 'document';
  if (value.format !== undefined && value.format !== format) throw new Error(`This template creates a ${format}. Choose a matching template or omit --format.`);
  const starter = await readFile(await templateFile(root, id, 'starter.tsx'), 'utf8');
  const created = await createDocumentFromFiles(root, {
    title: value.title, id: value.id as string | undefined, projectId: value.projectId as string, theme: value.theme as string | null | undefined, format,
  }, async (documentId, chosenTheme) => {
    const replacements: Record<string, string> = { '__OPENDOC_TITLE__': (value.title as string).trim(), '__OPENDOC_THEME__': chosenTheme ?? 'neutral', '__OPENDOC_DOCUMENT_ID__': documentId, '__OPENDOC_THEME_MODULE__': './theme' };
    const files: Record<string, string> = {};
    // A data-bound template gives each instance its own ordinary JSON input.
    const dataPath = resolve(root, 'templates', id, 'data.json');
    const dataStat = await lstat(dataPath).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
    let rawData = '';
    if (dataStat) {
      const dataFile = await templateFile(root, id, 'data.json');
      if ((await stat(dataFile)).size > 128_000) throw new Error('Template starter data is too large.');
      rawData = await readFile(dataFile, 'utf8');
      const data = JSON.parse(rawData.replace(/"(__OPENDOC_TITLE__|__OPENDOC_THEME__)"/g, (_match, marker: string) => JSON.stringify(replacements[marker])));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Template starter data must be a JSON object.');
      files['data.json'] = `${JSON.stringify(data, null, 2)}\n`;
    }
    for (const marker of ['__OPENDOC_TITLE__', '__OPENDOC_THEME__']) {
      if (!(starter + rawData).includes(JSON.stringify(marker))) throw new Error(`Template starter is missing its ${marker === '__OPENDOC_TITLE__' ? 'title' : 'theme'} placeholder.`);
    }
    if (starter.split('"__OPENDOC_THEME_MODULE__"').length !== 2) throw new Error('Template starter needs exactly one quoted theme module placeholder.');
    // A single pass over the original source never reinterprets literal user text.
    files['index.tsx'] = starter.replace(/"(__OPENDOC_TITLE__|__OPENDOC_THEME__|__OPENDOC_DOCUMENT_ID__|__OPENDOC_THEME_MODULE__)"/g, (_match, marker: string) => JSON.stringify(replacements[marker]));
    return files;
  });
  return { id: created.id, title: created.title, entry: created.entry, projectId: created.projectId, template: id, format };
}
