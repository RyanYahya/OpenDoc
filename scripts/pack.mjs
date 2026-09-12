#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
let output = path.join(root, 'output', 'packages');
let skipBuild = false;
let edition = 'all';
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--skip-build') skipBuild = true;
  else if (argv[i] === '--output' && argv[i + 1]) output = path.resolve(argv[++i]);
  else if (argv[i] === '--edition' && argv[i + 1]) edition = argv[++i];
  else throw new Error(`Unknown package argument: ${argv[i]}`);
}
if (!['normal', 'headless', 'all'].includes(edition)) throw new Error('Choose --edition normal, headless, or all.');
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('OpenDoc packaging requires Node.js 24 or newer.');

const browserDependencies = ['@base-ui/react', 'react-dom', '@types/react-dom', 'react-markdown', 'remark-gfm', 'chokidar', 'ws', '@types/ws'];
const browserFiles = ['dist', 'src/app', 'src/server/index.ts'];
const sourceArchive = 'vendor/formepdf/formepdf-core-0.20.1-opendoc.3.tgz';

async function run(command, args, cwd, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
    let stdout = '';
    if (capture) child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => code === 0 ? resolve(stdout) : reject(new Error(`${command} failed (${signal ?? code}).`)));
  });
}

async function copy(relative, destination, selectedEdition) {
  await cp(path.join(root, relative), destination, {
    recursive: true,
    filter(source) {
      const name = path.relative(root, source).split(path.sep).join('/');
      if (name === sourceArchive || name === 'docs/showcase' || name.startsWith('docs/showcase/')) return false;
      if (selectedEdition === 'headless' && browserFiles.some((entry) => name === entry || name.startsWith(`${entry}/`))) return false;
      return !['.DS_Store', 'node_modules', '.git', '.opendoc', 'output', 'tmp'].includes(path.basename(source));
    },
  });
}

async function installedVersion(name) {
  return JSON.parse(await readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
}

async function directoryDigest(directory) {
  const digest = createHash('sha256');
  async function visit(relative) {
    for (const entry of (await readdir(path.join(directory, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) digest.update(name).update('\0').update(await readFile(path.join(directory, name))).update('\0');
      else throw new Error(`Unexpected non-file in the starter library: ${name}`);
    }
  }
  await visit('');
  return digest.digest('hex');
}

async function keepNodeEngine(stage) {
  const coreRoot = path.join(stage, 'node_modules/@formepdf/core');
  const manifestPath = path.join(coreRoot, 'package.json');
  const engine = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (engine.version !== '0.20.1-opendoc.3') throw new Error('The release must contain the repaired Forme 0.20.1-opendoc.3 engine.');
  // Both editions render in Node. Keep the repaired Node engine byte for byte;
  // browser and worker targets remain available in the source rebuild archive.
  for (const entry of ['pkg', 'pkg-web', 'scripts', 'dist/browser.js', 'dist/browser.d.ts', 'dist/worker.js', 'dist/worker.d.ts']) {
    await rm(path.join(coreRoot, entry), { recursive: true, force: true });
  }
  const { types, import: nodeImport, default: nodeDefault } = engine.exports['.'];
  engine.exports = {
    '.': { types, import: nodeImport, default: nodeDefault },
    './layout': engine.exports['./layout'],
  };
  engine.files = ['dist/', 'pkg-node/'];
  delete engine.scripts;
  delete engine.devDependencies;
  await writeFile(manifestPath, JSON.stringify(engine, null, 2) + '\n');
  await cp(path.join(root, 'vendor/formepdf/LICENSE'), path.join(coreRoot, 'LICENSE'));
  const bytes = await readFile(path.join(coreRoot, 'pkg-node/forme_bg.wasm'));
  if (!WebAssembly.validate(bytes)) throw new Error('The packaged Node renderer is not valid WebAssembly.');
  return { version: engine.version, sha256: createHash('sha256').update(bytes).digest('hex') };
}

const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const editions = edition === 'all' ? ['normal', 'headless'] : [edition];
if (editions.includes('normal')) {
  if (!skipBuild) await run('pnpm', ['build'], root);
  await readFile(path.join(root, 'dist', 'index.html'));
}
await mkdir(output, { recursive: true });
const reports = [];
for (const selectedEdition of editions) {
  const stage = await mkdtemp(path.join(tmpdir(), `opendoc-${selectedEdition}-package-`));
  try {
    // Build an ordinary npm tree; never copy pnpm's checkout symlinks. Native
    // canvas, resvg, and esbuild dependencies remain unbundled so npm selects
    // the consumer's OS and architecture when either edition is installed.
    const coreArchive = path.join(root, sourceArchive);
    const dependencies = Object.fromEntries(await Promise.all(
      [...manifest.bundleDependencies, 'react'].map(async (name) => [name, await installedVersion(name)]),
    ));
    dependencies['@formepdf/core'] = `file:${coreArchive}`;
    await writeFile(path.join(stage, 'package.json'), JSON.stringify({
      name: manifest.name,
      version: manifest.version,
      private: true,
      dependencies,
      overrides: { '@formepdf/core': `file:${coreArchive}` },
    }, null, 2));
    await run('npm', ['install', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '--package-lock=false'], stage);
    const engine = await keepNodeEngine(stage);

    for (const entry of manifest.files) {
      if (entry === 'starter/') continue;
      if (selectedEdition === 'headless' && entry === 'dist/') continue;
      await copy(entry, path.join(stage, entry), selectedEdition);
    }
    // Both editions include the entire same public starter library. User
    // documents and project membership from a checkout must never leak in.
    const documentIds = ['welcome', 'welcome-presentation'];
    for (const id of documentIds) await copy(`documents/${id}`, path.join(stage, 'starter', 'documents', id), selectedEdition);
    for (const folder of ['templates', 'themes', 'assets']) await copy(folder, path.join(stage, 'starter', folder), selectedEdition);
    const projects = JSON.parse(await readFile(path.join(root, 'projects.json'), 'utf8'));
    const gettingStarted = projects.projects.find((project) => project.id === 'getting-started');
    if (!gettingStarted) throw new Error('The Getting started seed project is missing.');
    await writeFile(path.join(stage, 'starter', 'projects.json'), JSON.stringify({
      version: 1,
      projects: [gettingStarted],
      assignments: Object.fromEntries(documentIds.map((id) => [id, 'getting-started'])),
      formats: { 'welcome-presentation': 'presentation' },
    }, null, 2) + '\n');

    const release = { ...manifest, dependencies: { ...manifest.dependencies }, opendoc: { ...manifest.opendoc, edition: selectedEdition } };
    release.dependencies['@formepdf/core'] = engine.version;
    if (selectedEdition === 'headless') {
      release.name = '@ryanyahya/opendoc-headless';
      release.description = 'Beautiful, consistent PDFs and editable presentations with any agent, without a browser or server.';
      release.bin = { opendoc: './bin/opendoc.mjs', 'opendoc-headless': './bin/opendoc.mjs' };
      release.files = release.files.filter((entry) => entry !== 'dist/');
      for (const name of browserDependencies) delete release.dependencies[name];
    }
    // Published packages are ready to run and never build during installation.
    delete release.private;
    delete release.scripts;
    delete release.devDependencies;
    delete release.packageManager;
    delete release.overrides;
    await writeFile(path.join(stage, 'package.json'), JSON.stringify(release, null, 2) + '\n');
    const starterSha256 = await directoryDigest(path.join(stage, 'starter'));
    const packed = JSON.parse(await run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', output], stage, true))[0];
    const archive = path.join(output, packed.filename);
    const filenames = new Set(packed.files.map(({ path: name }) => name));
    const forbidden = packed.files.filter(({ path: name }) => /^(?:tests|documents|projects\.json|\.opendoc|\.git|output|tmp)(?:\/|$)/.test(name)
      || name === sourceArchive
      || /^node_modules\/@formepdf\/(?:html|renderer)(?:\/|$)/.test(name)
      || /^node_modules\/@formepdf\/core\/(?:pkg|pkg-web)(?:\/|$)/.test(name));
    if (forbidden.length) throw new Error(`Excluded files entered the package: ${forbidden.map(({ path: name }) => name).join(', ')}`);
    if (packed.bundled.some((name) => name === 'esbuild' || name.startsWith('@esbuild/') || name.startsWith('@napi-rs/') || name.startsWith('@resvg/'))) {
      throw new Error('A platform-specific dependency entered the bundle.');
    }
    for (const entry of ['bin/opendoc.mjs', 'src/cli/main.ts', 'starter/projects.json', 'tsconfig.workspace.json', '.agents/skills/opendoc-create/SKILL.md', 'node_modules/@formepdf/core/pkg-node/forme_bg.wasm', 'vendor/formepdf/LICENSE']) {
      if (!filenames.has(entry)) throw new Error(`Required package file missing: ${entry}`);
    }
    if (selectedEdition === 'normal' && !filenames.has('dist/index.html')) throw new Error('Normal OpenDoc requires the built browser interface.');
    if (selectedEdition === 'headless' && [...filenames].some((name) => browserFiles.some((entry) => name === entry || name.startsWith(`${entry}/`)))) {
      throw new Error('The browser interface entered the headless package.');
    }
    const corePaths = new Set();
    for (const owner of ['', 'node_modules/@formepdf/react']) {
      const require = createRequire(path.join(stage, owner, 'package.json'));
      corePaths.add(require.resolve('@formepdf/core'));
    }
    if (corePaths.size !== 1) throw new Error('The package does not share one repaired Forme engine.');
    const report = { ...packed, archive, edition: selectedEdition, engineVersion: engine.version, engineSha256: engine.sha256, starterSha256 };
    await writeFile(path.join(output, packed.filename.replace(/\.tgz$/, '.manifest.json')), JSON.stringify(report, null, 2) + '\n');
    reports.push(report);
    console.log(`Packed ${release.name}@${release.version}: ${(packed.size / 1024 / 1024).toFixed(1)} MiB compressed, ${(packed.unpackedSize / 1024 / 1024).toFixed(1)} MiB unpacked, ${packed.entryCount} files.`);
    console.log(`Bundled: ${packed.bundled.join(', ')}.`);
    console.log(archive);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
if (new Set(reports.map((report) => report.starterSha256)).size !== 1 || new Set(reports.map((report) => report.engineSha256)).size !== 1) {
  throw new Error('Normal and headless packages must contain identical starter libraries and Node rendering engines.');
}
