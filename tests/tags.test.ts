import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, projectRoot } from './helpers';
import {
  changeItemTags, createCustomTag, deleteCustomTag, readTags, readTagsFile, setItemTags,
} from '../src/server/tags';
import { handleTagsRequest } from '../src/server/tags-http';
import { runTagsCli } from '../src/server/tags-cli';
import { runTemplatesCli } from '../src/server/templates-cli';
import { createThemeFolder, readThemeFolders } from '../src/server/theme-folders';
import { deleteDocument, duplicateDocument, restoreDocument } from '../src/server/documents';
import { hasTags, normalizeTags, standardTagGroups, standardTags, tagCounts, tagKey, tagLabel, type TagsManifest } from '../src/shared/tags';
import { excludedFromCopy, forbiddenInPackage } from '../scripts/package-rules.mjs';

/** A fixture with one document, the checkout's themes, and two templates, without tags. */
async function workspace() {
  const f = await fixture();
  await rm(resolve(f.root, 'themes/folders.json'), { force: true });
  for (const id of ['invoice', 'pitch-deck']) await cp(resolve(projectRoot, 'templates', id), resolve(f.root, 'templates', id), { recursive: true });
  return f;
}
const tagsPath = (root: string) => resolve(root, 'tags.json');
const foldersPath = (root: string) => resolve(root, 'themes/folders.json');

test('the standard vocabulary is concise, grouped, and unambiguous', () => {
  assert.ok(standardTags.length >= 30 && standardTags.length <= 45, `${standardTags.length} standard tags`);
  const keys = new Map<string, string>();
  for (const tag of standardTags) {
    assert.match(tag.id, /^[a-z]+(?:-[a-z]+)*$/, 'IDs are stable lowercase slugs');
    assert.ok(standardTagGroups.some(group => group.id === tag.group));
    for (const spelling of [tag.id, tag.label, ...(tag.aliases ?? [])]) {
      const owner = keys.get(tagKey(spelling));
      assert.ok(!owner || owner === tag.id, `“${spelling}” names both ${owner} and ${tag.id}`);
      keys.set(tagKey(spelling), tag.id);
    }
  }
  for (const group of standardTagGroups) assert.ok(standardTags.some(tag => tag.group === group.id), group.id);
  assert.ok(!standardTags.some(tag => ['presentation', 'document', 'deck'].includes(tag.id)), 'Format is already known and never a tag.');
});

test('tags resolve to standard IDs, dedupe without regard to case, and keep one status', () => {
  assert.deepEqual(normalizeTags(['  Annual   report ', 'annual REPORT', 'REPORT', 'In Review', 'cv', 'Résumé', 'Human resources']).tags, ['Annual report', 'report', 'in-review', 'cv', 'hr']);
  assert.deepEqual(normalizeTags(['reports'], ['Reports']), { tags: ['Reports'], created: [] });
  assert.deepEqual(normalizeTags(['Project Phoenix', 'finance']).created, ['Project Phoenix']);
  // A later status replaces an earlier one, so draft → final needs only an add.
  assert.deepEqual(normalizeTags(['draft', 'finance', 'final']).tags, ['finance', 'final']);
  assert.throws(() => normalizeTags(['a,b']), /without commas/);
  assert.throws(() => normalizeTags(['x'.repeat(41)]), /40 characters/);
  assert.throws(() => normalizeTags(Array.from({ length: 21 }, (_, index) => `Tag ${index}`)), /up to 20/);
  assert.equal(tagLabel('in-review'), 'In review');
  assert.equal(tagLabel('Project Phoenix'), 'Project Phoenix');
  assert.ok(hasTags(['report', 'Client X'], ['Report', 'client x']));
  assert.ok(!hasTags(['report'], ['report', 'finance']));
  const manifest: TagsManifest = { version: 1, custom: [], documents: { a: ['finance', 'report'], b: ['report', 'Zeta'] }, themes: {}, templates: {} };
  assert.deepEqual(tagCounts(manifest, 'documents').map(({ label, count, group }) => [label, count, group]), [['Report', 2, 'type'], ['Finance', 1, 'area'], ['Zeta', 1, null]]);
});

test('documents, themes, and templates keep tags and a shared custom vocabulary in tags.json', async () => {
  const f = await workspace();
  try {
    assert.deepEqual(await readTags(f.root), { version: 1, custom: [], documents: {}, themes: {}, templates: {} });
    let result = await setItemTags(f.root, 'document', 'proof', ['Report', 'finance', 'Client Acme']);
    assert.deepEqual(result.tags, ['report', 'finance', 'Client Acme']);
    await setItemTags(f.root, 'theme', 'neutral', ['client acme', 'Minimal']);
    await setItemTags(f.root, 'template', 'invoice', ['invoice', 'Finance']);
    const manifest = await readTagsFile(f.root);
    assert.deepEqual(manifest, {
      version: 1, custom: ['Client Acme'],
      documents: { proof: ['report', 'finance', 'Client Acme'] },
      themes: { neutral: ['Client Acme', 'minimal'] },
      templates: { invoice: ['invoice', 'finance'] },
    });
    assert.deepEqual(JSON.parse(await readFile(tagsPath(f.root), 'utf8')), manifest);

    // Presentations are documents; a missing item or a malformed request changes nothing.
    assert.equal((await setItemTags(f.root, 'presentation', 'proof', ['draft'])).kind, 'documents');
    await assert.rejects(setItemTags(f.root, 'document', 'missing', ['draft']), { status: 404 });
    await assert.rejects(setItemTags(f.root, 'folder', 'proof', ['draft']), { status: 400 });
    await assert.rejects(setItemTags(f.root, 'document', 'proof', 'draft'), { status: 400 });

    // Removing a custom tag from every item keeps it in the vocabulary for reuse.
    await changeItemTags(f.root, 'document', 'proof', { add: ['Client Acme'] });
    result = await changeItemTags(f.root, 'theme', 'neutral', { remove: ['CLIENT ACME'] });
    assert.deepEqual(result.tags, ['minimal']);
    await changeItemTags(f.root, 'document', 'proof', { set: ['Client acme'] });
    assert.deepEqual((await readTagsFile(f.root)).custom, ['Client acme'], 'The only item using a tag may correct its capitalization.');
    assert.deepEqual((await changeItemTags(f.root, 'document', 'proof', { add: ['in review', 'final'] })).tags, ['Client acme', 'final']);

    await createCustomTag(f.root, 'Project Phoenix');
    await assert.rejects(createCustomTag(f.root, 'project phoenix'), { status: 409 });
    await assert.rejects(createCustomTag(f.root, 'Draft'), /standard tag draft/);
    assert.deepEqual((await setItemTags(f.root, 'template', 'pitch-deck', ['PROJECT PHOENIX'])).tags, ['Project Phoenix']);
    await assert.rejects(deleteCustomTag(f.root, 'Project Phoenix'), /used by 1 item/);
    await assert.rejects(deleteCustomTag(f.root, 'final'), /cannot be deleted/);
    const removed = await deleteCustomTag(f.root, 'project phoenix', { untag: true });
    assert.deepEqual(removed.untagged, [{ kind: 'templates', id: 'pitch-deck' }]);
    assert.equal(removed.manifest.templates['pitch-deck'], undefined);
    assert.ok(!removed.manifest.custom.includes('Project Phoenix'));
    await assert.rejects(deleteCustomTag(f.root, 'Never existed'), { status: 404 });
  } finally { await f.cleanup(); }
});

test('removed items keep their tags until the next change; invalid files are reported and preserved', async () => {
  const f = await workspace();
  try {
    await cp(resolve(f.root, 'templates/invoice'), resolve(f.root, 'templates/temporary'), { recursive: true });
    await setItemTags(f.root, 'template', 'temporary', ['invoice']);
    await rm(resolve(f.root, 'templates/temporary'), { recursive: true });
    assert.deepEqual((await readTags(f.root)).templates.temporary, ['invoice']);
    const { manifest } = await setItemTags(f.root, 'document', 'proof', ['memo']);
    assert.deepEqual(manifest.templates, {});

    // Hand edits are accepted when valid: labels resolve and custom tags join the vocabulary.
    await writeFile(tagsPath(f.root), JSON.stringify({ version: 1, documents: { proof: ['Draft', 'Board pack'] } }));
    assert.deepEqual(await readTagsFile(f.root), { version: 1, custom: ['Board pack'], documents: { proof: ['draft', 'Board pack'] }, themes: {}, templates: {} });

    for (const invalid of [
      '{"version":2}', '{"version":1,"extra":{}}', '{"version":1,"documents":{"Proof":["draft"]}}',
      '{"version":1,"documents":{"proof":"draft"}}', '{"version":1,"documents":{"proof":["a,b"]}}', 'not json',
    ]) {
      await writeFile(tagsPath(f.root), invalid);
      await assert.rejects(readTags(f.root), /tags\.json/);
      await assert.rejects(setItemTags(f.root, 'document', 'proof', ['draft']), /tags\.json/);
      assert.equal(await readFile(tagsPath(f.root), 'utf8'), invalid);
    }
  } finally { await f.cleanup(); }
});

test('legacy theme tags in themes/folders.json are read, then moved into tags.json on the next change', async () => {
  const f = await workspace();
  try {
    const legacy = {
      version: 1, folders: [{ id: 'brand', name: 'Brand', parent: null }], assignments: { neutral: 'brand' },
      tags: { neutral: ['Reports', 'Technical'], 'field-manual': ['reports', 'Warm'], 'removed-theme': ['Old'] },
    };
    await writeFile(foldersPath(f.root), JSON.stringify(legacy));
    // Reading changes nothing on disk.
    assert.deepEqual((await readTags(f.root)).themes, { neutral: ['Reports', 'technical'], 'field-manual': ['Reports', 'Warm'], 'removed-theme': ['Old'] });
    await assert.rejects(readFile(tagsPath(f.root)), { code: 'ENOENT' });
    assert.deepEqual(JSON.parse(await readFile(foldersPath(f.root), 'utf8')), legacy);
    // Folder changes leave legacy tags in place until tags take them over.
    await createThemeFolder(f.root, { name: 'Print' });
    assert.deepEqual((await readThemeFolders(f.root)).tags, { neutral: legacy.tags.neutral, 'field-manual': legacy.tags['field-manual'] }, 'Folder changes still prune removed themes.');

    await setItemTags(f.root, 'document', 'proof', ['report']);
    const moved = await readTagsFile(f.root);
    assert.deepEqual(moved.themes, { 'field-manual': ['Reports', 'Warm'], neutral: ['Reports', 'technical'] }, 'Existing themes keep every tag; removed themes are pruned.');
    assert.deepEqual(moved.custom, ['Reports', 'Warm']);
    const folders = await readThemeFolders(f.root);
    assert.equal(folders.tags, undefined);
    assert.deepEqual(folders.assignments, { neutral: 'brand' });
    assert.deepEqual(folders.folders.map(folder => folder.name), ['Brand', 'Print']);

    // tags.json wins for a theme it already mentions; other legacy themes are merged.
    await writeFile(foldersPath(f.root), JSON.stringify({ ...legacy, tags: { neutral: ['Legacy only'], 'civic-spectrum': ['Bold'] } }));
    assert.deepEqual((await readTags(f.root)).themes, { 'field-manual': ['Reports', 'Warm'], neutral: ['Reports', 'technical'], 'civic-spectrum': ['bold'] });

    // An unreadable folders file never blocks tags, and it is left for the user to repair.
    await writeFile(foldersPath(f.root), '{"version":1}');
    assert.deepEqual((await setItemTags(f.root, 'theme', 'neutral', ['formal'])).tags, ['formal']);
    assert.equal(await readFile(foldersPath(f.root), 'utf8'), '{"version":1}');
  } finally { await f.cleanup(); }
});

test('tags follow a document through duplication, Trash, and restore', async () => {
  const f = await workspace();
  try {
    await setItemTags(f.root, 'document', 'proof', ['report', 'Client Acme']);
    const copy = await duplicateDocument(f.root, 'proof', 'Proof document');
    assert.deepEqual((await readTags(f.root)).documents[copy.id], ['report', 'Client Acme']);
    const { restoreId } = await deleteDocument(f.root, 'proof');
    // Another change while the document is in Trash prunes its entry...
    await setItemTags(f.root, 'document', copy.id, ['memo']);
    assert.equal((await readTags(f.root)).documents.proof, undefined);
    // ...and restoring brings the tags back from the Trash receipt.
    await restoreDocument(f.root, restoreId);
    assert.deepEqual((await readTags(f.root)).documents.proof, ['report', 'Client Acme']);
  } finally { await f.cleanup(); }
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

test('the local API reads and replaces tags with matching status codes and change events', async () => {
  const f = await workspace();
  let changes = 0;
  const server = createServer((req, res) => {
    void handleTagsRequest(f.root, req, res, new URL(req.url!, 'http://localhost'), json, body, () => { changes++; })
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
    assert.deepEqual(await good(await fetch(`${origin}/api/tags`)), { version: 1, custom: [], documents: {}, themes: {}, templates: {} });
    const tagged = await good<{ tags: string[]; manifest: TagsManifest }>(await send('/api/tags/documents/proof', 'PUT', { tags: ['Report', 'report', 'Internal'] }));
    assert.deepEqual(tagged.tags, ['report', 'internal']);
    assert.deepEqual(tagged.manifest.documents.proof, ['report', 'internal']);
    await good(await send('/api/tags/templates/invoice', 'PUT', { tags: ['Invoice'] }));
    // The earlier theme route stays an alias for theme tags.
    const theme = await good<{ manifest: TagsManifest }>(await send('/api/themes/neutral/tags', 'PUT', { tags: ['Brand', 'brand', 'Print'] }));
    assert.deepEqual(theme.manifest.themes.neutral, ['Brand', 'Print']);
    assert.equal((await send('/api/tags/documents/missing', 'PUT', { tags: [] })).status, 404);
    assert.equal((await send('/api/tags/documents/proof', 'PUT', { tags: ['x'], extra: true })).status, 400);
    assert.equal((await send('/api/tags/documents/proof', 'PUT', { tags: ['a,b'] })).status, 400);
    assert.equal((await send('/api/tags/folders/proof', 'PUT', { tags: [] })).status, 404);
    assert.equal(changes, 3, 'Every successful change notifies connected windows.');
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

test('the tags CLI lists the vocabulary, edits items, finds them, and filters template lists', { timeout: 60_000 }, async t => {
  const f = await workspace();
  const json = output(t);
  try {
    await runTagsCli(['list'], f.root);
    const vocabulary = json() as { file: string; standard: { group: string; fits: string[]; tags: { id: string; count: number; counts: Record<string, number> }[] }[]; custom: unknown[] };
    assert.equal(vocabulary.file, 'tags.json');
    assert.deepEqual(vocabulary.standard.map(group => group.group), standardTagGroups.map(group => group.id));
    assert.deepEqual(vocabulary.standard.find(group => group.group === 'status')!.fits, ['document']);
    assert.deepEqual(vocabulary.standard[0].tags[0], { id: 'report', label: 'Report', count: 0, counts: { documents: 0, themes: 0, templates: 0 } });
    assert.deepEqual(vocabulary.custom, []);

    await runTagsCli(['add', 'presentation', 'proof', 'report,finance', 'Client Acme', 'draft'], f.root);
    assert.deepEqual(json(), { kind: 'document', id: 'proof', tags: ['report', 'finance', 'Client Acme', 'draft'] });
    await runTagsCli(['add', 'document', 'proof', 'final'], f.root);
    assert.deepEqual(json().tags, ['report', 'finance', 'Client Acme', 'final'], 'A new status replaces the old one.');
    await runTagsCli(['remove', 'document', 'proof', 'Finance'], f.root);
    assert.deepEqual(json().tags, ['report', 'Client Acme', 'final']);
    await runTagsCli(['add', 'template', 'invoice', 'invoice', 'finance'], f.root);
    json();
    await runTagsCli(['add', 'theme', 'neutral', 'minimal', 'client acme'], f.root);
    assert.deepEqual(json().tags, ['minimal', 'Client Acme']);
    await runTagsCli(['show', 'theme', 'neutral'], f.root);
    assert.deepEqual(json(), { kind: 'theme', id: 'neutral', tags: ['minimal', 'Client Acme'] });

    await runTagsCli(['find', 'client acme'], f.root);
    assert.deepEqual(json(), [
      { kind: 'document', id: 'proof', name: null, format: 'document', projectId: 'test-project', tags: ['report', 'Client Acme', 'final'] },
      { kind: 'theme', id: 'neutral', tags: ['minimal', 'Client Acme'] },
    ]);
    await runTagsCli(['find', 'Client Acme', 'Report', '--kind', 'document'], f.root);
    assert.deepEqual((json() as { id: string }[]).map(item => item.id), ['proof']);
    await runTagsCli(['list', '--kind', 'templates'], f.root);
    const templates = json() as { standard: { tags: { id: string; count: number; counts?: unknown }[] }[]; custom: { tag: string; count: number }[] };
    assert.deepEqual(templates.standard.flatMap(group => group.tags).filter(tag => tag.count).map(tag => [tag.id, tag.count, tag.counts]), [['invoice', 1, undefined], ['finance', 1, undefined]]);
    assert.deepEqual(templates.custom, [{ tag: 'Client Acme', count: 0 }]);

    await runTagsCli(['set', 'theme', 'neutral'], f.root);
    assert.deepEqual(json().tags, []);
    await runTagsCli(['create', 'Project Phoenix'], f.root);
    assert.deepEqual(json(), { created: 'Project Phoenix' });
    await runTagsCli(['delete', 'Client Acme', '--untag'], f.root);
    assert.deepEqual(json(), { deleted: 'Client Acme', untagged: [{ kind: 'document', id: 'proof' }] });

    await runTemplatesCli(['list', '--tag', 'Invoice'], f.root);
    assert.deepEqual((json() as { id: string; tags: string[] }[]).map(({ id, tags }) => ({ id, tags })), [{ id: 'invoice', tags: ['invoice', 'finance'] }]);
    await runTemplatesCli(['list'], f.root);
    assert.deepEqual((json() as { id: string; tags: string[] }[]).map(({ id, tags }) => [id, tags.length]), [['invoice', 2], ['pitch-deck', 0]]);
    await assert.rejects(runTemplatesCli(['inspect', 'invoice', '--tag', 'x'], f.root), /Usage/);

    for (const args of [['add', 'document', 'proof'], ['show', 'document'], ['find'], ['delete', 'x', 'y'], ['show', 'theme', 'neutral', '--kind', 'theme'], ['add', 'document', 'proof', 'x', '--untag'], ['unknown']]) {
      await assert.rejects(runTagsCli(args, f.root), /Usage/, args.join(' '));
    }
    await assert.rejects(runTagsCli(['add', 'folder', 'proof', 'x'], f.root), /Choose document, presentation, theme, or template/);
    await assert.rejects(runTagsCli(['show', 'document', 'missing'], f.root), /no longer exists/);
  } finally { await f.cleanup(); }
});

test('workspace tags, folders, and projects never enter the starter library or a package', () => {
  const archive = 'vendor/formepdf/core.tgz';
  for (const name of ['tags.json', 'themes/folders.json', 'projects.json', archive, 'docs/showcase/a.pdf']) assert.ok(excludedFromCopy(name, archive), name);
  for (const name of ['themes/neutral/index.ts', 'templates/invoice/template.json', 'docs/THEMES.md', 'templates/tags.json/x']) assert.ok(!excludedFromCopy(name, archive), name);
  for (const name of ['tags.json', 'starter/tags.json', 'starter/themes/folders.json', 'projects.json', 'documents/x/index.tsx']) assert.ok(forbiddenInPackage(name, archive), name);
  for (const name of ['starter/projects.json', 'starter/themes/neutral/index.ts', 'src/shared/tags.ts', 'docs/TAGS.md']) assert.ok(!forbiddenInPackage(name, archive), name);
});
