import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createDocument, CreateDocumentError, listStarters } from './create';
import { createFromTemplate } from './templates';

const invalid = (message: string) => new CreateDocumentError(message, 'INVALID_INPUT', 400);
const usage = 'Usage: npx opendoc create [<id>] --project <project-id> --title "Document title" [--theme <theme-id>] [--format document|presentation]\n       Add --template <template-id> for a reusable template or --starter <starter> for an example draft.\n       npx opendoc create --list [--json]';

export async function runCreateCli(args: string[], root = process.cwd()): Promise<void> {
  const { values, positionals } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, allowPositionals: true, options: {
    format: { type: 'string' }, starter: { type: 'string' }, template: { type: 'string' }, title: { type: 'string' }, project: { type: 'string' }, theme: { type: 'string' }, list: { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) { console.log(values.json ? JSON.stringify({ usage }, null, 2) : usage); return; }
  if (values.list) {
    if (positionals.length || values.title || values.starter || values.template || values.project || values.theme || values.format) throw invalid('--list cannot be combined with document creation.');
    console.log(values.json ? JSON.stringify({ starters: listStarters() }, null, 2) : listStarters().map(item => `${item.id.padEnd(16)}${item.name} — ${item.description}`).join('\n'));
    return;
  }
  if (positionals.length > 1) throw invalid('Provide one document ID. Use --title for the document title.');
  if (values.starter && values.template) throw invalid('Choose --starter or --template, not both.');
  if (values.format && !['document', 'presentation'].includes(values.format)) throw invalid('Choose document or presentation format.');
  const input = { id: positionals[0], title: values.title, projectId: values.project, theme: values.theme, format: values.format };
  const result = values.template
    ? await createFromTemplate(root, values.template, input)
    : await createDocument(root, { ...input, starter: values.starter, format: values.format });
  console.log(values.json ? JSON.stringify(result, null, 2) : `Created ${result.entry}\nOpen it in OpenDoc, then ask Codex to develop it using your brief and sources.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await runCreateCli(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
