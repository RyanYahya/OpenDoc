import { readdir } from 'node:fs/promises';
import { dirname, extname, posix, relative, resolve } from 'node:path';
import ts from 'typescript';
import { assetFile, readAssetHead, readAssetRevision, resolveThemeAssets, revisionFiles } from '../assets/files';
import { ARABIC_FALLBACK_ASSET } from '../rendering/script-fallback';
import type { AssetKind } from '../shared/assets';
import { limits, validatePaths } from './archive';
import { exists, localPath, readLocal } from './files';
import { itemFolder, payloadPath, sourceExtensions, validPackId, type PackItem, type PackManifest } from './manifest';

const runtimeImports = new Set(['opendoc', 'opendoc/assets', 'opendoc/themes', 'opendoc/template', 'opendoc/jsx-runtime', 'opendoc/jsx-dev-runtime', 'react', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@formepdf/react', '@formepdf/core']);
const skip = (name: string) => name.startsWith('.') || ['node_modules', 'comments.json', 'output'].includes(name);
const documentation = (name: string) => /\.(md|txt)$/i.test(name) || /^(LICENSE|NOTICE|COPYING)$/i.test(name) || name === 'source.json';

/** Dependency collection reads source and metadata; it does not import authored code. */
export async function collectPack(root: string, selected: Pick<PackItem, 'kind' | 'id'>[], includes: string[] = []) {
  const files = new Map<string, Buffer>(), items = new Map<string, PackItem>();
  const assets: PackManifest['assets'] = [], visitedAssets = new Set<string>();
  const scanned = new Set<string>();
  let total = 0;

  async function add(path: string) {
    if (files.has(path)) return;
    if (!payloadPath(path) || path.startsWith('previews/')) throw new Error(`Unsupported pack dependency: ${path}. Keep reusable files inside themes/, templates/, or assets/.`);
    const bytes = await readLocal(root, path);
    total += bytes.length;
    if (total > limits.expanded || files.size >= limits.files - 101) throw new Error('Pack dependencies exceed the archive limits.');
    files.set(path, bytes);
  }

  async function tree(path: string) {
    await localPath(root, path);
    for (const entry of (await readdir(resolve(root, path), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (skip(entry.name)) continue;
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) await tree(child);
      else await add(child); // add rejects symlinks and unsupported content instead of dropping dependencies.
    }
  }

  async function asset(kind: AssetKind, id: string) {
    const key = `${kind}/${id}`;
    if (visitedAssets.has(key)) return;
    visitedAssets.add(key);
    const head = readAssetHead(root, kind, id);
    if (head.archived) throw new Error(`Pack depends on archived ${kind} ${id}. Restore it or change the design's defaults first.`);
    const record = readAssetRevision(root, kind, id, head.revision);
    const folder = `assets/${kind === 'font' ? 'fonts' : 'logos'}/${id}`;
    // Keep the current pointer and exact referenced revision, never unrelated historical versions.
    await add(`${folder}/asset.json`);
    await add(`${folder}/revisions/${head.revision}.json`);
    for (const file of revisionFiles(record)) { assetFile(root, kind, id, file); await add(`${folder}/${file.file}`); }
    for (const entry of await readdir(resolve(root, folder), { withFileTypes: true })) if (entry.isFile() && documentation(entry.name)) await add(`${folder}/${entry.name}`);
    assets.push({ kind, id, revision: head.revision });
  }

  async function item(kind: PackItem['kind'], id: string, requested = false) {
    if (!validPackId(id)) throw new Error(`Invalid ${kind} ID: ${id}.`);
    const folder = itemFolder({ kind, id }), known = items.get(folder);
    if (known) { known.selected ||= requested; return; }
    if (items.size >= 100) throw new Error('A pack can contain at most 100 catalog items.');
    items.set(folder, { kind, id, selected: requested });
    await tree(folder);
    if (kind === 'theme') {
      const bindings = resolveThemeAssets(root, id);
      if (bindings.logo) await asset('logo', bindings.logo.id);
      for (const font of [bindings.bodyFont, bindings.headingFont]) if (font) await asset('font', font.id);
    }
  }

  async function dependency(path: string) {
    if (!payloadPath(path)) throw new Error(`Dependency is outside portable design folders: ${path}.`);
    const [category, id] = path.split('/');
    if (['themes', 'templates'].includes(category) && validPackId(id)) {
      const descriptor = `${category}/${id}/${category === 'themes' ? 'index.ts' : 'template.json'}`;
      if (await exists(resolve(root, descriptor))) await item(category === 'themes' ? 'theme' : 'template', id);
    }
    if (category === 'assets' && ['fonts', 'logos'].includes(id)) {
      const family = path.split('/')[2];
      if (validPackId(family) && await exists(resolve(root, 'assets', id, family, 'asset.json'))) await asset(id === 'fonts' ? 'font' : 'logo', family);
    }
    await add(path);
    // Loose fonts/images often keep their redistribution license beside the original.
    if (!sourceExtensions.has(extname(path)) && extname(path) !== '.json') {
      const folder = dirname(path);
      for (const entry of await readdir(resolve(root, folder), { withFileTypes: true })) {
        if (entry.isFile() && /(?:license|notice|copying|ofl)/i.test(entry.name)) await add(`${folder}/${entry.name}`);
      }
    }
  }

  async function localImport(file: string, specifier: string) {
    if (specifier === '__OPENDOC_THEME_MODULE__' && file.endsWith('/starter.tsx')) return;
    if (runtimeImports.has(specifier)) return;
    if (!specifier.startsWith('.')) throw new Error(`${file}: unsupported import ${JSON.stringify(specifier)}. Packs support OpenDoc, React, Forme, and relative local imports; remove runtime filesystem reads and other package dependencies.`);
    const target = posix.normalize(posix.join(posix.dirname(file), specifier));
    const candidates = [target, ...['.ts', '.tsx', '.js', '.jsx', '.json'].map(extension => target + extension), ...['index.ts', 'index.tsx', 'index.js', 'index.jsx'].map(name => `${target}/${name}`)];
    // TypeScript commonly uses a .js specifier for a .ts source module.
    if (target.endsWith('.js')) candidates.push(target.slice(0, -3) + '.ts', target.slice(0, -3) + '.tsx');
    for (const candidate of candidates) {
      if (!payloadPath(candidate)) continue;
      const info = await exists(resolve(root, candidate));
      if (info?.isFile() || info?.isSymbolicLink()) { await dependency(candidate); return; }
    }
    throw new Error(`${file}: missing portable import ${JSON.stringify(specifier)}.`);
  }

  function checkResource(file: string, value: string) {
    if (/^(?:[a-z]+:|\/)/i.test(value) && !value.startsWith('data:')) throw new Error(`${file}: resource paths must be local and workspace-relative, not ${JSON.stringify(value)}.`);
  }

  async function literalResource(file: string, value: string) {
    if (/^(assets|themes|templates)\//.test(value) && extname(value)) { await dependency(value); return; }
    if (/^\.{1,2}\//.test(value) && /\.(png|svg|jpe?g|webp|gif|ttf|otf|woff2?|pdf|csv)$/i.test(value)) {
      await dependency(posix.normalize(posix.join(posix.dirname(file), value)));
    }
  }

  async function scan(file: string, bytes: Buffer) {
    if (extname(file) === '.json') {
      const visit = async (value: unknown): Promise<void> => {
        if (typeof value === 'string') await literalResource(file, value);
        else if (Array.isArray(value)) for (const part of value) await visit(part);
        else if (value && typeof value === 'object') for (const [key, part] of Object.entries(value)) {
          if (key === 'src' && typeof part === 'string') checkResource(file, part);
          await visit(part);
        }
      };
      // Managed manifests have their own validated, exact file references.
      if (!file.startsWith('assets/')) await visit(JSON.parse(bytes.toString('utf8')));
      return;
    }
    if (!sourceExtensions.has(extname(file))) return;
    const source = ts.createSourceFile(file, bytes.toString('utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const imports = new Set<string>(), resources = new Set<string>();
    function visit(node: ts.Node) {
      if (ts.isPropertyAssignment(node) && node.name.getText(source).replace(/["']/g, '') === 'src' && ts.isStringLiteralLike(node.initializer)) checkResource(file, node.initializer.text);
      if (ts.isJsxAttribute(node) && node.name.getText(source) === 'src' && node.initializer) {
        const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
        if (value && ts.isStringLiteralLike(value)) checkResource(file, value.text);
      }
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.add(node.moduleSpecifier.text);
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) imports.add(node.argument.literal.text);
      if (ts.isImportEqualsDeclaration(node)) throw new Error(`${file}: use ordinary ES imports in a portable design.`);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && ['require', 'eval'].includes(node.expression.text))) {
        throw new Error(`${file}: dynamic imports, require, and eval are not supported in portable designs.`);
      }
      if (ts.isIdentifier(node) && node.text === 'process') throw new Error(`${file}: process-dependent paths are not portable; use workspace-relative asset paths.`);
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL') {
        const args = node.arguments;
        if (!args || !ts.isStringLiteralLike(args[0]) || !/^\.{1,2}\//.test(args[0].text) || args[1]?.getText(source) !== 'import.meta.url') throw new Error(`${file}: portable URLs must use a literal relative path and import.meta.url.`);
        resources.add(posix.normalize(posix.join(posix.dirname(file), args[0].text)));
      }
      if (ts.isStringLiteralLike(node)) resources.add(node.text);
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const specifier of imports) await localImport(file, specifier);
    for (const value of resources) if (!imports.has(value)) await literalResource(file, value);
  }

  if (!selected.length) throw new Error('Choose at least one --theme or --template to share.');
  for (const choice of selected) await item(choice.kind, choice.id, true);
  for (const path of includes) {
    const normalized = relative(root, resolve(root, path)).split('\\').join('/');
    const target = await localPath(root, normalized);
    if ((await exists(target))?.isDirectory()) await tree(normalized);
    else await dependency(normalized);
  }
  // These are implicit dependencies of every OpenDoc document, including catalog specimens.
  for (const entry of await readdir(resolve(root, 'assets/fonts'), { withFileTypes: true })) {
    if (entry.isFile() && (/^OpenDoc.*\.ttf$/.test(entry.name) || /^Source(?:Sans|Serif|Code)-LICENSE\.md$/.test(entry.name))) await add(`assets/fonts/${entry.name}`);
  }
  await asset('font', ARABIC_FALLBACK_ASSET);
  for (;;) {
    const next = [...files].find(([path]) => !scanned.has(path));
    if (!next) break;
    scanned.add(next[0]);
    await scan(...next);
  }
  validatePaths(files.keys());
  return { files, items: [...items.values()].sort((a, b) => itemFolder(a).localeCompare(itemFolder(b), 'en')), assets: assets.sort((a, b) => `${a.kind}/${a.id}`.localeCompare(`${b.kind}/${b.id}`, 'en')) };
}
