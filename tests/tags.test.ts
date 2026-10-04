import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, projectRoot } from './helpers';
import {
  changeItemTags, createCustomTag, deleteCustomTag, migrateTags, readTags, readTagsFile, restoreDocumentTags, setDocumentStatus, setItemDetails, setItemTags,
} from '../src/server/tags';
import { legacyStandardTags, migrateItemTags } from '../src/server/tags-legacy';
import { handleTagsRequest } from '../src/server/tags-http';
import { runTagsCli } from '../src/server/tags-cli';
import { runTemplatesCli } from '../src/server/templates-cli';
import { runThemesCli } from '../src/server/themes-cli';
import { createThemeFolder, readThemeFolders } from '../src/server/theme-folders';
import { deleteDocument, duplicateDocument, restoreDocument } from '../src/server/documents';
import { sourceLanguage, sourceProse, themeLanguage } from '../src/server/language';
import { classifyLanguage, countScripts } from '../src/shared/language';
import {
  documentStatus, documentStatuses, hasTags, resolveTags, standardType, standardTypes, tagCounts, tagKey, typeCounts, type TagsManifest,
} from '../src/shared/tags';
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
const empty: TagsManifest = { version: 2, custom: [], documents: {}, themes: {}, templates: {}, status: {} };

test('types are few, unambiguous, and absorb the earlier vocabulary through aliases', () => {
  assert.ok(standardTypes.length >= 6 && standardTypes.length <= 9, `${standardTypes.length} types`);
  const keys = new Map<string, string>();
  for (const type of standardTypes) {
    assert.match(type.id, /^[a-z]+(?:-[a-z]+)*$/, 'IDs are stable lowercase slugs');
    for (const spelling of [type.id, type.label, ...type.aliases]) {
      const owner = keys.get(tagKey(spelling));
      assert.ok(!owner || owner === type.id, `“${spelling}” names both ${owner} and ${type.id}`);
      keys.set(tagKey(spelling), type.id);
    }
  }
  // Every earlier type has a home, except Contract, which stays a custom tag.
  const mapped = Object.fromEntries(legacyStandardTags.filter(tag => tag.group === 'type').map(tag => [tag.id, standardType(tag.id)?.id ?? null]));
  assert.deepEqual(mapped, {
    report: 'report', proposal: 'proposal', brief: 'brief', plan: 'proposal', minutes: 'minutes', memo: 'brief', letter: 'letter', policy: 'guide', guide: 'guide',
    invoice: 'invoice', quotation: 'invoice', contract: null, cv: 'cv', profile: 'brief', newsletter: 'article', 'case-study': 'report', pitch: 'proposal', training: 'guide',
  });
  for (const word of ['quote', 'resume', 'handbook', 'manual', 'one-pager', 'essay', 'meeting minutes']) assert.ok(standardType(word), word);
  // Labels that become custom tags, and status or language words, never select a type.
  for (const tag of legacyStandardTags.filter(tag => tag.group !== 'type')) assert.equal(standardType(tag.label), undefined, tag.label);
  assert.ok(!standardTypes.some(type => ['presentation', 'document', 'deck'].includes(type.id)), 'Format is already known and never a type.');
  assert.deepEqual(documentStatuses.map(status => status.id), ['draft', 'in-review', 'final', 'archived']);
  assert.equal(documentStatus('In Review'), 'in-review');
  assert.equal(documentStatus('review'), 'in-review');
});

test('typed input selects one type, keeps custom tags, and refuses status and language words', () => {
  assert.deepEqual(resolveTags('documents', ['  Client   Acme ', 'client ACME', 'Memo', 'REPORT']).tags, ['report', 'Client Acme'], 'A later type replaces an earlier one.');
  assert.deepEqual(resolveTags('documents', ['acme'], ['Acme']), { type: undefined, custom: ['Acme'], tags: ['Acme'], created: [] });
  assert.deepEqual(resolveTags('templates', ['quote', 'Project Phoenix']).created, ['Project Phoenix']);
  assert.deepEqual(resolveTags('themes', ['report', 'Minimal']).tags, ['Report', 'Minimal'], 'Themes have no type; type words become custom tags.');
  assert.throws(() => resolveTags('documents', ['final']), /is a status.*tags status <document-id> final/);
  assert.throws(() => resolveTags('themes', ['Arabic']), /Language is detected/);
  assert.deepEqual(resolveTags('themes', ['Draft'], [], ['Draft']).tags, ['Draft'], 'An existing custom tag may keep a retired word.');
  assert.throws(() => resolveTags('documents', ['a,b']), /without commas/);
  assert.throws(() => resolveTags('documents', ['x'.repeat(41)]), /40 characters/);
  assert.throws(() => resolveTags('documents', Array.from({ length: 21 }, (_, index) => `Tag ${index}`)), /up to 20/);
  assert.ok(hasTags(['report', 'Client X'], ['Report', 'client x', 'case study']));
  assert.ok(hasTags(['Report', 'Minimal'], ['report']), 'A theme’s custom “Report” matches the report type.');
  assert.ok(!hasTags(['report'], ['report', 'Finance']));
  const manifest: TagsManifest = { ...empty, documents: { a: ['report', 'Finance'], b: ['report', 'Zeta'], c: ['brief'] } };
  assert.deepEqual(tagCounts(manifest, 'documents').map(({ tag, count }) => [tag, count]), [['Finance', 1], ['Zeta', 1]]);
  assert.deepEqual(typeCounts(manifest, 'documents').map(({ id, count }) => [id, count]), [['report', 2], ['brief', 1]]);
});

test('version 1 tags migrate on read without loss, and persist as version 2 on the next change', async () => {
  // Every rule in one file: types, status, language, other groups, custom tags, and themes.
  const v1 = {
    version: 1, custom: ['Showcase', 'Project Phoenix'],
    documents: {
      proof: ['memo', 'report', 'plan', 'brief', 'contract', 'finance', 'executive', 'arabic', 'draft', 'final', 'in-review', 'Showcase'],
      archived: ['Draft', 'archived', 'Final', 'english'],
      untyped: ['article', 'contract', 'formal'],
      labelled: ['Project Phoenix', 'Case study', 'human resources'],
    },
    themes: { neutral: ['report', 'minimal', 'english', 'draft', 'technical'] },
    templates: { invoice: ['quotation', 'invoice', 'finance', 'final', 'bilingual'] },
  };
  assert.deepEqual(migrateItemTags('documents', v1.documents.proof), { tags: ['brief', 'Report', 'Plan', 'Contract', 'Finance', 'Executive', 'Showcase'], status: 'final' });
  assert.deepEqual(migrateItemTags('documents', v1.documents.archived), { tags: [], status: 'archived' });
  assert.deepEqual(migrateItemTags('documents', v1.documents.untyped), { tags: ['article', 'Contract', 'Formal'] });
  assert.deepEqual(migrateItemTags('documents', v1.documents.labelled), { tags: ['report', 'Project Phoenix', 'HR'] });
  assert.deepEqual(migrateItemTags('themes', v1.themes.neutral), { tags: ['Report', 'Minimal', 'Draft', 'Technical'] });
  assert.deepEqual(migrateItemTags('templates', v1.templates.invoice), { tags: ['invoice', 'Finance', 'Final'] });
  const migrated = migrateTags(v1);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.status, { proof: 'final', archived: 'archived' });
  assert.deepEqual(migrated.custom, ['Showcase', 'Project Phoenix', 'Report', 'Plan', 'Contract', 'Finance', 'Executive', 'Formal', 'HR', 'Minimal', 'Draft', 'Technical', 'Final']);

  const f = await workspace();
  try {
    for (const id of ['archived', 'untyped', 'labelled']) await cp(resolve(f.root, 'documents/proof'), resolve(f.root, 'documents', id), { recursive: true });
    const original = JSON.stringify(v1);
    await writeFile(tagsPath(f.root), original);
    // Reading migrates in memory only.
    assert.deepEqual(await readTags(f.root), migrated);
    assert.equal(await readFile(tagsPath(f.root), 'utf8'), original);
    // The next change saves version 2; a migrated custom tag that names a type keeps its meaning.
    const changed = await changeItemTags(f.root, 'document', 'proof', { remove: ['Contract'] });
    assert.deepEqual([changed.type, changed.tags, changed.status], ['brief', ['Report', 'Plan', 'Finance', 'Executive', 'Showcase'], 'final']);
    const saved = JSON.parse(await readFile(tagsPath(f.root), 'utf8'));
    assert.equal(saved.version, 2);
    assert.deepEqual(saved.status, { archived: 'archived', proof: 'final' });
    assert.deepEqual(saved.themes.neutral, ['Report', 'Minimal', 'Draft', 'Technical']);
    assert.deepEqual(await readTagsFile(f.root), saved, 'Version 2 reads back unchanged.');
    assert.ok(hasTags(saved.documents.proof, ['Report', 'brief']));
  } finally { await f.cleanup(); }
});

test('documents, themes, and templates keep a type, custom tags, and a status in tags.json', async () => {
  const f = await workspace();
  try {
    assert.deepEqual(await readTags(f.root), empty);
    let result = await setItemTags(f.root, 'document', 'proof', ['Report', 'Client Acme']);
    assert.deepEqual([result.type, result.tags], ['report', ['Client Acme']]);
    await setItemTags(f.root, 'theme', 'neutral', ['client acme', 'Minimal']);
    await setItemTags(f.root, 'template', 'invoice', ['quote', 'Finance']);
    await setDocumentStatus(f.root, 'proof', 'In review');
    const manifest = await readTagsFile(f.root);
    assert.deepEqual(manifest, {
      version: 2, custom: ['Client Acme', 'Minimal', 'Finance'],
      documents: { proof: ['report', 'Client Acme'] }, themes: { neutral: ['Client Acme', 'Minimal'] }, templates: { invoice: ['invoice', 'Finance'] },
      status: { proof: 'in-review' },
    });
    assert.deepEqual(JSON.parse(await readFile(tagsPath(f.root), 'utf8')), manifest);

    // Details replace each given field; custom tags are taken as written.
    result = await setItemDetails(f.root, 'presentation', 'proof', { type: 'minutes', tags: ['Client acme', 'Board'], status: 'final' });
    assert.deepEqual([result.kind, result.type, result.tags, result.status], ['documents', 'minutes', ['Client Acme', 'Board'], 'final']);
    assert.deepEqual((await readTagsFile(f.root)).custom, ['Client Acme', 'Minimal', 'Finance', 'Board'], 'A tag used elsewhere keeps its established spelling.');
    assert.deepEqual((await readTagsFile(f.root)).documents.proof, ['minutes', 'Client Acme', 'Board']);
    await assert.rejects(setItemDetails(f.root, 'document', 'proof', { tags: ['memo'] }), /“memo” is the Brief type/);
    await assert.rejects(setItemDetails(f.root, 'theme', 'neutral', { type: 'report' }), /Themes have no type/);
    await assert.rejects(setItemDetails(f.root, 'template', 'invoice', { status: 'final' }), /Only documents/);
    await assert.rejects(setItemDetails(f.root, 'document', 'proof', { type: 'spreadsheet' }), /not a type/);
    result = await setItemDetails(f.root, 'document', 'proof', { type: null, status: null });
    assert.deepEqual([result.type, result.status, result.tags], [undefined, undefined, ['Client Acme', 'Board']]);

    // Missing items or malformed requests change nothing.
    await assert.rejects(setItemTags(f.root, 'document', 'missing', ['brief']), { status: 404 });
    await assert.rejects(setItemTags(f.root, 'folder', 'proof', ['brief']), { status: 400 });
    await assert.rejects(setItemTags(f.root, 'document', 'proof', 'brief'), { status: 400 });
    await assert.rejects(setDocumentStatus(f.root, 'proof', 'shipped'), /Choose a status/);

    // Removing a custom tag from every item keeps it in the vocabulary for reuse.
    result = await changeItemTags(f.root, 'theme', 'neutral', { remove: ['CLIENT ACME'] });
    assert.deepEqual(result.tags, ['Minimal']);
    await createCustomTag(f.root, 'Project Phoenix');
    await assert.rejects(createCustomTag(f.root, 'project phoenix'), { status: 409 });
    await assert.rejects(createCustomTag(f.root, 'Memo'), /type brief/);
    await assert.rejects(createCustomTag(f.root, 'Final'), /is a status/);
    assert.deepEqual((await setItemTags(f.root, 'template', 'pitch-deck', ['PROJECT PHOENIX', 'pitch deck'])).tags, ['Project Phoenix']);
    await assert.rejects(deleteCustomTag(f.root, 'Project Phoenix'), /used by 1 item/);
    await assert.rejects(deleteCustomTag(f.root, 'report'), /Types are part of OpenDoc/);
    const removed = await deleteCustomTag(f.root, 'project phoenix', { untag: true });
    assert.deepEqual(removed.untagged, [{ kind: 'templates', id: 'pitch-deck' }]);
    assert.deepEqual(removed.manifest.templates['pitch-deck'], ['proposal'], 'Untagging keeps the type.');
    await assert.rejects(deleteCustomTag(f.root, 'Never existed'), { status: 404 });
  } finally { await f.cleanup(); }
});

test('removed items keep their entries until the next change; invalid files are reported and preserved', async () => {
  const f = await workspace();
  try {
    await cp(resolve(f.root, 'templates/invoice'), resolve(f.root, 'templates/temporary'), { recursive: true });
    await cp(resolve(f.root, 'documents/proof'), resolve(f.root, 'documents/gone'), { recursive: true });
    await setItemTags(f.root, 'template', 'temporary', ['invoice']);
    await setDocumentStatus(f.root, 'gone', 'final');
    await rm(resolve(f.root, 'templates/temporary'), { recursive: true });
    await rm(resolve(f.root, 'documents/gone'), { recursive: true });
    assert.deepEqual((await readTags(f.root)).templates.temporary, ['invoice']);
    const { manifest } = await setItemTags(f.root, 'document', 'proof', ['memo']);
    assert.deepEqual([manifest.templates, manifest.status], [{}, {}]);

    // Valid hand edits are accepted: custom tags join the vocabulary.
    await writeFile(tagsPath(f.root), JSON.stringify({ version: 2, documents: { proof: ['brief', 'Board pack'] }, status: { proof: 'draft' } }));
    assert.deepEqual(await readTagsFile(f.root), { ...empty, custom: ['Board pack'], documents: { proof: ['brief', 'Board pack'] }, status: { proof: 'draft' } });

    for (const invalid of [
      '{"version":3}', '{"version":2,"extra":{}}', '{"version":2,"documents":{"Proof":["brief"]}}', '{"version":2,"documents":{"proof":"brief"}}',
      '{"version":2,"documents":{"proof":["a,b"]}}', '{"version":2,"documents":{"proof":["brief","report"]}}', '{"version":2,"status":{"proof":"Final"}}',
      '{"version":1,"documents":{"proof":["a,b"]}}', 'not json',
    ]) {
      await writeFile(tagsPath(f.root), invalid);
      await assert.rejects(readTags(f.root), /tags\.json/, invalid);
      await assert.rejects(setItemTags(f.root, 'document', 'proof', ['brief']), /tags\.json/);
      assert.equal(await readFile(tagsPath(f.root), 'utf8'), invalid);
    }
  } finally { await f.cleanup(); }
});

test('legacy theme tags in themes/folders.json migrate, then move into tags.json on the next change', async () => {
  const f = await workspace();
  try {
    const legacy = {
      version: 1, folders: [{ id: 'brand', name: 'Brand', parent: null }], assignments: { neutral: 'brand' },
      tags: { neutral: ['Reports', 'Technical', 'english'], 'field-manual': ['reports', 'Warm', 'guide'], 'removed-theme': ['Old'] },
    };
    await writeFile(foldersPath(f.root), JSON.stringify(legacy));
    // Reading changes nothing on disk.
    assert.deepEqual((await readTags(f.root)).themes, { neutral: ['Reports', 'Technical'], 'field-manual': ['reports', 'Warm', 'Guide'], 'removed-theme': ['Old'] });
    await assert.rejects(readFile(tagsPath(f.root)), { code: 'ENOENT' });
    assert.deepEqual(JSON.parse(await readFile(foldersPath(f.root), 'utf8')), legacy);
    // Folder changes leave legacy tags in place until tags take them over.
    await createThemeFolder(f.root, { name: 'Print' });
    assert.deepEqual((await readThemeFolders(f.root)).tags, { neutral: legacy.tags.neutral, 'field-manual': legacy.tags['field-manual'] }, 'Folder changes still prune removed themes.');

    await setItemTags(f.root, 'document', 'proof', ['report']);
    const moved = await readTagsFile(f.root);
    assert.deepEqual(moved.themes, { 'field-manual': ['reports', 'Warm', 'Guide'], neutral: ['Reports', 'Technical'] }, 'Existing themes keep every tag; removed themes are pruned.');
    const folders = await readThemeFolders(f.root);
    assert.equal(folders.tags, undefined);
    assert.deepEqual(folders.assignments, { neutral: 'brand' });
    assert.deepEqual(folders.folders.map(folder => folder.name), ['Brand', 'Print']);

    // tags.json wins for a theme it already mentions; other legacy themes are merged.
    await writeFile(foldersPath(f.root), JSON.stringify({ ...legacy, tags: { neutral: ['Legacy only'], 'civic-spectrum': ['bold'] } }));
    assert.deepEqual((await readTags(f.root)).themes, { 'field-manual': ['reports', 'Warm', 'Guide'], neutral: ['Reports', 'Technical'], 'civic-spectrum': ['Bold'] });

    // An unreadable folders file never blocks tags, and it is left for the user to repair.
    await writeFile(foldersPath(f.root), '{"version":1}');
    assert.deepEqual((await setItemTags(f.root, 'theme', 'neutral', ['Formal'])).tags, ['Formal']);
    assert.equal(await readFile(foldersPath(f.root), 'utf8'), '{"version":1}');
  } finally { await f.cleanup(); }
});

test('tags follow a document through duplication and Trash; status follows Trash only', async () => {
  const f = await workspace();
  try {
    await setItemTags(f.root, 'document', 'proof', ['report', 'Client Acme']);
    await setDocumentStatus(f.root, 'proof', 'final');
    const copy = await duplicateDocument(f.root, 'proof', 'Proof document');
    const tags = await readTags(f.root);
    assert.deepEqual([tags.documents[copy.id], tags.status[copy.id]], [['report', 'Client Acme'], undefined], 'A copy is new work without a status.');
    const { restoreId } = await deleteDocument(f.root, 'proof');
    // Another change while the document is in Trash prunes its entries...
    await setItemTags(f.root, 'document', copy.id, ['memo']);
    assert.equal((await readTags(f.root)).documents.proof, undefined);
    assert.equal((await readTags(f.root)).status.proof, undefined);
    // ...and restoring brings them back from the Trash receipt.
    await restoreDocument(f.root, restoreId);
    const restored = await readTags(f.root);
    assert.deepEqual([restored.documents.proof, restored.status.proof], [['report', 'Client Acme'], 'final']);
    // A receipt written before version 2 holds version 1 tags, which migrate on restore.
    await restoreDocumentTags(f.root, copy.id, { tags: ['memo', 'finance', 'in-review', 'arabic'] });
    const legacy = await readTags(f.root);
    assert.deepEqual([legacy.documents[copy.id], legacy.status[copy.id]], [['brief', 'Finance'], 'in-review']);
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

test('the local API reads tags and sets tags, details, and status with matching codes and change events', async () => {
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
    assert.deepEqual(await good(await fetch(`${origin}/api/tags`)), empty);
    const tagged = await good<{ type: string; tags: string[]; manifest: TagsManifest }>(await send('/api/tags/documents/proof', 'PUT', { tags: ['Report', 'report', 'Internal'] }));
    assert.deepEqual([tagged.type, tagged.tags, tagged.manifest.documents.proof], ['report', ['Internal'], ['report', 'Internal']]);
    const details = await good<{ type: string; status: string; tags: string[] }>(await send('/api/tags/documents/proof', 'PUT', { type: 'letter', tags: ['Internal', 'Acme'], status: 'in-review' }));
    assert.deepEqual([details.type, details.status, details.tags], ['letter', 'in-review', ['Internal', 'Acme']]);
    const status = await good<{ status?: string; manifest: TagsManifest }>(await send('/api/tags/documents/proof/status', 'PUT', { status: 'final' }));
    assert.deepEqual([status.status, status.manifest.status], ['final', { proof: 'final' }]);
    assert.equal((await good<{ status?: string }>(await send('/api/tags/documents/proof/status', 'PUT', { status: null }))).status, undefined);
    await good(await send('/api/tags/templates/invoice', 'PUT', { tags: ['Invoice'] }));
    // The earlier theme route stays an alias for theme tags.
    const theme = await good<{ manifest: TagsManifest }>(await send('/api/themes/neutral/tags', 'PUT', { tags: ['Brand', 'brand', 'Print'] }));
    assert.deepEqual(theme.manifest.themes.neutral, ['Brand', 'Print']);
    assert.equal((await send('/api/tags/documents/missing', 'PUT', { tags: [] })).status, 404);
    assert.equal((await send('/api/tags/documents/missing/status', 'PUT', { status: 'final' })).status, 404);
    assert.equal((await send('/api/tags/documents/proof', 'PUT', { tags: ['x'], extra: true })).status, 400);
    assert.equal((await send('/api/tags/documents/proof', 'PUT', {})).status, 400);
    assert.equal((await send('/api/tags/documents/proof', 'PUT', { tags: ['a,b'] })).status, 400);
    assert.equal((await send('/api/tags/documents/proof/status', 'PUT', { status: 'done!' })).status, 400);
    assert.equal((await send('/api/tags/templates/invoice/status', 'PUT', { status: 'final' })).status, 404);
    assert.equal((await send('/api/tags/folders/proof', 'PUT', { tags: [] })).status, 404);
    assert.equal(changes, 6, 'Every successful change notifies connected windows.');
  } finally {
    server.closeAllConnections(); await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()));
    await f.cleanup();
  }
});

test('language is derived from text weighed with the declared direction', () => {
  const english = countScripts('A quarterly operations report with budget notes and a short summary.');
  const arabic = countScripts('تقرير الأداء الربعي للعمليات مع ملاحظات حول الميزانية وخلاصة قصيرة. Microsoft 365');
  const bilingual = countScripts('Quarterly operations report: تقرير العمليات الربعي. Budget notes: ملاحظات الميزانية.');
  assert.equal(classifyLanguage(english), 'english');
  assert.equal(classifyLanguage(arabic, { lang: 'ar', direction: 'rtl' }), 'arabic');
  assert.equal(classifyLanguage(arabic), 'arabic', 'Arabic text is Arabic without a declaration.');
  assert.equal(classifyLanguage(bilingual), 'bilingual');
  assert.equal(classifyLanguage(english, { direction: 'rtl' }), 'english', 'Substantial English text outweighs a right-to-left declaration.');
  assert.equal(classifyLanguage(countScripts('Draft'), { direction: 'rtl' }), 'arabic', 'With little text, the declaration decides.');
  assert.equal(classifyLanguage(countScripts('Draft'), { lang: 'ar-SA' }), 'arabic');
  assert.equal(classifyLanguage(countScripts('')), 'english');
  assert.equal(classifyLanguage(countScripts('١٢٣ ٤٥٦ 2026 (%)')), 'english', 'Digits and symbols are not letters.');
  assert.equal(themeLanguage({ direction: 'rtl' }), 'arabic');
  assert.equal(themeLanguage({ lang: 'ar', direction: 'auto' }), 'bilingual');
  assert.equal(themeLanguage({}), 'english');
  // Source text counts prose, not identifiers, IDs, or import paths.
  assert.deepEqual(sourceProse('index.tsx', `import x from './some path';\nconst id = 'intro'; <Paragraph id="body" style={{ textAlign: 'right' }}>نص عربي</Paragraph>; const t = 'Two words';`), ['نص عربي', 'Two words']);
});

test('documents and templates are classified from source', { timeout: 60_000 }, async () => {
  const f = await workspace();
  try {
    assert.equal(await sourceLanguage(f.root, 'documents', 'proof'), 'english');
    assert.equal(await sourceLanguage(f.root, 'templates', 'invoice'), 'english');
    const arabic = `import {Document,Pages,Heading,Paragraph} from '../../src/document';
export const meta={title:'تقرير',description:'',theme:'neutral'};
export default function Proof(){return <Document title="تقرير" direction="rtl" lang="ar"><Pages title="تقرير">
<Heading id="title" level={1}>تقرير الربع الثالث</Heading>
<Paragraph id="body">يعرض هذا التقرير نتائج العمليات والميزانية خلال الربع الثالث من العام.</Paragraph>
</Pages></Document>}`;
    await writeFile(f.entry, arabic);
    assert.equal(await sourceLanguage(f.root, 'documents', 'proof'), 'arabic', 'The cache follows the source revision.');
    // A data file with English and Arabic content makes the document bilingual.
    await writeFile(resolve(f.root, 'documents/proof/data.json'), JSON.stringify({ rows: ['Quarterly results for operations and the annual budget review', 'Executive summary with the decisions requested from the board'] }));
    assert.equal(await sourceLanguage(f.root, 'documents', 'proof'), 'bilingual');
    await rm(resolve(f.root, 'documents/proof/data.json'));
    // Declared right-to-left without Arabic text: substantial English decides.
    await writeFile(f.entry, arabic.replace(/تقرير الربع الثالث/u, 'Third quarter report').replace(/يعرض هذا .*?العام\./u, 'This report presents the operating results and budget for the third quarter.').replaceAll('تقرير', 'Report'));
    assert.equal(await sourceLanguage(f.root, 'documents', 'proof'), 'english');
    // A template folder: its guide and schema do not count, its content and declaration do.
    await mkdir(resolve(f.root, 'templates/arabic-letter'), { recursive: true });
    await writeFile(resolve(f.root, 'templates/arabic-letter/index.tsx'), `export const render = () => <Document direction="rtl" lang="ar"><Paragraph id="greeting">السلام عليكم ورحمة الله وبركاته</Paragraph></Document>;`);
    await writeFile(resolve(f.root, 'templates/arabic-letter/AGENTS.md'), 'Use this template for formal Arabic letters to government and business recipients.');
    assert.equal(await sourceLanguage(f.root, 'templates', 'arabic-letter'), 'arabic');
  } finally { await f.cleanup(); }
});

function output(t: TestContext) {
  const lines: string[] = [];
  t.mock.method(console, 'log', (line: string) => { lines.push(line); });
  return () => {
    assert.equal(lines.length, 1, 'A command returns one complete JSON value.');
    return JSON.parse(lines.splice(0)[0]);
  };
}

test('the tags CLI lists the vocabulary, edits items and status, finds them by facet, and filters catalogs', { timeout: 120_000 }, async t => {
  const f = await workspace();
  const json = output(t);
  try {
    await runTagsCli(['list'], f.root);
    const vocabulary = json() as { file: string; types: { id: string; count: number; counts: Record<string, number> }[]; statuses: { id: string }[]; languages: { id: string }[]; custom: unknown[] };
    assert.equal(vocabulary.file, 'tags.json');
    assert.deepEqual(vocabulary.types.map(type => type.id), standardTypes.map(type => type.id));
    assert.deepEqual(vocabulary.types[0].counts, { documents: 0, themes: 0, templates: 0 });
    assert.deepEqual(vocabulary.statuses.map(status => status.id), ['draft', 'in-review', 'final', 'archived']);
    assert.deepEqual(vocabulary.languages.map(language => language.id), ['english', 'arabic', 'bilingual']);
    assert.deepEqual(vocabulary.custom, []);

    await runTagsCli(['add', 'presentation', 'proof', 'memo,Client Acme', 'report'], f.root);
    assert.deepEqual(json(), { kind: 'document', id: 'proof', type: 'report', status: null, tags: ['Client Acme'] });
    await runTagsCli(['status', 'proof', 'draft'], f.root);
    assert.deepEqual(json(), { id: 'proof', status: 'draft' });
    await runTagsCli(['status', 'proof', 'final'], f.root);
    assert.deepEqual(json(), { id: 'proof', status: 'final' });
    await runTagsCli(['status', 'proof'], f.root);
    assert.deepEqual(json(), { id: 'proof', status: 'final' });
    await assert.rejects(runTagsCli(['add', 'document', 'proof', 'final'], f.root), /tags status <document-id> final/);
    await runTagsCli(['remove', 'document', 'proof', 'Report'], f.root);
    assert.deepEqual(json().type, null);
    await runTagsCli(['add', 'template', 'invoice', 'invoice', 'Finance'], f.root);
    json();
    await runTagsCli(['add', 'theme', 'neutral', 'minimal', 'client acme', 'report'], f.root);
    assert.deepEqual(json(), { kind: 'theme', id: 'neutral', tags: ['minimal', 'Client Acme', 'Report'] });
    await runTagsCli(['show', 'document', 'proof'], f.root);
    assert.deepEqual(json(), { kind: 'document', id: 'proof', type: null, status: 'final', language: 'english', tags: ['Client Acme'] });

    await runTagsCli(['find', 'client acme'], f.root);
    assert.deepEqual(json(), [
      { kind: 'document', id: 'proof', type: null, status: 'final', language: 'english', tags: ['Client Acme'], name: null, format: 'document', projectId: 'test-project' },
      { kind: 'theme', id: 'neutral', language: 'english', tags: ['minimal', 'Client Acme', 'Report'] },
    ]);
    await runTagsCli(['find', '--status', 'final'], f.root);
    assert.deepEqual((json() as { id: string }[]).map(item => item.id), ['proof']);
    await runTagsCli(['find', '--status', 'none', '--kind', 'document'], f.root);
    assert.deepEqual(json(), []);
    await runTagsCli(['find', '--type', 'quote'], f.root);
    assert.deepEqual((json() as { kind: string; id: string }[]).map(item => [item.kind, item.id]), [['template', 'invoice']]);
    await runTagsCli(['find', '--language', 'arabic'], f.root);
    assert.deepEqual(json(), []);
    await runTagsCli(['find', 'report', '--kind', 'theme', '--language', 'english'], f.root);
    assert.deepEqual((json() as { id: string }[]).map(item => item.id), ['neutral']);
    await runTagsCli(['list', '--kind', 'templates'], f.root);
    const templates = json() as { types: { id: string; count: number; counts?: unknown }[]; statuses?: unknown; custom: { tag: string; count: number }[] };
    assert.deepEqual(templates.types.filter(type => type.count).map(type => [type.id, type.count, type.counts]), [['invoice', 1, undefined]]);
    assert.equal(templates.statuses, undefined);
    assert.deepEqual(templates.custom.map(entry => [entry.tag, entry.count]), [['Client Acme', 0], ['Finance', 1], ['minimal', 0], ['Report', 0]]);

    await runTagsCli(['status', 'proof', '--clear'], f.root);
    assert.deepEqual(json(), { id: 'proof', status: null });
    await runTagsCli(['set', 'theme', 'neutral'], f.root);
    assert.deepEqual(json().tags, []);
    await runTagsCli(['create', 'Project Phoenix'], f.root);
    assert.deepEqual(json(), { created: 'Project Phoenix' });
    await runTagsCli(['delete', 'Client Acme', '--untag'], f.root);
    assert.deepEqual(json(), { deleted: 'Client Acme', untagged: [{ kind: 'document', id: 'proof' }] });

    await runTemplatesCli(['list', '--type', 'quotation'], f.root);
    assert.deepEqual((json() as { id: string; type: string; language: string; tags: string[] }[]).map(({ id, type, language, tags }) => ({ id, type, language, tags })), [{ id: 'invoice', type: 'invoice', language: 'english', tags: ['Finance'] }]);
    await runTemplatesCli(['list', '--tag', 'Invoice', '--language', 'english'], f.root);
    assert.deepEqual((json() as { id: string }[]).map(item => item.id), ['invoice']);
    await runTemplatesCli(['list', '--language', 'arabic'], f.root);
    assert.deepEqual(json(), []);
    await runTemplatesCli(['list'], f.root);
    assert.deepEqual((json() as { id: string; type: string | null }[]).map(({ id, type }) => [id, type]), [['invoice', 'invoice'], ['pitch-deck', null]]);
    await assert.rejects(runTemplatesCli(['list', '--type', 'spreadsheet'], f.root), /not a type/);
    await assert.rejects(runTemplatesCli(['inspect', 'invoice', '--tag', 'x'], f.root), /Usage/);
    await runThemesCli(['list', '--language', 'english'], f.root);
    const themes = json() as { id: string; language: string }[];
    assert.ok(themes.length > 1 && themes.every(theme => theme.language === 'english'));

    for (const args of [['add', 'document', 'proof'], ['show', 'document'], ['find'], ['delete', 'x', 'y'], ['show', 'theme', 'neutral', '--kind', 'theme'], ['add', 'document', 'proof', 'x', '--untag'], ['status'], ['status', 'proof', 'final', '--clear'], ['show', 'document', 'proof', '--status', 'final'], ['unknown']]) {
      await assert.rejects(runTagsCli(args, f.root), /Usage/, args.join(' '));
    }
    await assert.rejects(runTagsCli(['add', 'folder', 'proof', 'x'], f.root), /Choose document, presentation, theme, or template/);
    await assert.rejects(runTagsCli(['show', 'document', 'missing'], f.root), /no longer exists/);
    await assert.rejects(runTagsCli(['status', 'proof', 'shipped'], f.root), /Choose a status/);
    await assert.rejects(runTagsCli(['find', '--language', 'french'], f.root), /Choose a language/);
    await assert.rejects(runTagsCli(['find', '--type', 'spreadsheet'], f.root), /not a type/);
  } finally { await f.cleanup(); }
});

test('workspace tags, folders, and projects never enter the starter library or a package', () => {
  const archive = 'vendor/formepdf/core.tgz';
  for (const name of ['tags.json', 'themes/folders.json', 'projects.json', archive, 'docs/showcase/a.pdf']) assert.ok(excludedFromCopy(name, archive), name);
  for (const name of ['themes/neutral/index.ts', 'templates/invoice/template.json', 'docs/THEMES.md', 'templates/tags.json/x']) assert.ok(!excludedFromCopy(name, archive), name);
  for (const name of ['tags.json', 'starter/tags.json', 'starter/themes/folders.json', 'projects.json', 'documents/x/index.tsx']) assert.ok(forbiddenInPackage(name, archive), name);
  for (const name of ['starter/projects.json', 'starter/themes/neutral/index.ts', 'src/shared/tags.ts', 'docs/TAGS.md']) assert.ok(!forbiddenInPackage(name, archive), name);
});
