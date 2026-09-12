import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { copyFile, lstat, mkdtemp, mkdir, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { dependencyPin, workspaceIdentity, packageNames } from '../src/cli/workspace.js';
import { latestCompatibleVersion, updateWorkspace, type UpdateDependencies } from '../src/cli/update.js';

const published = ['0.2.9', '0.3.1', '0.3.8', '0.3.9-beta.1', '0.4.0', '1.0.0'];

async function snapshot(root: string) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.isFile()) {
      const file = join(entry.parentPath, entry.name);
      files[relative(root, file)] = (await readFile(file)).toString('base64');
    }
  }
  return files;
}

async function fixture(run: (root: string, container: string) => Promise<void>) {
  const container = await mkdtemp(join(tmpdir(), 'opendoc-update-test-')), root = join(container, 'workspace');
  try {
    await mkdir(join(root, '.opendoc'), { recursive: true });
    await mkdir(join(root, 'documents/my-document'), { recursive: true });
    await mkdir(join(root, 'assets'), { recursive: true });
    await mkdir(join(root, 'themes'), { recursive: true });
    await mkdir(join(root, '.agents/skills/my-skill'), { recursive: true });
    await mkdir(join(root, 'node_modules/opendoc'), { recursive: true });
    await writeFile(join(root, '.opendoc/workspace.json'), '{"formatVersion":1}\n');
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'my-workspace', private: true, dependencies: { opendoc: 'npm:@ryanyahya/opendoc@0.3.1' }, scripts: { test: 'must never run' }, custom: { preserve: true } }, null, 2) + '\n');
    await writeFile(join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{"":{"dependencies":{"opendoc":"npm:@ryanyahya/opendoc@0.3.1"}}}}\n');
    await writeFile(join(root, 'node_modules/opendoc/package.json'), '{"name":"@ryanyahya/opendoc","version":"0.3.1","opendoc":{"edition":"normal"}}');
    await writeFile(join(root, 'node_modules/opendoc/previous-only.txt'), 'previous runtime bytes');
    await writeFile(join(root, 'documents/my-document/index.tsx'), 'user authored source');
    await writeFile(join(root, 'assets/user-font.ttf'), 'user font bytes');
    await writeFile(join(root, 'themes/my-theme.ts'), 'user theme bytes');
    await writeFile(join(root, '.agents/skills/my-skill/SKILL.md'), 'user instructions');
    await writeFile(join(root, 'AGENTS.md'), 'workspace instructions');
    await run(root, container);
  } finally { await rm(container, { recursive: true, force: true }); }
}

function fakeNpm(options: { installError?: string; reportedVersion?: string; checkError?: boolean; versions?: string[]; packageName?: string; edition?: string } = {}) {
  const calls: { args: string[]; cwd: string }[] = [];
  const npm: NonNullable<UpdateDependencies['npm']> = async (args, cwd) => {
    calls.push({ args, cwd });
    if (args[0] === 'view') return JSON.stringify(options.versions ?? published);
    assert.equal(args[0], 'install');
    assert.ok(args.includes('--ignore-scripts'), 'workspace lifecycle scripts must not execute');
    if (options.installError) throw new Error(options.installError);
    const manifest = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'));
    const identity = workspaceIdentity(manifest);
    const version = identity.version;
    await mkdir(join(cwd, 'node_modules/opendoc/bin'), { recursive: true });
    await writeFile(join(cwd, 'node_modules/opendoc/package.json'), JSON.stringify({ name: options.packageName ?? identity.name, version, opendoc: { edition: options.edition ?? identity.edition }, bin: { opendoc: 'bin/opendoc.mjs' } }));
    await writeFile(join(cwd, 'node_modules/opendoc/bin/opendoc.mjs'), `if (process.argv[2] === '--version') console.log(${JSON.stringify(options.reportedVersion ?? version)}); else if (process.argv[2] === 'check') { console.log(JSON.stringify({ ok: ${!options.checkError} })); } else process.exitCode = 1;\n`);
    await writeFile(join(cwd, 'node_modules/opendoc/new-runtime.txt'), `runtime ${version}`);
    await writeFile(join(cwd, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies: manifest.dependencies }, 'node_modules/opendoc': { version } } }) + '\n');
    return '';
  };
  return { npm, calls };
}

async function makeHeadless(root: string) {
  const pin = dependencyPin({ edition: 'headless', version: '0.3.1' });
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  manifest.dependencies.opendoc = pin;
  await writeFile(join(root, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(join(root, '.opendoc/workspace.json'), '{"formatVersion":1,"edition":"headless"}\n');
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies: { opendoc: pin } } } }) + '\n');
  await writeFile(join(root, 'node_modules/opendoc/package.json'), '{"name":"@ryanyahya/opendoc-headless","version":"0.3.1","type":"module","opendoc":{"edition":"headless"}}');
}

test('Headless updates ignore GUI session files while preserving their bytes', async () => {
  await fixture(async root => {
    await makeHeadless(root);
    const session = 'A malformed GUI session is irrelevant to the Headless runtime.\n';
    await writeFile(join(root, '.opendoc/server.json'), session);
    const result = await updateWorkspace(root, {}, fakeNpm());
    assert.equal(result.status, 'updated');
    assert.equal(await readFile(join(root, '.opendoc/server.json'), 'utf8'), session);
  });
});

test('a running Headless CLI command prevents runtime replacement until its workspace lock is released', async t => {
  if (Number(process.versions.node.split('.')[0]) < 24) { t.skip('The installed CLI requires Node.js 24.'); return; }
  await fixture(async (root, container) => {
    await makeHeadless(root);
    const installed = join(root, 'node_modules/opendoc'), release = join(container, 'release-command');
    // Use the real dispatcher and lock with a controlled long-running handler.
    // No renderer timing assumptions or network service are needed for contention.
    for (const source of ['src/cli/main.ts', 'src/cli/workspace.ts', 'src/cli/process.ts', 'src/cli/lock.ts', 'src/runtime/paths.ts', 'src/server/render-error.ts']) {
      await mkdir(dirname(join(installed, source)), { recursive: true });
      await copyFile(new URL(`../${source}`, import.meta.url), join(installed, source));
    }
    await writeFile(join(installed, 'src/server/projects-cli.ts'), `import { access } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
export async function runProjectsCli() {
  console.log('command-ready');
  for (;;) {
    try { await access(${JSON.stringify(release)}); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await setTimeout(10);
  }
}
`);
    const launcher = join(container, 'headless-command.mjs');
    await writeFile(launcher, `import { main } from ${JSON.stringify(pathToFileURL(join(installed, 'src/cli/main.ts')).href)}; await main(['projects', '--json']);\n`);
    const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), launcher], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', data => { stderr += data; });
    const closed = once(child, 'close');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 15_000);
    try {
      const output = await Promise.race([
        once(child.stdout, 'data').then(([data]) => String(data)),
        closed.then(([code]) => { throw new Error(`Headless command exited before entering its handler (${code}): ${stderr}`); }),
      ]);
      assert.match(output, /command-ready/);
      const lock = JSON.parse(await readFile(join(root, '.opendoc/update.lock'), 'utf8'));
      assert.equal(lock.pid, child.pid);
      const before = await snapshot(root);
      await assert.rejects(updateWorkspace(root, {}, fakeNpm()), /Another OpenDoc command is in progress/);
      assert.deepEqual(await snapshot(root), before, 'Update refusal preserves the running command and every workspace byte.');
      assert.equal(child.exitCode, null);
      await writeFile(release, 'finished');
      const [code] = await closed;
      assert.equal(code, 0, stderr);
      await assert.rejects(lstat(join(root, '.opendoc/update.lock')), { code: 'ENOENT' });
      assert.equal((await updateWorkspace(root, {}, fakeNpm())).status, 'updated');
    } finally {
      clearTimeout(timeout);
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await closed; }
    }
  });
});

test('Headless updates query their own package and preserve the exact alias, edition, and authored content', async () => {
  await fixture(async root => {
    await makeHeadless(root);
    const before = await snapshot(root), executor = fakeNpm();
    const result = await updateWorkspace(root, {}, executor);
    assert.equal(result.status, 'updated');
    assert.equal(result.targetVersion, '0.3.8');
    assert.deepEqual(executor.calls[0].args, ['view', '@ryanyahya/opendoc-headless', 'versions', '--json']);
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
    assert.equal(manifest.dependencies.opendoc, 'npm:@ryanyahya/opendoc-headless@0.3.8');
    assert.equal(lock.packages[''].dependencies.opendoc, manifest.dependencies.opendoc);
    const installed = JSON.parse(await readFile(join(root, 'node_modules/opendoc/package.json'), 'utf8'));
    assert.equal(installed.name, '@ryanyahya/opendoc-headless');
    assert.equal(installed.opendoc.edition, 'headless');
    const after = await snapshot(root);
    for (const [file, bytes] of Object.entries(before)) {
      if (file.startsWith('node_modules/') || ['package.json', 'package-lock.json'].includes(file)) continue;
      assert.equal(after[file], bytes, `${file} remains unchanged`);
    }
  });
});

test('a Headless candidate cannot silently change the package name or edition', async () => {
  await fixture(async (root, container) => {
    await makeHeadless(root);
    const before = await snapshot(root);
    for (const override of [{ packageName: packageNames.normal, edition: 'normal' }, { packageName: packageNames.headless, edition: 'normal' }]) {
      await assert.rejects(updateWorkspace(root, {}, fakeNpm(override)), /name, edition, or|invalid name, edition/);
      assert.deepEqual(await snapshot(root), before);
      assert.deepEqual(await readdir(container), ['workspace']);
    }
  });
});

test('a mismatched edition pin is rejected before registry access, and a concurrent edition change prevents activation', async () => {
  await fixture(async root => {
    await makeHeadless(root);
    await writeFile(join(root, '.opendoc/workspace.json'), '{"formatVersion":1,"edition":"normal"}\n');
    const before = await snapshot(root), executor = fakeNpm();
    await assert.rejects(updateWorkspace(root, {}, executor), /workspace edition does not match/);
    assert.deepEqual(executor.calls, []);
    assert.deepEqual(await snapshot(root), before);
    await makeHeadless(root);
    let concurrent: Awaited<ReturnType<typeof snapshot>>;
    await assert.rejects(updateWorkspace(root, {}, { ...executor, beforeActivate: async () => {
      await writeFile(join(root, '.opendoc/workspace.json'), '{"formatVersion":1,"edition":"normal"}\n');
      concurrent = await snapshot(root);
    } }), /workspace edition does not match/);
    assert.deepEqual(await snapshot(root), concurrent!);
  });
});

test('a failed Headless activation restores its alias and exact original installed bytes', async () => {
  await fixture(async root => {
    await makeHeadless(root);
    const before = await snapshot(root);
    await assert.rejects(updateWorkspace(root, {}, { ...fakeNpm(), afterActivationStep: async step => {
      if (step === 'manifest') throw new Error('simulated Headless activation failure');
    } }), /previous installation was restored/);
    assert.deepEqual(await snapshot(root), before);
  });
});

async function startSession(root: string) {
  const token = 'session-token-must-never-appear-in-an-error';
  const server = createServer((request, response) => {
    assert.equal(request.url, '/api/session');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ token }));
  });
  await new Promise<void>(accept => server.listen(0, '127.0.0.1', accept));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await writeFile(join(root, '.opendoc/server.json'), JSON.stringify({ origin: `http://127.0.0.1:${address.port}`, token, pid: process.pid }));
  return { server, token };
}

async function closeServer(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()));
}

async function runSubprocess(script: string, container: string) {
  const file = join(container, 'update-child.mjs');
  await writeFile(file, script);
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), file], { cwd: container, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 15_000);
  try {
    const [code, signal] = await once(child, 'close') as [number | null, string | null];
    return { code, signal, stdout, stderr };
  } finally { clearTimeout(timeout); await rm(file, { force: true }); }
}

test('default updates follow stable npm caret compatibility, including pre-1.0 boundaries', () => {
  assert.equal(latestCompatibleVersion('0.3.1', published), '0.3.8');
  assert.equal(latestCompatibleVersion('0.0.3', ['0.0.2', '0.0.3', '0.0.4', '0.1.0']), '0.0.3');
  assert.equal(latestCompatibleVersion('1.2.3', ['1.2.2', '1.2.4', '1.9.0', '2.0.0', '2.0.0-beta.1']), '1.9.0');
  assert.equal(latestCompatibleVersion('0.3.8', ['0.3.1', '0.4.0']), '0.3.8');
});

test('update --check reports versions without creating or changing workspace files', async () => {
  await fixture(async (root, container) => {
    await writeFile(join(root, '.opendoc/server.json'), 'invalid active-session record is irrelevant to a read-only check');
    const before = await snapshot(root), executor = fakeNpm();
    const result = await updateWorkspace(root, { check: true }, executor);
    assert.deepEqual(result, { status: 'available', currentVersion: '0.3.1', targetVersion: '0.3.8', latestCompatibleVersion: '0.3.8', latestVersion: '1.0.0', check: true, explicit: false });
    assert.deepEqual(await snapshot(root), before);
    assert.deepEqual(await readdir(container), ['workspace']);
    assert.deepEqual(executor.calls.map(call => call.args[0]), ['view']);
  });
});

test('a failed staged dependency install leaves the complete active installation untouched', async () => {
  await fixture(async (root, container) => {
    const before = await snapshot(root), executor = fakeNpm({ installError: 'simulated registry outage' });
    await assert.rejects(updateWorkspace(root, {}, executor), /simulated registry outage/);
    assert.deepEqual(await snapshot(root), before);
    assert.deepEqual(await readdir(container), ['workspace']);
    assert.notEqual(executor.calls[1].cwd, root);
    assert.equal(join(executor.calls[1].cwd, '..'), join(root, '..'));
  });
});

test('candidate CLI verification must succeed before activation', async () => {
  await fixture(async (root, container) => {
    const before = await snapshot(root), executor = fakeNpm({ reportedVersion: 'wrong version' });
    await assert.rejects(updateWorkspace(root, {}, executor), /CLI did not report the requested version/);
    assert.deepEqual(await snapshot(root), before);
    assert.deepEqual(await readdir(container), ['workspace']);
  });
});

test('a broken candidate installation is rejected even if its version command works', async () => {
  await fixture(async (root, container) => {
    const before = await snapshot(root);
    await assert.rejects(updateWorkspace(root, {}, fakeNpm({ checkError: true })), /installation check failed/);
    assert.deepEqual(await snapshot(root), before);
    assert.deepEqual(await readdir(container), ['workspace']);
  });
});

for (const filename of ['package.json', 'package-lock.json']) {
  test(`a concurrent ${filename} edit is preserved and prevents activation`, async () => {
    await fixture(async (root, container) => {
      let expected: Awaited<ReturnType<typeof snapshot>> | undefined;
      await assert.rejects(updateWorkspace(root, {}, {
        ...fakeNpm(),
        beforeActivate: async () => {
          const data = JSON.parse(await readFile(join(root, filename), 'utf8'));
          data.userChange = 'made while installing';
          await writeFile(join(root, filename), JSON.stringify(data) + '\n');
          expected = await snapshot(root);
        },
      }), /manifest or lockfile changed during the update/);
      assert.deepEqual(await snapshot(root), expected);
      assert.deepEqual(await readdir(container), ['workspace']);
    });
  });
}

for (const failureStep of ['dependencies', 'lockfile', 'manifest'] as const) {
  test(`activation failure after replacing ${failureStep} rolls back exact original files`, async () => {
    await fixture(async (root, container) => {
      const before = await snapshot(root);
      await assert.rejects(updateWorkspace(root, {}, {
        ...fakeNpm(),
        afterActivationStep: async step => { if (step === failureStep) throw new Error('simulated activation failure'); },
      }), /previous installation was restored.*simulated activation failure/);
      assert.deepEqual(await snapshot(root), before);
      assert.deepEqual(await readdir(container), ['workspace']);
    });
  });
}

for (const scenario of [
  { step: 'dependencies', file: 'package.json', retained: false, throws: false },
  { step: 'dependencies', file: 'package-lock.json', retained: false, throws: false },
  { step: 'lockfile', file: 'package.json', retained: false, throws: false },
  { step: 'lockfile', file: 'package-lock.json', retained: true, throws: false },
  { step: 'manifest', file: 'package.json', retained: true, throws: false },
  { step: 'manifest', file: 'package.json', retained: true, throws: true },
] as const) {
  test(`a concurrent ${scenario.file} edit after ${scenario.step} survives ${scenario.throws ? 'forced rollback' : 'activation checks'}`, async () => {
    await fixture(async (root, container) => {
      const before = await snapshot(root), executor = fakeNpm();
      let changedBytes: Buffer | undefined;
      await assert.rejects(updateWorkspace(root, {}, {
        ...executor,
        afterActivationStep: async step => {
          if (step !== scenario.step) return;
          const path = join(root, scenario.file);
          const data = JSON.parse(await readFile(path, 'utf8'));
          data.userChange = 'keep this concurrent edit';
          await writeFile(path, JSON.stringify(data) + '\n');
          changedBytes = await readFile(path);
          if (scenario.throws) throw new Error('failure after concurrent edit');
        },
      }), scenario.retained ? /could not safely restore.*Concurrent files were preserved/ : /changed during activation/);
      assert.ok(changedBytes);
      assert.deepEqual(await snapshot(root), { ...before, [scenario.file]: changedBytes.toString('base64') });
      const stage = executor.calls[1].cwd;
      if (scenario.retained) {
        assert.equal((await readFile(join(stage, 'previous', scenario.file))).toString('base64'), before[scenario.file]);
        assert.deepEqual((await readdir(container)).sort(), [stage.split('/').at(-1)!, 'workspace'].sort());
      } else assert.deepEqual(await readdir(container), ['workspace']);
    });
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  for (const step of ['dependencies', 'manifest'] as const) {
    test(`${signal} during ${step} activation completes rollback and releases the lock before exiting`, async () => {
      await fixture(async (root, container) => {
        const before = await snapshot(root);
        const script = `
          import { mkdir, readFile, writeFile } from 'node:fs/promises';
          import { join } from 'node:path';
          import { updateWorkspace } from ${JSON.stringify(new URL('../src/cli/update.ts', import.meta.url).href)};
          import { workspaceIdentity } from ${JSON.stringify(new URL('../src/cli/workspace.ts', import.meta.url).href)};
          try {
            await updateWorkspace(${JSON.stringify(root)}, {}, {
              npm: async (args, cwd) => {
                if (args[0] === 'view') return JSON.stringify(['0.3.1', '0.3.8']);
                const manifest = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'));
                const identity = workspaceIdentity(manifest);
                const version = identity.version;
                await mkdir(join(cwd, 'node_modules/opendoc/bin'), { recursive: true });
                await writeFile(join(cwd, 'node_modules/opendoc/package.json'), JSON.stringify({ name: identity.name, version, opendoc: { edition: identity.edition }, bin: { opendoc: 'bin/opendoc.mjs' } }));
                await writeFile(join(cwd, 'node_modules/opendoc/bin/opendoc.mjs'), "console.log(process.argv[2] === '--version' ? " + JSON.stringify(version) + " : JSON.stringify({ok:true}));\\n");
                await writeFile(join(cwd, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies: manifest.dependencies } } }));
                return '';
              },
              afterActivationStep: async step => {
                if (step === ${JSON.stringify(step)}) {
                  process.kill(process.pid, ${JSON.stringify(signal)});
                  await new Promise(accept => setTimeout(accept, 20));
                }
              },
            });
            throw new Error('The interrupted update unexpectedly succeeded.');
          } catch (error) { console.error(error.message); if (!process.exitCode) process.exitCode = 1; }
        `;
        const result = await runSubprocess(script, container);
        assert.equal(result.signal, null, result.stderr);
        assert.equal(result.code, signal === 'SIGINT' ? 130 : 143, result.stderr);
        assert.match(result.stderr, new RegExp(`previous installation was restored.*interrupted by ${signal}`));
        assert.deepEqual(await snapshot(root), before);
        assert.deepEqual(await readdir(container), ['workspace']);
      });
    });
  }
}

test('an edit through a metadata file handle opened before activation survives rollback', async () => {
  await fixture(async (root, container) => {
    const before = await snapshot(root), file = join(root, 'package.json');
    const edited = JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), userChange: 'written through the original file handle' }) + '\n';
    const handle = await open(file, 'r+');
    try {
      await assert.rejects(updateWorkspace(root, {}, {
        ...fakeNpm(),
        afterActivationStep: async step => {
          if (step === 'manifest') {
            await handle.truncate(0);
            await handle.writeFile(edited);
          }
        },
      }), /changed through an open file handle/);
      assert.deepEqual(await snapshot(root), { ...before, 'package.json': Buffer.from(edited).toString('base64') });
      assert.deepEqual(await readdir(container), ['workspace']);
      await handle.write(Buffer.from(' '), 0, 1, Buffer.byteLength(edited));
      assert.equal(await readFile(file, 'utf8'), edited + ' ', 'rollback restores the inode still referenced by the editor');
    } finally { await handle.close(); }
  });
});

test('successful update changes runtime and npm metadata while preserving all authored content and metadata', async () => {
  await fixture(async (root, container) => {
    const before = await snapshot(root), oldManifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const result = await updateWorkspace(root, {}, fakeNpm());
    assert.equal(result.status, 'updated');
    assert.equal(result.targetVersion, '0.3.8');
    const updatedManifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    assert.deepEqual(updatedManifest, { ...oldManifest, dependencies: { opendoc: 'npm:@ryanyahya/opendoc@0.3.8' } });
    assert.equal(JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8')).packages[''].dependencies.opendoc, 'npm:@ryanyahya/opendoc@0.3.8');
    assert.equal(JSON.parse(await readFile(join(root, 'node_modules/opendoc/package.json'), 'utf8')).version, '0.3.8');
    const after = await snapshot(root);
    for (const [path, bytes] of Object.entries(before)) {
      if (!path.startsWith('node_modules/') && !['package.json', 'package-lock.json'].includes(path)) assert.equal(after[path], bytes, `${path} was preserved`);
    }
    assert.equal(after['node_modules/opendoc/previous-only.txt'], undefined);
    assert.deepEqual(await readdir(container), ['workspace']);
  });
});

for (const version of ['0.2.9', '0.4.0', '1.0.0']) {
  test(`an explicit stable version permits the requested transition to ${version}`, async () => {
    await fixture(async root => {
      const result = await updateWorkspace(root, { version }, fakeNpm());
      assert.equal(result.status, 'updated');
      assert.equal(result.targetVersion, version);
      assert.equal(result.explicit, true);
      assert.equal(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).dependencies.opendoc, `npm:@ryanyahya/opendoc@${version}`);
    });
  });
}

test('a live matching localhost session blocks mutation, with restart guidance and no token leakage', async () => {
  await fixture(async (root, container) => {
    const { server, token } = await startSession(root);
    try {
      const before = await snapshot(root), executor = fakeNpm();
      await assert.rejects(updateWorkspace(root, {}, executor), error => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /still running.*Ctrl\+C.*npx opendoc start/);
        assert.ok(!error.message.includes(token));
        return true;
      });
      assert.deepEqual(await snapshot(root), before);
      assert.equal(executor.calls.length, 1);
      assert.deepEqual(await readdir(container), ['workspace']);
    } finally { await closeServer(server); }
  });
});

test('a closed listener with a live recorded process still blocks updates until shutdown finishes', async () => {
  await fixture(async (root, container) => {
    const { server, token } = await startSession(root);
    await closeServer(server);
    const before = await snapshot(root), executor = fakeNpm();
    await assert.rejects(updateWorkspace(root, {}, executor), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /finishing shutdown.*exit completely.*Ctrl\+C.*npx opendoc start/);
      assert.ok(!error.message.includes(token));
      return true;
    });
    assert.deepEqual(await snapshot(root), before);
    assert.deepEqual(await readdir(container), ['workspace']);
    assert.equal(executor.calls.length, 1);
  });
});

test('a refused listener permits update only after the recorded process is dead', async () => {
  await fixture(async root => {
    const { server } = await startSession(root);
    await closeServer(server);
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    const pid = child.pid;
    assert.ok(pid);
    await once(child, 'exit');
    const file = join(root, '.opendoc/server.json');
    const session = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(file, JSON.stringify({ ...session, pid }));
    assert.equal((await updateWorkspace(root, {}, fakeNpm())).status, 'updated');
  });
});

test('JSON update failures emit one structured result plus a human-readable stderr diagnostic', async () => {
  await fixture(async (root, container) => {
    const before = await snapshot(root);
    const result = await runSubprocess(`
      import { runUpdate } from ${JSON.stringify(new URL('../src/cli/update.ts', import.meta.url).href)};
      await runUpdate(['--version', 'latest', '--json'], ${JSON.stringify(root)});
    `, container);
    assert.equal(result.code, 1);
    assert.equal(result.signal, null);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.status, 'error');
    assert.match(payload.error, /exact stable version/);
    assert.equal(result.stderr.trim(), payload.error);
    assert.deepEqual(await snapshot(root), before);
  });
});

test('a session started while dependencies install blocks final activation', async () => {
  await fixture(async root => {
    let server: Server | undefined;
    let expected: Awaited<ReturnType<typeof snapshot>> | undefined;
    try {
      await assert.rejects(updateWorkspace(root, {}, {
        ...fakeNpm(), beforeActivate: async () => {
          ({ server } = await startSession(root));
          expected = await snapshot(root);
        },
      }), /still running/);
      assert.deepEqual(await snapshot(root), expected);
    } finally { if (server) await closeServer(server); }
  });
});

test('unknown workspace formats and inexact requested versions fail before registry access or mutation', async () => {
  await fixture(async (root, container) => {
    await writeFile(join(root, '.opendoc/workspace.json'), '{"formatVersion":2}\n');
    const before = await snapshot(root), executor = fakeNpm();
    await assert.rejects(updateWorkspace(root, { check: true }, executor), /Unsupported OpenDoc workspace format/);
    assert.equal(executor.calls.length, 0);
    assert.deepEqual(await snapshot(root), before);
    assert.deepEqual(await readdir(container), ['workspace']);
    await writeFile(join(root, '.opendoc/workspace.json'), '{"formatVersion":1}\n');
    for (const version of ['latest', '^0.3.1', 'v0.3.1', '0.3.9-beta.1', '01.2.3']) {
      await assert.rejects(updateWorkspace(root, { version }, executor), /exact stable version/);
    }
    assert.equal(executor.calls.length, 0);
    await assert.rejects(updateWorkspace(root, { version: '9.9.9' }, executor), /not a published stable version/);
  });
});
