import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { TemplateCatalog, readTemplate, readTemplateGuide, templateFile } from './templates';
import { captureEntryExportInputs } from './export-inputs';
import { ExportChangedError, publishPDF } from './export-file';
import { RenderFailure } from './render-error';
import { hasTags, splitTags, standardType } from '../shared/tags';
import { parseLanguage } from '../shared/language';
import { readTags } from './tags';

const usage = 'Usage: npx opendoc templates list [--type <type>] [--language <language>] [--tag <tag>] [--json]\n       npx opendoc templates inspect <id> | check <id> | preview <id> [--json]\n       Create an instance with npx opendoc create --template <id> --project <project-id> --title "Title".';

export async function runTemplatesCli(args: string[], root = process.cwd()): Promise<void> {
  const { values, positionals } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, allowPositionals: true, options: {
    json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, tag: { type: 'string', multiple: true }, type: { type: 'string' }, language: { type: 'string' },
  } });
  if (values.help) { console.log(values.json ? JSON.stringify({ usage }, null, 2) : usage); return; }
  const [command = 'list', id] = positionals;
  if ((values.tag || values.type !== undefined || values.language !== undefined) && command !== 'list') throw new Error(usage);
  const type = values.type === undefined ? undefined : standardType(values.type)?.id;
  if (values.type !== undefined && !type) throw new Error(`“${values.type}” is not a type. Run npx opendoc tags to list them.`);
  const language = values.language === undefined ? undefined : parseLanguage(values.language);
  if (values.language !== undefined && !language) throw new Error('Choose a language of english, arabic, or bilingual.');
  if (command === 'list' && positionals.length <= 1) {
    // Tags are optional: an unreadable tags.json must not hide the catalog unless a filter needs it.
    const tags = await readTags(root).catch(error => {
      if (values.tag?.length || type) throw error;
      console.error(error instanceof Error ? error.message : String(error));
      return undefined;
    });
    const catalog = new TemplateCatalog(root);
    try {
      console.log(JSON.stringify((await catalog.list())
        .filter(item => hasTags(tags?.templates[item.id], values.tag ?? []) && (!language || item.language === language))
        .map(({ id, descriptor, language, error }) => ({ id, ...descriptor, ...splitTags('templates', tags?.templates[id]), language: language ?? null, ...(error ? { error } : {}) }))
        .map(({ type: found, custom, ...item }) => ({ ...item, type: found ?? null, tags: custom }))
        .filter(item => !type || item.type === type), null, 2));
    } finally { await catalog.close(); }
  } else if (command === 'inspect' && id && positionals.length === 2) {
    const descriptor = await readTemplate(root, id);
    const guide = await readTemplateGuide(root, id);
    const paths = {
      definition: `templates/${id}/index.tsx`, descriptor: `templates/${id}/template.json`,
      guide: `templates/${id}/AGENTS.md`, preview: `templates/${id}/preview.tsx`, starter: `templates/${id}/starter.tsx`,
    };
    console.log(JSON.stringify({ id, ...descriptor, paths, guide }, null, 2));
  } else if ((command === 'check' || command === 'preview') && id && positionals.length === 2) {
    const catalog = new TemplateCatalog(root);
    try {
      const unchanged = await captureEntryExportInputs(root, await templateFile(root, id, 'preview.tsx'));
      const descriptor = await readTemplate(root, id);
      await readTemplateGuide(root, id);
      const preview = await catalog.preview(id);
      if (!preview.artifact) throw new RenderFailure(preview.error ?? 'Template preview failed.', preview.issues);
      if (!unchanged()) throw new ExportChangedError();
      const artifact = preview.artifact;
      const output = command === 'preview' ? await publishPDF(root, id, await catalog.pdf(id, artifact.hash), unchanged, 'templates') : undefined;
      console.log(JSON.stringify({ id, name: descriptor.name, status: 'ready', format: artifact.format ?? 'document', pages: artifact.pages.length, hash: artifact.hash, issues: artifact.issues ?? [], ...(output ? { output } : {}), review: 'Inspect every PDF page; automated checks do not establish visual quality.' }, null, 2));
    } catch (error) {
      if (error instanceof ExportChangedError) throw new Error('The template changed while preparing its preview. Retry after edits finish; no template PDF was replaced.', { cause: error });
      throw error;
    } finally { await catalog.close(); }
  } else throw new Error(usage);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runTemplatesCli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
