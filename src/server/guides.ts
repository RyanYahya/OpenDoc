import { readFile, realpath, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { applicationRoot } from '../runtime/paths';
import { containedFile } from './files';

export class GuideError extends Error {
  constructor(message: string, public status: 400 | 404 = 400) { super(message); }
}

const namedGuides = new Set(['README.md', 'AGENTS.md', 'VALIDATION.md', 'CONTRIBUTING.md', 'SECURITY.md', 'THIRD_PARTY.md', 'templates/AGENTS.md', 'vendor/formepdf/README.md']);
const maxGuideBytes = 128_000;

function isApplicationGuide(file: string): boolean {
  return namedGuides.has(file) || file.startsWith('docs/') || file.startsWith('.agents/skills/');
}

function isMissing(error: unknown): boolean {
  return ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '');
}

function guidePath(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > 512 || !value.endsWith('.md') || /[\\\u0000-\u001f\u007f?#:]/.test(value)
    || value.split('/').some((part, index) => !part || (part.startsWith('.') && !(index === 0 && part === '.agents')))) {
    throw new GuideError('Choose a workspace-relative Markdown guide.');
  }
  if (!namedGuides.has(value) && !/^docs\/.+\.md$/.test(value)
    && !/^(?:templates|themes)\/[a-z0-9]+(?:-[a-z0-9]+)*\/.+\.md$/.test(value)
    && !/^\.agents\/skills\/.+\.md$/.test(value)) {
    throw new GuideError('That file is outside the OpenDoc guide locations.');
  }
}

async function readGuideAt(root: string, file: string, application = false): Promise<{ file: string; markdown: string }> {
  const base = await realpath(root);
  const path = await containedFile(base, resolve(base, file));
  const canonical = relative(base, path).split(sep).join('/');
  guidePath(canonical);
  if (application && !isApplicationGuide(canonical)) throw new GuideError('That file is outside the installed OpenDoc guide locations.');
  const info = await stat(path);
  if (!info.isFile()) throw new GuideError('This guide must be a regular Markdown file.');
  if (info.size > maxGuideBytes) throw new GuideError('This guide is too large to display. Keep it below 128 KB.');
  const markdown = await readFile(path, 'utf8');
  if (Buffer.byteLength(markdown) > maxGuideBytes) throw new GuideError('This guide is too large to display. Keep it below 128 KB.');
  return { file: canonical, markdown };
}

/** Prefer workspace guidance; only canonical application guides can fall back to the installation. */
export async function readGuide(root: string, file: unknown): Promise<{ file: string; markdown: string }> {
  try {
    // Generated workspace pointers name this one installed package explicitly.
    // Resolve through our application root, never through arbitrary node_modules paths.
    const prefix = 'node_modules/opendoc/';
    if (typeof file === 'string' && file.startsWith(prefix)) {
      const installed = file.slice(prefix.length);
      guidePath(installed);
      if (/^(?:templates|themes)\//.test(installed)) return await readGuideAt(root, installed);
      if (!isApplicationGuide(installed)) throw new GuideError('That file is outside the installed OpenDoc guide locations.');
      const guide = await readGuideAt(applicationRoot, installed, true);
      return { ...guide, file: `${prefix}${guide.file}` };
    }
    guidePath(file);
    try { return await readGuideAt(root, file); }
    catch (error) {
      if (!isMissing(error) || !isApplicationGuide(file)) throw error;
    }
    return await readGuideAt(applicationRoot, file, true);
  } catch (error) {
    if (isMissing(error)) throw new GuideError(`This guide is missing: ${file}. Ask your agent to restore it or update the link.`, 404);
    throw error;
  }
}
