import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { initializeWorkspace, type InitDependencies } from '../src/cli/init';
import { discoverWorkspace, explicitWorkspace, installedApplication, readWorkspaceMarker, workspaceFormat, dependencyPin, packageIdentity, workspaceIdentity, packageNames, type Edition } from '../src/cli/workspace';
import { withWorkspaceLock } from '../src/cli/lock';
import { applicationRoot } from '../src/runtime/paths';
import { parseGlobalArgs } from '../src/cli/main';

const version = '0.4.2';
const normalPin = `npm:@ryanyahya/opendoc@${version}`;
const starterSource = 'export const title = "An authored starter";\n';

async function fixture(t: TestContext, edition: Edition = 'normal') {
  const container = await realpath(await mkdtemp(join(tmpdir(), 'opendoc-cli-workspace-')));
  t.after(() => rm(container, { recursive: true, force: true }));
  const sourceRoot = join(container, 'runtime-source');
  await mkdir(join(sourceRoot, 'starter/documents/welcome'), { recursive: true });
  await mkdir(join(sourceRoot, 'starter/assets'), { recursive: true });
  await writeFile(join(sourceRoot, 'package.json'), JSON.stringify({ name: packageNames[edition], version, opendoc: { edition } }));
  await writeFile(join(sourceRoot, 'starter/documents/welcome/index.tsx'), starterSource);
  await writeFile(join(sourceRoot, 'starter/assets/reference.bin'), Buffer.from([0, 1, 127, 255]));
  await writeFile(join(sourceRoot, 'starter/projects.json'), JSON.stringify({ version: 1, projects: [{ id: 'getting-started', name: 'Getting started', defaultTheme: null }], assignments: { welcome: 'getting-started' } }));
  for (const name of ['opendoc-create', 'opendoc-current-document', 'opendoc-apply-comments', 'opendoc-create-theme', 'opendoc-create-template', 'opendoc-review-document']) {
    const folder = join(sourceRoot, '.agents/skills', name);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'SKILL.md'), `---\nname: ${name}\ndescription: Versioned workflow.\n---\n\nThe installed workflow body.\n`);
  }
  t.mock.method(console, 'error', () => {});
  return { container, sourceRoot };
}

function fakeInstall() {
  const calls: { stage: string; version: string }[] = [];
  const install: NonNullable<InitDependencies['install']> = async (stage, requestedVersion, identity) => {
    calls.push({ stage, version: requestedVersion });
    await mkdir(join(stage, 'node_modules/opendoc/bin'), { recursive: true });
    await mkdir(join(stage, 'node_modules/.bin'), { recursive: true });
    await writeFile(join(stage, 'node_modules/opendoc/package.json'), JSON.stringify({ name: identity.name, version: requestedVersion, opendoc: { edition: identity.edition } }));
    await writeFile(join(stage, 'node_modules/opendoc/bin/opendoc.mjs'), 'export const installedCommand = true;\n');
    await symlink('../opendoc/bin/opendoc.mjs', join(stage, 'node_modules/.bin/opendoc'));
    await writeFile(join(stage, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies: { opendoc: dependencyPin(identity) } }, 'node_modules/opendoc': { version: requestedVersion } } }));
  };
  return { install, calls };
}

async function snapshot(root: string) {
  const files: Record<string, string> = {};
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files[relative(root, path)] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
  return files;
}

for (const existing of [false, true]) {
  test(`initialization publishes a checked workspace into ${existing ? 'an empty' : 'a new'} path with spaces and Unicode`, async t => {
    const f = await fixture(t), destination = join(f.container, 'parent folder', 'My café workspace مستندات');
    if (existing) await mkdir(destination, { recursive: true });
    const previousInode = existing ? (await lstat(destination)).ino : undefined;
    const installer = fakeInstall();
    let validated = false;
    const result = await initializeWorkspace(destination, { sourceRoot: f.sourceRoot }, {
      ...installer,
      validate: async stage => {
        assert.notEqual(stage, destination);
        assert.equal(dirname(stage), dirname(destination));
        assert.deepEqual(await readWorkspaceMarker(stage), { formatVersion: workspaceFormat, createdWith: version, edition: 'normal' });
        assert.equal(await installedApplication(stage), join(stage, 'node_modules/opendoc'));
        assert.equal(await readFile(join(stage, 'documents/welcome/index.tsx'), 'utf8'), starterSource);
        validated = true;
      },
    });
    assert.equal(validated, true);
    assert.deepEqual(result, { workspace: destination, version, edition: 'normal' });
    assert.equal(installer.calls[0].version, version);
    assert.equal(await readFile(join(destination, 'documents/welcome/index.tsx'), 'utf8'), starterSource);
    assert.deepEqual(await readFile(join(destination, 'assets/reference.bin')), Buffer.from([0, 1, 127, 255]));
    assert.equal(JSON.parse(await readFile(join(destination, 'package.json'), 'utf8')).dependencies.opendoc, normalPin);
    assert.equal(JSON.parse(await readFile(join(destination, 'package-lock.json'), 'utf8')).packages[''].dependencies.opendoc, normalPin);
    assert.equal(await installedApplication(destination), join(destination, 'node_modules/opendoc'));
    assert.equal(await discoverWorkspace(join(destination, 'documents/welcome')), destination);
    const skill = await readFile(join(destination, '.agents/skills/opendoc-create/SKILL.md'), 'utf8');
    assert.match(skill, /name: opendoc-create/);
    assert.match(skill, /node_modules\/opendoc\/\.agents\/skills\/opendoc-create\/SKILL\.md/);
    assert.ok(!skill.includes('The installed workflow body.'), 'The local skill forwards to version-matched runtime guidance.');
    assert.equal(await readFile(join(destination, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');
    assert.equal(await realpath(join(destination, '.claude/skills')), await realpath(join(destination, '.agents/skills')));
    assert.equal(await readFile(join(destination, '.claude/skills/opendoc-create/SKILL.md'), 'utf8'), skill);
    const guide = await readFile(join(destination, 'AGENTS.md'), 'utf8');
    for (const entry of await readdir(join(destination, '.agents/skills'))) {
      assert.ok(guide.includes(`node_modules/opendoc/.agents/skills/${entry}/SKILL.md`), 'Every installed skill remains discoverable by reading the guide.');
    }
    await assert.rejects(lstat(installer.calls[0].stage), { code: 'ENOENT' });
    const executable = join(destination, 'node_modules/.bin/opendoc');
    assert.equal((await lstat(executable)).isSymbolicLink(), true);
    assert.equal(await realpath(executable), join(destination, 'node_modules/opendoc/bin/opendoc.mjs'));
    assert.equal(await readFile(executable, 'utf8'), 'export const installedCommand = true;\n');
    if (existing) assert.equal((await lstat(destination)).ino, previousInode);
  });
}

test('nonempty destinations, files, and symlink destinations are refused before installation and retain their bytes', async t => {
  const f = await fixture(t), destination = join(f.container, 'existing');
  await mkdir(join(destination, 'nested'), { recursive: true });
  await writeFile(join(destination, '.hidden'), 'User-owned hidden content');
  await writeFile(join(destination, 'nested/notes.txt'), 'Keep every byte.\n');
  const before = await snapshot(destination), installer = fakeInstall();
  for (const target of [destination, join(destination, 'nested/notes.txt')]) {
    await assert.rejects(initializeWorkspace(target, { sourceRoot: f.sourceRoot }, installer), /Refusing to overwrite/);
  }
  const linked = join(f.container, 'linked-destination');
  await symlink(destination, linked, 'dir');
  await assert.rejects(initializeWorkspace(linked, { sourceRoot: f.sourceRoot }, installer), /Refusing to overwrite/);
  assert.deepEqual(await snapshot(destination), before);
  assert.equal((await lstat(linked)).isSymbolicLink(), true);
  assert.deepEqual(installer.calls, []);
  assert.ok(!(await readdir(f.container)).some(name => name.startsWith('.opendoc-init-')));
});

test('headless initialization preserves the starter library and installs an exact alias with remote delivery guidance', async t => {
  const f = await fixture(t, 'headless'), destination = join(f.container, 'remote workspace');
  const installer = fakeInstall();
  const result = await initializeWorkspace(destination, { sourceRoot: f.sourceRoot }, { ...installer, validate: async () => {} });
  assert.deepEqual(result, { workspace: destination, version, edition: 'headless' });
  assert.equal(JSON.parse(await readFile(join(destination, 'package.json'), 'utf8')).dependencies.opendoc, `npm:@ryanyahya/opendoc-headless@${version}`);
  assert.equal(JSON.parse(await readFile(join(destination, 'package-lock.json'), 'utf8')).packages[''].dependencies.opendoc, `npm:@ryanyahya/opendoc-headless@${version}`);
  assert.equal(await installedApplication(destination), join(destination, 'node_modules/opendoc'));
  assert.deepEqual(await readWorkspaceMarker(destination), { formatVersion: 1, createdWith: version, edition: 'headless' });
  assert.equal(await readFile(join(destination, 'documents/welcome/index.tsx'), 'utf8'), starterSource);
  assert.deepEqual(await readFile(join(destination, 'assets/reference.bin')), Buffer.from([0, 1, 127, 255]));
  const guide = await readFile(join(destination, 'AGENTS.md'), 'utf8');
  assert.match(guide, /recipients receive finished PDF and PowerPoint files/);
  assert.match(guide, /npx opendoc review/);
  assert.ok(!guide.includes('npx opendoc start'));
  assert.equal(await realpath(join(destination, '.claude/skills')), await realpath(join(destination, '.agents/skills')));
  assert.equal(await readFile(join(destination, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');
  const before = await snapshot(destination);
  await writeFile(join(destination, 'node_modules/opendoc/package.json'), JSON.stringify({ name: packageNames.normal, version, opendoc: { edition: 'normal' } }));
  await assert.rejects(installedApplication(destination), /version or edition does not match/);
  const after = await snapshot(destination);
  assert.deepEqual(Object.keys(after), Object.keys(before));
});

test('edition identity rejects ambiguous aliases, mismatched markers, and invalid package identities', () => {
  assert.deepEqual(packageIdentity({ name: packageNames.normal, version, opendoc: { edition: 'normal' } }), { name: packageNames.normal, version, edition: 'normal' });
  assert.deepEqual(workspaceIdentity({ dependencies: { opendoc: normalPin } }, { formatVersion: 1 }), { name: packageNames.normal, version, edition: 'normal' });
  for (const pin of ['0.4.0', '^0.4.0', 'latest', 'npm:opendoc@0.4.0', 'npm:opendoc-headless@0.4.0', 'npm:@other/opendoc@0.4.0', 'npm:@ryanyahya/opendoc@latest', 'npm:@ryanyahya/opendoc-headless@0.4.0-beta.1', 'file:./opendoc.tgz']) {
    assert.throws(() => workspaceIdentity({ dependencies: { opendoc: pin } }), /exact stable version/);
  }
  assert.throws(() => workspaceIdentity({ dependencies: { opendoc: normalPin } }, { formatVersion: 1, edition: 'headless' }), /workspace edition does not match/);
  for (const metadata of [
    { name: packageNames.headless, version },
    { name: packageNames.normal, version, opendoc: { edition: 'headless' } },
    { name: packageNames.headless, version, opendoc: { edition: 'normal' } },
    { name: packageNames.normal, version: '0.4.0-beta.1' },
  ]) assert.throws(() => packageIdentity(metadata), /invalid name, edition, or exact stable version/);
});

test('initialization refuses a different installed edition before validation or publication', async t => {
  const f = await fixture(t, 'headless'), destination = join(f.container, 'remote workspace');
  const installer = fakeInstall();
  let validated = false;
  await assert.rejects(initializeWorkspace(destination, { sourceRoot: f.sourceRoot }, {
    install: async (stage, requestedVersion, identity) => {
      await installer.install(stage, requestedVersion, { ...identity, name: packageNames.normal, edition: 'normal' });
    },
    validate: async () => { validated = true; },
  }), /version or edition does not match/);
  assert.equal(validated, false);
  await assert.rejects(lstat(destination), { code: 'ENOENT' });
  assert.equal(await readFile(join(installer.calls[0].stage, 'documents/welcome/index.tsx'), 'utf8'), starterSource);
});

for (const existing of [false, true]) {
  test(`failed installation preserves ${existing ? 'the empty destination' : 'an absent destination'} and retains prepared recovery files`, async t => {
    const f = await fixture(t), destination = join(f.container, 'chosen workspace');
    if (existing) await mkdir(destination);
    const previousInode = existing ? (await lstat(destination)).ino : undefined;
    let prepared: string | undefined, validated = false;
    await assert.rejects(initializeWorkspace(destination, { sourceRoot: f.sourceRoot }, {
      install: async stage => {
        prepared = stage;
        await writeFile(join(stage, 'installation-progress.txt'), 'Keep for diagnosis');
        throw new Error('Simulated install failure');
      },
      validate: async () => { validated = true; },
    }), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Simulated install failure/);
      assert.ok(prepared && error.message.includes(prepared));
      return true;
    });
    assert.equal(validated, false);
    if (existing) {
      assert.deepEqual(await readdir(destination), []);
      assert.equal((await lstat(destination)).ino, previousInode);
    } else await assert.rejects(lstat(destination), { code: 'ENOENT' });
    assert.equal(await readFile(join(prepared!, 'documents/welcome/index.tsx'), 'utf8'), starterSource);
    assert.equal(await readFile(join(prepared!, 'installation-progress.txt'), 'utf8'), 'Keep for diagnosis');
    assert.deepEqual(await readWorkspaceMarker(prepared!), { formatVersion: workspaceFormat, createdWith: version, edition: 'normal' });
  });
}

test('validation failure and a new destination file during preparation prevent publication', async t => {
  const f = await fixture(t), destination = join(f.container, 'workspace');
  await mkdir(destination);
  const installer = fakeInstall();
  await assert.rejects(initializeWorkspace(destination, { sourceRoot: f.sourceRoot }, {
    ...installer, validate: async () => { throw new Error('Simulated validation failure'); },
  }), /Simulated validation failure/);
  assert.deepEqual(await readdir(destination), []);
  assert.equal(await installedApplication(installer.calls[0].stage), join(installer.calls[0].stage, 'node_modules/opendoc'));

  const sourceBytes = Buffer.from('A user wrote this while setup was running.\n');
  await assert.rejects(initializeWorkspace(destination, { sourceRoot: f.sourceRoot }, {
    ...installer, validate: async () => { await writeFile(join(destination, 'user-note.txt'), sourceBytes); },
  }), /Refusing to overwrite/);
  assert.deepEqual(await readdir(destination), ['user-note.txt']);
  assert.deepEqual(await readFile(join(destination, 'user-note.txt')), sourceBytes);
});

test('workspace discovery follows ancestors while explicit, malformed, and unsupported markers fail without mutation', async t => {
  const f = await fixture(t), root = join(f.container, 'workspace'), nested = join(root, 'documents/one');
  await mkdir(join(root, '.opendoc'), { recursive: true });
  await mkdir(nested, { recursive: true });
  const marker = join(root, '.opendoc/workspace.json');
  await writeFile(marker, JSON.stringify({ formatVersion: workspaceFormat }));
  assert.equal(await discoverWorkspace(nested), root);
  assert.equal(await explicitWorkspace(root), root);
  await assert.rejects(explicitWorkspace(nested), /not an initialized OpenDoc workspace/);
  assert.equal(await discoverWorkspace(f.sourceRoot), null);

  const innerMarker = join(nested, '.opendoc/workspace.json');
  await mkdir(dirname(innerMarker));
  for (const content of [JSON.stringify({ formatVersion: workspaceFormat + 1 }), '{}', '{malformed']) {
    await writeFile(innerMarker, content);
    const before = await snapshot(root);
    await assert.rejects(discoverWorkspace(nested), /workspace format|Cannot read/);
    await assert.rejects(explicitWorkspace(nested), /workspace format|Cannot read/);
    assert.deepEqual(await snapshot(root), before);
  }
});

test('installed workspace runtime must match the exact version pinned in its manifest', async t => {
  const f = await fixture(t), root = join(f.container, 'workspace');
  await mkdir(join(root, '.opendoc'), { recursive: true });
  await writeFile(join(root, '.opendoc/workspace.json'), JSON.stringify({ formatVersion: 1 }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { opendoc: normalPin } }));
  await assert.rejects(installedApplication(root), /not installed/);
  const installer = fakeInstall();
  await installer.install(root, version, { name: packageNames.normal, version, edition: 'normal' });
  assert.equal(await installedApplication(root), join(root, 'node_modules/opendoc'));
  for (const manifest of [{ name: 'other-package', version }, { name: packageNames.normal, version: '0.4.1', opendoc: { edition: 'normal' } }]) {
    await writeFile(join(root, 'node_modules/opendoc/package.json'), JSON.stringify(manifest));
    const before = await snapshot(root);
    await assert.rejects(installedApplication(root), /pinned OpenDoc version/);
    assert.deepEqual(await snapshot(root), before);
  }
});

test('the executable provides JSON help and version outside a workspace, and rejects workspace commands without mutation', async t => {
  const f = await fixture(t), execute = promisify(execFile), bin = join(applicationRoot, 'bin/opendoc.mjs');
  const invoke = (args: string[]) => execute(process.execPath, [bin, ...args], { cwd: f.container, timeout: 15_000 });
  const before = await snapshot(f.container);
  if (Number(process.versions.node.split('.')[0]) < 24) {
    await assert.rejects(invoke(['--help', '--json']), error => {
      const result = error as Error & { code: number; stdout: string; stderr: string };
      assert.equal(result.code, 1);
      assert.match(JSON.parse(result.stdout).error, /requires Node\.js 24 or newer/);
      return true;
    });
    assert.deepEqual(await snapshot(f.container), before);
    return;
  }
  for (const args of [['--help', '--json'], ['init', '--help', '--json']]) {
    const result = await invoke(args);
    assert.equal(typeof JSON.parse(result.stdout).usage, 'string');
    assert.equal(result.stderr, '');
  }
  const result = await invoke(['--version', '--json']);
  const manifest = JSON.parse(await readFile(join(applicationRoot, 'package.json'), 'utf8'));
  assert.equal(JSON.parse(result.stdout).version, manifest.version);
  assert.equal(result.stderr, '');
  await assert.rejects(invoke(['projects', '--json']), error => {
    const result = error as Error & { code: number; stdout: string; stderr: string };
    assert.equal(result.code, 1);
    assert.match(JSON.parse(result.stdout).error, /No OpenDoc workspace found/);
    assert.match(result.stderr, /No OpenDoc workspace found/);
    return true;
  });
  assert.deepEqual(await snapshot(f.container), before);
});

test('global flags preserve the option terminator and literal command arguments', () => {
  assert.deepEqual(parseGlobalArgs(['--json', '--workspace', 'workspace folder', 'comments', 'add', 'proof', 'target', '--', '--workspace', '--json']), {
    args: ['comments', 'add', 'proof', 'target', '--', '--workspace', '--json'], workspace: 'workspace folder', json: true,
  });
});

test('workspace lock excludes concurrent actions and is released after success or failure', async t => {
  const f = await fixture(t), root = join(f.container, 'workspace'), file = join(root, '.opendoc/update.lock');
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(accept => { enter = accept; });
  const released = new Promise<void>(accept => { release = accept; });
  const first = withWorkspaceLock(root, async () => { enter(); await released; return 'completed'; });
  await entered;
  try {
    assert.equal(JSON.parse(await readFile(file, 'utf8')).pid, process.pid);
    let secondRan = false;
    await assert.rejects(withWorkspaceLock(root, async () => { secondRan = true; }), /in progress/);
    assert.equal(secondRan, false);
  } finally { release(); }
  assert.equal(await first, 'completed');
  await assert.rejects(lstat(file), { code: 'ENOENT' });
  await assert.rejects(withWorkspaceLock(root, async () => { throw new Error('Action failed'); }), /Action failed/);
  await assert.rejects(lstat(file), { code: 'ENOENT' });
});

test('a terminated lock owner requires explicit recovery and concurrent attempts leave the lock intact', async t => {
  const f = await fixture(t), root = join(f.container, 'workspace'), file = join(root, '.opendoc/update.lock');
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
  assert.ok(child.pid);
  await mkdir(dirname(file), { recursive: true });
  const stale = JSON.stringify({ pid: child.pid, id: 'terminated-owner' });
  await writeFile(file, stale);
  let actions = 0;
  const attempts = await Promise.allSettled(Array.from({ length: 3 }, () => withWorkspaceLock(root, async () => { actions++; })));
  assert.equal(actions, 0);
  for (const attempt of attempts) {
    assert.equal(attempt.status, 'rejected');
    if (attempt.status === 'rejected') {
      assert.match(attempt.reason.message, /stopped before releasing its lock/);
      assert.match(attempt.reason.message, /Confirm no OpenDoc command is running/);
      assert.ok(attempt.reason.message.includes(`remove ${file}`));
    }
  }
  assert.equal(await readFile(file, 'utf8'), stale);
  await rm(file);
  await withWorkspaceLock(root, async () => { assert.equal(JSON.parse(await readFile(file, 'utf8')).pid, process.pid); });
  await assert.rejects(lstat(file), { code: 'ENOENT' });
});

test('lock cleanup preserves a replacement written by another owner', async t => {
  const f = await fixture(t), root = join(f.container, 'workspace'), file = join(root, '.opendoc/update.lock');
  const replacement = JSON.stringify({ pid: process.pid, id: 'replacement-owner' });
  await withWorkspaceLock(root, async () => { await writeFile(file, replacement); });
  assert.equal(await readFile(file, 'utf8'), replacement);
});

test('lock cleanup diagnostics preserve the successful result and the original action error', async t => {
  const f = await fixture(t), root = join(f.container, 'workspace'), file = join(root, '.opendoc/update.lock');
  const warnings: string[] = [];
  t.mock.method(console, 'error', (message: string) => { warnings.push(message); });
  t.mock.method(fs.promises, 'unlink', async () => { throw Object.assign(new Error('Simulated cleanup failure'), { code: 'EPERM' }); });
  syncBuiltinESMExports();
  try {
    assert.equal(await withWorkspaceLock(root, async () => 'completed'), 'completed');
    assert.equal(JSON.parse(await readFile(file, 'utf8')).pid, process.pid);
    await rm(file);
    const original = new Error('The actual operation failed');
    await assert.rejects(withWorkspaceLock(root, async () => { throw original; }), error => error === original);
    assert.equal(warnings.length, 2);
    assert.ok(warnings.every(message => message.includes('Simulated cleanup failure') && message.includes(file)));
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});
