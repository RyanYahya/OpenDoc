import { lstat, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ThemeCatalog, readTheme, readThemeGuide, themeFile, readThemePaths } from './themes';
import { captureEntryExportInputs } from './export-inputs';
import { RenderFailure } from './render-error';
import { ExportChangedError, publishPDF } from './export-file';
import { folderDescendants, folderPath } from '../shared/theme-folders';
import { hasTags } from '../shared/tags';
import { assignThemeFolder, createThemeFolderPath, deleteThemeFolder, readThemeFolders, resolveFolderPath, themeDirectories, themeFoldersFile, ThemeFoldersError, updateThemeFolder } from './theme-folders';
import { changeItemTags, itemTags, readTags } from './tags';

const usage = `Usage: npx opendoc themes list [--folder <path>] [--tag <tag>] | inspect <id> | check <id> | preview <id> [--json]
       npx opendoc themes folders [list]
       npx opendoc themes folders create <path>
       npx opendoc themes folders update <path> [--name "Folder name"] [--parent <path|none>]
       npx opendoc themes folders delete <path>
       npx opendoc themes assign <theme-id> <folder-path|none>
       npx opendoc themes tags <theme-id> [--set "Tag, Tag"] [--add <tag>] [--remove <tag>]`;

/** Folders live in themes/folders.json and tags in tags.json; neither moves theme directories. */
async function runOrganization(command: string, positionals: string[], values: { name?: string; parent?: string; set?: string; add?: string[]; remove?: string[] }, root: string) {
  const [action = 'list', target, extra] = positionals;
  if (command === 'folders') {
    if (extra !== undefined || (action === 'list' ? target !== undefined : !target)) throw new Error(usage);
    if (action === 'list') {
      const manifest = await readThemeFolders(root);
      const present = await themeDirectories(root);
      return { file: themeFoldersFile, folders: manifest.folders.map(folder => ({ id: folder.id, name: folder.name, path: folderPath(manifest, folder.id), parent: folderPath(manifest, folder.parent), themes: Object.keys(manifest.assignments).filter(id => manifest.assignments[id] === folder.id && present.has(id)).sort() }))
        .sort((a, b) => a.path!.localeCompare(b.path!, 'en', { sensitivity: 'base', numeric: true })) };
    }
    if (action === 'create') return createThemeFolderPath(root, target);
    const folder = resolveFolderPath(await readThemeFolders(root), target);
    if (!folder) throw new ThemeFoldersError('Choose a folder path, not the top level.');
    if (action === 'update') {
      const input = { ...(values.name === undefined ? {} : { name: values.name }), ...(values.parent === undefined ? {} : { parent: resolveFolderPath(await readThemeFolders(root), values.parent)?.id ?? null }) };
      const { folder: updated, manifest } = await updateThemeFolder(root, folder.id, input);
      return { id: updated.id, name: updated.name, path: folderPath(manifest, updated.id), parent: folderPath(manifest, updated.parent) };
    }
    if (action === 'delete') {
      const { manifest, deleted, parent, ...moved } = await deleteThemeFolder(root, folder.id);
      return { deleted: deleted.id, movedTo: folderPath(manifest, parent), ...moved };
    }
    throw new Error(usage);
  }
  if (command === 'assign') {
    if (!action || !target || extra !== undefined) throw new Error(usage);
    const folder = resolveFolderPath(await readThemeFolders(root), target);
    const { manifest } = await assignThemeFolder(root, action, folder?.id ?? null);
    return { id: action, folder: folderPath(manifest, folder?.id) };
  }
  // Kept for existing scripts; npx opendoc tags covers themes, documents, and templates.
  if (!action || target !== undefined) throw new Error(usage);
  if (values.set === undefined && !values.add?.length && !values.remove?.length) {
    const { id, tags } = await itemTags(root, 'themes', action);
    return { id, tags };
  }
  const { id, tags } = await changeItemTags(root, 'themes', action, { set: values.set?.split(',').filter(tag => tag.trim()), add: values.add, remove: values.remove });
  return { id, tags };
}

export async function runThemesCli(args: string[], root = process.cwd()): Promise<void> {
  const { values, positionals } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, allowPositionals: true, options: {
    json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    folder: { type: 'string' }, tag: { type: 'string', multiple: true },
    name: { type: 'string' }, parent: { type: 'string' }, set: { type: 'string' }, add: { type: 'string', multiple: true }, remove: { type: 'string', multiple: true },
  } });
  if (values.help) { console.log(values.json ? JSON.stringify({ usage }, null, 2) : usage); return; }
  const [command = 'list', id, ...extra] = positionals;
  const organization = ['folders', 'assign', 'tags'].includes(command);
  const options = Object.keys(values).filter(key => !['json', 'help'].includes(key));
  if (!organization && options.some(key => command !== 'list' || !['folder', 'tag'].includes(key))) throw new Error(usage);
  if (organization) {
    const allowed = command === 'tags' ? ['set', 'add', 'remove'] : command === 'folders' && id === 'update' ? ['name', 'parent'] : [];
    if (options.some(key => !allowed.includes(key)) || (command === 'folders' && id === 'update' && !options.length)) throw new Error(usage);
    console.log(JSON.stringify(await runOrganization(command, positionals.slice(1), values, root), null, 2)); return;
  }
  if (extra.length || !['list', 'inspect', 'check', 'preview'].includes(command) || (command === 'list' ? id !== undefined : !id)) throw new Error(usage);
  const catalog = new ThemeCatalog(root);
  try {
    if (command === 'list') {
      // Organization is optional: an unreadable folders or tags file must not hide the catalog unless a filter needs it.
      const optional = <T,>(read: Promise<T>, needed: boolean) => read.catch(error => {
        if (needed) throw error;
        console.error(error instanceof Error ? error.message : String(error));
        return undefined;
      });
      const manifest = await optional(readThemeFolders(root), values.folder !== undefined);
      const tagged = await optional(readTags(root), Boolean(values.tag?.length));
      // A folder filter includes nested folders; `none` or `/` selects themes at the top level.
      const target = values.folder === undefined || !manifest ? undefined : resolveFolderPath(manifest, values.folder);
      const scope = target ? folderDescendants(manifest!, target.id) : target;
      const choices = (await catalog.list()).map(({ id, name, description, error }) => ({ id, name, description, error, folder: manifest ? folderPath(manifest, manifest.assignments[id]) : null, tags: tagged?.themes[id] ?? [] }))
        .filter(theme => (scope === undefined || (scope === null ? !theme.folder : scope.has(manifest!.assignments[theme.id] ?? '')))
          && hasTags(theme.tags, values.tag ?? []));
      console.log(JSON.stringify(choices, null, 2));
    }
    else {
      const unchanged = command === 'inspect' ? () => true : await captureEntryExportInputs(root, await themeFile(root, id, 'preview.tsx'));
      const theme = await readTheme(root, id);
      const guide = await readThemeGuide(root, id);
      const paths = await readThemePaths(root, id);
      if (command === 'inspect') console.log(JSON.stringify({ id, name: theme.name, description: theme.description, useFor: theme.useFor ?? [], principles: theme.principles ?? [], palette: theme.palette ?? [], geometry: theme.geometry ?? [], paths, guideWords: guide.trim().split(/\s+/).length }, null, 2));
      else {
        const preview = await catalog.preview(id);
        if (!preview.artifact) throw new RenderFailure(preview.error ?? 'Theme preview failed.', preview.issues);
        if (!unchanged()) throw new ExportChangedError();
        const artifact = preview.artifact;
        let output: string | undefined;
        if (command === 'preview') {
          for (const folder of [resolve(root, 'output'), resolve(root, 'output/themes')]) {
            await mkdir(folder, { recursive: true });
            const info = await lstat(folder);
            if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Theme exports need a regular local output/themes folder.');
          }
          output = resolve(root, 'output/themes', `${id}.pdf`);
          const previous = await lstat(output).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
          if (previous && (!previous.isFile() || previous.isSymbolicLink())) throw new Error('The theme export destination is not a regular file.');
          await publishPDF(root, id, await catalog.pdf(id, artifact.hash), unchanged, 'themes');
        }
        console.log(JSON.stringify({ id, name: theme.name, status: 'ready', pages: artifact.pages.length, hash: artifact.hash, issues: artifact.issues ?? [], paths, ...(output ? { output } : {}), review: 'Inspect every PDF page; automated checks do not establish visual quality.' }, null, 2));
      }
    }
  } catch (error) {
    if (error instanceof ExportChangedError) throw new Error('The theme changed while preparing its preview. Retry after edits finish; no theme PDF was replaced.', { cause: error });
    throw error;
  } finally { await catalog.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runThemesCli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
