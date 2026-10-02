import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  compareNewest, countFacet, customTagLabel, hashWith, itemFacets, matchesFilters, matchesSearch, noFilters, offered, readItemFilters, readSort,
  sortItems, splitHash, statusRank, storeSort, type Facet,
} from '../src/app/libraryFilters';
import { emptyTags, type TagsManifest } from '../src/shared/tags';
import { sourceFiles, sourceUpdatedAt } from '../src/server/source-files';
import { TemplateCatalog } from '../src/server/templates';
import { projectRoot } from './helpers';

const manifest: TagsManifest = {
  ...emptyTags(),
  custom: ['Client Acme', 'الصحة'],
  documents: { a: ['report', 'Client Acme'], b: ['minutes'], c: ['report', 'الصحة'], d: [] },
  status: { a: 'draft', b: 'final', c: 'draft' },
};
const items = [{ id: 'a' }, { id: 'b', language: 'arabic' as const }, { id: 'c' }, { id: 'd' }];
const facet = (facets: Facet[], key: string) => facets.find(entry => entry.key === key)!;

test('filters live in the hash query beside the route and leave clean links when cleared', () => {
  assert.deepEqual([...splitHash('#project/q3?status=draft&tag=acme').params], [['status', 'draft'], ['tag', 'acme']]);
  assert.equal(splitHash('#project/q3?status=draft').path, 'project/q3');
  assert.equal(splitHash('').path, '');
  assert.equal(hashWith('#project/q3?status=draft', { tag: 'acme' }), '#project/q3?status=draft&tag=acme', 'Other filters keep their order');
  assert.equal(hashWith('#project/q3?status=draft&tag=acme', { status: '', tag: null }), '#project/q3');
  assert.equal(hashWith('#themes', { folder: 'narra', q: undefined }), '#themes?folder=narra');
  assert.equal(hashWith('', { status: 'draft' }), '#library?status=draft', 'The documents library is named when it needs a query');
  assert.equal(hashWith('#library?q=x', { q: null }), '#library');
  const arabic = hashWith('#themes', { tag: 'الصحة' });
  assert.equal(splitHash(arabic).params.get('tag'), 'الصحة', 'Arabic values survive the round trip');
  assert.deepEqual(readItemFilters(new URLSearchParams('type=report&language=arabic&q=x')), { type: 'report', status: '', language: 'arabic', tag: '' });
});

test('type, status, language, and custom tag filters combine; none selects items without a value', () => {
  const pass = (value: Partial<typeof noFilters>) => items.filter(item => matchesFilters(manifest, 'documents', item, { ...noFilters, ...value })).map(item => item.id);
  assert.deepEqual(pass({}), ['a', 'b', 'c', 'd']);
  assert.deepEqual(pass({ type: 'report' }), ['a', 'c']);
  assert.deepEqual(pass({ type: 'none' }), ['d']);
  assert.deepEqual(pass({ status: 'draft', type: 'report' }), ['a', 'c']);
  assert.deepEqual(pass({ status: 'none' }), ['d']);
  assert.deepEqual(pass({ language: 'arabic' }), ['b']);
  assert.deepEqual(pass({ language: 'english' }), ['a', 'c', 'd'], 'Items without a detected language count as English');
  assert.deepEqual(pass({ tag: 'client acme' }), ['a']);
  assert.deepEqual(pass({ tag: 'الصحة', status: 'draft' }), ['c']);
});

test('search matches every word in any order and letter case', () => {
  assert.ok(matchesSearch('Quarterly Report Client Acme', 'acme report'));
  assert.ok(matchesSearch('تقرير الأداء الربعي', 'الربعي'));
  assert.ok(matchesSearch('Anything', '  '));
  assert.ok(!matchesSearch('Quarterly Report', 'report minutes'));
});

test('facets count values, keep a chosen value, and are offered only when they split the items', () => {
  const facets = itemFacets(manifest, 'documents', items, noFilters);
  assert.deepEqual(facets.map(entry => entry.key), ['type', 'status', 'language', 'tag']);
  assert.deepEqual(facet(facets, 'type').options, [{ value: 'report', label: 'Report', count: 2 }, { value: 'minutes', label: 'Minutes', count: 1 }, { value: 'none', label: 'No type', count: 1 }]);
  assert.deepEqual(facet(facets, 'status').options.map(option => `${option.label} ${option.count}`), ['Draft 2', 'Final 1', 'No status 1']);
  assert.deepEqual(facet(facets, 'language').options.map(option => `${option.value} ${option.count}`), ['english 3', 'arabic 1']);
  assert.deepEqual(facet(facets, 'tag').options.map(option => option.label), ['Client Acme', 'الصحة']);
  assert.ok(facets.every(offered));

  // One language for every item, or one tag on every item, would not narrow the list.
  const english = itemFacets(manifest, 'documents', [{ id: 'a' }, { id: 'c' }], noFilters);
  assert.equal(offered(facet(english, 'language')), false, 'A single value is hidden');
  assert.equal(offered(facet(english, 'status')), false, 'Every item in the same status is hidden');
  assert.equal(offered(facet(english, 'tag')), true, 'A tag on some items still splits them');
  const allTagged = itemFacets({ ...manifest, documents: { a: ['Client Acme'] } }, 'documents', [{ id: 'a' }], noFilters);
  assert.equal(offered(facet(allTagged, 'tag')), false);

  // A link can name a value no item carries any more; it stays visible so it can be removed.
  const stale = itemFacets(manifest, 'documents', [{ id: 'a' }, { id: 'c' }], { ...noFilters, language: 'arabic', tag: 'gone' });
  assert.deepEqual(facet(stale, 'language').options.at(-1), { value: 'arabic', label: 'Arabic', count: 0 });
  assert.ok(offered(facet(stale, 'language')));
  assert.equal(facet(stale, 'tag').options.at(-1)?.label, 'gone');
  assert.equal(customTagLabel(manifest, 'client acme'), 'Client Acme');

  // Themes have neither type nor status.
  assert.deepEqual(itemFacets(manifest, 'themes', [], noFilters).map(entry => entry.key), ['language', 'tag']);
  // A facet whose empty value is itself a choice, such as active or archived assets, decides for itself.
  assert.equal(offered({ key: 'status', label: 'Status', anyLabel: 'Active', total: 2, value: '', options: [{ value: 'archived', label: 'Archived', count: 2 }], offer: true }), true);
});

test('a facet over any list counts single values in the given order', () => {
  const media = [{ kind: 'chart' }, { kind: 'photo' }, { kind: 'chart' }, {}];
  const kinds = countFacet({ key: 'kind', label: 'Kind', anyLabel: 'Any kind', items: media, value: '', valueOf: item => item.kind, labelOf: value => value.toUpperCase(), order: ['image', 'photo', 'chart'] });
  assert.deepEqual(kinds.options, [{ value: 'photo', label: 'PHOTO', count: 1 }, { value: 'chart', label: 'CHART', count: 2 }]);
  assert.equal(kinds.total, 4);
  assert.ok(offered(kinds));
});

test('sorting: newest first, workflow status order, stable ties, and chained comparators', () => {
  assert.ok(compareNewest('2026-10-02T00:00:00Z', '2026-09-01T00:00:00Z') < 0);
  assert.ok(compareNewest(undefined, '2026-09-01T00:00:00Z') > 0, 'Items without a time follow');
  assert.equal(compareNewest(undefined, undefined), 0);
  assert.deepEqual(['archived', undefined, 'final', 'draft', 'in-review'].sort((a, b) => statusRank(a) - statusRank(b)), ['draft', 'in-review', 'final', 'archived', undefined]);
  const rows = [{ id: 'x', group: 2 }, { id: 'y', group: 1 }, { id: 'z', group: 2 }, { id: 'w', group: 1 }];
  assert.deepEqual(sortItems(rows, (a, b) => a.group - b.group).map(row => row.id), ['y', 'w', 'x', 'z'], 'Ties keep their original order');
  assert.deepEqual(sortItems(rows, (a, b) => a.group - b.group, (a, b) => a.id.localeCompare(b.id)).map(row => row.id), ['w', 'y', 'x', 'z']);
  assert.deepEqual(rows.map(row => row.id), ['x', 'y', 'z', 'w'], 'The input is not changed');
});

test('each page remembers its own sort order, and an unknown or unreadable choice falls back', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const options = [{ value: 'updated', label: 'Last edited' }, { value: 'title', label: 'Title A–Z' }];
  assert.equal(readSort(storage, 'documents', options, 'updated'), 'updated');
  storeSort(storage, 'documents', 'title');
  assert.equal(readSort(storage, 'documents', options, 'updated'), 'title');
  assert.equal(readSort(storage, 'project', options, 'updated'), 'updated', 'Pages do not share a choice');
  values.set('opendoc-sort:documents', 'status');
  assert.equal(readSort(storage, 'documents', options, 'updated'), 'updated', 'A choice the page no longer offers falls back');
  const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(readSort(blocked, 'documents', options, 'title'), 'title');
  assert.doesNotThrow(() => storeSort(blocked, 'documents', 'title'));
  assert.equal(readSort(undefined, 'documents', options, 'title'), 'title');
});

test('last edited comes from the newest source file; comments, history, and media do not count', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opendoc-updated-'));
  try {
    const folder = resolve(root, 'documents/report');
    await mkdir(resolve(folder, '.history'), { recursive: true });
    await mkdir(resolve(folder, 'media/chart'), { recursive: true });
    const at = (file: string, time: string) => utimes(resolve(folder, file), new Date(time), new Date(time));
    await writeFile(resolve(folder, 'index.tsx'), 'export default () => null;');
    await writeFile(resolve(folder, 'content.json'), '{}');
    await writeFile(resolve(folder, 'comments.json'), '[]');
    await writeFile(resolve(folder, '.history/index.json'), '{}');
    await writeFile(resolve(folder, 'media/chart/meta.json'), '{}');
    await at('index.tsx', '2026-09-01T10:00:00Z');
    await at('content.json', '2026-09-02T10:00:00Z');
    await at('comments.json', '2026-09-30T10:00:00Z');
    await at('.history/index.json', '2026-09-30T10:00:00Z');
    await at('media/chart/meta.json', '2026-09-30T10:00:00Z');
    const files = await sourceFiles(root, 'documents', 'report');
    assert.deepEqual(files.map(file => file.name).sort(), ['comments.json', 'content.json', 'index.tsx']);
    assert.equal(sourceUpdatedAt(files), '2026-09-02T10:00:00.000Z');
    assert.equal(sourceUpdatedAt([]), undefined);
    assert.deepEqual(await sourceFiles(root, 'documents', '../outside'), [], 'Invalid IDs read nothing');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the template catalog reports when each template last changed', async () => {
  const catalog = new TemplateCatalog(projectRoot);
  try {
    const items = await catalog.list();
    assert.ok(items.length > 0);
    assert.ok(items.every(item => item.error || (item.updatedAt && !Number.isNaN(Date.parse(item.updatedAt)))));
  } finally { await catalog.close(); }
});
