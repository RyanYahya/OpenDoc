import { lstat, readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { classifyLanguage, countScripts, declaredLanguage, type DeclaredLanguage, type Language, type ScriptCounts } from '../shared/language';
import type { RenderArtifact } from '../shared/types';
import { validId } from './render';

/**
 * Derived languages. A rendered document is classified from its PDF text and the language and
 * direction its Document declared. Without a render (the command line, or a document that does
 * not render yet), OpenDoc reads the text in its source instead: JSX text, and string values that
 * read like prose (containing a space or a non-ASCII letter), so identifiers, IDs, and import
 * paths do not count. Results are cached per render, or per source file revision.
 */

const rendered = new WeakMap<RenderArtifact, Language>();

export function artifactLanguage(artifact: RenderArtifact): Language {
  const cached = rendered.get(artifact);
  if (cached) return cached;
  const counts: ScriptCounts = { arabic: 0, latin: 0 };
  for (const block of Object.values(artifact.blocks)) countScripts(block.text, counts);
  const language = classifyLanguage(counts, { lang: artifact.lang, direction: artifact.direction });
  rendered.set(artifact, language);
  return language;
}

/** A theme has no text of its own; its declared direction and language decide. */
export function themeLanguage(theme: DeclaredLanguage): Language {
  return declaredLanguage(theme);
}

const proseLike = (value: string) => /\S\s+\S/u.test(value) || /[^\x00-\x7f]/u.test(value);

/** Prose-like text in TypeScript or TSX source, without evaluating it. */
export function sourceProse(file: string, text: string): string[] {
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportTypeNode(node) || ts.isExternalModuleReference(node)) return;
    if (ts.isJsxText(node)) { if (node.text.trim()) found.push(node.text); }
    else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && proseLike(node.text)) {
      if (!(ts.isCallExpression(node.parent) && ts.isIdentifier(node.parent.expression) && node.parent.expression.text === 'require')) found.push(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return found;
}

/** Prose-like string values in a JSON data file; keys never count. */
export function jsonProse(text: string): string[] {
  const found: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === 'string') { if (proseLike(value)) found.push(value); }
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  try { visit(JSON.parse(text)); } catch { /* An unreadable data file has no text to count. */ }
  return found;
}

const directionPattern = /\bdirection\s*[:=]\s*\{?\s*['"`](ltr|rtl|auto)['"`]/u;
const langPattern = /\blang\s*[:=]\s*\{?\s*['"`]([A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*)['"`]/u;
const themeImport = /from\s+['"](?:\.\.?\/)+(?:\.\.\/)*themes\/([a-z0-9-]+)(?:\/index)?['"]/gu;

/** The first direction and language written in source, such as `direction="rtl"` or `lang: 'ar'`. */
export function sourceDeclaration(text: string): DeclaredLanguage {
  const direction = directionPattern.exec(text)?.[1];
  const lang = langPattern.exec(text)?.[1];
  return { ...(direction ? { direction } : {}), ...(lang ? { lang } : {}) };
}

const maximumFileSize = 512_000;
const maximumFiles = 60;
const textExtensions = new Set(['.tsx', '.ts', '.jsx', '.json', '.md', '.txt']);

interface SourceFile { path: string; name: string; size: number; mtimeMs: number }

/** Local text files of one item, skipping media, history, and dot folders. */
async function itemFiles(folder: string, depth = 0, found: SourceFile[] = []): Promise<SourceFile[]> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (found.length >= maximumFiles || entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'media') continue;
    const path = resolve(folder, entry.name);
    if (entry.isDirectory() && depth < 2) await itemFiles(path, depth + 1, found);
    else if (entry.isFile() && textExtensions.has(extname(entry.name))) {
      const info = await lstat(path).catch(() => undefined);
      if (info?.isFile() && info.size <= maximumFileSize) found.push({ path, name: entry.name, size: info.size, mtimeMs: info.mtimeMs });
    }
  }
  return found;
}

/** Files that hold settings rather than content: asset bindings, theme definitions, guides, and schemas. */
const settingsFile = (name: string) => ['assets.json', 'template.json', 'AGENTS.md', 'README.md', 'preview.tsx'].includes(name) || /^(?:theme|schema)\.tsx?$/u.test(name);
const declaringFile = (name: string) => /^(?:index|starter|theme)\.tsx?$/u.test(name);

const fromSource = new Map<string, { signature: string; language: Language }>();

/**
 * Classify a document or template folder from its source. A declaration in the item's own files
 * wins over one in a workspace theme it imports.
 */
export async function sourceLanguage(root: string, kind: 'documents' | 'templates', id: string): Promise<Language> {
  if (!validId(id)) return 'english';
  const folder = resolve(root, kind, id);
  const files = await itemFiles(folder);
  const signature = JSON.stringify(files.map(file => [relative(folder, file.path), file.size, file.mtimeMs]));
  const cached = fromSource.get(folder);
  if (cached?.signature === signature) return cached.language;
  const counts: ScriptCounts = { arabic: 0, latin: 0 };
  let declared: DeclaredLanguage = {};
  const themes = new Set<string>();
  for (const file of files) {
    const text = await readFile(file.path, 'utf8').catch(() => '');
    const extension = extname(file.name);
    if (declaringFile(file.name) && relative(folder, file.path).split(sep).length === 1) {
      declared = { ...sourceDeclaration(text), ...declared };
      for (const match of text.matchAll(themeImport)) themes.add(match[1]);
    }
    if (settingsFile(file.name)) continue;
    const prose = extension === '.json' ? jsonProse(text) : extension === '.md' || extension === '.txt' ? [text] : sourceProse(file.name, text);
    for (const value of prose) countScripts(value, counts);
  }
  for (const theme of themes) {
    if (declared.direction && declared.lang) break;
    if (!validId(theme)) continue;
    const text = await readFile(resolve(root, 'themes', theme, 'index.ts'), 'utf8').catch(() => '');
    declared = { ...sourceDeclaration(text), ...declared };
  }
  const language = classifyLanguage(counts, declared);
  if (fromSource.size > 500) fromSource.clear();
  fromSource.set(folder, { signature, language });
  return language;
}

/** A document's language: from its current render when there is one, otherwise from its source. */
export async function documentLanguage(root: string, id: string, artifact?: RenderArtifact): Promise<Language> {
  return artifact ? artifactLanguage(artifact) : sourceLanguage(root, 'documents', id);
}
