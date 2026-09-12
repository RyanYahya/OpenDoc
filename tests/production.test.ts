import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, get, request } from 'node:http';
import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { builtClient } from '../src/server/client';
import type { DocumentState } from '../src/shared/types';
import { fixture, projectRoot, source, until } from './helpers';

test('development shutdown disconnects an open browser hot-reload socket', { timeout: 15_000 }, async () => {
  const f = await fixture();
  const child = spawn(process.execPath, ['--import', 'tsx', resolve(projectRoot, 'src/server/index.ts')], {
    cwd: f.root, env: { ...process.env, OPENDOC_PORT: '0', NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '', socket: WebSocket | undefined;
  child.stdout.on('data', value => logs += value); child.stderr.on('data', value => logs += value);
  try {
    let origin = '';
    await until(async () => {
      try { origin = JSON.parse(await readFile(resolve(f.root, '.opendoc/server.json'), 'utf8')).origin; return true; }
      catch { if (child.exitCode !== null) throw new Error(logs); return false; }
    });
    const client = await fetch(`${origin}/@vite/client`).then(response => response.text());
    const token = /const wsToken = "([^"]+)"/.exec(client)?.[1];
    assert.ok(token, 'The development client includes its local socket token.');
    socket = new WebSocket(`${origin.replace('http:', 'ws:')}/?token=${token}`, 'vite-hmr');
    await new Promise<void>((accept, reject) => {
      socket!.addEventListener('message', () => accept(), { once: true });
      socket!.addEventListener('error', () => reject(new Error('The development socket did not connect.')), { once: true });
    });
    child.kill('SIGTERM');
    await until(() => child.exitCode !== null, 5000);
    assert.equal(child.exitCode, 0, logs);
    await assert.rejects(readFile(resolve(f.root, '.opendoc/server.json')), { code: 'ENOENT' });
  } finally {
    socket?.close();
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
    await f.cleanup();
  }
});

test('built client serves only build files with browser cache, MIME, and method boundaries', async () => {
  const f = await fixture();
  let server: ReturnType<typeof createServer> | undefined;
  try {
    await assert.rejects(builtClient(f.root), /built OpenDoc app is missing/);
    await mkdir(resolve(f.root, 'dist/assets'), { recursive: true });
    await writeFile(resolve(f.root, 'dist/index.html'), '<!doctype html><title>OpenDoc</title>');
    await writeFile(resolve(f.root, 'dist/assets/app-123.js'), 'export default "built app";');
    await writeFile(resolve(f.root, 'dist/assets/pdf.worker-123.mjs'), 'export default "PDF worker";');
    await symlink(resolve(f.root, 'projects.json'), resolve(f.root, 'dist/linked.json'));
    const client = await builtClient(f.root);
    server = createServer((req, res) => { void client(req, res); });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const origin = `http://127.0.0.1:${address.port}`;
    const index = await fetch(origin);
    assert.match(index.headers.get('content-type')!, /text\/html/);
    assert.equal(index.headers.get('cache-control'), 'no-cache');
    assert.match(await index.text(), /OpenDoc/);
    const script = await fetch(`${origin}/assets/app-123.js`);
    assert.match(script.headers.get('content-type')!, /javascript/);
    assert.match(script.headers.get('cache-control')!, /immutable/);
    assert.match(await script.text(), /built app/);
    assert.match((await fetch(`${origin}/assets/pdf.worker-123.mjs`)).headers.get('content-type')!, /javascript/, 'Module PDF workers need a JavaScript MIME type with nosniff.');
    const head = await fetch(`${origin}/assets/app-123.js`, { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    assert.ok(Number(head.headers.get('content-length')) > 0);
    for (const path of ['/projects.json', '/linked.json', '/.opendoc/current.json', '/src/app/main.tsx', '/assets/%2e%2e%2f%2e%2e%2fprojects.json', '/missing.js']) {
      assert.equal((await fetch(`${origin}${path}`)).status, 404, path);
    }
    assert.equal((await fetch(`${origin}/%`, { method: 'GET' })).status, 400);
    assert.equal((await fetch(origin, { method: 'POST' })).status, 405);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise<void>(accept => server!.close(() => accept())); }
    await f.cleanup();
  }
});

test('production startup keeps rendering, source watch, session guards, and clean shutdown', { timeout: 30_000 }, async () => {
  const f = await fixture();
  await mkdir(resolve(f.root, 'dist'));
  await writeFile(resolve(f.root, 'dist/index.html'), '<!doctype html><title>Built OpenDoc</title>');
  const child = spawn(process.execPath, ['--import', 'tsx', resolve(projectRoot, 'src/server/index.ts'), '--production'], {
    cwd: f.root, env: { ...process.env, OPENDOC_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', value => logs += value); child.stderr.on('data', value => logs += value);
  try {
    let connection: { origin: string; token: string; pid: number } | undefined;
    const sessionFile = resolve(f.root, '.opendoc/server.json');
    await until(async () => {
      try { connection = JSON.parse(await readFile(sessionFile, 'utf8')); return true; }
      catch { if (child.exitCode !== null) throw new Error(logs); return false; }
    });
    const { origin, token } = connection!;
    assert.equal(await fetch(origin).then(response => response.text()), await readFile(resolve(projectRoot, 'dist/index.html'), 'utf8'), 'The interface belongs to the application, not the workspace dist folder.');
    assert.equal((await fetch(`${origin}/@vite/client`)).status, 404);
    const deniedHost = await new Promise<number | undefined>((accept, reject) => get(origin, { headers: { host: 'untrusted.example' } }, response => { response.resume(); accept(response.statusCode); }).on('error', reject));
    assert.equal(deniedHost, 403);
    assert.equal((await fetch(`${origin}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"Denied"}' })).status, 403);
    const state = () => fetch(`${origin}/api/documents`).then(response => response.json()).then((states: DocumentState[]) => states.find(item => item.id === 'proof'));
    await until(async () => (await state())?.status === 'ready');
    await writeFile(f.entry, source().replace('Proof document', 'Production revision'));
    await until(async () => { const document = await state(); return document?.status === 'ready' && document.artifact?.meta.title === 'Production revision'; });
    const current = (await state())!;
    const exported = await fetch(`${origin}/api/documents/proof/export`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OpenDoc-Token': token, Origin: origin }, body: JSON.stringify({ hash: current.artifact!.hash }) });
    assert.equal(exported.status, 200);
    assert.equal((await readFile(resolve(f.root, 'output/proof.pdf'))).subarray(0, 5).toString(), '%PDF-');
    // Stopping an older local process must preserve a replacement session's connection.
    const replacement = { ...connection, pid: process.pid, token: 'replacement-session' };
    await writeFile(sessionFile, JSON.stringify(replacement));
    const saveBody = JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', hash: current.artifact!.hash, filename: 'Shutdown.pdf' });
    let finishSave!: () => void;
    const savedDuringShutdown = new Promise<number | undefined>((accept, reject) => {
      const pending = request(`${origin}/api/documents/proof/exports`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OpenDoc-Token': token } }, response => { response.resume(); response.on('end', () => accept(response.statusCode)); });
      pending.on('error', reject); pending.write('{');
      finishSave = () => pending.end(saveBody.slice(1));
    });
    await new Promise(accept => setTimeout(accept, 100));
    const exited = once(child, 'exit'); child.kill('SIGTERM');
    await new Promise(accept => setTimeout(accept, 100));
    child.kill('SIGTERM');
    await new Promise(accept => setTimeout(accept, 100));
    assert.equal(child.exitCode, null, 'Shutdown drains accepted saves before removing preview files.');
    finishSave();
    assert.equal(await savedDuringShutdown, 200);
    assert.equal((await exited)[0], 0, logs);
    assert.equal((await readFile(resolve(f.root, 'output/Shutdown.pdf'))).subarray(0, 5).toString(), '%PDF-');
    assert.deepEqual(JSON.parse(await readFile(sessionFile, 'utf8')), replacement);
    assert.deepEqual(await readdir(resolve(f.root, '.opendoc/renders')), []);
  } finally {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
    await f.cleanup();
  }
});
