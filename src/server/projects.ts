import { constants, lstatSync, readFileSync, unlinkSync } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { readTheme } from './themes';
import { emptyProjects, type Project, type ProjectsManifest } from '../shared/projects';
import { atomicWrite } from './files';
import { documentEntry, validId } from './render';

export class ProjectError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) { super(message); this.name = 'ProjectError'; }
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** A terminated CLI must not leave all later project changes permanently busy. */
function releaseDeadProjectLock(lock: string) {
  try {
    const before = lstatSync(lock);
    if (!before.isFile() || before.isSymbolicLink() || before.size > 128) return;
    let pid: number | undefined;
    try { pid = (JSON.parse(readFileSync(lock, 'utf8')) as { pid?: number } | null)?.pid; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    if (Number.isSafeInteger(pid) && pid! > 0) {
      try { process.kill(pid!, 0); return; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return; }
    } else if (Date.now() - before.mtimeMs < 30_000) return;
    const current = lstatSync(lock);
    if (current.dev === before.dev && current.ino === before.ino && current.mtimeMs === before.mtimeMs) unlinkSync(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
function projectName(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120 || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(value)) throw new ProjectError('Give the project a name of 120 characters or fewer, on one line.');
  return value.trim();
}
export async function selectedTheme(root: string, value: unknown): Promise<string | null> {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !validId(value)) throw new ProjectError('Choose an available theme.');
  try { await readTheme(root, value); } catch { throw new ProjectError('Choose an available theme.'); }
  return value;
}

function parseManifest(value: unknown): ProjectsManifest {
  const invalid = () => new ProjectError('projects.json is invalid. Ask your agent to repair it; no project data was replaced.');
  if (!record(value) || value.version !== 1 || !Array.isArray(value.projects) || !record(value.assignments) || Object.keys(value).some(key => !['version', 'projects', 'assignments', 'names', 'formats'].includes(key))) throw invalid();
  const ids = new Set<string>();
  const projects = value.projects.map((entry): Project => {
    if (!record(entry) || typeof entry.id !== 'string' || !validId(entry.id) || entry.id.length > 80 || ids.has(entry.id) || Object.keys(entry).some(key => !['id', 'name', 'defaultTheme'].includes(key))) throw invalid();
    ids.add(entry.id);
    // Keep a removed custom theme readable. Creation will ask for an available replacement.
    if (entry.defaultTheme !== null && (typeof entry.defaultTheme !== 'string' || !entry.defaultTheme.trim())) throw invalid();
    return { id: entry.id, name: projectName(entry.name), defaultTheme: entry.defaultTheme as string | null };
  });
  const assignments: Record<string, string> = {};
  for (const [id, projectId] of Object.entries(value.assignments)) {
    if (!validId(id) || id.length > 80 || typeof projectId !== 'string' || !ids.has(projectId)) throw invalid();
    assignments[id] = projectId;
  }
  const names: Record<string, string> = {};
  if (value.names !== undefined) {
    if (!record(value.names)) throw invalid();
    for (const [id, name] of Object.entries(value.names)) {
      if (!validId(id) || id.length > 80) throw invalid();
      names[id] = documentDisplayName(name);
    }
  }
  const formats: NonNullable<ProjectsManifest['formats']> = {};
  if (value.formats !== undefined) {
    if (!record(value.formats)) throw invalid();
    for (const [id, format] of Object.entries(value.formats)) {
      if (!validId(id) || id.length > 80 || !['document', 'presentation'].includes(format as string)) throw invalid();
      formats[id] = format as 'document' | 'presentation';
    }
  }
  return { version: 1, projects, assignments, ...(value.names === undefined ? {} : { names }), ...(value.formats === undefined ? {} : { formats }) };
}

export function documentDisplayName(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 160 || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(value)) throw new ProjectError('Give the document a name of 160 characters or fewer, on one line.');
  return value.trim();
}

async function manifestFile(root: string) {
  const file = resolve(await realpath(root), 'projects.json');
  const info = await lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (info && (!info.isFile() || info.isSymbolicLink() || info.size > 1_000_000)) throw new ProjectError('projects.json must be a regular local file smaller than 1 MB.');
  return { file, exists: Boolean(info) };
}

export async function readProjects(root: string): Promise<ProjectsManifest> {
  const { file, exists } = await manifestFile(root);
  if (!exists) return emptyProjects();
  try { return parseManifest(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) {
    if (error instanceof ProjectError) throw error;
    throw new ProjectError('Could not read projects.json. Ask your agent to repair it; no project data was replaced.');
  }
}

/** Serialize browser and CLI changes, including document publication and its assignment. */
export async function withProjects<T>(root: string, change: (manifest: ProjectsManifest, save: () => Promise<void>) => Promise<T>): Promise<T> {
  const workspace = await realpath(root);
  const runtime = resolve(workspace, '.opendoc');
  await mkdir(runtime, { recursive: true });
  const lock = resolve(runtime, 'projects.lock');
  let handle;
  const started = Date.now();
  while (!handle) {
    try { handle = await open(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      releaseDeadProjectLock(lock);
      if (Date.now() - started > 5000) throw new ProjectError('Project files are busy. Try again when the other operation finishes.', 409);
      await setTimeout(25);
    }
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid }));
    const manifest = await readProjects(workspace);
    return await change(manifest, async () => {
      const { file } = await manifestFile(workspace);
      await atomicWrite(file, `${JSON.stringify(parseManifest(manifest), null, 2)}\n`);
    });
  } finally { await handle.close(); await unlink(lock); }
}

export function requireProject(manifest: ProjectsManifest, id: unknown): Project {
  if (typeof id !== 'string' || !validId(id)) throw new ProjectError('Choose a project before creating a document.');
  const project = manifest.projects.find(project => project.id === id);
  if (!project) throw new ProjectError('This project no longer exists. Choose another project.', 404);
  return project;
}

export async function createProject(root: string, input: unknown): Promise<Project> {
  if (!record(input) || Object.keys(input).some(key => !['name', 'id', 'defaultTheme'].includes(key))) throw new ProjectError('Provide a project name and an optional default theme.');
  const name = projectName(input.name);
  const defaultTheme = await selectedTheme(root, input.defaultTheme);
  const derived = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '') || 'new-project';
  const id = input.id ?? derived;
  if (typeof id !== 'string' || !validId(id) || id.length > 80) throw new ProjectError('Use a project ID with lowercase letters, numbers, and single hyphens, up to 80 characters.');
  return withProjects(root, async (manifest, save) => {
    if (manifest.projects.some(project => project.id === id || project.name.toLowerCase() === name.toLowerCase())) throw new ProjectError('A project with this name or ID already exists. Choose another name.', 409);
    const project = { id, name, defaultTheme };
    manifest.projects.push(project); await save(); return project;
  });
}

export async function updateProject(root: string, id: string, input: unknown): Promise<Project> {
  if (!record(input) || !Object.keys(input).length || Object.keys(input).some(key => !['name', 'defaultTheme'].includes(key))) throw new ProjectError('Provide a project name or default theme.');
  return withProjects(root, async (manifest, save) => {
    const project = requireProject(manifest, id);
    if (input.name !== undefined) {
      const name = projectName(input.name);
      if (manifest.projects.some(other => other.id !== id && other.name.toLowerCase() === name.toLowerCase())) throw new ProjectError('A project with this name already exists.', 409);
      project.name = name;
    }
    if (Object.hasOwn(input, 'defaultTheme')) project.defaultTheme = await selectedTheme(root, input.defaultTheme);
    await save(); return project;
  });
}

export async function assignProject(root: string, documentId: string, projectId: unknown) {
  return withProjects(root, async (manifest, save) => {
    const project = requireProject(manifest, projectId);
    await documentEntry(root, documentId);
    manifest.assignments[documentId] = project.id;
    await save(); return { id: documentId, projectId: project.id };
  });
}

export async function deleteProject(root: string, id: string) {
  return withProjects(root, async (manifest, save) => {
    requireProject(manifest, id);
    for (const [documentId, projectId] of Object.entries(manifest.assignments)) {
      if (projectId !== id) continue;
      const exists = await lstat(resolve(root, 'documents', documentId)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (exists) throw new ProjectError('Move this project’s documents to another project before deleting it.', 409);
      delete manifest.assignments[documentId];
    }
    manifest.projects = manifest.projects.filter(project => project.id !== id);
    await save();
  });
}
