import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { reviewTarget, type ReviewTarget } from './review';
import { validId } from './render';
import { checkWorkspace } from '../cli/check';

export const reviewUsage = 'Usage: npx opendoc review <document-id> [--export] [--json]\n       npx opendoc review --theme <id> [--json]\n       npx opendoc review --template <id> [--json]\n--export: typecheck, review, and prepare PDF plus editable PPTX for presentations from one render.';

export function parseReviewArgs(args: string[]): { help: true; json?: boolean; target?: never; export?: never } | { help: false; json?: boolean; target: ReviewTarget; export?: boolean } {
  const { values, positionals, tokens } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, allowPositionals: true, tokens: true, options: {
    json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, theme: { type: 'string' }, template: { type: 'string' }, export: { type: 'boolean' },
  } });
  if (values.help) return { help: true as const, json: values.json };
  if (positionals.length + tokens.filter(token => token.kind === 'option' && (token.name === 'theme' || token.name === 'template')).length !== 1) throw new Error(reviewUsage);
  const target: ReviewTarget = values.theme !== undefined ? { kind: 'theme', id: values.theme } : values.template !== undefined ? { kind: 'template', id: values.template } : { kind: 'document', id: positionals[0] };
  if (!validId(target.id)) throw new Error(reviewUsage);
  if (values.export && target.kind !== 'document') throw new Error('--export requires a document or presentation ID.');
  return { help: false as const, json: values.json, target, ...(values.export ? { export: true } : {}) };
}

export async function runReviewCli(args: string[], root = process.cwd()): Promise<void> {
  const options = parseReviewArgs(args);
  if (options.help) { console.log(options.json ? JSON.stringify({ usage: reviewUsage }, null, 2) : reviewUsage); return; }
  if (options.export) await checkWorkspace(root, false, true);
  const result = await reviewTarget(root, options.target, { export: options.export });
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else if (result.status === 'ready') {
    console.log(`Prepared ${result.pageCount} pages for review: ${result.outputs.review}\nPDF: ${result.outputs.pdf}\nInspect every page image and check the content before delivery; visual and factual review are still required.`);
    if (result.outputs.pptx) console.log(`PowerPoint: ${result.outputs.pptx}\nNative PowerPoint appearance still requires review.`);
    console.log(`Changed pages: ${result.changes.changedPages.join(', ') || 'none'}; removed pages: ${result.changes.removedPages.join(', ') || 'none'}.`);
    for (const issue of result.issues) console.log(`${issue.severity}: ${issue.message}`);
    if (result.warning) console.error(result.warning);
  } else console.error(`${result.id}: ${result.error}\n${result.previousOutputRetained ? 'Previous review artifacts retained.' : 'No review artifacts were published.'}`);
  if (result.status === 'error') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await runReviewCli(process.argv.slice(2)); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (process.argv.includes('--json')) console.log(JSON.stringify({ status: 'error', error: message }, null, 2));
    else console.error(message);
    process.exitCode = 1;
  }
}
