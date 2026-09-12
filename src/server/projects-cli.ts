import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assignProject, createProject, deleteProject, readProjects, updateProject } from './projects';

const usage = 'Usage: npx opendoc projects list [--json]\n       npx opendoc projects create <id> --name "Project name" [--theme <theme-id>]\n       npx opendoc projects update <id> [--name "Project name"] [--theme <theme-id|none>]\n       npx opendoc projects assign <document-id> <project-id>\n       npx opendoc projects delete <empty-project-id>';

export async function runProjectsCli(args: string[], root = process.cwd()): Promise<void> {
  const { values, positionals } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, allowPositionals: true, options: {
    name: { type: 'string' }, theme: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  const [action = 'list', id, projectId] = positionals;
  let result: unknown;
  if (values.help) {
    console.log(values.json ? JSON.stringify({ usage }, null, 2) : usage);
  } else {
    if (action === 'list' && positionals.length <= 1) result = await readProjects(root);
    else if (action === 'create' && id && positionals.length === 2) result = await createProject(root, { id, name: values.name, defaultTheme: values.theme === 'none' ? null : values.theme });
    else if (action === 'update' && id && positionals.length === 2) result = await updateProject(root, id, { ...(values.name === undefined ? {} : { name: values.name }), ...(values.theme === undefined ? {} : { defaultTheme: values.theme === 'none' ? null : values.theme }) });
    else if (action === 'assign' && id && projectId && positionals.length === 3) result = await assignProject(root, id, projectId);
    else if (action === 'delete' && id && positionals.length === 2) { await deleteProject(root, id); result = { deleted: id }; }
    else throw new Error('Unknown project command or missing arguments. Use npx opendoc projects --help.');
    console.log(JSON.stringify(result, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runProjectsCli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
