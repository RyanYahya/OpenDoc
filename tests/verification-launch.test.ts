import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm, access, symlink, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { projectRoot, until } from './helpers';

const exec = promisify(execFile);
const helpers = resolve(projectRoot, '.cursor/skills/verify-opendoc/helpers');
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('verification resolves linked checkout roots before invoking guarded CLI entrypoints', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opendoc-linked-launch-'));
  try {
    const checkout = resolve(root, 'checkout'), link = resolve(root, 'linked');
    await mkdir(checkout);
    await writeFile(resolve(checkout, 'package.json'), '{"name": "@ryanyahya/opendoc"}');
    await symlink(checkout, link, 'dir');
    const { stdout } = await exec('bash', ['-c', 'source "$1"; printf "%s" "$REPO_ROOT"', 'verify-root', resolve(helpers, 'common.sh')], { env: { ...process.env, VERIFY_REPO_ROOT: link } });
    assert.equal(stdout, await realpath(checkout));
  } finally { await rm(root, { recursive: true, force: true }); }
});

// Exercise the real shell helpers against a disposable server implementing the
// session contract. Failure modes must never publish readiness or orphan a child.
for (const mode of ['matching', 'mismatched', 'unavailable', 'malformed'] as const) {
  test(`verification launch handles a ${mode} session handshake`, { skip: process.platform === 'win32', timeout: 20_000 }, async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'opendoc-launch-'));
    const run = resolve(root, 'run');
    let pid: number | undefined;
    try {
      await mkdir(resolve(root, 'src/server'), { recursive: true });
      await mkdir(resolve(root, 'dist'));
      await mkdir(resolve(root, '.opendoc'));
      await writeFile(resolve(root, 'package.json'), JSON.stringify({ name: '@ryanyahya/opendoc', type: 'module' }, null, 2));
      // The launcher imports tsx; resolve it from the repository without copying dependencies.
      await symlink(resolve(projectRoot, 'node_modules'), resolve(root, 'node_modules'), 'dir');
      await writeFile(resolve(root, 'src/server/index.ts'), `
import { createServer } from 'node:http';
import { writeFileSync, rmSync } from 'node:fs';
const mode = process.env.HANDSHAKE_MODE;
const server = createServer((req, res) => {
  if (mode === 'unavailable') { res.writeHead(503); res.end(); return; }
  res.end(mode === 'malformed' ? 'not JSON' : JSON.stringify({ token: mode === 'matching' ? 'fixture-token' : 'wrong-token' }));
});
server.listen(0, '127.0.0.1', () => {
  const origin = 'http://127.0.0.1:' + server.address().port;
  writeFileSync('started.pid', String(process.pid));
  writeFileSync('.opendoc/server.json', JSON.stringify({ pid: process.pid, origin, token: 'fixture-token' }));
  console.log('OpenDoc is running at ' + origin);
});
const stop = () => { rmSync('.opendoc/server.json', { force: true }); server.close(() => process.exit(0)); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
`);
      const env = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH}`, VERIFY_REPO_ROOT: root, VERIFY_RUN_DIR: run, VERIFY_STARTUP_TIMEOUT_SECONDS: '3', HANDSHAKE_MODE: mode };
      const result = await exec('bash', [resolve(helpers, 'launch.sh')], { env, timeout: 15_000 }).then(
        result => ({ ...result, code: 0 }),
        (error: { stdout: string; stderr: string; code: number }) => error,
      );
      pid = Number(await readFile(resolve(root, 'started.pid'), 'utf8'));
      if (mode === 'matching') {
        assert.equal(result.code, 0, result.stderr);
        assert.match(result.stdout, /OpenDoc is ready/);
        assert.equal(JSON.parse(await readFile(resolve(run, 'run.json'), 'utf8')).pid, pid);
        assert.ok(alive(pid));
        await exec('bash', [resolve(helpers, 'cleanup.sh')], { env, timeout: 10_000 });
      } else {
        assert.equal(result.code, 1, result.stderr);
        assert.doesNotMatch(result.stdout, /OpenDoc is ready/);
        assert.match(result.stderr, /did not become ready/);
        await assert.rejects(access(resolve(run, 'run.json')));
        await access(resolve(run, 'server.log'));
      }
      await until(() => !alive(pid!), 3000);
      await assert.rejects(access(resolve(root, '.opendoc/server.json')));
    } finally {
      if (pid && alive(pid)) process.kill(pid, 'SIGKILL');
      await rm(root, { recursive: true, force: true });
    }
  });
}
