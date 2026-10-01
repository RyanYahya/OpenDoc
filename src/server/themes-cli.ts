import { lstat, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ThemeCatalog, readTheme, readThemeGuide, themeFile, readThemePaths } from './themes';
import { captureEntryExportInputs } from './export-inputs';
import { RenderFailure } from './render-error';
import { ExportChangedError, publishPDF } from './export-file';
import { inFolder, sortedFolders, themeFolder } from '../shared/theme-folders';
import { hasTags } from '../shared/tags';
import { assignThemeFolder, cliFolderName, createThemeFolder, deleteThemeFolder, readThemeFolders, readThemeFoldersFile, renameThemeFolder, resolveFolderName, themeDirectories, themeFoldersFile, ThemeFoldersError } from './theme-folders';
import { changeItemTags, itemTags, readTags } from './tags';

const usage = `Usage: npx opendoc themes list [--folder <name|none>] [--tag <tag>] | inspect <id> | check <id> | preview <id> [--json]
       npx opendoc themes folders [list]
       npx opendoc themes folders create <name>
       npx opendoc themes folders rename <name> <new-name>
       npx opendoc themes folders delete <name>
       npx opendoc themes assign <theme-id> <folder|none>
       npx opendoc themes tags <theme-id> [--set "Tag, Tag"] [--add <tag>] [--remove <tag>]
Theme folders are single-level; quote names that contain spaces.`;

const noParents = 'Theme folders are single-level and cannot be nested, so --parent is no longer supported. Rename a folder with npx opendoc themes folders rename <name> <new-name>, and file a theme with npx opendoc themes assign <theme-id> <folder>.';

/** Folders live in themes/folders.json and tags in tags.json; neither moves theme directories. */
async function runOrganization(command: string, positionals: string[], values: { name?: string; set?: string; add?: string[]; remove?: string[] }, root: string) {
  const [action = 'list', target, extra, ...rest] = positionals;
  if (rest.length) throw new Error(usage);
  if (command === 'folders') {
    if (action === 'list') {
      if (target !== undefined) throw new Error(usage);
      const { manifest, migration } = await readThemeFoldersFile(root);
      const present = await themeDirectories(root);
      return {
        file: themeFoldersFile,
        folders: sortedFolders(manifest).map(folder => ({ id: folder.id, name: folder.name, themes: Object.keys(manifest.assignments).filter(id => manifest.assignments[id] === folder.id && present.has(id)).sort() })),
        ...(migration ? { migration: { ...migration, saved: false, note: 'Nested folders from an earlier version are shown flattened; the next folder or assignment change saves this layout.' } } : {}),
      };
    }
    if (action === 'create') {
      if (!target || extra !== undefined) throw new Error(usage);
      const { folder } = await createThemeFolder(root, { name: cliFolderName(target) });
      return { id: folder.id, name: folder.name };
    }
    // `update <name> --name <new-name>` is the earlier spelling of rename.
    const renaming = action === 'rename' || (action === 'update' && values.name !== undefined);
    if (!target || (renaming ? (action === 'rename' ? extra === undefined : extra !== undefined) : extra !== undefined)) throw new Error(usage);
    const folder = resolveFolderName(await readThemeFolders(root), target);
    if (!folder) throw new ThemeFoldersError('Choose a folder by name; “none” is not a folder.');
    if (renaming) {
      const { folder: renamed } = await renameThemeFolder(root, folder.id, { name: action === 'rename' ? extra : values.name });
      return { id: renamed.id, name: renamed.name, previous: folder.name };
    }
    if (action === 'delete') {
      const { deleted, unfiledThemes } = await deleteThemeFolder(root, folder.id);
      return { deleted: deleted.id, name: deleted.name, unfiledThemes };
    }
    throw new Error(usage);
  }
  if (command === 'assign') {
    if (!action || !target || extra !== undefined) throw new Error(usage);
    const folder = resolveFolderName(await readThemeFolders(root), target);
    await assignThemeFolder(root, action, folder?.id ?? null);
    return { id: action, folder: folder?.name ?? null };
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
  if (options.includes('parent')) throw new ThemeFoldersError(noParents);
  if (!organization && options.some(key => command !== 'list' || !['folder', 'tag'].includes(key))) throw new Error(usage);
  if (organization) {
    const allowed = command === 'tags' ? ['set', 'add', 'remove'] : command === 'folders' && id === 'update' ? ['name'] : [];
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
      // `--folder none` selects themes outside every folder; folder and tag filters combine.
      const target = values.folder === undefined || !manifest ? undefined : resolveFolderName(manifest, values.folder);
      const choices = (await catalog.list()).map(({ id, name, description, error }) => ({ id, name, description, error, folder: manifest ? themeFolder(manifest, id)?.name ?? null : null, tags: tagged?.themes[id] ?? [] }))
        .filter(theme => (target === undefined || inFolder(manifest!, theme.id, target?.id ?? null))
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
