import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type RequestListener, type ServerResponse } from 'node:http';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, source, until } from './helpers';
import { exportDocuments, parseExportArgs } from '../src/server/export-batch';
import { publishPDF, ExportChangedError } from '../src/server/export-file';

test('batch exports valid PDFs independently, preserves prior failed outputs, and cleans render files', async () => {
  const f = await fixture();
  try {
    await mkdir(resolve(f.root, 'documents/broken'));
    await writeFile(resolve(f.root, 'documents/broken/index.tsx'), 'export default =');
    await mkdir(resolve(f.root, 'output'));
    await writeFile(resolve(f.root, 'output/broken.pdf'), 'Previous reviewed output');
    const results = await exportDocuments(f.root, ['proof', 'broken', 'proof', 'missing']);
    assert.deepEqual(results.map(result => result.id), ['proof', 'broken', 'missing']);
    assert.equal(results[0].status, 'success');
    if (results[0].status === 'success') {
      assert.equal(results[0].source, 'render');
      assert.ok(results[0].pages > 0);
      assert.match((await readFile(results[0].path)).toString('latin1'), /^%PDF/);
    }
    assert.equal(results[1].status, 'error');
    if (results[1].status === 'error') {
      assert.equal(results[1].updated, false);
      assert.equal(results[1].previousOutputRetained, true);
    }
    assert.equal(await readFile(resolve(f.root, 'output/broken.pdf'), 'utf8'), 'Previous reviewed output');
    assert.equal(results[2].status, 'error');
    assert.deepEqual(await readdir(resolve(f.root, '.opendoc/renders')), []);
  } finally { await f.cleanup(); }
});

test('batch command parsing rejects ambiguous or unsafe requests and deduplicates IDs', () => {
  assert.deepEqual(parseExportArgs(['--', 'proof', 'proof', 'another', '--json']), { all: false, json: true, ids: ['proof', 'another'] });
  assert.deepEqual(parseExportArgs(['--all', '--json']), { all: true, json: true, ids: [] });
  for (const args of [[], ['--all', 'proof'], ['../outside'], ['--unknown'], ['--all', '--all'], ['proof', '--json', '--json']]) {
    assert.throws(() => parseExportArgs(args));
  }
});

test('atomic publication never replaces the reviewed PDF when its source changed', async () => {
  const f = await fixture();
  try {
    await publishPDF(f.root, 'proof', new TextEncoder().encode('Reviewed PDF'));
    await assert.rejects(publishPDF(f.root, 'proof', new TextEncoder().encode('Obsolete revision'), () => false), ExportChangedError);
    assert.equal(await readFile(resolve(f.root, 'output/proof.pdf'), 'utf8'), 'Reviewed PDF');
    assert.deepEqual(await readdir(resolve(f.root, 'output')), ['proof.pdf']);
  } finally { await f.cleanup(); }
});

test('an offline source edit during rendering cannot publish an obsolete PDF', async () => {
  const f = await fixture();
  try {
    await publishPDF(f.root, 'proof', new TextEncoder().encode('Previously reviewed PDF'));
    await writeFile(f.entry, `import {writeFileSync} from 'node:fs'; import {resolve} from 'node:path';\n` + source().replace('function Proof(){return', 'function Proof(){writeFileSync(resolve(process.cwd(),".opendoc/render-started"),"started"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,450); return'));
    const exporting = exportDocuments(f.root, ['proof']);
    await until(async () => { try { await access(resolve(f.root, '.opendoc/render-started')); return true; } catch { return false; } });
    await writeFile(f.entry, source().replace('Proof document', 'The newer draft'));
    const [result] = await exporting;
    assert.equal(result.status, 'error');
    if (result.status === 'error') assert.match(result.error, /changed during export/);
    assert.equal(await readFile(resolve(f.root, 'output/proof.pdf'), 'utf8'), 'Previously reviewed PDF');
    assert.deepEqual(await readdir(resolve(f.root, '.opendoc/renders')), []);
  } finally { await f.cleanup(); }
});

async function serveSession(root: string, handler: RequestListener) {
  const server = createServer(handler);
  await new Promise<void>(accept => server.listen(0, '127.0.0.1', accept));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await mkdir(resolve(root, '.opendoc'), { recursive: true });
  await writeFile(resolve(root, '.opendoc/server.json'), JSON.stringify({ origin: `http://127.0.0.1:${address.port}`, token: 'test-only-session-token' }));
  return async () => { await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept())); };
}
const json = (res: ServerResponse, value: unknown, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };

test('a live invalid preview or refused export remains authoritative without an offline fallback', async () => {
  const f = await fixture();
  let ready = false, writes = 0;
  const close = await serveSession(f.root, (req, res) => {
    if (req.url === '/api/documents') json(res, [{ id: 'proof', status: ready ? 'ready' : 'error', error: 'data.metrics[0].value: Expected a finite number.', artifact: { hash: 'latest-preview', pages: [{}] } }]);
    else { writes++; json(res, { error: 'This preview changed.' }, 409); }
  });
  try {
    const [invalid] = await exportDocuments(f.root, ['proof']);
    assert.equal(invalid.status, 'error');
    if (invalid.status === 'error') assert.match(invalid.error, /Expected a finite number/);
    assert.equal(writes, 0);
    ready = true;
    const [refused] = await exportDocuments(f.root, ['proof']);
    assert.equal(refused.status, 'error');
    if (refused.status === 'error') assert.equal(refused.error, 'This preview changed.');
    assert.equal(writes, 1);
    await assert.rejects(readFile(resolve(f.root, 'output/proof.pdf')), { code: 'ENOENT' });
  } finally { await close(); await f.cleanup(); }
});

test('live batch concurrency is bounded and slow readiness returns a useful per-output error', async () => {
  const f = await fixture();
  let active = 0, peak = 0, rendering = false;
  const ids = ['proof', 'second', 'third'];
  for (const id of ids.slice(1)) {
    await mkdir(resolve(f.root, 'documents', id));
    await writeFile(resolve(f.root, 'documents', id, 'index.tsx'), source());
  }
  const close = await serveSession(f.root, (req, res) => {
    if (req.url === '/api/documents') {
      json(res, ids.map(id => ({ id, status: rendering ? 'rendering' : 'ready', artifact: { hash: `${id}-hash`, pages: [{}] } })));
    } else {
      active++; peak = Math.max(peak, active);
      setTimeout(() => { active--; res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end('%PDF-test'); }, 35);
    }
  });
  try {
    const results = await exportDocuments(f.root, ids);
    assert.ok(results.every(result => result.status === 'success'));
    assert.equal(peak, 2);
    rendering = true;
    const [pending] = await exportDocuments(f.root, ['proof'], { readyTimeoutMs: 50 });
    assert.equal(pending.status, 'error');
    if (pending.status === 'error') assert.match(pending.error, /still rendering/);
  } finally { await close(); await f.cleanup(); }
});
