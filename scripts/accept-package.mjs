#!/usr/bin/env node
// Exercise a release as an npm consumer. No checkout imports or linked runtime folders.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Package acceptance requires Node.js 24 or newer.');
if (process.argv.length !== 3) throw new Error('Usage: node scripts/accept-package.mjs <opendoc-tarball.tgz>');
const tarball = await realpath(resolve(process.argv[2]));
const checkout = fileURLToPath(new URL('../', import.meta.url));
const directory = await realpath(await mkdtemp(resolve(tmpdir(), 'opendoc-package-acceptance-')));
assert.ok(relative(checkout, directory).startsWith('..'), 'Acceptance must run outside the source checkout.');
const manifestPath = resolve(directory, 'acceptance.json');
const manifest = { ok: false, directory, tarball, startedAt: new Date().toISOString(), node: process.version, platform: process.platform, workspaces: [], exports: [], checks: [] };
const servers = new Set();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonFile = async file => JSON.parse(await readFile(file, 'utf8'));
const exists = async file => lstat(file).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
const pause = ms => new Promise(accept => setTimeout(accept, ms));
const diagnostic = text => process.stderr.write(`${text}\n`);
const within = (root, file) => { const path = relative(root, file); return path !== '..' && !path.startsWith(`..${sep}`); };
const signalTree = (child, signal) => { try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } };

async function fileHashes(root, base = root) {
  const result = {};
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) Object.assign(result, await fileHashes(path, base));
    else { assert.ok(entry.isFile(), 'Starter files cannot be symlinks.'); result[relative(base, path)] = hash(await readFile(path)); }
  }
  return result;
}

async function until(check, label, timeout = 45_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await check();
    if (result) return result;
    await pause(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function run(command, args, cwd, extraEnv = {}, timeout = 180_000, expectedCode = 0) {
  const began = Date.now();
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...extraEnv }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-24_000); });
    const timer = setTimeout(() => signalTree(child, 'SIGKILL'), timeout);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code !== expectedCode) reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code}).\n${stderr}\n${stdout}`));
      else { manifest.checks.push({ command: [command, ...args], cwd, code, ms: Date.now() - began }); accept(stdout); }
    });
  });
}

const cli = (root, args, cwd = root, env = {}) => run(process.execPath, [resolve(root, 'node_modules/opendoc/bin/opendoc.mjs'), ...args], cwd, env);
const cliJSON = async (root, args, cwd = root, env = {}) => JSON.parse(await cli(root, [...args, '--json'], cwd, env));
const cliFailure = async (root, args, cwd = root) => JSON.parse(await run(process.execPath, [resolve(root, 'node_modules/opendoc/bin/opendoc.mjs'), ...args, '--json'], cwd, {}, 180_000, 1));

async function start(root, cwd = root, offline = false) {
  const child = spawn(process.execPath, [resolve(root, 'node_modules/opendoc/bin/opendoc.mjs'), 'start', '--no-open', '--json'], {
    cwd, env: { ...process.env, OPENDOC_PORT: '0', ...(offline ? { npm_config_offline: 'true', npm_config_registry: 'http://127.0.0.1:9' } : {}) },
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const server = { child, root, stdout: '', stderr: '' };
  servers.add(server);
  child.stdout.on('data', data => { server.stdout += data; });
  child.stderr.on('data', data => { server.stderr = (server.stderr + data).slice(-24_000); });
  child.on('error', error => { server.error = error; });
  const ready = await until(() => {
    if (server.error) throw server.error;
    if (child.exitCode !== null) throw new Error(`Start exited before readiness: ${server.stderr}\n${server.stdout}`);
    try { return JSON.parse(server.stdout.trim()); } catch { return false; }
  }, 'the installed start command');
  assert.equal(ready.workspace, await realpath(root));
  assert.equal(ready.version, manifest.version);
  assert.equal(ready.reused, false);
  const session = await jsonFile(resolve(root, '.opendoc/server.json'));
  assert.equal(ready.origin, session.origin);
  Object.assign(server, { origin: ready.origin, token: session.token, ready });
  const html = await fetch(server.origin).then(response => { assert.equal(response.status, 200); return response.text(); });
  assert.match(html, /<html|<!doctype html/i);
  const asset = /(?:src|href)="(\/assets\/[^"#?]+)/.exec(html)?.[1];
  assert.ok(asset, 'The installed interface includes built assets.');
  assert.equal((await fetch(server.origin + asset)).status, 200);
  manifest.checks.push({ command: ['opendoc', 'start', '--no-open', '--json'], cwd, offlineNpm: offline });
  return server;
}

async function stop(server) {
  if (!servers.has(server)) return;
  const child = server.child;
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGINT');
  try { await until(() => child.exitCode !== null || child.signalCode !== null, 'graceful shutdown', 15_000); }
  catch (error) { signalTree(child, 'SIGKILL'); throw error; }
  servers.delete(server);
  assert.equal(await exists(resolve(server.root, '.opendoc/server.json')), false, 'Ctrl+C removes the local session.');
  assert.deepEqual(JSON.parse(server.stdout.trim()), server.ready, 'Start emits exactly one JSON readiness result.');
}

async function api(server, route, body) {
  const response = await fetch(server.origin + route, {
    ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: server.origin, 'X-OpenDoc-Token': server.token }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

async function readyDocument(server, id, after = -1) {
  return until(async () => {
    const state = await api(server, `/api/documents/${id}`);
    if (state.status === 'error') throw new Error(`${id} failed: ${state.error}`);
    return state.status === 'ready' && state.revision > after && state;
  }, `${id} to render`, 90_000);
}

async function saveExport(server, state, format, filename = `${state.id}.${format}`) {
  const saved = await api(server, `/api/documents/${state.id}/exports`, { id: randomUUID(), hash: state.artifact.hash, format, filename });
  assert.ok(within(server.root, saved.path), 'Exports stay in their own workspace.');
  const bytes = await readFile(saved.path);
  assert.ok(bytes.length > 100);
  if (format === 'pdf') {
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    const preview = Buffer.from(await (await fetch(`${server.origin}/api/documents/${state.id}/pdf?hash=${state.artifact.hash}`)).arrayBuffer());
    assert.deepEqual(bytes, preview, 'PDF export matches the current preview bytes.');
  } else assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  const download = Buffer.from(await (await fetch(`${server.origin}/api/exports/${saved.id}/download`)).arrayBuffer());
  assert.deepEqual(download, bytes);
  const entry = { workspace: server.root, documentId: state.id, format, path: saved.path, bytes: bytes.length, sha256: hash(bytes), renderHash: state.artifact.hash, pages: state.artifact.pages.length };
  manifest.exports.push(entry);
  return entry;
}

async function acceptHeadless(root, nested) {
  diagnostic('Exercising remote authoring, specimens, review files, feedback, and delivered exports.');
  assert.match((await cliFailure(root, ['start', '--no-open'], nested)).error, /headless|browser/i);
  assert.equal(await exists(resolve(root, '.opendoc/server.json')), false);
  // Headless must never consult a leftover GUI session when producing artifacts.
  await writeFile(resolve(root, '.opendoc/server.json'), 'invalid GUI session that Headless must ignore');
  const sourcePath = resolve(root, 'documents/acceptance-report/index.tsx');
  await writeFile(sourcePath, reportSource.replace('Original editable copy.', 'Saved through the installed agent.'));
  const feedback = await cliJSON(root, ['comments', 'add', 'acceptance-report', 'editable', 'Confirmed the remote revision.'], nested);
  const comment = feedback.find(item => item.text === 'Confirmed the remote revision.');
  assert.ok(comment); assert.match(comment.quote, /Saved through the installed agent/);
  await cliJSON(root, ['comments', 'resolve', 'acceptance-report', comment.id], nested);
  assert.equal((await cliJSON(root, ['comments', 'list', 'acceptance-report'], nested)).find(item => item.id === comment.id).status, 'resolved');

  const template = resolve(root, 'templates/acceptance-template');
  await cp(resolve(root, 'templates/executive-brief'), template, { recursive: true });
  const descriptor = await jsonFile(resolve(template, 'template.json'));
  await writeFile(resolve(template, 'template.json'), JSON.stringify({ ...descriptor, name: 'Remote custom brief' }, null, 2));
  assert.equal((await cliJSON(root, ['templates', 'inspect', 'acceptance-template'], nested)).name, 'Remote custom brief');
  for (const [catalog, id] of [['templates', 'acceptance-template'], ['themes', 'acceptance-theme']]) {
    await cliJSON(root, [catalog, 'preview', id], nested);
    assert.equal((await readFile(resolve(root, 'output', catalog, `${id}.pdf`))).subarray(0, 5).toString(), '%PDF-');
  }
  manifest.reviews = [];
  for (const args of [['acceptance-report'], ['--theme', 'acceptance-theme'], ['--template', 'acceptance-template']]) {
    const review = await cliJSON(root, ['review', ...args], nested);
    assert.equal(review.status, 'ready'); assert.equal(review.visualReview, 'required');
    assert.ok(review.pages.length && review.pages.length === review.pageCount);
    assert.ok(within(root, review.outputs.directory));
    assert.equal(hash(await readFile(review.outputs.pdf)), review.hash);
    assert.equal((await jsonFile(review.outputs.review)).hash, review.hash);
    const extracted = await readFile(review.outputs.text, 'utf8');
    assert.ok(extracted.trim().length);
    for (const page of review.pages) {
      assert.ok(within(review.outputs.directory, page.image));
      assert.equal((await readFile(page.image)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(typeof page.text, 'string');
      assert.ok(within(review.outputs.directory, page.text));
      assert.equal(typeof await readFile(page.text, 'utf8'), 'string');
      assert.ok(Array.isArray(page.blockIds));
    }
    if (review.kind === 'document') assert.match(extracted, /Saved through the installed agent/);
    manifest.reviews.push(review);
  }
  const reviewed = manifest.reviews.find(item => item.id === 'acceptance-report');
  const previousReview = hash(await readFile(reviewed.outputs.review));
  const validSource = await readFile(sourcePath, 'utf8');
  await writeFile(sourcePath, validSource + '\nthis is deliberately invalid TSX');
  const failed = await cliFailure(root, ['review', 'acceptance-report'], nested);
  assert.equal(failed.status, 'error'); assert.equal(failed.previousOutputRetained, true);
  assert.equal(hash(await readFile(reviewed.outputs.review)), previousReview);
  await writeFile(sourcePath, validSource);

  for (const id of ['acceptance-report', 'acceptance-deck', 'acceptance-invoice', 'welcome', 'welcome-presentation']) {
    for (const format of ['pdf', ...(['acceptance-deck', 'welcome-presentation'].includes(id) ? ['pptx'] : [])]) {
      const exported = (await cliJSON(root, ['export', id, '--format', format], nested, { npm_config_offline: 'true', npm_config_registry: 'http://127.0.0.1:9' })).results[0];
      assert.equal(exported.status, 'success'); assert.equal(exported.source, 'render');
      const bytes = await readFile(exported.path);
      if (id === 'acceptance-invoice') assert.ok(exported.pages >= 3);
      if (id === 'acceptance-report') assert.equal(hash(bytes), reviewed.hash, 'Delivered PDF matches the remotely reviewed revision.');
      manifest.exports.push({ workspace: root, documentId: id, format, path: exported.path, bytes: bytes.length, sha256: hash(bytes), renderHash: exported.hash, pages: exported.pages });
    }
  }
  assert.equal(await readFile(resolve(root, '.opendoc/server.json'), 'utf8'), 'invalid GUI session that Headless must ignore');
}

const reportSource = `import { Document, Pages, Heading, Paragraph, Block, MediaFrame, Logo, type DocumentMeta } from 'opendoc';
import { defineTemplate } from 'opendoc/template';
import { theme } from './theme';
export const meta: DocumentMeta = {title: 'Package acceptance report', description: 'Synthetic release acceptance material.', theme: theme.id};
const content = defineTemplate({parse: (text: string) => text, meta: () => meta, render: (text: string) => <Paragraph id="copy">{text}</Paragraph>});
export default function Report() { return <Document title={meta.title} theme={theme}><Pages title="Package acceptance">
<Heading id="title">A document from the installed package</Heading>
<Paragraph id="editable">Original editable copy.</Paragraph>
{content.render('A public template API is available.')}
<Block id="image"><MediaFrame item="acceptance-image" width={180} height={90} fit="contain" /></Block>
<Block id="logo"><Logo width={120} /></Block>
</Pages></Document>; }
`;
const deckSource = `import { Presentation, Slide, Heading, Paragraph, Strong, type DocumentMeta } from 'opendoc';
import { theme } from './theme';
export const meta: DocumentMeta = {title: 'Editable package deck', description: 'Synthetic release acceptance material.', theme: theme.id};
export default function Deck() { return <Presentation title={meta.title} theme={theme}>
<Slide id="opening"><Heading id="deck-title">Editable package deck</Heading><Paragraph id="deck-copy">Native text with a <Strong>clear argument</Strong>.</Paragraph></Slide>
<Slide id="closing"><Heading id="closing-title">The next page is yours.</Heading><Paragraph id="closing-copy">Both export formats share one source revision.</Paragraph></Slide>
</Presentation>; }
`;

// Inspection runs with dependencies resolved from the installed package, never this script's checkout.
const inspectSource = `import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(resolve(process.argv[2], 'node_modules/opendoc/package.json'));
const { register } = await import(pathToFileURL(require.resolve('tsx/esm/api')).href); register();
for (const name of ['opendoc', 'opendoc/themes', 'opendoc/assets', 'opendoc/template', 'opendoc/jsx-runtime', 'opendoc/jsx-dev-runtime']) assert.ok(Object.keys(await import(name)).length, name);
const files = JSON.parse(await readFile(process.argv[3], 'utf8'));
const { getDocument } = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
const { readZip } = await import(pathToFileURL(require.resolve('@shbernal/ts-pptx/zip')).href);
const checks = [];
for (const file of files) {
  const bytes = await readFile(file.path);
  if (file.format === 'pdf') {
    const task = getDocument({data: new Uint8Array(bytes), standardFontDataUrl: resolve(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + sep, verbosity: 0, useSystemFonts: false});
    try { const pdf = await task.promise; assert.equal(pdf.numPages, file.pages); let text = '';
      for (let page = 1; page <= pdf.numPages; page++) text += (await (await pdf.getPage(page)).getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' ') + '\\n';
      if (file.documentId === 'acceptance-report') assert.match(text, /Saved through the installed (?:application|agent)/);
      if (file.documentId === 'acceptance-deck') assert.match(text, /Editable package deck/);
      checks.push({path: file.path, pages: pdf.numPages, textCharacters: text.length});
    } finally { await task.destroy(); }
  } else { const parts = await readZip(bytes); const slides = [...parts.keys()].filter(path => /^ppt\\/slides\\/slide\\d+\\.xml$/.test(path));
    assert.equal(slides.length, file.pages); assert.ok([...parts.keys()].some(path => path.startsWith('ppt/fonts/')));
    const text = slides.map(path => Buffer.from(parts.get(path)).toString()).join(''); assert.match(text, /<a:t>/);
    if (file.documentId === 'acceptance-deck') assert.match(text, /Editable package deck/);
    checks.push({path: file.path, editableSlides: slides.length, embeddedFonts: [...parts.keys()].filter(path => path.startsWith('ppt/fonts/')).length});
  }
}
console.log(JSON.stringify({publicApis: true, checks}));
`;

try {
  manifest.tarballSha256 = hash(await readFile(tarball));
  diagnostic(`Installing release into ${directory}`);
  const launcher = resolve(directory, 'launcher');
  await mkdir(launcher);
  await writeFile(resolve(launcher, 'package.json'), '{"name":"opendoc-acceptance-launcher","private":true,"type":"module"}\n');
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', `opendoc@file:${tarball}`], launcher);
  const installed = await jsonFile(resolve(launcher, 'node_modules/opendoc/package.json'));
  manifest.version = installed.version;
  manifest.edition = installed.opendoc?.edition ?? 'normal';
  manifest.packageName = installed.name;
  const headless = manifest.edition === 'headless';
  const pin = `npm:${installed.name}@${manifest.version}`;
  assert.equal(installed.name, headless ? '@ryanyahya/opendoc-headless' : '@ryanyahya/opendoc');
  if (headless) {
    for (const path of ['dist', 'src/app', 'src/server/index.ts']) assert.equal(await exists(resolve(launcher, 'node_modules/opendoc', path)), false);
    for (const dependency of ['opendoc', '@ryanyahya/opendoc', '@base-ui/react', 'react-dom', 'react-markdown', 'remark-gfm', 'ws', 'chokidar']) assert.equal(installed.dependencies?.[dependency], undefined);
    assert.equal(await exists(resolve(launcher, 'node_modules/opendoc-headless')), false, 'The alias installs one runtime under the shared authoring name.');
    assert.match((await cliFailure(launcher, ['init'], directory)).error, /folder/i);
    await run('npm', ['exec', '--offline', '--', 'opendoc-headless', '--help'], launcher);
  }
  const dependencyTree = JSON.parse(await run('npm', ['ls', '@formepdf/core', '--all', '--json'], launcher));
  const engines = [];
  const visit = tree => { for (const [name, dependency] of Object.entries(tree.dependencies ?? {})) { if (name === '@formepdf/core') engines.push(dependency.version); visit(dependency); } };
  visit(dependencyTree);
  assert.ok(engines.length && engines.every(version => version === '0.20.1-opendoc.3'), 'Every installed renderer uses the repaired engine.');
  manifest.engineVersions = [...new Set(engines)];
  await run('npm', ['exec', '--offline', '--', 'opendoc', '--help'], launcher);
  const first = resolve(directory, 'first workspace'), second = resolve(directory, 'second workspace — 文档');
  for (const root of [first, second]) {
    diagnostic(`Initializing ${root}`);
    const result = await cliJSON(launcher, ['init', root, '--no-start'], launcher, { OPENDOC_PACKAGE_TARBALL: tarball });
    assert.equal(result.workspace, root); assert.equal(result.version, manifest.version);
    assert.equal((await jsonFile(resolve(root, 'package.json'))).dependencies.opendoc, pin);
    assert.equal((await jsonFile(resolve(root, 'package-lock.json'))).packages[''].dependencies.opendoc, pin);
    assert.equal((await jsonFile(resolve(root, '.opendoc/workspace.json'))).edition, manifest.edition);
    assert.equal(await exists(resolve(root, 'src')), false);
    assert.equal((await lstat(resolve(root, 'node_modules/opendoc'))).isSymbolicLink(), false);
    assert.ok(within(root, await realpath(resolve(root, 'node_modules/opendoc'))));
    assert.equal(await readFile(resolve(root, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');
    assert.equal(await realpath(resolve(root, '.claude/skills')), await realpath(resolve(root, '.agents/skills')));
    for (const skill of await readdir(resolve(root, '.agents/skills'))) {
      assert.equal(await readFile(resolve(root, '.claude/skills', skill, 'SKILL.md'), 'utf8'), await readFile(resolve(root, '.agents/skills', skill, 'SKILL.md'), 'utf8'));
      const guidePath = `node_modules/opendoc/.agents/skills/${skill}/SKILL.md`;
      assert.ok((await readFile(resolve(root, 'AGENTS.md'), 'utf8')).includes(guidePath));
      assert.ok((await readFile(resolve(root, guidePath), 'utf8')).startsWith('---\n'));
    }
    for (const folder of ['documents', 'themes', 'templates', 'assets']) assert.deepEqual(await fileHashes(resolve(root, folder)), await fileHashes(resolve(launcher, 'node_modules/opendoc/starter', folder)), `The complete ${folder} starter library is copied unchanged.`);
    assert.equal(await exists(resolve(root, '.opendoc/server.json')), false);
    manifest.workspaces.push(root);
  }
  assert.match((await cliFailure(launcher, ['init', first, '--no-start'], launcher)).error, /overwrite|empty/i);
  const nested = resolve(first, 'documents/welcome');
  const secondManifest = hash(await readFile(resolve(second, 'projects.json')));
  assert.ok((await cliJSON(first, ['projects', 'list'], nested)).projects.length);
  assert.ok((await cliJSON(first, ['templates', 'list'], nested)).some(template => template.id === 'invoice'));
  assert.ok((await cliJSON(first, ['themes', 'list'], nested)).some(theme => theme.id === 'neutral'));
  await cliJSON(first, ['projects', 'create', 'acceptance', '--name', 'Release acceptance'], nested);
  const custom = resolve(first, 'themes/acceptance-theme');
  await cp(resolve(first, 'themes/neutral'), custom, { recursive: true });
  await writeFile(resolve(custom, 'index.ts'), `import { neutral, validateTheme } from 'opendoc/themes';
export const theme = {...neutral, id: 'acceptance-theme', name: 'Acceptance theme', accent: '#2646A6'}; validateTheme(theme);\n`);
  const customGuide = await readFile(resolve(custom, 'design.md'), 'utf8');
  await writeFile(resolve(custom, 'design.md'), customGuide.replaceAll('Neutral', 'Acceptance theme').replaceAll('#424242', '#2646A6').replace('quiet gray structure', 'restrained blue accents'));
  assert.equal((await cliJSON(first, ['themes', 'inspect', 'acceptance-theme'], nested)).id, 'acceptance-theme');
  await cliJSON(first, ['create', 'acceptance-report', '--project', 'acceptance', '--title', 'Package acceptance report', '--theme', 'acceptance-theme'], nested);
  await cliJSON(first, ['create', 'acceptance-deck', '--project', 'acceptance', '--title', 'Editable package deck', '--format', 'presentation'], nested);
  await cliJSON(first, ['create', 'acceptance-invoice', '--project', 'acceptance', '--title', 'Template acceptance', '--template', 'invoice'], nested);
  const invoiceFile = resolve(first, 'documents/acceptance-invoice/data.json');
  const invoice = await jsonFile(invoiceFile);
  invoice.pricing.items = Array.from({ length: 36 }, (_, index) => ({ id: `acceptance-line-${index + 1}`, description: `Acceptance line ${index + 1}: synthetic research, writing, and review services with documented scope and supporting material.`, quantity: '1', unit: 'package', unitPrice: `${20 + index}.00` }));
  invoice.notes.push({ id: 'continuation', title: 'Long-form acceptance material', text: 'This fictional scope note verifies that prose remains readable after a continued pricing table. Each rendered page should retain its margins, complete words, and clear relationship to the table above. '.repeat(15).trim() });
  await writeFile(invoiceFile, JSON.stringify(invoice, null, 2) + '\n');
  const input = resolve(first, 'acceptance-inputs'); await mkdir(input);
  const svg = resolve(input, 'mark.svg');
  await writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#2646A6"/><path d="M25 70L60 30L95 70Z" fill="#fff"/></svg>');
  await cliJSON(first, ['assets', 'import', 'logo', '--file', svg, '--name', 'Acceptance mark', '--id', 'acceptance-mark'], nested);
  const logo = await cliJSON(first, ['assets', 'inspect', 'logo', 'acceptance-mark'], nested);
  const revision = logo.asset ?? logo.revision ?? logo;
  const imageFile = resolve(first, 'assets/logos/acceptance-mark', revision.variations[0].image.file);
  await cliJSON(first, ['media', 'import', 'acceptance-report', 'acceptance-image', '--file', imageFile, '--title', 'Acceptance illustration', '--description', 'A synthetic blue geometric mark used to verify local image import.'], nested);
  await cliJSON(first, ['media', 'check', 'acceptance-report', 'acceptance-image'], nested);
  await cliJSON(first, ['assets', 'import', 'font', '--file', resolve(first, 'assets/fonts/OpenDocSans-Regular.ttf'), '--file', resolve(first, 'assets/fonts/OpenDocSans-Semibold.ttf'), '--name', 'Acceptance Sans', '--id', 'acceptance-sans'], nested);
  await cliJSON(first, ['assets', 'bind', 'acceptance-report', 'logo', 'acceptance-mark'], nested);
  await cliJSON(first, ['assets', 'bind', 'acceptance-report', 'body-font', 'acceptance-sans'], nested);
  await writeFile(resolve(first, 'documents/acceptance-report/index.tsx'), reportSource);
  await writeFile(resolve(first, 'documents/acceptance-deck/index.tsx'), deckSource);
  assert.equal((await cliJSON(first, ['check'], nested)).ok, true);
  assert.equal(hash(await readFile(resolve(second, 'projects.json'))), secondManifest, 'The second workspace stays independent.');

  if (headless) await acceptHeadless(first, nested);
  else {
  diagnostic('Exercising the installed interface, watcher, corrections, comments, and exports.');
  const live = await start(first, nested);
  const reused = await cliJSON(first, ['start', '--no-open'], nested);
  assert.equal(reused.origin, live.origin); assert.equal(reused.reused, true);
  const guide = await api(live, '/api/guides?path=docs%2FAUTHORING.md');
  assert.equal(guide.file, 'docs/AUTHORING.md'); assert.ok(guide.markdown.length > 1000);
  const packagedGuide = await api(live, '/api/guides?path=node_modules%2Fopendoc%2Fdocs%2FAUTHORING.md');
  assert.equal(packagedGuide.markdown, guide.markdown);
  const skillPointer = await api(live, '/api/guides?path=.agents%2Fskills%2Fopendoc-create%2FSKILL.md');
  assert.match(skillPointer.markdown, /node_modules\/opendoc\//);
  const skillGuide = await api(live, '/api/guides?path=node_modules%2Fopendoc%2F.agents%2Fskills%2Fopendoc-create%2FSKILL.md');
  assert.ok(skillGuide.markdown.length > 1000, 'Agent skill pointers open substantive installed instructions.');
  assert.equal((await fetch(live.origin + '/api/guides?path=.opendoc%2Fserver.json')).status, 400);
  const initial = await readyDocument(live, 'acceptance-report');
  const sourcePath = resolve(first, 'documents/acceptance-report/index.tsx');
  await writeFile(sourcePath, reportSource.replace('Original editable copy.', 'A watched source revision.'));
  const watched = await readyDocument(live, 'acceptance-report', initial.revision);
  assert.match(watched.artifact.blocks.editable.text, /A watched source revision/);
  const target = watched.artifact.textTargets.find(item => item.blockId === 'editable');
  assert.ok(target, 'The rendered paragraph has an editable text target.');
  const binding = target.runs.find(run => run.source);
  assert.ok(binding?.source, 'The installed JSX runtime preserves the paragraph’s authored source binding.');
  assert.equal(binding.source.file, 'documents/acceptance-report/index.tsx');
  const change = { revision: watched.revision, hash: watched.artifact.hash, edits: [{ targetId: target.id, start: binding.start, end: binding.end, replacement: 'Saved through the installed application.' }] };
  await api(live, '/api/documents/acceptance-report/edits', change);
  const edited = await readyDocument(live, 'acceptance-report', watched.revision);
  assert.match(edited.artifact.blocks.editable.text, /Saved through the installed application/);
  assert.match(await readFile(sourcePath, 'utf8'), /Saved through the installed application/);
  const comments = await cliJSON(first, ['comments', 'add', 'acceptance-report', 'editable', 'Confirmed the installed editing workflow.'], nested);
  const comment = comments.find(item => item.text === 'Confirmed the installed editing workflow.'); assert.ok(comment);
  await cliJSON(first, ['comments', 'resolve', 'acceptance-report', comment.id], nested);
  assert.equal((await cliJSON(first, ['comments', 'list', 'acceptance-report'], nested)).find(item => item.id === comment.id).status, 'resolved');
  await saveExport(live, edited, 'pdf');
  for (const id of ['acceptance-deck', 'acceptance-invoice', 'welcome', 'welcome-presentation']) {
    const state = await readyDocument(live, id);
    if (id === 'acceptance-invoice') {
      assert.ok(state.artifact.pages.length >= 3, 'Long template data exercise multiple pages.');
      assert.ok(state.artifact.pages.filter(page => page.fragments.some(block => block.id === 'pricing-items')).length >= 2, 'The pricing table continues across pages.');
    }
    await saveExport(live, state, 'pdf');
    if (state.artifact.format === 'presentation') await saveExport(live, state, 'pptx');
  }
  const liveCLI = await cliJSON(first, ['export', 'acceptance-deck', '--format', 'pptx'], nested);
  assert.equal(liveCLI.results[0].status, 'success');
  const offline = await start(second, resolve(second, 'documents/welcome'), true);
  assert.notEqual(offline.origin, live.origin);
  assert.equal((await api(offline, '/api/documents')).some(state => state.id === 'acceptance-report'), false);
  await readyDocument(offline, 'welcome');
  await stop(offline); await stop(live);
  }
  const offlineCLI = await cliJSON(first, ['export', 'acceptance-report'], nested, { npm_config_offline: 'true', npm_config_registry: 'http://127.0.0.1:9' });
  assert.equal(offlineCLI.results[0].status, 'success');
  assert.equal(hash(await readFile(offlineCLI.results[0].path)), manifest.exports.find(item => item.documentId === 'acceptance-report').sha256);
  const inspect = resolve(first, '.opendoc/acceptance-inspect.mjs');
  const exportsFile = resolve(directory, 'exports.json');
  await writeFile(inspect, inspectSource); await writeFile(exportsFile, JSON.stringify(manifest.exports, null, 2));
  manifest.inspection = JSON.parse(await run(process.execPath, [inspect, first, exportsFile], nested));
  assert.equal(hash(await readFile(tarball)), manifest.tarballSha256, 'The release archive remained unchanged throughout acceptance.');
  manifest.ok = true;
  diagnostic('Installed package acceptance passed. Exported artifacts remain available for visual review.');
} catch (error) {
  manifest.error = error instanceof Error ? error.stack : String(error);
  diagnostic(manifest.error);
  process.exitCode = 1;
} finally {
  for (const server of servers) {
    try { await stop(server); }
    catch (error) { diagnostic(`Cleanup: ${error.message}`); process.exitCode = 1; manifest.ok = false; }
  }
  manifest.finishedAt = new Date().toISOString();
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ ok: manifest.ok, directory, manifest: manifestPath, exports: manifest.exports.map(item => item.path) }, null, 2));
}
