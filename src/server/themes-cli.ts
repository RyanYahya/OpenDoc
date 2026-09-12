import { lstat, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ThemeCatalog, readTheme, readThemeGuide, themeFile, readThemePaths } from './themes';
import { captureEntryExportInputs } from './export-inputs';
import { RenderFailure } from './render-error';
import { ExportChangedError, publishPDF } from './export-file';

const usage = 'Usage: npx opendoc themes list | inspect <id> | check <id> | preview <id> [--json]';

export async function runThemesCli(args: string[], root = process.cwd()): Promise<void> {
  const { values, positionals } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, allowPositionals: true, options: {
    json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) { console.log(values.json ? JSON.stringify({ usage }, null, 2) : usage); return; }
  const [command = 'list', id, ...extra] = positionals;
  if (extra.length || !['list', 'inspect', 'check', 'preview'].includes(command) || (command === 'list' ? id !== undefined : !id)) throw new Error(usage);
  const catalog = new ThemeCatalog(root);
  try {
    if (command === 'list') {
      const choices = (await catalog.list()).map(({ id, name, description, error }) => ({ id, name, description, error }));
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
