import { resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { applicationRoot } from '../runtime/paths';
import { discoverWorkspace, explicitWorkspace, installedApplication, packageIdentity, packageMetadata, packageNames, type Edition } from './workspace';
import { runProcess } from './process';
import { withWorkspaceLock } from './lock';
import { RenderFailure } from '../server/render-error';

const usageFor = (edition: Edition) => `OpenDoc${edition === 'headless' ? ' Headless — remote document production for agents' : ' — local documents and editable presentations'}

${edition === 'headless'
    ? `  npx --yes ${packageNames.headless} init <folder>\n                                   Create a workspace without a server`
    : `  npx --yes ${packageNames.normal} init [folder]\n                                   Create a workspace and open OpenDoc\n  npx opendoc start [folder]         Start its installed runtime`}
  npx opendoc create <id>            Create a document or presentation
  npx opendoc projects              Manage projects and membership
  npx opendoc templates             Inspect, check, and preview templates
  npx opendoc themes                Inspect, check, and preview themes
  npx opendoc assets                Manage fonts, logos, and bindings
  npx opendoc media                 Manage document-owned media
  npx opendoc comments              Read and resolve feedback
  npx opendoc export <id...>         Export PDF or editable PowerPoint
  npx opendoc review <id>            Generate page images, text, and review issues
  npx opendoc check                 Typecheck workspace authoring
  npx opendoc update [--check]       Explicitly update the runtime

Commands discover the workspace from this folder or an ancestor.
Use --workspace <folder> to select one and --json for structured results.
Use <command> --help for options, or --version for the active version.`;

export function parseGlobalArgs(args: string[]) {
  const rest: string[] = [];
  let workspace: string | undefined;
  let json = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--') { rest.push(...args.slice(index)); break; }
    if (arg === '--workspace' || arg.startsWith('--workspace=')) {
      if (workspace !== undefined) throw new Error('Provide --workspace only once.');
      workspace = arg === '--workspace' ? args[++index] : arg.slice('--workspace='.length);
      if (!workspace || workspace.startsWith('--')) throw new Error('Provide a folder after --workspace.');
    } else if (arg === '--json') json = true;
    else rest.push(arg);
  }
  return { args: rest, workspace, json };
}

export async function main(rawArgs = process.argv.slice(2)) {
  let json = rawArgs.includes('--json');
  try {
    if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('OpenDoc requires Node.js 24 or newer. Install Node.js 24, then retry.');
    const parsed = parseGlobalArgs(rawArgs);
    json = parsed.json;
    const identity = packageIdentity(await packageMetadata());
    const usage = usageFor(identity.edition);
    const [command, ...args] = parsed.args;
    if (!command || ['--help', '-h', 'help'].includes(command)) {
      console.log(json ? JSON.stringify({ usage }) : usage); return;
    }
    if (command === 'init') {
      if (parsed.workspace) throw new Error('Use init <folder> to choose the new workspace.');
      const { runInit } = await import('./init');
      await runInit([...(json ? ['--json'] : []), ...args]); return;
    }
    let startFolder: string | undefined;
    if (command === 'start') {
      const index = args.findIndex(arg => !arg.startsWith('-'));
      if (index >= 0) startFolder = args.splice(index, 1)[0];
      if (startFolder && parsed.workspace) throw new Error('Choose start <folder> or --workspace <folder>, not both.');
    }
    const root = parsed.workspace || startFolder
      ? await explicitWorkspace(parsed.workspace ?? startFolder!)
      : await discoverWorkspace();
    if (root) {
      const active = await installedApplication(root);
      if (active !== await realpath(applicationRoot)) {
        const result = await runProcess(process.execPath, [resolve(active, 'bin/opendoc.mjs'), ...rawArgs], process.cwd());
        if (result.code) process.exitCode = result.code;
        return;
      }
    }
    if (command === '--version' || command === '-v') {
      if (args.length) throw new Error('Use --version without other arguments.');
      const { version } = await packageMetadata();
      console.log(json ? JSON.stringify({ version }) : version); return;
    }
    if (!root) throw new Error(`No OpenDoc workspace found. Run npx --yes ${identity.name} init <folder>, or use --workspace <folder> for an existing workspace.`);
    const flags = [...(json ? ['--json'] : []), ...args];
    const dispatch = async () => {
      switch (command) {
        case 'start': await (await import('./start')).runStart(flags, root); break;
        case 'create': await (await import('../server/create-cli')).runCreateCli(flags, root); break;
        case 'projects': await (await import('../server/projects-cli')).runProjectsCli(flags, root); break;
        case 'templates': await (await import('../server/templates-cli')).runTemplatesCli(flags, root); break;
        case 'themes': await (await import('../server/themes-cli')).runThemesCli(flags, root); break;
        case 'assets': await (await import('../server/assets-cli')).runAssetsCli(flags, root); break;
        case 'media': await (await import('../server/media-cli')).runMediaCli(flags, root); break;
        case 'comments': await (await import('../server/comments-cli')).runCommentsCli(flags, root, { mode: identity.edition === 'headless' ? 'direct' : 'auto' }); break;
        case 'export': await (await import('../server/export')).runExportCli(flags, root, { mode: identity.edition === 'headless' ? 'direct' : 'preview' }); break;
        case 'review': await (await import('../server/review-cli')).runReviewCli(flags, root); break;
        case 'update': await (await import('./update')).runUpdate(flags, root); break;
        case 'check': {
          if (args.includes('--help') || args.includes('-h')) { const help = 'Usage: npx opendoc check [--json]\nTypechecks workspace documents, themes, and templates.'; console.log(json ? JSON.stringify({ usage: help }) : help); break; }
          if (args.length) throw new Error('Usage: npx opendoc check [--json]');
          const { checkWorkspace, validateInstallation } = await import('./check');
          await validateInstallation(); await checkWorkspace(root, json); break;
        }
        default: throw new Error(`Unknown command: ${command}. Use npx opendoc --help.`);
      }
    };
    if (identity.edition === 'headless' && !['update', 'start'].includes(command)) await withWorkspaceLock(root, dispatch);
    else await dispatch();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    if (json) console.log(JSON.stringify({ error: message, ...(error instanceof RenderFailure ? { issues: error.issues } : {}) }));
    if (!process.exitCode) process.exitCode = 1;
  }
}
