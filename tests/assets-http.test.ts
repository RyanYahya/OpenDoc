import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, projectRoot } from './helpers';
import { AssetStore } from '../src/assets/store';
import { handleAssetRequest } from '../src/server/assets-http';
import type { AssetInspection, AssetCatalog } from '../src/shared/assets';

const exec = promisify(execFile);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAIAAABwJOjsAAAAOUlEQVR4nO3NQQEAIAwDsVIzqMEF/jXw3QzcHjQGsvY9muCRVYlBJrMqMcZc1SXGmKu6xBhzlT6PH78GAQA/IUyuAAAAAElFTkSuQmCC', 'base64');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect x="4" y="4" width="72" height="32" fill="white"/></svg>';

function upload(metadata: unknown, files: { filename: string; bytes: Uint8Array | string; type: string }[], multiple = false) {
  const form = new FormData();
  form.set('metadata', JSON.stringify(metadata));
  for (const file of files) form.append(multiple ? 'files' : 'file', new Blob([typeof file.bytes === 'string' ? file.bytes : new Uint8Array(file.bytes)], { type: file.type }), file.filename);
  return form;
}
function json(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function serveAssets() {
  const f = await fixture();
  await rm(resolve(f.root, 'assets')); // Remove the fixture symlink before managing assets.
  await mkdir(resolve(f.root, 'assets'));
  const store = new AssetStore(f.root);
  let changes = 0;
  const server = createServer((req, res) => {
    void handleAssetRequest(f.root, store, req, res, new URL(req.url!, 'http://localhost'), json, body, () => { changes++; })
      .then(handled => { if (!handled) json(res, { error: 'Not found.' }, 404); })
      // Match the app's outer request handler: local validation errors are 400.
      .catch(error => json(res, { error: error.message }, error.status ?? (error.code === 'ENOENT' ? 404 : 400)));
  });
  await new Promise<void>(accept => server.listen(0, '127.0.0.1', accept));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    ...f, store, changes: () => changes,
    get: (path: string) => fetch(origin + path),
    send: (path: string, method: string, value: unknown) => fetch(origin + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }),
    post: (path: string, form: FormData) => fetch(origin + path, { method: 'POST', body: form }),
    raw: (path: string, content: string, type: string) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': type }, body: content }),
    cleanup: async () => { server.closeAllConnections(); await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept())); await f.cleanup(); },
  };
}
async function good<T>(response: Response, status = 200): Promise<T> {
  assert.equal(response.status, status, await response.clone().text());
  return response.json() as Promise<T>;
}
function fileRoute(kind: 'logo' | 'font', id: string, revision: string, file: string) {
  return `/api/assets/${kind}/${id}/file?${new URLSearchParams({ revision, file })}`;
}

test('asset HTTP imports mixed logo variations, agrees with CLI inspection, and serves only revision members', { timeout: 60_000 }, async () => {
  const f = await serveAssets();
  try {
    const created = await good<AssetInspection>(await f.post('/api/assets/logo', upload({ id: 'acme', name: 'Acme', variationName: 'On light backgrounds', variationDescription: 'Dark mark for pale paper.' }, [{ filename: 'acme.png', bytes: png, type: 'image/png' }])), 201);
    assert.equal(created.asset.kind, 'logo');
    if (created.asset.kind !== 'logo') throw new Error('Expected a logo.');
    assert.equal(created.asset.defaultVariation, 'default');
    const first = created.asset.variations[0];
    const added = await good<AssetInspection>(await f.post('/api/assets/logo/acme/variations', upload({ expectedRevision: created.asset.revision, id: 'on-dark', name: 'On dark backgrounds', description: 'White mark on navy or black.' }, [{ filename: 'acme-white.svg', bytes: svg, type: 'image/svg+xml' }])));
    if (added.asset.kind !== 'logo') throw new Error('Expected a logo.');
    const white = added.asset.variations.find(variation => variation.id === 'on-dark')!;
    assert.equal(white.original.mime, 'image/svg+xml');
    assert.equal(white.image.mime, 'image/png');
    assert.equal(white.image.width! / white.image.height!, 2);

    const revised = await good<AssetInspection>(await f.send('/api/assets/logo/acme', 'PATCH', { expectedRevision: added.asset.revision, defaultVariation: 'on-dark', variation: { id: 'on-dark', description: 'Use on dark PDF backgrounds; preserve clear space.' } }));
    if (revised.asset.kind !== 'logo') throw new Error('Expected a logo.');
    assert.equal(revised.asset.defaultVariation, 'on-dark');
    assert.equal(revised.asset.variations[1].id, 'on-dark');
    const inspected = await good<AssetInspection>(await f.get('/api/assets/logo/acme'));
    const cli = await exec(process.execPath, ['--import', import.meta.resolve('tsx'), resolve(projectRoot, 'src/server/assets-cli.ts'), 'inspect', 'logo', 'acme'], { cwd: f.root, timeout: 15_000 });
    assert.deepEqual(inspected, JSON.parse(cli.stdout));
    assert.deepEqual(inspected, revised);

    const oldFile = await f.get(fileRoute('logo', 'acme', created.asset.revision, first.image.file));
    assert.equal(oldFile.status, 200);
    assert.equal(oldFile.headers.get('content-type'), 'image/png');
    assert.equal(oldFile.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await oldFile.arrayBuffer()), png);
    const original = await f.get(fileRoute('logo', 'acme', revised.asset.revision, white.original.file));
    assert.equal(original.status, 200);
    assert.equal(original.headers.get('content-type'), 'image/svg+xml');
    assert.match(original.headers.get('content-disposition')!, /^attachment;/);
    assert.match(original.headers.get('content-security-policy')!, /default-src 'none'; sandbox/);
    assert.equal(await original.text(), svg);
    const prepared = await f.get(fileRoute('logo', 'acme', revised.asset.revision, white.image.file));
    assert.equal(prepared.status, 200);
    assert.equal(prepared.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await prepared.arrayBuffer()), await readFile(resolve(f.root, inspected.folder, white.image.file)));
    for (const file of [white.original.file, '../package.json', 'files/unrelated.png']) {
      const forbidden = await f.get(fileRoute('logo', 'acme', created.asset.revision, file));
      assert.equal(forbidden.status, 404, await forbidden.text());
    }
    assert.equal((await f.get(`/api/assets/logo/acme/file?file=${encodeURIComponent(first.image.file)}`)).status, 400);
    assert.equal((await f.get('/api/assets/logo/acme?revision=not-a-revision')).status, 400);
    const changes = f.changes();
    assert.equal((await f.send('/api/assets/logo/acme', 'PATCH', { expectedRevision: added.asset.revision, name: 'Stale overwrite' })).status, 409);
    assert.equal((await f.send('/api/assets/logo/acme', 'PATCH', { expectedRevision: revised.asset.revision, misspelledDescription: 'Not accepted' })).status, 400);
    assert.equal(f.changes(), changes);
    assert.equal((await good<AssetInspection>(await f.get('/api/assets/logo/acme'))).asset.revision, revised.asset.revision);
  } finally { await f.cleanup(); }
});

test('asset HTTP theme defaults and archive undo reject stale or implicit changes', { timeout: 60_000 }, async () => {
  const f = await serveAssets();
  try {
    const logo = await f.store.createLogo({ id: 'brand', name: 'Brand' }, { filename: 'brand.png', bytes: png });
    const route = '/api/themes/neutral/assets';
    const before = await good<{ defaults: { version: 1 }; revision: string }>(await f.get(route));
    assert.deepEqual(before.defaults, { version: 1 });
    const input = { defaults: { version: 1, logo: { id: 'brand', variation: 'default' } }, expectedRevision: before.revision };
    const assigned = await good<{ defaults: typeof input.defaults; revision: string }>(await f.send(route, 'PUT', input));
    assert.deepEqual(assigned.defaults, input.defaults);
    assert.notEqual(assigned.revision, before.revision);
    assert.equal((await f.send(route, 'PUT', { ...input, defaults: { version: 1 } })).status, 409);
    assert.equal((await f.send(route, 'PUT', { defaults: { version: 1, extra: 'invalid' }, expectedRevision: assigned.revision })).status, 400);
    assert.deepEqual(await good(await f.get(route)), assigned);
    const archive = '/api/assets/logo/brand/archive';
    assert.equal((await f.send(archive, 'POST', { expectedRevision: logo.asset.revision })).status, 409);
    assert.equal((await f.send(archive, 'POST', { expectedRevision: logo.asset.revision, clearDefaults: 'true' })).status, 400);
    assert.equal((await good<AssetInspection>(await f.send(archive, 'POST', { expectedRevision: logo.asset.revision, clearDefaults: true }))).head.archived, true);
    assert.deepEqual((await good<{ defaults: unknown }>(await f.get(route))).defaults, { version: 1 });
    assert.equal((await good<AssetCatalog>(await f.get('/api/assets?kind=logo'))).items.length, 0);
    assert.equal((await good<AssetCatalog>(await f.get('/api/assets?kind=logo&archived=true'))).items[0].archived, true);
    const restored = await good<AssetInspection>(await f.send('/api/assets/logo/brand/restore', 'POST', { expectedRevision: logo.asset.revision }));
    assert.equal(restored.head.archived, undefined);
    assert.deepEqual((await good<{ defaults: unknown }>(await f.get(route))).defaults, input.defaults);
    assert.equal((await f.get('/api/assets?kind=video')).status, 400);
    assert.equal((await f.get('/api/themes/not-a-theme/assets')).status, 404);
  } finally { await f.cleanup(); }
});

test('asset HTTP rejects truncated multipart, invalid metadata, and ambiguous file fields before publication', { timeout: 60_000 }, async () => {
  const f = await serveAssets();
  try {
    assert.equal((await f.raw('/api/assets/logo', JSON.stringify({ name: 'Wrong encoding' }), 'application/json')).status, 400);
    const partial = '--cut-off\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n{"name":"Incomplete"}\r\n--cut-off\r\nContent-Disposition: form-data; name="file"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\npartial-png';
    const interrupted = await f.raw('/api/assets/logo', partial, 'multipart/form-data; boundary=cut-off');
    assert.equal(interrupted.status, 400);
    assert.match(await interrupted.text(), /interrupted|malformed/);
    for (const metadata of [[], { name: 'Misspelled', unrelated: true }, { name: '' }]) {
      assert.equal((await f.post('/api/assets/logo', upload(metadata, [{ filename: 'logo.png', bytes: png, type: 'image/png' }]))).status, 400);
    }
    const duplicate = upload({ name: 'Duplicate metadata' }, [{ filename: 'logo.png', bytes: png, type: 'image/png' }]);
    duplicate.append('metadata', '{}');
    assert.equal((await f.post('/api/assets/logo', duplicate)).status, 400);
    const wrongKey = upload({ name: 'Wrong file key' }, [{ filename: 'logo.png', bytes: png, type: 'image/png' }], true);
    assert.equal((await f.post('/api/assets/logo', wrongKey)).status, 400);
    const twoFiles = upload({ name: 'Two logo files' }, [{ filename: 'one.png', bytes: png, type: 'image/png' }, { filename: 'two.png', bytes: png, type: 'image/png' }]);
    assert.equal((await f.post('/api/assets/logo', twoFiles)).status, 400);
    const invalid = upload({ name: 'Invalid image' }, [{ filename: 'bad.svg', bytes: '<svg><image href="https://example.com/image.png"/></svg>', type: 'image/svg+xml' }]);
    assert.equal((await f.post('/api/assets/logo', invalid)).status, 400);
    assert.equal(f.changes(), 0);
    assert.deepEqual((await good<AssetCatalog>(await f.get('/api/assets?kind=logo'))).items, []);
  } finally { await f.cleanup(); }
});

test('asset HTTP imports a font family from repeated files with an inferred name and serves its actual specimen', { timeout: 60_000 }, async () => {
  const f = await serveAssets();
  try {
    const files = await Promise.all(['Regular', 'Semibold'].map(async face => ({ filename: `OpenDocSans-${face}.ttf`, bytes: await readFile(resolve(projectRoot, `assets/fonts/OpenDocSans-${face}.ttf`)), type: 'font/ttf' })));
    const result = await good<AssetInspection>(await f.post('/api/assets/font', upload({ id: 'reading-family' }, files, true)), 201);
    if (result.asset.kind !== 'font') throw new Error('Expected a font.');
    assert.equal(result.asset.name, 'OpenDoc Sans');
    assert.equal(result.asset.description, '');
    assert.equal(result.asset.faces.length, 2);
    assert.equal(result.asset.compatibility.defaultEligible, true);
    assert.equal(result.asset.specimen?.mime, 'application/pdf');
    const specimen = await f.get(fileRoute('font', 'reading-family', result.asset.revision, result.asset.specimen!.file));
    assert.equal(specimen.status, 200);
    assert.equal(specimen.headers.get('content-type'), 'application/pdf');
    assert.match(specimen.headers.get('content-disposition')!, /^inline;/);
    assert.equal(Buffer.from(await specimen.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    const face = result.asset.faces[0];
    const download = await f.get(fileRoute('font', 'reading-family', result.asset.revision, face.file.file));
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), files[0].bytes);
  } finally { await f.cleanup(); }
});
