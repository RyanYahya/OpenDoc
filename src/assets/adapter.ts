import { constants, lstatSync, readFileSync, renameSync } from 'node:fs';
import { lstat, open, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import ts from 'typescript';
import { AssetError, assertAssetId, assetHash, safeAssetPath } from './files';

export function documentAssetAdapterSource(themeId: string) {
  assertAssetId(themeId);
  return `import { theme as base } from '../../themes/${themeId}';
import { withDocumentAssets, type DocumentAssets } from 'opendoc/assets';
import assets from './assets.json';

export const theme = withDocumentAssets(base, assets as DocumentAssets);
`;
}
const unsupported = () => new AssetError('This template uses a custom or ambiguous theme import. Ask your agent to pass withDocumentAssets(baseTheme, savedAssets) into its template factory before binding fonts. No source was changed.', 409);
const conflict = () => new AssetError('This document changed while preparing its asset choices. Reload it before binding fonts. Your source was not overwritten.', 409);

/** Upgrade recognized legacy imports without evaluating source or rewriting document content. */
export async function ensureDocumentAssetAdapter(workspace: string, documentId: string): Promise<{ changed: boolean; theme?: string }> {
  assertAssetId(documentId);
  const root = await realpath(workspace), folder = resolve(root, 'documents', documentId);
  safeAssetPath(root, folder, true);
  const entry = safeAssetPath(root, resolve(folder, 'index.tsx'));
  const initial = await lstat(entry);
  if (initial.size > 1_000_000) throw new AssetError('This document entry is too large to adapt automatically. Ask your agent to use withDocumentAssets in its theme import.');
  const contents = await readFile(entry, 'utf8'), digest = assetHash(contents);
  const source = ts.createSourceFile(entry, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = source.statements.filter(ts.isImportDeclaration).filter(node => ts.isStringLiteral(node.moduleSpecifier));
  const pathFor = (node: ts.ImportDeclaration) => (node.moduleSpecifier as ts.StringLiteral).text;
  const existing = imports.find(node => /^\.\/theme(?:\.tsx?)?$/.test(pathFor(node)) && !node.importClause?.isTypeOnly);
  if (existing) {
    const candidates = /\.tsx?$/.test(pathFor(existing)) ? [resolve(folder, pathFor(existing))] : [resolve(folder, 'theme.ts'), resolve(folder, 'theme.tsx')];
    let file: string | undefined;
    for (const candidate of candidates) { try { file = safeAssetPath(root, candidate); break; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
    if (!file) throw new AssetError('This document is missing its local theme adapter. Restore that file before binding fonts.', 409);
    const adapter = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const helpers = new Set<string>();
    for (const statement of adapter.statements) if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && /^(?:opendoc\/assets|\.\.\/\.\.\/src\/assets(?:\/index(?:\.ts)?)?)$/.test(statement.moduleSpecifier.text) && !statement.importClause?.isTypeOnly && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
      for (const name of statement.importClause.namedBindings.elements) if (!name.isTypeOnly && (name.propertyName ?? name.name).text === 'withDocumentAssets') helpers.add(name.name.text);
    }
    let adapted = false;
    const visit = (node: ts.Node) => { if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && helpers.has(node.expression.text)) adapted = true; ts.forEachChild(node, visit); };
    visit(adapter);
    if (!adapted) throw unsupported();
    return { changed: false };
  }
  const selected: { declaration: ts.ImportDeclaration; theme: string; specifiers: ts.ImportSpecifier[] }[] = [];
  let unsupportedThemeImport = false;
  for (const declaration of imports) {
    const path = pathFor(declaration), direct = /^\.\.\/\.\.\/themes\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/index(?:\.ts)?)?$/.exec(path)?.[1];
    const registry = /^(?:opendoc\/themes|\.\.\/\.\.\/themes(?:\/index(?:\.ts)?)?)$/.test(path);
    if ((!direct && !registry) || declaration.importClause?.isTypeOnly) continue;
    const clause = declaration.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings) || clause.name) { unsupportedThemeImport = true; continue; }
    const themes = new Map<string, ts.ImportSpecifier[]>();
    for (const specifier of clause.namedBindings.elements) {
      if (specifier.isTypeOnly) continue;
      const imported = (specifier.propertyName ?? specifier.name).text;
      const theme = direct ? imported === 'theme' || imported === direct ? direct : undefined : imported === 'neutral' ? imported : undefined;
      if (theme) themes.set(theme, [...(themes.get(theme) ?? []), specifier]);
    }
    for (const [theme, specifiers] of themes) selected.push({ declaration, theme, specifiers });
  }
  const template = imports.some(node => !node.importClause?.isTypeOnly && /^(?:opendoc\/template$|\.\.\/\.\.\/(?:templates|src\/template)(?:\/|$))/.test(pathFor(node)));
  if (unsupportedThemeImport || new Set(selected.map(item => item.theme)).size > 1 || (!selected.length && template)) throw unsupported();
  // Ordinary legacy documents with no explicit theme use Document's runtime adapter.
  if (!selected.length) return { changed: false };
  const theme = selected[0].theme;
  safeAssetPath(root, resolve(root, 'themes', theme, 'index.ts'));
  if (await lstat(resolve(folder, 'theme.ts')).catch(error => { if (error.code === 'ENOENT') return null; throw error; })) throw new AssetError('This document already has a theme.ts that would shadow the asset adapter. Ask your agent to integrate its saved assets; the existing file was preserved.', 409);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: true });
  const replacements = selected.map(item => {
    const clause = item.declaration.importClause!, names = clause.namedBindings as ts.NamedImports;
    const remaining = names.elements.filter(name => !item.specifiers.includes(name));
    const themeImport = ts.factory.createImportDeclaration(undefined, ts.factory.createImportClause(false, undefined,
      ts.factory.createNamedImports(item.specifiers.map(name => ts.factory.createImportSpecifier(false, name.name.text === 'theme' ? undefined : ts.factory.createIdentifier('theme'), ts.factory.createIdentifier(name.name.text))))), ts.factory.createStringLiteral('./theme'));
    const rest = remaining.length ? ts.factory.updateImportDeclaration(item.declaration, item.declaration.modifiers,
      ts.factory.updateImportClause(clause, clause.isTypeOnly, clause.name, ts.factory.createNamedImports(remaining)), item.declaration.moduleSpecifier, item.declaration.attributes) : undefined;
    return { start: item.declaration.getStart(source), end: item.declaration.end, text: [rest, themeImport].filter(Boolean).map(node => printer.printNode(ts.EmitHint.Unspecified, node!, source)).join('\n') };
  });
  let updated = contents;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) updated = updated.slice(0, replacement.start) + replacement.text + updated.slice(replacement.end);
  const adapterFile = resolve(folder, 'theme.tsx'), adapterSource = documentAssetAdapterSource(theme);
  const created = new Map<string, { ino: number; digest: string }>();
  const pending = resolve(folder, `.asset-adapter-${randomUUID()}.tmp`);
  const folderInfo = await lstat(folder);
  function assertCurrent() {
    safeAssetPath(root, folder, true); safeAssetPath(root, entry);
    const currentFolder = lstatSync(folder), current = lstatSync(entry);
    if (currentFolder.dev !== folderInfo.dev || currentFolder.ino !== folderInfo.ino || current.dev !== initial.dev || current.ino !== initial.ino || assetHash(readFileSync(entry)) !== digest) throw conflict();
  }
  async function createCompanion(file: string, value: string, acceptsExisting: boolean) {
    assertCurrent();
    let handle;
    try { handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      safeAssetPath(root, file);
      if (!acceptsExisting && await readFile(file, 'utf8') !== value) throw new AssetError('This document already has a custom theme.tsx. Ask your agent to integrate its saved assets; the existing file was preserved.', 409);
      return;
    }
    try { const info = await handle.stat(); created.set(file, { ino: info.ino, digest: assetHash(value) }); await handle.writeFile(value); }
    finally { await handle.close(); }
  }
  try {
    // An empty manifest keeps a first-time upgrade renderable until the caller
    // publishes its exact choices. Existing choices are never replaced here.
    await createCompanion(resolve(folder, 'assets.json'), '{"version":1}\n', true);
    await createCompanion(adapterFile, adapterSource, false);
    await writeFile(pending, updated, { flag: 'wx', mode: initial.mode & 0o777 });
    assertCurrent();
    renameSync(pending, entry);
    return { changed: true, theme };
  } catch (error) {
    for (const [file, identity] of created) {
      try { if ((await lstat(file)).ino === identity.ino && assetHash(await readFile(file)) === identity.digest) await unlink(file); } catch { /* Preserve a companion changed by another writer. */ }
    }
    throw error;
  } finally { await unlink(pending).catch(() => {}); }
}
