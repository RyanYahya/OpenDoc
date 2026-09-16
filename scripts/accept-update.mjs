#!/usr/bin/env node
// Exercise real npm updates against disposable releases served only on localhost.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, createReadStream } from 'node:fs';
import { appendFile, copyFile, lstat, mkdir, mkdtemp, readdir, readFile, readlink, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Update acceptance requires Node.js 24 or newer.');
if (process.argv.length !== 3) throw new Error('Usage: node scripts/accept-update.mjs <opendoc-release-tarball.tgz>');
const sourceTarball = await realpath(resolve(process.argv[2]));
const checkout = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(resolve(tmpdir(), 'opendoc-update-acceptance-'));
assert.ok(relative(checkout, directory).startsWith('..'), 'Acceptance must run outside the source checkout.');
const tarball = resolve(directory, 'release.tgz');
await copyFile(sourceTarball, tarball);
const manifestPath = resolve(directory, 'acceptance.json');
const logPath = resolve(directory, 'acceptance.log');
const manifest = {
  ok: false, directory, sourceTarball, tarball, startedAt: new Date().toISOString(), node: process.version,
  platform: process.platform, log: logPath, checks: [], updates: [], preservation: [],
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonFile = async file => JSON.parse(await readFile(file, 'utf8'));
const pause = ms => new Promise(accept => setTimeout(accept, ms));
const diagnostic = message => { process.stderr.write(`${message}\n`); appendFileSync(logPath, `${message}\n`); };
const redact = text => String(text).replace(/([?&]token=)[^&\s]+/gi, '$1[redacted]').replace(/("token"\s*:\s*")[^"]+"/gi, '$1[redacted]"');
const children = new Set();
let registry;
let live;
let userManifest;
const packageNames = { normal: '@ryanyahya/opendoc', headless: '@ryanyahya/opendoc-headless' };
let edition, packageName, shortName;
let baseVersion, compatibleVersion, breakingVersion, brokenVersion;
const pinFor = version => `npm:${packageName}@${version}`;

function killTree(child) {
  if (!child.pid) return;
  try { process.kill(-child.pid, 'SIGKILL'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

async function run(command, args, cwd, extraEnv = {}, allowFailure = false) {
  const began = Date.now();
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...extraEnv }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-24_000); });
    const timer = setTimeout(() => killTree(child), 180_000);
    child.once('error', error => { clearTimeout(timer); children.delete(child); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer); children.delete(child);
      if (code !== 0) killTree(child);
      manifest.checks.push({ command: [command, ...args], cwd, ms: Date.now() - began, code, signal });
      if (code !== 0 && !allowFailure) reject(new Error(redact(`${command} ${args.join(' ')} failed (${signal ?? code}).\n${stderr}\n${stdout}`)));
      else accept({ stdout, stderr, code, signal });
    });
  });
}

const cli = (root, args, env = {}, allowFailure = false) => run(process.execPath, [resolve(root, 'node_modules/opendoc/bin/opendoc.mjs'), ...args, '--json'], root, env, allowFailure);
const cliJSON = async (root, args, env = {}) => JSON.parse((await cli(root, args, env)).stdout);

async function until(check, label, timeout = 45_000) {
  const began = Date.now();
  while (Date.now() - began < timeout) {
    const value = await check();
    if (value) return value;
    await pause(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function start(root) {
  const child = spawn(process.execPath, [resolve(root, 'node_modules/opendoc/bin/opendoc.mjs'), 'start', '--no-open', '--json'], {
    cwd: root, env: { ...process.env, OPENDOC_PORT: '0' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const server = { child, root, stdout: '', stderr: '' };
  live = server;
  child.stdout.on('data', data => { server.stdout += data; });
  child.stderr.on('data', data => { server.stderr = (server.stderr + data).slice(-24_000); });
  child.once('error', error => { server.error = error; });
  child.once('close', () => { server.closed = true; });
  const ready = await until(() => {
    if (server.error) throw server.error;
    if (child.exitCode !== null) throw new Error(redact(`The installed server exited during startup: ${server.stderr}`));
    try { return JSON.parse(server.stdout.trim()); } catch { return false; }
  }, 'the installed server');
  assert.equal(ready.version, baseVersion);
  assert.equal(ready.reused, false);
  server.origin = ready.origin;
  server.document = await until(async () => {
    const response = await fetch(`${server.origin}/api/documents/update-owned`);
    if (!response.ok) return false;
    const state = await response.json();
    if (state.status === 'error') throw new Error(`The preservation document failed to render: ${state.error}`);
    return state.status === 'ready' && state;
  }, 'the preservation document', 90_000);
  return server;
}

async function stop() {
  if (!live) return;
  const child = live.child;
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGINT');
  await until(() => live.closed, 'graceful shutdown', 15_000);
  const sessionExists = await lstat(resolve(live.root, '.opendoc/server.json')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
  assert.equal(sessionExists, false, 'The server must finish shutdown before update activation.');
  live = undefined;
}

// Hash bytes and link targets, never follow user symlinks outside the workspace.
// Keep persistent export receipts, workspace metadata, and every author-owned
// path; only dependency metadata and transient runtime activity are excluded.
async function snapshot(root, excluded = () => false) {
  const files = {};
  async function visit(folder, prefix = '') {
    for (const name of (await readdir(folder)).sort()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (excluded(path)) continue;
      const file = resolve(folder, name), stat = await lstat(file);
      if (stat.isDirectory()) await visit(file, path);
      else if (stat.isSymbolicLink()) files[path] = hash(`symlink:${await readlink(file)}`);
      else if (stat.isFile()) files[path] = hash(await readFile(file));
      else throw new Error(`Unexpected special file in disposable workspace: ${path}`);
    }
  }
  await visit(root);
  return files;
}

const volatile = new Set(['node_modules', 'package.json', 'package-lock.json', '.opendoc/server.json', '.opendoc/current.json', '.opendoc/update.lock', '.opendoc/renders', '.opendoc/dependencies', '.opendoc/locks', '.opendoc/media-imports']);
const ownedSnapshot = root => snapshot(root, path => volatile.has(path)
  || /(?:^|\/)\.forme-render-[^/]+$/.test(path)
  || /^\.opendoc\/(?:current|server)\.json\.[a-f0-9-]+\.tmp$/.test(path));
const metadataSnapshot = async root => Object.fromEntries(await Promise.all(['package.json', 'package-lock.json'].map(async file => [file, hash(await readFile(resolve(root, file)))])));
const snapshotDigest = files => hash(JSON.stringify(files));

async function assertOwned(root, baseline, stage) {
  const current = await ownedSnapshot(root);
  const changed = [...new Set([...Object.keys(current), ...Object.keys(baseline)])].filter(file => current[file] !== baseline[file]);
  assert.equal(changed.length, 0, `${stage} changed user-owned files: ${changed.slice(0, 20).join(', ')}`);
  manifest.preservation.push({ stage, fileCount: Object.keys(current).length, sha256: snapshotDigest(current) });
}

async function installVersion(root, target) {
  const installed = await jsonFile(resolve(root, 'node_modules/opendoc/package.json'));
  const packageJSON = await jsonFile(resolve(root, 'package.json'));
  const lock = await jsonFile(resolve(root, 'package-lock.json'));
  assert.equal(installed.version, target);
  assert.equal(installed.name, packageName);
  assert.equal(installed.opendoc?.edition, edition);
  assert.equal(packageJSON.dependencies.opendoc, pinFor(target));
  if (userManifest) assert.deepEqual(packageJSON, { ...userManifest, dependencies: { ...userManifest.dependencies, opendoc: pinFor(target) } }, 'Runtime updates preserve every unrelated workspace manifest field.');
  assert.equal(lock.packages[''].dependencies.opendoc, pinFor(target));
  assert.equal(lock.packages['node_modules/opendoc'].version, target);
  assert.equal((await cliJSON(root, ['--version'])).version, target);
}

async function prepareRegistry() {
  const unpacked = resolve(directory, 'release');
  const archives = resolve(directory, 'candidate-tarballs');
  await mkdir(unpacked); await mkdir(archives);
  await run('tar', ['-xzf', tarball, '-C', unpacked], directory);
  const packageRoot = resolve(unpacked, 'package');
  const base = await jsonFile(resolve(packageRoot, 'package.json'));
  assert.ok(Object.values(packageNames).includes(base.name));
  assert.match(base.version, /^\d+\.\d+\.\d+$/, 'Update acceptance requires a stable release.');
  const [major, minor, patch] = base.version.split('.').map(Number);
  assert.ok(major > 0 || minor > 0, 'The compatible-update fixture requires version 0.1.0 or later.');
  baseVersion = base.version;
  compatibleVersion = `${major}.${minor}.${patch + 1}`;
  brokenVersion = `${major}.${minor}.${patch + 2}`;
  breakingVersion = major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  manifest.version = baseVersion;
  packageName = base.name;
  edition = base.opendoc?.edition;
  assert.equal(packageName, packageNames[edition]);
  shortName = packageName.split('/').at(-1);
  manifest.edition = edition; manifest.packageName = packageName;
  const candidates = new Map([[baseVersion, { file: tarball, manifest: base }]]);
  for (const version of [compatibleVersion, breakingVersion]) {
    const candidate = { ...base, version };
    await writeFile(resolve(packageRoot, 'package.json'), JSON.stringify(candidate, null, 2) + '\n');
    const packed = JSON.parse((await run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', archives], packageRoot)).stdout)[0];
    candidates.set(version, { file: resolve(archives, packed.filename), manifest: candidate });
  }
  const corrupt = resolve(archives, `${shortName}-${brokenVersion}.tgz`);
  await writeFile(corrupt, 'Synthetic failed installation: this file is deliberately not a tar archive.\n');
  candidates.set(brokenVersion, { file: corrupt, manifest: { ...base, version: brokenVersion } });
  for (const candidate of candidates.values()) {
    const bytes = await readFile(candidate.file);
    candidate.integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    candidate.shasum = createHash('sha1').update(bytes).digest('hex');
  }

  const published = new Set([baseVersion, compatibleVersion, breakingVersion]);
  const requests = { metadata: 0, tarballs: [], upstreamReads: 0, refusedWrites: 0 };
  let origin;
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        requests.refusedWrites += 1;
        response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
      }
      const url = new URL(request.url, 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const tar = new RegExp(`^/${packageName}/-/${shortName}-([^/]+)\\.tgz$`).exec(pathname);
      if (tar && published.has(tar[1])) {
        requests.tarballs.push(tar[1]);
        response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
        if (request.method === 'HEAD') response.end();
        else {
          const stream = createReadStream(candidates.get(tar[1]).file);
          stream.on('error', () => response.destroy());
          stream.pipe(response);
        }
        return;
      }
      if (pathname === `/${packageName}` || new RegExp(`^/${packageName}/\\d+\\.\\d+\\.\\d+$`).test(pathname)) {
        requests.metadata += 1;
        const versions = Object.fromEntries([...published].map(version => {
          const candidate = candidates.get(version);
          return [version, { ...candidate.manifest, dist: { tarball: `${origin}/${packageName}/-/${shortName}-${version}.tgz`, integrity: candidate.integrity, shasum: candidate.shasum } }];
        }));
        const packument = { _id: packageName, name: packageName, 'dist-tags': { latest: breakingVersion }, versions };
        const body = pathname === `/${packageName}` ? packument : versions[pathname.split('/').at(-1)];
        response.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(request.method === 'HEAD' ? undefined : JSON.stringify(body ?? { error: 'not_found' }));
        return;
      }
      if (Object.values(packageNames).some(name => pathname === `/${name}` || pathname.startsWith(`/${name}/`))) { response.writeHead(404); response.end(); return; }
      // Ordinary dependencies may need registry metadata on an empty cache.
      // Let npm fetch public reads itself, including its normal HTTP handling;
      // this fixture cannot publish or forward authorization headers.
      requests.upstreamReads += 1;
      response.writeHead(302, { Location: `https://registry.npmjs.org${url.pathname}${url.search}` });
      response.end();
    } catch (error) {
      if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'fixture_read_failed', reason: error.message }));
    }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  origin = `http://127.0.0.1:${server.address().port}`;
  registry = server;
  manifest.registry = { origin, candidates: [...candidates].map(([version, candidate]) => ({ version, tarball: candidate.file, integrity: candidate.integrity })), requests };
  const env = {
    npm_config_registry: origin, npm_config_cache: resolve(directory, 'npm-cache'), npm_config_prefer_online: 'true',
    npm_config_fetch_retries: '0', npm_config_fetch_timeout: '60000', npm_config_update_notifier: 'false',
  };
  return { env, published, requests };
}

try {
  manifest.tarballSha256 = hash(await readFile(tarball));
  diagnostic(`Preparing local update releases in ${directory}`);
  const { env, published, requests } = await prepareRegistry();
  const launcher = resolve(directory, 'launcher'), root = resolve(directory, 'owned workspace');
  manifest.workspace = root;
  await mkdir(launcher);
  await writeFile(resolve(launcher, 'package.json'), '{"name":"opendoc-update-launcher","private":true,"type":"module"}\n');
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', `opendoc@file:${tarball}`], launcher, env);
  await cliJSON(launcher, ['init', root, '--no-start'], { ...env, OPENDOC_PACKAGE_TARBALL: tarball });
  await installVersion(root, baseVersion);

  diagnostic('Creating user-owned instructions, document, media, asset, feedback, and export fixtures.');
  userManifest = {
    ...await jsonFile(resolve(root, 'package.json')),
    description: 'User-owned metadata must survive runtime updates.',
    scripts: { preinstall: `node -e "throw new Error('Workspace lifecycle scripts must not run during runtime updates')"` },
    userPreferences: { preserveFormatting: true, project: 'update-owned' },
  };
  await writeFile(resolve(root, 'package.json'), JSON.stringify(userManifest, null, 2) + '\n');
  for (const file of ['AGENTS.md', 'CLAUDE.md', '.agents/skills/opendoc-create/SKILL.md']) {
    await appendFile(resolve(root, file), '\nUser preference for this workspace: keep the original wording and stable identities.\n');
  }
  await cliJSON(root, ['projects', 'create', 'update-owned', '--name', 'User-owned update acceptance']);
  await cliJSON(root, ['create', 'update-owned', '--project', 'update-owned', '--title', 'Update preservation']);
  await writeFile(resolve(root, 'documents/update-owned/index.tsx'), `import { Document, Page, Heading, Paragraph, type DocumentMeta } from 'opendoc';
import { theme } from './theme';
export const meta: DocumentMeta = { title: 'Update preservation', description: 'Synthetic package update acceptance material.', theme: theme.id };
export default function Report() { return <Document title={meta.title} theme={theme}><Page>
<Heading id="owned-heading">A runtime update leaves this page alone.</Heading>
<Paragraph id="owned-copy">This user-authored wording, its feedback, and its exported PDF must remain byte-for-byte unchanged.</Paragraph>
</Page></Document>; }
`);
  const input = resolve(root, 'update-inputs'); await mkdir(input);
  const svg = resolve(input, 'owned-mark.svg');
  await writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><rect width="80" height="40" fill="#234D72"/><circle cx="40" cy="20" r="12" fill="#fff"/></svg>');
  await cliJSON(root, ['assets', 'import', 'logo', '--file', svg, '--id', 'update-owned', '--name', 'User-owned update mark']);
  await cliJSON(root, ['media', 'import', 'update-owned', 'owned-image', '--file', resolve(root, 'documents/welcome/media/paper-architecture/image.png'), '--title', 'User-owned illustration', '--description', 'Copied public seed artwork for update preservation acceptance.']);
  await appendFile(resolve(root, 'themes/neutral/design.md'), '\nUser note: preserve this local theme guidance when updating the runtime.\n');
  await appendFile(resolve(root, 'templates/invoice/README.md'), '\nUser note: preserve this local template guidance when updating the runtime.\n');
  await writeFile(resolve(root, '.opendoc/user-owned-note.json'), '{"purpose":"preserve non-runtime user metadata"}\n');
  const server = edition === 'normal' ? await start(root) : undefined;
  await cliJSON(root, ['comments', 'add', 'update-owned', 'owned-copy', 'Preserve this unresolved feedback through every update.']);
  const exported = await cliJSON(root, ['export', 'update-owned']);
  assert.equal(exported.results[0].status, 'success');
  manifest.export = exported.results[0].path;
  // CLI exports write a local artifact; the app's reviewed-export route also
  // persists its receipt and snapshot, which are user history worth protecting.
  if (server) {
    const session = await jsonFile(resolve(root, '.opendoc/server.json'));
    const receiptResponse = await fetch(`${server.origin}/api/documents/update-owned/exports`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: server.origin, 'X-OpenDoc-Token': session.token },
      body: JSON.stringify({ id: randomUUID(), hash: server.document.artifact.hash, format: 'pdf', filename: 'update-owned-reviewed.pdf' }),
    });
    assert.equal(receiptResponse.status, 200, 'The app saves a reviewed export receipt.');
    manifest.reviewedExport = (await receiptResponse.json()).path;
  } else {
    manifest.review = await cliJSON(root, ['review', 'update-owned']);
    const refused = await cli(root, ['start'], {}, true);
    assert.notEqual(refused.code, 0);
    assert.match(JSON.parse(refused.stdout).error, /Headless has no browser service/);
    await assert.rejects(lstat(resolve(root, '.opendoc/server.json')), { code: 'ENOENT' });
  }
  const baseline = await ownedSnapshot(root);
  const hashesPath = resolve(directory, 'owned-file-hashes.json');
  await writeFile(hashesPath, JSON.stringify(baseline, null, 2) + '\n');
  manifest.ownedFileHashes = hashesPath;
  assert.ok(Object.keys(baseline).some(path => path === 'documents/update-owned/comments.json'));
  assert.ok(Object.keys(baseline).some(path => path.startsWith('output/')));
  if (edition === 'normal') assert.ok(Object.keys(baseline).some(path => path.startsWith('.opendoc/exports/')));
  else assert.ok(Object.keys(baseline).some(path => path.startsWith('output/reviews/')));
  const initialMetadata = await metadataSnapshot(root);

  diagnostic(`Checking read-only discovery${server ? ' and refusal while the actual server is running' : ' for Headless'}.`);
  const checked = await cliJSON(root, ['update', '--check'], env);
  assert.deepEqual(checked, { status: 'available', currentVersion: baseVersion, targetVersion: compatibleVersion, latestCompatibleVersion: compatibleVersion, latestVersion: breakingVersion, check: true, explicit: false });
  assert.deepEqual(await metadataSnapshot(root), initialMetadata);
  await assertOwned(root, baseline, 'read-only update check');
  if (server) {
    const tarRequests = requests.tarballs.length;
    const refused = await cli(root, ['update'], env, true);
    assert.notEqual(refused.code, 0);
    assert.match(JSON.parse(refused.stdout).error, /still running|Stop OpenDoc/);
    assert.equal(requests.tarballs.length, tarRequests, 'An active server prevents candidate installation.');
    assert.deepEqual(await metadataSnapshot(root), initialMetadata);
    await assertOwned(root, baseline, 'active-server refusal');
    assert.equal((await fetch(`${server.origin}/api/documents/update-owned`)).status, 200, 'A refused update leaves the running server available.');
    await stop();
    await assertOwned(root, baseline, 'server shutdown');
  }

  for (const scenario of [
    { label: 'default compatible update', args: [], from: baseVersion, target: compatibleVersion, explicit: false },
    { label: 'explicit breaking update', args: ['--version', breakingVersion], from: compatibleVersion, target: breakingVersion, explicit: true },
    { label: 'explicit downgrade', args: ['--version', baseVersion], from: breakingVersion, target: baseVersion, explicit: true },
  ]) {
    diagnostic(`Exercising ${scenario.label}.`);
    const result = await cliJSON(root, ['update', ...scenario.args], env);
    assert.equal(result.status, 'updated'); assert.equal(result.currentVersion, scenario.from);
    assert.equal(result.targetVersion, scenario.target); assert.equal(result.explicit, scenario.explicit);
    await installVersion(root, scenario.target);
    await assertOwned(root, baseline, scenario.label);
    manifest.updates.push({ scenario: scenario.label, ...result });
  }

  diagnostic('Testing a real failed npm tarball installation and a successful retry.');
  published.add(brokenVersion);
  const beforeFailure = await metadataSnapshot(root);
  const runtimeBefore = snapshotDigest(await snapshot(resolve(root, 'node_modules')));
  const failure = await cli(root, ['update'], env, true);
  assert.notEqual(failure.code, 0);
  assert.match(JSON.parse(failure.stdout).error, /npm failed/);
  assert.ok(requests.tarballs.includes(brokenVersion), 'npm attempted to fetch the deliberately broken candidate.');
  assert.deepEqual(await metadataSnapshot(root), beforeFailure, 'A failed npm install preserves both manifest and lockfile.');
  assert.equal(snapshotDigest(await snapshot(resolve(root, 'node_modules'))), runtimeBefore, 'A failed npm install preserves every installed dependency byte.');
  await installVersion(root, baseVersion);
  await assertOwned(root, baseline, 'failed candidate installation');
  manifest.failedInstall = { version: brokenVersion, refused: true, metadataPreserved: true, installedTreeSha256: runtimeBefore };

  const retry = await cliJSON(root, ['update', '--version', compatibleVersion], env);
  assert.equal(retry.status, 'updated'); assert.equal(retry.targetVersion, compatibleVersion);
  await installVersion(root, compatibleVersion);
  await assertOwned(root, baseline, 'successful retry');
  assert.equal((await cliJSON(root, ['check'])).ok, true, 'The updated runtime can typecheck the existing authored workspace.');
  const comments = await cliJSON(root, ['comments', 'list', 'update-owned']);
  assert.ok(comments.some(comment => comment.text === 'Preserve this unresolved feedback through every update.' && comment.status === 'open'));
  assert.equal(requests.refusedWrites, 0, 'No operation attempted registry publication or another registry write.');
  manifest.updates.push({ scenario: 'successful retry', ...retry });
  manifest.finalVersion = compatibleVersion;
  manifest.ok = true;
  diagnostic('Real packed update acceptance passed; every protected file hash remained unchanged.');
} catch (error) {
  manifest.error = redact(error instanceof Error ? error.stack : error);
  diagnostic(manifest.error);
  process.exitCode = 1;
} finally {
  try { await stop(); }
  catch (error) { if (live) killTree(live.child); diagnostic(redact(`Cleanup: ${error.message}`)); manifest.ok = false; process.exitCode = 1; }
  for (const child of children) killTree(child);
  if (registry) { registry.closeAllConnections(); await new Promise(accept => registry.close(accept)); }
  manifest.finishedAt = new Date().toISOString();
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ ok: manifest.ok, directory, manifest: manifestPath, workspace: manifest.workspace, finalVersion: manifest.finalVersion }, null, 2));
}
