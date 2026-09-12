import test from 'node:test';
import assert from 'node:assert/strict';
import { Agent, get } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { resolve } from 'node:path';
import { fixture, projectRoot, until } from './helpers';

test('open sessions cannot occupy every HTTP slot and stall document previews', { timeout: 30_000 }, async () => {
  const f = await fixture();
  const child = spawn(process.execPath, ['--import', 'tsx', resolve(projectRoot, 'src/server/index.ts')], { cwd: f.root, env: { ...process.env, OPENDOC_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', d => logs += d); child.stderr.on('data', d => logs += d);
  // Chromium's HTTP/1 connection allowance is shared across tabs and sessions.
  const agent = new Agent({ keepAlive: true, maxSockets: 6 });
  const reads: ReturnType<typeof get>[] = [];
  const sockets: WebSocket[] = [];
  const read = (url: string) => new Promise<Buffer>((accept, reject) => {
    const timer = setTimeout(() => { req.destroy(); reject(new Error('PDF remained queued behind six live-update streams.')); }, 2_000);
    const req = get(url, { agent, signal: AbortSignal.timeout(2_000) }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => { clearTimeout(timer); accept(Buffer.concat(chunks)); });
      res.on('error', reject);
    });
    req.on('error', error => { clearTimeout(timer); reject(error); });
  });
  try {
    let origin = '';
    await until(async () => { try { origin = JSON.parse(await readFile(resolve(f.root, '.opendoc/server.json'), 'utf8')).origin; return true; } catch { if (child.exitCode !== null) throw new Error(logs); return false; } });
    let hash = '';
    await until(async () => { const [document] = await fetch(`${origin}/api/documents`).then(r => r.json()); hash = document?.artifact?.hash ?? ''; return document?.status === 'ready'; });
    // Old tabs must release their obsolete event streams during an upgrade.
    await Promise.all(Array.from({ length: 6 }, () => new Promise<void>((accept, reject) => {
      const req = get(`${origin}/api/events`, { agent }, res => { res.resume(); accept(); });
      req.on('error', reject); reads.push(req);
    })));
    const pdf = await read(`${origin}/api/documents/proof/pdf?hash=${hash}`);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    const counts = Array.from({ length: 8 }, () => 0);
    await Promise.all(counts.map((_, index) => new Promise<void>((accept, reject) => {
      const ws = new WebSocket(origin.replace('http:', 'ws:') + '/api/events', { origin, agent });
      sockets.push(ws);
      ws.on('error', reject);
      ws.on('message', data => { if (String(data) === 'connected') accept(); else if (String(data) === 'changed') counts[index]++; });
    })));
    assert.equal((await read(`${origin}/api/documents/proof/pdf?hash=${hash}`)).subarray(0, 5).toString(), '%PDF-');
    const before = [...counts];
    await writeFile(f.entry, (await readFile(f.entry, 'utf8')).replace('Proof document', 'Updated proof'));
    await until(() => counts.every((count, index) => count > before[index]));
    await new Promise<void>((accept, reject) => {
      const denied = new WebSocket(origin.replace('http:', 'ws:') + '/api/events', { origin: 'https://example.com' });
      sockets.push(denied);
      denied.on('open', () => reject(new Error('Accepted a foreign origin.')));
      denied.on('error', error => { assert.match(error.message, /403/); accept(); });
    });
  } finally {
    for (const socket of sockets) socket.terminate();
    for (const req of reads) req.destroy();
    agent.destroy();
    const exited = new Promise(r => child.once('exit', r)); child.kill('SIGTERM');
    const killTimer = setTimeout(() => child.kill('SIGKILL'), 5_000);
    await exited;
    clearTimeout(killTimer);
    await f.cleanup();
  }
});
