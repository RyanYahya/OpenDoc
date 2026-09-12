import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverDocumentIds, exportDocuments, exportUsage, parseExportArgs, type ExportOptions } from './export-batch';

export async function runExportCli(args: string[], root = process.cwd(), settings: Pick<ExportOptions, 'mode'> = {}): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(args.includes('--json') ? JSON.stringify({ usage: exportUsage }, null, 2) : exportUsage);
    return;
  }
  const options = parseExportArgs(args);
  const ids = options.all ? await discoverDocumentIds(root) : options.ids;
  const results = await exportDocuments(root, ids, { format: options.format, ...settings });
  if (options.json) console.log(JSON.stringify({ results }, null, 2));
  else for (const result of results) {
    if (result.status === 'success') {
      console.log(`Exported ${result.id} (${result.pages} ${result.pages === 1 ? 'page' : 'pages'}): ${result.path}`);
      if (result.warning) console.error(result.warning);
    }
    else console.error(`${result.id}: ${result.error}\n${result.updated === 'unknown' ? `Check ${result.path} before retrying.` : result.previousOutputRetained ? 'Previous export retained; it was not updated.' : 'No file was written.'}`);
  }
  if (results.some(result => result.status === 'error')) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await runExportCli(process.argv.slice(2)); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (process.argv.includes('--json')) console.log(JSON.stringify({ error: message, results: [] }, null, 2));
    else console.error(message);
    process.exitCode = 1;
  }
}
