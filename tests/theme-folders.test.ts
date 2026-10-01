import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture } from './helpers';
import {
  assignThemeFolder, createThemeFolder, deleteThemeFolder, readThemeFolders, setThemeTags, updateThemeFolder,
} from '../src/server/theme-folders';
import { handleThemeFoldersRequest } from '../src/server/theme-folders-http';
import { runThemesCli } from '../src/server/themes-cli';
import { folderPath, normalizeTags, tagCatalog, themeChoiceLabel, type ThemeFoldersManifest } from '../src/shared/theme-folders';

/** A fixture without any organization copied from the checkout. */
async function workspace() {
  const f = await fixture();
  await rm(resolve(f.root, 'themes/folders.json'), { force: true });
  return f;
}
const file = (root: string) => resolve(root, 'themes/folders.json');

test('folders nest, rename, and move without cycles or duplicate sibling names', async () => {
  const f = await workspace();
  try {
    assert.deepEqual(await readThemeFolders(f.root), { version: 1, folders: [], assignments: {}, tags: {} });
    const clients = (await createThemeFolder(f.root, { name: '  Clients ' })).folder;
    assert.deepEqual(clients, { id: 'clients', name: 'Clients', parent: null });
    const acme = (await createThemeFolder(f.root, { name: 'Acme', parent: clients.id })).folder;
    const reports = (await createThemeFolder(f.root, { name: 'Reports', parent: acme.id })).folder;
    // Names are unique among siblings only, without regard to case.
    await assert.rejects(createThemeFolder(f.root, { name: 'clients' }), { status: 409 });
    const topReports = (await createThemeFolder(f.root, { name: 'Reports' })).folder;
    assert.equal(topReports.id, 'reports-2');
    for (const name of ['', 'A/B', '..', 'x'.repeat(81), 'Line\nbreak']) await assert.rejects(createThemeFolder(f.root, { name }), { status: 400 });
    await assert.rejects(createThemeFolder(f.root, { name: 'Orphan', parent: 'missing' }), { status: 404 });

    let manifest = (await updateThemeFolder(f.root, acme.id, { name: 'Acme Corp' })).manifest;
    assert.equal(folderPath(manifest, reports.id), 'Clients/Acme Corp/Reports');
    for (const parent of [acme.id, reports.id]) await assert.rejects(updateThemeFolder(f.root, acme.id, { parent }), /cannot move into itself/);
    await assert.rejects(updateThemeFolder(f.root, reports.id, { parent: null }), /already exists/);
    manifest = (await updateThemeFolder(f.root, acme.id, { parent: null })).manifest;
    assert.equal(folderPath(manifest, reports.id), 'Acme Corp/Reports');
    assert.equal(folderPath(manifest, clients.id), 'Clients');
  } finally { await f.cleanup(); }
});

test('deleting a folder keeps every theme and moves its contents to the parent', async () => {
  const f = await workspace();
  try {
    const before = await readFile(resolve(f.root, 'themes/neutral/index.ts'));
    const outer = (await createThemeFolder(f.root, { name: 'Outer' })).folder;
    const inner = (await createThemeFolder(f.root, { name: 'Inner', parent: outer.id })).folder;
    const nested = (await createThemeFolder(f.root, { name: 'Drafts', parent: inner.id })).folder;
    await createThemeFolder(f.root, { name: 'drafts', parent: outer.id });
    await assignThemeFolder(f.root, 'neutral', inner.id);
    await assignThemeFolder(f.root, 'field-manual', inner.id);
    await setThemeTags(f.root, 'neutral', ['Reports']);
    const result = await deleteThemeFolder(f.root, inner.id);
    assert.equal(result.movedThemes, 2);
    assert.equal(result.movedFolders, 1);
    assert.deepEqual(result.renamed, [{ from: 'Drafts', to: 'Drafts 2' }]);
    assert.equal(result.manifest.assignments.neutral, outer.id);
    assert.equal(folderPath(result.manifest, nested.id), 'Outer/Drafts 2');
    assert.deepEqual(result.manifest.tags.neutral, ['Reports']);
    // Removing a top-level folder returns its themes to the top level.
    const top = await deleteThemeFolder(f.root, outer.id);
    assert.equal(top.manifest.assignments.neutral, undefined);
    assert.deepEqual(top.manifest.folders.map(folder => folder.parent), [null, null]);
    assert.ok((await readdir(resolve(f.root, 'themes'))).includes('neutral'));
    assert.deepEqual(await readFile(resolve(f.root, 'themes/neutral/index.ts')), before);
    await assert.rejects(deleteThemeFolder(f.root, inner.id), { status: 404 });
  } finally { await f.cleanup(); }
});

test('tags are trimmed, deduplicated without regard to case, and reuse an established spelling', async () => {
  assert.deepEqual(normalizeTags(['  Annual   report ', 'annual REPORT', 'Print']), ['Annual report', 'Print']);
  assert.deepEqual(normalizeTags(['reports'], ['Reports']), ['Reports']);
  assert.throws(() => normalizeTags(['a,b']), /without commas/);
  assert.throws(() => normalizeTags(Array.from({ length: 21 }, (_, index) => `Tag ${index}`)), /up to 20/);
  const f = await workspace();
  try {
    await setThemeTags(f.root, 'neutral', ['Reports', ' reports ', 'Formal']);
    const { tags, manifest } = await setThemeTags(f.root, 'field-manual', ['REPORTS', 'Field']);
    assert.deepEqual(tags, ['Reports', 'Field']);
    assert.deepEqual(tagCatalog(manifest).map(({ label, count }) => [label, count]), [['Field', 1], ['Formal', 1], ['Reports', 2]]);
    // The only theme using a tag can correct its capitalization.
    assert.deepEqual((await setThemeTags(f.root, 'field-manual', ['Reports', 'FIELD'])).tags, ['Reports', 'FIELD']);
    assert.deepEqual((await setThemeTags(f.root, 'neutral', [])).manifest.tags.neutral, undefined);
    await assert.rejects(setThemeTags(f.root, 'missing-theme', ['Reports']), { status: 404 });
    await assert.rejects(setThemeTags(f.root, 'neutral', 'Reports'), { status: 400 });
    await assert.rejects(assignThemeFolder(f.root, 'missing-theme', null), { status: 404 });
  } finally { await f.cleanup(); }
});

test('removed themes are ignored, then pruned on the next change; invalid files are preserved', async () => {
  const f = await workspace();
  try {
    await cp(resolve(f.root, 'themes/neutral'), resolve(f.root, 'themes/temporary'), { recursive: true });
    const folder = (await createThemeFolder(f.root, { name: 'Archive' })).folder;
    await assignThemeFolder(f.root, 'temporary', folder.id);
    await setThemeTags(f.root, 'temporary', ['Old']);
    await rm(resolve(f.root, 'themes/temporary'), { recursive: true });
    // Reading does not discard organization; the folder may only be briefly absent.
    assert.equal((await readThemeFolders(f.root)).assignments.temporary, folder.id);
    const { manifest } = await assignThemeFolder(f.root, 'neutral', folder.id);
    assert.deepEqual(manifest.assignments, { neutral: folder.id });
    assert.deepEqual(manifest.tags, {});
    assert.deepEqual(JSON.parse(await readFile(file(f.root), 'utf8')), manifest);

    for (const invalid of [
      '{"version":1,"folders":[{"id":"a","name":"A","parent":"b"},{"id":"b","name":"B","parent":"a"}]}',
      '{"version":1,"folders":[{"id":"a","name":"A","parent":null},{"id":"b","name":"a","parent":null}]}',
      '{"version":1,"folders":[],"assignments":{"neutral":"missing"}}',
      '{"version":2,"folders":[]}',
      'not json',
    ]) {
      await writeFile(file(f.root), invalid);
      await assert.rejects(readThemeFolders(f.root), /folders\.json/);
      await assert.rejects(createThemeFolder(f.root, { name: 'Do not replace' }), /folders\.json/);
      assert.equal(await readFile(file(f.root), 'utf8'), invalid);
    }
  } finally { await f.cleanup(); }
});

test('theme pickers show the folder after the theme name', () => {
  const manifest: ThemeFoldersManifest = { version: 1, folders: [{ id: 'a', name: 'Clients', parent: null }, { id: 'b', name: 'Acme', parent: 'a' }], assignments: { neutral: 'b' }, tags: {} };
  assert.equal(themeChoiceLabel({ id: 'neutral', name: 'Neutral' }, manifest), 'Neutral (Clients / Acme)');
  assert.equal(themeChoiceLabel({ id: 'field-manual', name: 'Field Manual' }, manifest), 'Field Manual');
});

function json(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

test('the local API creates, moves, tags, and deletes with matching status codes and change events', async () => {
  const f = await workspace();
  let changes = 0;
  const server = createServer((req, res) => {
    void handleThemeFoldersRequest(f.root, req, res, new URL(req.url!, 'http://localhost'), json, body, () => { changes++; })
      .then(handled => { if (!handled) json(res, { error: 'Not found.' }, 404); })
      .catch(error => json(res, { error: error.message }, error.status ?? 400));
  });
  await new Promise<void>(accept => server.listen(0, '127.0.0.1', accept));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const send = (path: string, method: string, value?: unknown) => fetch(origin + path, { method, headers: { 'Content-Type': 'application/json' }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  async function good<T>(response: Response, status = 200): Promise<T> {
    assert.equal(response.status, status, await response.clone().text());
    return response.json() as Promise<T>;
  }
  try {
    assert.deepEqual(await good(await fetch(`${origin}/api/theme-folders`)), { version: 1, folders: [], assignments: {}, tags: {} });
    const { folder: parent } = await good<{ folder: { id: string } }>(await send('/api/theme-folders', 'POST', { name: 'Brand' }), 201);
    const { folder: child } = await good<{ folder: { id: string } }>(await send('/api/theme-folders', 'POST', { name: 'Print', parent: parent.id }), 201);
    assert.equal((await send(`/api/theme-folders/${parent.id}`, 'PATCH', { parent: child.id })).status, 409);
    assert.equal((await send('/api/theme-folders', 'POST', { name: 'Brand', extra: true })).status, 400);
    await good(await send('/api/themes/neutral/folder', 'PUT', { folderId: child.id }));
    assert.equal((await send('/api/themes/neutral/folder', 'PUT', { folderId: child.id, extra: 1 })).status, 400);
    assert.equal((await send('/api/themes/missing/folder', 'PUT', { folderId: null })).status, 404);
    const tagged = await good<{ manifest: ThemeFoldersManifest }>(await send('/api/themes/neutral/tags', 'PUT', { tags: ['Brand', 'brand', 'Print'] }));
    assert.deepEqual(tagged.manifest.tags.neutral, ['Brand', 'Print']);
    const renamed = await good<{ manifest: ThemeFoldersManifest }>(await send(`/api/theme-folders/${child.id}`, 'PATCH', { name: 'Printed' }));
    assert.equal(folderPath(renamed.manifest, renamed.manifest.assignments.neutral), 'Brand/Printed');
    const removed = await good<{ manifest: ThemeFoldersManifest; movedThemes: number }>(await send(`/api/theme-folders/${parent.id}`, 'DELETE'));
    assert.equal(removed.movedThemes, 0);
    assert.equal(folderPath(removed.manifest, removed.manifest.assignments.neutral), 'Printed');
    assert.equal(changes, 6, 'Every successful mutation notifies connected windows.');
    assert.equal((await send('/api/theme-folders/missing', 'DELETE')).status, 404);
  } finally {
    server.closeAllConnections(); await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()));
    await f.cleanup();
  }
});

function output(t: TestContext) {
  const lines: string[] = [];
  t.mock.method(console, 'log', (line: string) => { lines.push(line); });
  return () => {
    assert.equal(lines.length, 1, 'A command returns one complete JSON value.');
    return JSON.parse(lines.splice(0)[0]);
  };
}

test('the theme CLI reports and filters organization, and manages folders, assignments, and tags', { timeout: 60_000 }, async t => {
  const f = await workspace();
  const json = output(t);
  try {
    await runThemesCli(['list', '--json'], f.root);
    const flat = json() as { id: string; folder: string | null; tags: string[] }[];
    assert.ok(flat.length > 1 && flat.every(theme => theme.folder === null && theme.tags.length === 0), 'Without folders.json every theme is at the top level.');

    await runThemesCli(['folders', 'create', 'Clients/Acme'], f.root);
    assert.deepEqual(json().path, 'Clients/Acme');
    await runThemesCli(['assign', 'field-manual', 'clients/acme'], f.root);
    assert.deepEqual(json(), { id: 'field-manual', folder: 'Clients/Acme' });
    await runThemesCli(['assign', 'neutral', 'Clients'], f.root);
    json();
    await runThemesCli(['tags', 'field-manual', '--set', 'Reports, Technical'], f.root);
    assert.deepEqual(json().tags, ['Reports', 'Technical']);
    await runThemesCli(['tags', 'neutral', '--add', 'reports', '--add', 'Warm'], f.root);
    assert.deepEqual(json().tags, ['Reports', 'Warm']);
    await runThemesCli(['tags', 'neutral', '--remove', 'WARM'], f.root);
    assert.deepEqual(json().tags, ['Reports']);

    await runThemesCli(['list', '--folder', 'Clients', '--json'], f.root);
    assert.deepEqual((json() as { id: string }[]).map(theme => theme.id).sort(), ['field-manual', 'neutral']);
    await runThemesCli(['list', '--folder', 'Clients/Acme', '--tag', 'technical'], f.root);
    assert.deepEqual((json() as { id: string; folder: string; tags: string[] }[]).map(({ id, folder, tags }) => ({ id, folder, tags })), [{ id: 'field-manual', folder: 'Clients/Acme', tags: ['Reports', 'Technical'] }]);
    await runThemesCli(['list', '--folder', 'none'], f.root);
    assert.ok((json() as { folder: string | null }[]).every(theme => theme.folder === null));
    await assert.rejects(runThemesCli(['list', '--folder', 'Missing'], f.root), /No theme folder matches/);
    await assert.rejects(runThemesCli(['inspect', 'neutral', '--tag', 'x'], f.root), /Usage/);

    await runThemesCli(['folders', 'update', 'Clients/Acme', '--name', 'Acme Corp', '--parent', 'none'], f.root);
    assert.deepEqual(json(), { id: 'acme', name: 'Acme Corp', path: 'Acme Corp', parent: null });
    await runThemesCli(['folders'], f.root);
    assert.deepEqual(json().folders.map((folder: { path: string; themes: string[] }) => [folder.path, folder.themes]), [['Acme Corp', ['field-manual']], ['Clients', ['neutral']]]);
    await runThemesCli(['folders', 'delete', 'Clients'], f.root);
    assert.deepEqual(json(), { deleted: 'clients', movedTo: null, movedThemes: 1, movedFolders: 0, renamed: [] });
    await assert.rejects(runThemesCli(['folders', 'update', 'Acme Corp'], f.root), /Usage/);
    await assert.rejects(runThemesCli(['assign', 'neutral', 'Nowhere'], f.root), /No theme folder matches/);

    // An unreadable organization file never hides the catalog itself.
    await writeFile(file(f.root), '{"version":1}');
    t.mock.method(console, 'error', () => {});
    await runThemesCli(['list'], f.root);
    assert.ok((json() as unknown[]).length > 1);
    await assert.rejects(runThemesCli(['list', '--tag', 'Reports'], f.root), /folders\.json is invalid/);
  } finally { await f.cleanup(); }
});
