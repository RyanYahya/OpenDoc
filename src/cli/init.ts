import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { applicationRoot } from '../runtime/paths';
import { dependencyPin, installedApplication, packageIdentity, packageMetadata, packageNames, workspaceFormat, type Edition, type PackageIdentity } from './workspace';
import { runProcess } from './process';

const usageFor = (edition: Edition) => edition === 'headless'
  ? `Usage: npx --yes ${packageNames.headless} init <folder> [--json]\nCreates a headless workspace without starting a server. The folder must be new or empty.`
  : `Usage: npx --yes ${packageNames.normal} init [folder] [--no-start] [--no-open] [--json]\nCreates a new workspace. The folder must be new or empty.`;
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const skills = ['opendoc-create', 'opendoc-current-document', 'opendoc-apply-comments', 'opendoc-create-theme', 'opendoc-create-template', 'opendoc-review-document'];
const skillLabels: Record<string, string> = {
  'opendoc-create': 'Create a document or presentation',
  'opendoc-current-document': 'Resolve an active document or selection',
  'opendoc-apply-comments': 'Apply saved feedback',
  'opendoc-create-theme': 'Create or refine a theme',
  'opendoc-create-template': 'Create a reusable template',
  'opendoc-review-document': 'Review PDFs and presentation exports',
};
const skillIndex = `\n## Agent skills\n\nRead the matching skill directly when your agent does not discover workspace skills automatically. Start the agent in this workspace; after creating it during a conversation, read this guide explicitly.\n\n${skills.map(skill => `- ${skillLabels[skill]}: [${skill}](node_modules/opendoc/.agents/skills/${skill}/SKILL.md)`).join('\n')}\n`;
const instructions = `# OpenDoc workspace\n\nThis folder contains your documents, presentations, projects, themes, templates, and assets.\n\nRead [the OpenDoc agent guide](node_modules/opendoc/AGENTS.md) before authoring or editing. Use the matching OpenDoc skill below; its substantive instructions live with the installed runtime. Resolve document and catalog paths from this workspace, not from the installed package.\n\nUse \`npx opendoc\` commands from this folder or a subfolder. Start the app with \`npx opendoc start\`; check authoring with \`npx opendoc check\`. Keep stable content identities and saved corrections. Finish authorized work through reviewed exports.\n\nDo not edit \`node_modules/opendoc\` to change a document or theme. The workspace-owned \`themes/\` and \`templates/\` are editable. Runtime updates use \`npx opendoc update\` after stopping OpenDoc with Ctrl+C.\n`;
const headlessInstructions = `# OpenDoc Headless workspace\n\nThis folder contains your documents, presentations, projects, themes, templates, and assets. OpenDoc runs in the agent's environment; recipients receive finished PDF and PowerPoint files and need no OpenDoc installation.\n\nRead [the OpenDoc Headless agent guide](node_modules/opendoc/AGENTS.md) before authoring or editing. Use the matching OpenDoc skill; its substantive instructions live with the installed runtime. Resolve document and catalog paths from this workspace, not from the installed package.\n\nUse \`npx opendoc\` commands from this folder or a subfolder. Author from the user's brief, run \`npx opendoc check\`, then \`npx opendoc review <id> --json\`. Inspect every generated page image and the extracted text, correct issues, and export the final PDF with \`npx opendoc export <id>\`. For presentations also export editable PowerPoint with \`npx opendoc export <id> --format pptx\`. Deliver the requested files through your existing channel. Keep stable content identities and saved corrections. The workflow does not require a browser or persistent server.\n\nDo not edit \`node_modules/opendoc\` to change a document or theme. The workspace-owned \`themes/\` and \`templates/\` are editable. Keep this workspace when future revisions or reusable themes and templates are needed. Runtime updates use \`npx opendoc update\` and preserve the Headless edition and workspace content.\n`;

export async function requireEmptyDestination(root: string) {
  try {
    const info = await lstat(root);
    if (!info.isDirectory() || info.isSymbolicLink() || (await readdir(root)).length) throw new Error(`Refusing to overwrite ${root}. Choose a new or empty directory.`);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

export type InitDependencies = {
  install?: (stage: string, version: string, identity: PackageIdentity) => Promise<void>;
  validate?: (stage: string) => Promise<void>;
};

async function copyContents(source: string, destination: string) {
  for (const entry of await readdir(source)) {
    await cp(resolve(source, entry), resolve(destination, entry), { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
  }
}

/** Prepare privately, then copy without ever overwriting a destination file. */
export async function initializeWorkspace(destination: string, options: { sourceRoot?: string; tarball?: string } = {}, dependencies: InitDependencies = {}) {
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error('OpenDoc 0.4 supports macOS and Linux.');
  const root = resolve(destination === '~' ? homedir() : destination.startsWith('~/') ? resolve(homedir(), destination.slice(2)) : destination);
  await requireEmptyDestination(root);
  const sourceRoot = options.sourceRoot ?? applicationRoot;
  const identity = packageIdentity(await packageMetadata(sourceRoot));
  const { version, edition } = identity;
  const pin = dependencyPin(identity);
  await mkdir(dirname(root), { recursive: true });
  const stage = await mkdtemp(resolve(dirname(root), '.opendoc-init-'));
  try {
    await copyContents(resolve(sourceRoot, 'starter'), stage);
    const manifest = { name: 'opendoc-workspace', private: true, type: 'module', dependencies: { opendoc: pin } };
    await writeFile(resolve(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    await writeFile(resolve(stage, 'tsconfig.json'), JSON.stringify({ extends: 'opendoc/tsconfig.workspace.json', include: ['documents', 'templates', 'themes'] }, null, 2) + '\n', { flag: 'wx' });
    await mkdir(resolve(stage, '.opendoc'), { recursive: true });
    await writeFile(resolve(stage, '.opendoc/workspace.json'), JSON.stringify({ formatVersion: workspaceFormat, createdWith: version, edition }, null, 2) + '\n', { flag: 'wx' });
    await writeFile(resolve(stage, 'AGENTS.md'), (edition === 'headless' ? headlessInstructions : instructions) + skillIndex, { flag: 'wx' });
    await writeFile(resolve(stage, 'CLAUDE.md'), '@AGENTS.md\n', { flag: 'wx' });
    await writeFile(resolve(stage, '.gitignore'), 'node_modules/\n.opendoc/*\n!.opendoc/workspace.json\noutput/\n.DS_Store\n', { flag: 'wx' });
    for (const skill of skills) {
      const source = await readFile(resolve(sourceRoot, '.agents/skills', skill, 'SKILL.md'), 'utf8');
      const frontmatter = source.match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0] ?? `---\nname: ${skill}\ndescription: OpenDoc authoring workflow.\n---`;
      const directory = resolve(stage, '.agents/skills', skill);
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, 'SKILL.md'), `${frontmatter}\n\nRead and follow [the installed ${skill} skill](../../../node_modules/opendoc/.agents/skills/${skill}/SKILL.md). Resolve document and catalog paths from this workspace; the installed file contains version-matched instructions.\n`, { flag: 'wx' });
    }
    // Claude and other agents share one set of workspace skill definitions.
    await mkdir(resolve(stage, '.claude'));
    await symlink('../.agents/skills', resolve(stage, '.claude/skills'), 'dir');
    console.error(`Installing OpenDoc${edition === 'headless' ? ' Headless' : ''} ${version}…`);
    if (dependencies.install) await dependencies.install(stage, version, identity);
    else {
      const tarball = options.tarball ?? process.env.OPENDOC_PACKAGE_TARBALL;
      const args = ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...(tarball ? ['--save-exact', `opendoc@file:${resolve(tarball)}`] : [])];
      const result = await runProcess('npm', args, stage, { diagnostics: true });
      if (result.code) throw new Error(`npm install failed (exit ${result.code}).`);
      // Local release acceptance uses a tarball; keep the public workspace contract exactly pinned.
      if (tarball) {
        await writeFile(resolve(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
        const lockPath = resolve(stage, 'package-lock.json');
        const lock = JSON.parse(await readFile(lockPath, 'utf8'));
        lock.packages[''].dependencies.opendoc = pin;
        await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
      }
    }
    await installedApplication(stage);
    if (dependencies.validate) await dependencies.validate(stage);
    else {
      const result = await runProcess(process.execPath, [resolve(stage, 'node_modules/opendoc/bin/opendoc.mjs'), 'check', '--json'], stage, { capture: true });
      if (result.code) throw new Error('The installed workspace did not pass its authoring check.');
    }
    await requireEmptyDestination(root);
    await mkdir(root, { recursive: true });
    await copyContents(stage, root);
    await rm(stage, { recursive: true, force: true });
    return { workspace: root, version, edition };
  } catch (error) {
    throw new Error(`${(error as Error).message}\nThe destination was not overwritten. Prepared files remain at ${stage}.\nTo recover, inspect that folder, run npm install there, then npx opendoc check${edition === 'normal' ? ' and npx opendoc start' : ''}. Or retry initialization in a new empty folder.`, { cause: error });
  }
}

export async function runInit(args: string[]) {
  const { edition } = packageIdentity(await packageMetadata());
  const usage = usageFor(edition);
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { 'no-start': { type: 'boolean' }, 'no-open': { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) { console.log(values.json ? JSON.stringify({ usage }) : usage); return; }
  if (positionals.length > 1) throw new Error(usage);
  let destination = positionals[0];
  if (!destination) {
    if (edition === 'headless') throw new Error(`OpenDoc Headless requires an explicit workspace folder: npx --yes ${packageNames.headless} init <folder>`);
    if (!process.stdin.isTTY) throw new Error(`Provide a workspace folder when input is not interactive: npx --yes ${packageNames.normal} init <folder> --no-start`);
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    try { destination = (await prompt.question('Workspace folder [~/Documents/My OpenDoc]: ')).trim() || resolve(homedir(), 'Documents/My OpenDoc'); }
    finally { prompt.close(); }
  }
  const result = await initializeWorkspace(destination);
  if (edition === 'headless') console.log(values.json ? JSON.stringify(result) : `Created ${result.workspace}\nRead its AGENTS.md, then author, review, and deliver finished PDF or PowerPoint files with npx opendoc.`);
  else if (values['no-start']) console.log(values.json ? JSON.stringify(result) : `Created ${result.workspace}\nOpen this folder in your coding agent.\nStart OpenDoc: npx opendoc start ${quote(result.workspace)}`);
  else {
    console.error(`Created ${result.workspace}. Open this folder in your coding agent.`);
    // Launch the installed runtime, including when init came from npm's temporary cache.
    const child = await runProcess(process.execPath, [resolve(result.workspace, 'node_modules/opendoc/bin/opendoc.mjs'), 'start', ...(values['no-open'] ? ['--no-open'] : []), ...(values.json ? ['--json'] : [])], result.workspace);
    if (child.code) process.exitCode = child.code;
  }
}
