import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { withWorkspaceLock } from '../cli/lock';
import { exportPack, installPack, planInstall, readPack } from './packs';

const usage = `Usage: npx opendoc packs export --theme <id> [--template <id>] [--output <file.opendoc.zip>]
       npx opendoc packs inspect <file.opendoc.zip> [--previews <new-folder>]
       npx opendoc packs install <file.opendoc.zip> --dry-run
       npx opendoc packs install <file.opendoc.zip> --trust
Options:
  --theme, --template     Repeat to share multiple designs and their dependencies.
  --include <path>        Include an additional workspace asset file or folder; repeatable.
  --id, --name            Pack identity and display name; default to the first selected ID.
  --pack-version         Pack version, independent of OpenDoc; default 1.0.0.
  --author, --license     Optional attribution and redistribution terms.
  --json                 Structured output.
Inspection does not execute source. Installation verifies and renders executable design code;
use --trust only for an author you trust, and stop the browser service before installing.
Existing designs are never overwritten. Both OpenDoc editions use the same pack format.`;

export async function runPacksCli(args: string[], root?: string) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, json: { type: 'boolean' },
    theme: { type: 'string', multiple: true }, template: { type: 'string', multiple: true }, include: { type: 'string', multiple: true },
    id: { type: 'string' }, name: { type: 'string' }, 'pack-version': { type: 'string' }, author: { type: 'string' }, license: { type: 'string' },
    output: { type: 'string' }, previews: { type: 'string' }, trust: { type: 'boolean' }, 'dry-run': { type: 'boolean' },
  } });
  if (values.help || !positionals.length) { console.log(values.json ? JSON.stringify({ usage }) : usage); return; }
  const [command, file, extra] = positionals;
  const allowed = command === 'export' ? ['theme', 'template', 'include', 'id', 'name', 'pack-version', 'author', 'license', 'output']
    : command === 'inspect' ? ['previews'] : command === 'install' ? ['trust', 'dry-run'] : [];
  if (extra || Object.keys(values).some(key => !['json', 'help', ...allowed].includes(key))) throw new Error(usage);
  let result: unknown;
  if (command === 'export' && !file) {
    if (!root) throw new Error('Export a pack from an initialized OpenDoc workspace.');
    result = await withWorkspaceLock(root, () => exportPack(root, { themes: values.theme, templates: values.template, include: values.include, id: values.id, name: values.name,
      version: values['pack-version'], author: values.author, license: values.license, output: values.output }));
  } else if (command === 'inspect' && file) {
    const pack = await readPack(resolve(file));
    const previews: string[] = [];
    if (values.previews !== undefined) {
      const destination = resolve(values.previews);
      await mkdir(dirname(destination), { recursive: true });
      await mkdir(destination); // Only a new directory; never mix with or replace the user's files.
      try {
        for (const [path, bytes] of pack.files) if (path.startsWith('previews/')) {
          const target = resolve(destination, path.slice('previews/'.length));
          await writeFile(target, bytes, { flag: 'wx' }); previews.push(target);
        }
      } catch (error) { await rm(destination, { recursive: true, force: true }); throw error; }
    }
    result = { manifest: pack.manifest, sha256: pack.sha256, ...(root ? { plan: await planInstall(root, pack) } : {}), previews,
      trust: 'Contains executable TypeScript. Hashes verify file integrity, not author identity or safety. Inspection did not execute the source.',
      visualReview: 'Supplied previews are examples from the sender; inspect them before reuse.' };
  } else if (command === 'install' && file) {
    if (!root) throw new Error('Initialize or choose an OpenDoc workspace before installing a pack.');
    const installed = await installPack(root, resolve(file), { trust: values.trust, dryRun: values['dry-run'] });
    if (!installed.plan.compatible || installed.plan.conflicts.length) process.exitCode = 1;
    result = installed;
  } else throw new Error(usage);
  console.log(JSON.stringify(result, null, 2));
}
