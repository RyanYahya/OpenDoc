import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture } from './helpers';
import {
  assignThemeFolder, createThemeFolder, deleteThemeFolder, parseThemeFoldersFile, readThemeFolders, readThemeFoldersFile, renameThemeFolder,
} from '../src/server/theme-folders';
import { handleThemeFoldersRequest } from '../src/server/theme-folders-http';
import { runThemesCli } from '../src/server/themes-cli';
import { folderCounts, inFolder, themeChoiceLabel, themeFolder, type ThemeFoldersManifest } from '../src/shared/theme-folders';

/** A fixture without any organization copied from the checkout. Tags are covered in tags.test.ts. */
async function workspace() {
  const f = await fixture();
  await rm(resolve(f.root, 'themes/folders.json'), { force: true });
  await rm(resolve(f.root, 'tags.json'), { force: true });
  return f;
}
const file = (root: string) => resolve(root, 'themes/folders.json');
const names = (manifest: ThemeFoldersManifest) => Object.fromEntries(manifest.folders.map(folder => [folder.id, folder.name]));

test('folders are single-level: names are unique, renames keep the ID, and nesting is refused', async () => {
  const f = await workspace();
  try {
    assert.deepEqual(await readThemeFolders(f.root), { version: 2, folders: [], assignments: {} });
    const clients = (await createThemeFolder(f.root, { name: '  Clients ' })).folder;
    assert.deepEqual(clients, { id: 'clients', name: 'Clients' });
    // Names are unique across all folders, without regard to case.
    await assert.rejects(createThemeFolder(f.root, { name: 'clients' }), { status: 409 });
    for (const name of ['', 'A/B', '..', 'x'.repeat(81), 'Line\nbreak']) await assert.rejects(createThemeFolder(f.root, { name }), { status: 400 });
    await assert.rejects(createThemeFolder(f.root, { name: 'Acme', parent: clients.id }), { status: 400, message: /single-level/ });
    // Earlier clients sent `parent: null` for a plain folder.
    const acme = (await createThemeFolder(f.root, { name: 'Acme', parent: null })).folder;

    await assignThemeFolder(f.root, 'neutral', acme.id);
    const renamed = await renameThemeFolder(f.root, acme.id, { name: 'Acme Corp' });
    assert.deepEqual(renamed.folder, { id: 'acme', name: 'Acme Corp' });
    assert.equal(renamed.manifest.assignments.neutral, 'acme', 'Themes stay in a renamed folder.');
    await renameThemeFolder(f.root, acme.id, { name: 'ACME corp' });
    await assert.rejects(renameThemeFolder(f.root, acme.id, { name: 'Clients' }), { status: 409 });
    await assert.rejects(renameThemeFolder(f.root, acme.id, { parent: clients.id }), { status: 400, message: /single-level/ });
    await assert.rejects(renameThemeFolder(f.root, 'missing', { name: 'Gone' }), { status: 404 });
    assert.deepEqual(JSON.parse(await readFile(file(f.root), 'utf8')), {
      version: 2, folders: [{ id: 'clients', name: 'Clients' }, { id: 'acme', name: 'ACME corp' }], assignments: { neutral: 'acme' },
    });
  } finally { await f.cleanup(); }
});

test('deleting a folder leaves its themes outside any folder and never deletes a theme', async () => {
  const f = await workspace();
  try {
    const before = await readFile(resolve(f.root, 'themes/neutral/index.ts'));
    const brand = (await createThemeFolder(f.root, { name: 'Brand' })).folder;
    const other = (await createThemeFolder(f.root, { name: 'Other' })).folder;
    await assignThemeFolder(f.root, 'neutral', brand.id);
    await assignThemeFolder(f.root, 'field-manual', brand.id);
    await assignThemeFolder(f.root, 'civic-spectrum', other.id);
    const result = await deleteThemeFolder(f.root, brand.id);
    assert.equal(result.unfiledThemes, 2);
    assert.deepEqual(result.manifest.assignments, { 'civic-spectrum': other.id });
    assert.deepEqual(result.manifest.folders, [other]);
    assert.ok((await readdir(resolve(f.root, 'themes'))).includes('neutral'));
    assert.deepEqual(await readFile(resolve(f.root, 'themes/neutral/index.ts')), before);
    await assert.rejects(deleteThemeFolder(f.root, brand.id), { status: 404 });
  } finally { await f.cleanup(); }
});

test('nested version 1 folders flatten on read without losing assignments, and save flat on the next change', async () => {
  const f = await workspace();
  try {
    const legacy = {
      version: 1,
      folders: [
        { id: 'brands', name: 'Brands', parent: null },
        { id: 'narra', name: 'Narra', parent: 'brands' },
        { id: 'scot', name: 'SCOT', parent: 'brands' },
        { id: 'starter', name: 'Starter', parent: null },
        // A top-level folder already uses the name of a nested one, and of its first suffix.
        { id: 'archive', name: 'narra', parent: null },
        { id: 'archive-2', name: 'Narra 2', parent: null },
        // A parent with its own theme stays; an empty grandparent goes.
        { id: 'clients', name: 'Clients', parent: null },
        { id: 'acme', name: 'Acme', parent: 'clients' },
        { id: 'reports', name: 'Reports', parent: 'acme' },
      ],
      assignments: { neutral: 'narra', 'field-manual': 'scot', 'civic-spectrum': 'starter', 'opendoc-neutral': 'acme', 'mckinsey-consulting': 'reports' },
      tags: { neutral: ['Legacy'] },
    };
    const text = JSON.stringify(legacy);
    await writeFile(file(f.root), text);
    const { manifest, migration } = await readThemeFoldersFile(f.root);
    assert.equal(await readFile(file(f.root), 'utf8'), text, 'Reading never rewrites the file.');
    assert.deepEqual(names(manifest), { narra: 'Narra 3', scot: 'SCOT', starter: 'Starter', archive: 'narra', 'archive-2': 'Narra 2', acme: 'Acme', reports: 'Reports' });
    assert.deepEqual(manifest.assignments, legacy.assignments, 'Every theme keeps its folder.');
    assert.deepEqual(manifest.tags, legacy.tags);
    assert.deepEqual(migration, {
      from: 1,
      flattened: [{ id: 'narra', name: 'Narra 3', from: 'Brands/Narra' }, { id: 'scot', name: 'SCOT', from: 'Brands/SCOT' }, { id: 'acme', name: 'Acme', from: 'Clients/Acme' }, { id: 'reports', name: 'Reports', from: 'Clients/Acme/Reports' }],
      renamed: [{ id: 'narra', from: 'Narra', to: 'Narra 3' }],
      removed: [{ id: 'brands', name: 'Brands' }, { id: 'clients', name: 'Clients' }],
    });
    // Flattening is deterministic, so links by folder ID resolve the same way on every read.
    assert.deepEqual(parseThemeFoldersFile(legacy).manifest, manifest);

    await createThemeFolder(f.root, { name: 'Print' });
    const saved = JSON.parse(await readFile(file(f.root), 'utf8'));
    assert.equal(saved.version, 2);
    assert.ok(saved.folders.every((folder: object) => !('parent' in folder)));
    assert.deepEqual(saved.assignments, legacy.assignments);
    assert.deepEqual(saved.tags, legacy.tags, 'Legacy tags wait for tags.json.');
    assert.equal((await readThemeFoldersFile(f.root)).migration, undefined);

    // A version 1 file without nesting needs no report.
    await writeFile(file(f.root), JSON.stringify({ version: 1, folders: [{ id: 'a', name: 'A', parent: null }], assignments: { neutral: 'a' } }));
    assert.deepEqual(await readThemeFoldersFile(f.root), { manifest: { version: 2, folders: [{ id: 'a', name: 'A' }], assignments: { neutral: 'a' } } });
  } finally { await f.cleanup(); }
});

test('removed themes are ignored, then pruned on the next change; invalid files are preserved', async () => {
  const f = await workspace();
  try {
    await cp(resolve(f.root, 'themes/neutral'), resolve(f.root, 'themes/temporary'), { recursive: true });
    const folder = (await createThemeFolder(f.root, { name: 'Archive' })).folder;
    await assignThemeFolder(f.root, 'temporary', folder.id);
    await rm(resolve(f.root, 'themes/temporary'), { recursive: true });
    // Reading does not discard organization; the folder may only be briefly absent.
    assert.equal((await readThemeFolders(f.root)).assignments.temporary, folder.id);
    const { manifest } = await assignThemeFolder(f.root, 'neutral', folder.id);
    assert.deepEqual(manifest.assignments, { neutral: folder.id });
    assert.deepEqual(JSON.parse(await readFile(file(f.root), 'utf8')), manifest);

    for (const invalid of [
      '{"version":1,"folders":[{"id":"a","name":"A","parent":"b"},{"id":"b","name":"B","parent":"a"}]}',
      '{"version":1,"folders":[{"id":"a","name":"A","parent":null},{"id":"b","name":"a","parent":null}]}',
      '{"version":2,"folders":[{"id":"a","name":"A"},{"id":"b","name":"a"}]}',
      '{"version":2,"folders":[{"id":"a","name":"A"},{"id":"b","name":"B","parent":"a"}]}',
      '{"version":2,"folders":[],"assignments":{"neutral":"missing"}}',
      '{"version":3,"folders":[]}',
      'not json',
    ]) {
      await writeFile(file(f.root), invalid);
      await assert.rejects(readThemeFolders(f.root), /folders\.json/);
      await assert.rejects(createThemeFolder(f.root, { name: 'Do not replace' }), /folders\.json/);
      assert.equal(await readFile(file(f.root), 'utf8'), invalid);
    }
  } finally { await f.cleanup(); }
});

test('folder filters, counts, and picker labels use the single folder of each theme', () => {
  const manifest: ThemeFoldersManifest = { version: 2, folders: [{ id: 'acme', name: 'Acme' }, { id: 'empty', name: 'Empty' }], assignments: { neutral: 'acme', 'field-manual': 'acme', removed: 'acme' } };
  const listed = ['neutral', 'field-manual', 'civic-spectrum'];
  assert.deepEqual(listed.filter(id => inFolder(manifest, id, undefined)), listed, 'No folder filter lists every theme.');
  assert.deepEqual(listed.filter(id => inFolder(manifest, id, 'acme')), ['neutral', 'field-manual']);
  assert.deepEqual(listed.filter(id => inFolder(manifest, id, null)), ['civic-spectrum']);
  assert.deepEqual([...folderCounts(manifest, listed)], [['acme', 2], ['empty', 0]], 'Counts include only listed themes.');
  assert.equal(themeFolder(manifest, 'neutral')?.name, 'Acme');
  assert.equal(themeChoiceLabel({ id: 'neutral', name: 'Neutral' }, manifest), 'Neutral (Acme)');
  assert.equal(themeChoiceLabel({ id: 'civic-spectrum', name: 'Civic Spectrum' }, manifest), 'Civic Spectrum');
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

test('the local API creates, renames, assigns, and deletes folders with matching status codes and change events', async () => {
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
    assert.deepEqual(await good(await fetch(`${origin}/api/theme-folders`)), { version: 2, folders: [], assignments: {} });
    const { folder } = await good<{ folder: { id: string } }>(await send('/api/theme-folders', 'POST', { name: 'Brand' }), 201);
    const nested = await send('/api/theme-folders', 'POST', { name: 'Print', parent: folder.id });
    assert.equal(nested.status, 400);
    assert.match((await nested.json()).error, /single-level/);
    assert.equal((await send(`/api/theme-folders/${folder.id}`, 'PATCH', { parent: folder.id })).status, 400);
    assert.equal((await send('/api/theme-folders', 'POST', { name: 'Brand', extra: true })).status, 400);
    await good(await send('/api/themes/neutral/folder', 'PUT', { folderId: folder.id }));
    assert.equal((await send('/api/themes/neutral/folder', 'PUT', { folderId: folder.id, extra: 1 })).status, 400);
    assert.equal((await send('/api/themes/missing/folder', 'PUT', { folderId: null })).status, 404);
    const renamed = await good<{ manifest: ThemeFoldersManifest }>(await send(`/api/theme-folders/${folder.id}`, 'PATCH', { name: 'Printed' }));
    assert.equal(themeFolder(renamed.manifest, 'neutral')?.name, 'Printed');
    const removed = await good<{ manifest: ThemeFoldersManifest; unfiledThemes: number }>(await send(`/api/theme-folders/${folder.id}`, 'DELETE'));
    assert.equal(removed.unfiledThemes, 1);
    assert.deepEqual(removed.manifest, { version: 2, folders: [], assignments: {} });
    assert.equal(changes, 4, 'Every successful mutation notifies connected windows.');
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
    assert.ok(flat.length > 1 && flat.every(theme => theme.folder === null && theme.tags.length === 0), 'Without folders.json no theme is in a folder.');

    await assert.rejects(runThemesCli(['folders', 'create', 'Clients/Acme'], f.root), /single-level.*Create “Acme” instead/);
    await runThemesCli(['folders', 'create', 'Clients'], f.root);
    assert.deepEqual(json(), { id: 'clients', name: 'Clients' });
    await runThemesCli(['folders', 'create', 'Acme Reports'], f.root);
    json();
    await runThemesCli(['assign', 'field-manual', 'acme reports'], f.root);
    assert.deepEqual(json(), { id: 'field-manual', folder: 'Acme Reports' });
    await runThemesCli(['assign', 'neutral', 'Clients'], f.root);
    json();
    await runThemesCli(['assign', 'civic-spectrum', 'Clients'], f.root);
    json();
    // `themes tags` remains available and stores tags in tags.json; themes carry custom tags only.
    await runThemesCli(['tags', 'field-manual', '--set', 'Reports, Technical'], f.root);
    assert.deepEqual(json().tags, ['Reports', 'Technical']);
    await runThemesCli(['tags', 'neutral', '--add', 'reports', '--add', 'Warm'], f.root);
    assert.deepEqual(json().tags, ['Reports', 'Warm']);
    await runThemesCli(['tags', 'neutral', '--remove', 'WARM'], f.root);
    assert.deepEqual(json().tags, ['Reports']);

    // Folder and tag filters combine.
    await runThemesCli(['list', '--folder', 'Clients', '--json'], f.root);
    assert.deepEqual((json() as { id: string }[]).map(theme => theme.id).sort(), ['civic-spectrum', 'neutral']);
    await runThemesCli(['list', '--folder', 'Clients', '--tag', 'reports'], f.root);
    assert.deepEqual((json() as { id: string; folder: string; tags: string[] }[]).map(({ id, folder, tags }) => ({ id, folder, tags })), [{ id: 'neutral', folder: 'Clients', tags: ['Reports'] }]);
    await runThemesCli(['list', '--tag', 'reports'], f.root);
    assert.deepEqual((json() as { id: string }[]).map(theme => theme.id).sort(), ['field-manual', 'neutral']);
    await runThemesCli(['list', '--folder', 'Clients', '--language', 'english'], f.root);
    assert.deepEqual((json() as { id: string; language: string }[]).map(({ id, language }) => [id, language]).sort(), [['civic-spectrum', 'english'], ['neutral', 'english']]);
    await runThemesCli(['list', '--folder', 'Clients', '--language', 'arabic'], f.root);
    assert.deepEqual(json(), []);
    await runThemesCli(['list', '--folder', 'none'], f.root);
    assert.ok((json() as { folder: string | null }[]).every(theme => theme.folder === null));
    await assert.rejects(runThemesCli(['list', '--folder', 'Missing'], f.root), /No theme folder is named/);
    await assert.rejects(runThemesCli(['list', '--folder', 'Clients/Acme Reports'], f.root), /single-level.*“Acme Reports”/);
    await assert.rejects(runThemesCli(['inspect', 'neutral', '--tag', 'x'], f.root), /Usage/);

    await runThemesCli(['folders', 'rename', 'Acme Reports', 'Acme Corp'], f.root);
    assert.deepEqual(json(), { id: 'acme-reports', name: 'Acme Corp', previous: 'Acme Reports' });
    // The earlier spelling still renames; --parent is refused with guidance.
    await runThemesCli(['folders', 'update', 'Acme Corp', '--name', 'Acme'], f.root);
    assert.equal(json().name, 'Acme');
    for (const args of [['folders', 'update', 'Acme', '--parent', 'none'], ['folders', 'update', 'Acme', '--name', 'X', '--parent', 'Clients'], ['folders', 'create', 'X', '--parent', 'Clients']]) {
      await assert.rejects(runThemesCli(args, f.root), /single-level.*--parent is no longer supported.*folders rename/);
    }
    await assert.rejects(runThemesCli(['folders', 'rename', 'Acme'], f.root), /Usage/);
    await runThemesCli(['folders'], f.root);
    assert.deepEqual(json().folders.map((folder: { name: string; themes: string[] }) => [folder.name, folder.themes]), [['Acme', ['field-manual']], ['Clients', ['civic-spectrum', 'neutral']]]);
    await runThemesCli(['folders', 'delete', 'Clients'], f.root);
    assert.deepEqual(json(), { deleted: 'clients', name: 'Clients', unfiledThemes: 2 });
    await assert.rejects(runThemesCli(['assign', 'neutral', 'Nowhere'], f.root), /No theme folder is named/);

    // A nested file from an earlier version lists flattened, with a report, until the next change saves it.
    await writeFile(file(f.root), JSON.stringify({ version: 1, folders: [{ id: 'brands', name: 'Brands', parent: null }, { id: 'narra', name: 'Narra', parent: 'brands' }], assignments: { neutral: 'narra' } }));
    await runThemesCli(['folders', 'list'], f.root);
    const listed = json();
    assert.deepEqual(listed.folders, [{ id: 'narra', name: 'Narra', themes: ['neutral'] }]);
    assert.deepEqual({ flattened: listed.migration.flattened, removed: listed.migration.removed, saved: listed.migration.saved }, { flattened: [{ id: 'narra', name: 'Narra', from: 'Brands/Narra' }], removed: [{ id: 'brands', name: 'Brands' }], saved: false });
    await runThemesCli(['list', '--folder', 'Narra'], f.root);
    assert.deepEqual((json() as { id: string }[]).map(theme => theme.id), ['neutral']);

    // An unreadable organization file never hides the catalog itself, or tags kept in tags.json.
    await writeFile(file(f.root), '{"version":2}');
    t.mock.method(console, 'error', () => {});
    await runThemesCli(['list'], f.root);
    assert.ok((json() as unknown[]).length > 1);
    await runThemesCli(['list', '--tag', 'Reports'], f.root);
    assert.deepEqual((json() as { id: string }[]).map(theme => theme.id).sort(), ['field-manual', 'neutral']);
    await assert.rejects(runThemesCli(['list', '--folder', 'Clients'], f.root), /folders\.json is invalid/);
    await writeFile(resolve(f.root, 'tags.json'), '{"version":3}');
    await runThemesCli(['list'], f.root);
    assert.ok((json() as unknown[]).length > 1);
    await assert.rejects(runThemesCli(['list', '--tag', 'Reports'], f.root), /tags\.json is invalid/);
  } finally { await f.cleanup(); }
});
