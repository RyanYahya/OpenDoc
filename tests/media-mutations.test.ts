import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fixture } from './helpers';
import { importMedia, editMedia, type MediaImportMetadata } from '../src/server/media-mutations';
import { hashBytes, readMedia, mediaFreshness } from '../src/media/files';
import { recordMedia, importMedia as importMediaFromFile } from '../src/server/media-cli';
import { scanMaterials } from '../src/server/materials';
import { Conflict } from '../src/server/comments';
import type { MediaMeta } from '../src/shared/media';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAIAAABwJOjsAAAAOUlEQVR4nO3NQQEAIAwDsVIzqMEF/jXw3QzcHjQGsvY9muCRVYlBJrMqMcZc1SXGmKu6xBhzlT6PH78GAQA/IUyuAAAAAElFTkSuQmCC', 'base64');
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDyeiiiu04z/9k=', 'base64');
const details: MediaImportMetadata = { title: 'A supplied image', description: 'A synthetic image for testing.', kind: 'image', sources: ['Synthetic test fixture'] };
const revision = (meta: unknown) => hashBytes(Buffer.from(JSON.stringify(meta)));
const upload = { filename: 'supplied.png', bytes: png };

test('PNG and JPEG uploads publish complete owned media with unchanged image bytes', async () => {
  const f = await fixture();
  try {
    const first = await importMedia(f.root, 'proof', details, upload);
    const second = await importMedia(f.root, 'proof', { ...details, id: 'photograph', kind: 'photo' }, { filename: 'photo.jpeg', bytes: jpeg });
    assert.equal(first.id, 'a-supplied-image');
    assert.equal(second.id, 'photograph');
    const document = resolve(f.root, 'documents/proof');
    assert.deepEqual(readMedia(document, first.id).bytes, png);
    assert.deepEqual(readMedia(document, second.id).bytes, jpeg);
    assert.deepEqual([readMedia(document, second.id).width, readMedia(document, second.id).height], [16, 8]);
    const catalog = await scanMaterials(f.root, [{ id: 'proof', status: 'rendering', revision: 0 }]);
    assert.equal(catalog.issues.length, 0);
    assert.equal(catalog.media.find(item => item.id === first.id)?.metadataRevision, first.metadataRevision);
    assert.equal(catalog.media.find(item => item.id === second.id)?.meta?.file, 'image.jpg');
    assert.deepEqual(await readdir(resolve(f.root, '.opendoc/media-imports')), []);
  } finally { await f.cleanup(); }
});

test('imports preserve existing media, serialize competing IDs, and give repeated titles new identities', async () => {
  const f = await fixture();
  try {
    const results = await Promise.allSettled([1, 2].map(() => importMedia(f.root, 'proof', { ...details, id: 'same-id' }, upload)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const failure = results.find(result => result.status === 'rejected');
    assert.ok(failure?.status === 'rejected' && failure.reason instanceof Conflict);
    assert.deepEqual(await readFile(resolve(f.root, 'documents/proof/media/same-id/image.png')), png);
    const first = await importMedia(f.root, 'proof', details, upload);
    const second = await importMedia(f.root, 'proof', details, upload);
    assert.notEqual(first.id, second.id);
    const empty = resolve(f.root, 'documents/proof/media/empty');
    await mkdir(empty);
    await assert.rejects(importMedia(f.root, 'proof', { ...details, id: 'empty' }, upload), /already exists/);
    assert.deepEqual(await readdir(empty), []);
    assert.deepEqual(await readdir(resolve(f.root, '.opendoc/media-imports')), []);
  } finally { await f.cleanup(); }
});

test('invalid image bytes or metadata never create an incomplete media item', async () => {
  const f = await fixture();
  try {
    await assert.rejects(importMedia(f.root, 'proof', { ...details, title: '' }, upload), /nonempty/);
    await assert.rejects(importMedia(f.root, 'proof', { ...details, id: '../outside' }, upload), /lowercase/);
    await assert.rejects(importMedia(f.root, 'proof', details, { filename: 'bad.jpg', bytes: jpeg.subarray(0, -2) }), /incomplete/);
    await assert.rejects(importMedia(f.root, 'proof', details, { filename: 'bad.png', bytes: png.subarray(0, 30) }), /valid PNG|truncated|incomplete/);
    await assert.rejects(importMedia(f.root, 'proof', details, { filename: 'mislabeled.png', bytes: jpeg }), /extension/);
    await assert.rejects(importMedia(f.root, '../proof', details, upload), /Invalid document ID/);
    assert.deepEqual(await readdir(resolve(f.root, 'documents/proof')), ['index.tsx']);
  } finally { await f.cleanup(); }
});

test('CLI imports keep content-based file inputs while sharing full image validation and publication', async () => {
  const f = await fixture();
  try {
    const supplied = resolve(f.root, 'supplied-file'); await writeFile(supplied, jpeg);
    const result = await importMediaFromFile(f.root, 'proof', 'cli-photo', supplied, details.title, details.description, 'photo');
    await assert.rejects(importMediaFromFile(f.root, 'proof', 'cli-photo', supplied, 'Replacement', details.description), /already exists/);
    assert.equal(result.file, 'documents/proof/media/cli-photo/image.jpg');
    assert.deepEqual(await readFile(supplied), jpeg);
    assert.deepEqual(readMedia(resolve(f.root, 'documents/proof'), 'cli-photo').bytes, jpeg);
    const catalog = await scanMaterials(f.root, [{ id: 'proof', status: 'rendering', revision: 0 }]);
    assert.equal(catalog.media[0].meta?.title, details.title);
    assert.equal(catalog.media[0].usageKnown, false);
    const corrupt = resolve(f.root, 'corrupt.png'); await writeFile(corrupt, png.subarray(0, 30));
    await assert.rejects(importMediaFromFile(f.root, 'proof', 'bad-cli-image', corrupt, details.title, details.description), /valid PNG|truncated|incomplete/);
    assert.deepEqual(await readdir(resolve(f.root, 'documents/proof/media')), ['cli-photo']);
  } finally { await f.cleanup(); }
});

test('metadata edits preserve preparation files and never turn stale generated work into reviewed work', async () => {
  const f = await fixture();
  try {
    await importMedia(f.root, 'proof', { ...details, id: 'chart', kind: 'chart', alt: 'Original alternative text.' }, upload);
    const folder = resolve(f.root, 'documents/proof/media/chart');
    const meta = JSON.parse(await readFile(resolve(folder, 'meta.json'), 'utf8')) as MediaMeta;
    meta.data = 'data.json'; meta.recipe = 'recipe.py';
    await writeFile(resolve(folder, 'meta.json'), JSON.stringify(meta));
    await writeFile(resolve(folder, 'data.json'), '[1,2,3]');
    await writeFile(resolve(folder, 'recipe.py'), '# Prepared chart recipe\n');
    await recordMedia(f.root, 'proof', 'chart');
    const generation = await readFile(resolve(folder, 'generation.json'));
    await writeFile(resolve(folder, 'data.json'), '[2,3,4]');
    const { alt: _alt, ...newMeta } = meta;
    const saved = await editMedia(f.root, 'proof', 'chart', { expectedRevision: revision(meta), meta: { ...newMeta, title: 'Updated chart title', sources: ['New provenance note'] } });
    const updated = readMedia(resolve(f.root, 'documents/proof'), 'chart');
    assert.equal(updated.meta.title, 'Updated chart title');
    assert.equal(updated.meta.alt, undefined);
    assert.deepEqual(updated.meta.sources, ['New provenance note']);
    assert.equal(updated.meta.data, 'data.json');
    assert.equal(updated.meta.recipe, 'recipe.py');
    assert.equal(mediaFreshness(updated).freshness, 'stale');
    assert.deepEqual(await readFile(resolve(folder, 'generation.json')), generation);
    assert.equal(await readFile(resolve(folder, 'data.json'), 'utf8'), '[2,3,4]');
    assert.equal(saved.metadataRevision, revision(updated.meta));
    await assert.rejects(editMedia(f.root, 'proof', 'chart', { expectedRevision: saved.metadataRevision, meta: { ...updated.meta, recipe: 'replacement.py' } }), /cannot change recipe/);
    await assert.rejects(editMedia(f.root, 'proof', 'chart', { expectedRevision: saved.metadataRevision, meta: { ...updated.meta, file: '../outside.png' } }), /cannot change file/);
  } finally { await f.cleanup(); }
});

test('metadata CAS preserves external changes and serializes concurrent app or agent edits', async () => {
  const f = await fixture();
  try {
    const imported = await importMedia(f.root, 'proof', { ...details, id: 'photo' }, upload);
    const file = resolve(f.root, 'documents/proof/media/photo/meta.json');
    const meta = JSON.parse(await readFile(file, 'utf8')) as MediaMeta;
    const attempts = await Promise.allSettled(['First edit', 'Second edit'].map(title => editMedia(f.root, 'proof', 'photo', { expectedRevision: imported.metadataRevision, meta: { ...meta, title } })));
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter(result => result.status === 'rejected' && result.reason instanceof Conflict).length, 1);
    const external = { ...JSON.parse(await readFile(file, 'utf8')), description: 'A newer manual correction.' };
    await writeFile(file, JSON.stringify(external));
    await assert.rejects(editMedia(f.root, 'proof', 'photo', { expectedRevision: imported.metadataRevision, meta: { ...meta, title: 'Old edit' } }), /metadata changed/);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).description, external.description);
  } finally { await f.cleanup(); }
});

test('metadata editing retains unknown existing source annotations without permitting changes to them', async () => {
  const f = await fixture();
  try {
    await importMedia(f.root, 'proof', { ...details, id: 'photo' }, upload);
    const file = resolve(f.root, 'documents/proof/media/photo/meta.json');
    const original = { ...JSON.parse(await readFile(file, 'utf8')), sourceDetails: { originalId: 'stable-source', notes: ['Keep this record'] } };
    await writeFile(file, JSON.stringify(original));
    await editMedia(f.root, 'proof', 'photo', { expectedRevision: revision(original), meta: { ...original, title: 'Renamed photograph' } });
    const updated = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(updated.sourceDetails, original.sourceDetails);
    await assert.rejects(editMedia(f.root, 'proof', 'photo', { expectedRevision: revision(updated), meta: { ...updated, sourceDetails: { originalId: 'replacement' } } }), /cannot change sourceDetails/);
  } finally { await f.cleanup(); }
});

test('media import and edit refuse linked document, item, metadata, and runtime paths', async () => {
  const f = await fixture();
  try {
    const outside = resolve(f.root, 'outside'); await mkdir(outside);
    await symlink(outside, resolve(f.root, 'documents/proof/media'));
    await assert.rejects(importMedia(f.root, 'proof', details, upload), /ordinary local folders/);
    assert.deepEqual(await readdir(outside), []);
    await rm(resolve(f.root, 'documents/proof/media'));
    const result = await importMedia(f.root, 'proof', { ...details, id: 'photo' }, upload);
    const folder = resolve(f.root, 'documents/proof/media/photo');
    const raw = await readFile(resolve(folder, 'meta.json'), 'utf8');
    const outsideMetadata = resolve(outside, 'metadata.json'); await writeFile(outsideMetadata, raw);
    await rm(resolve(folder, 'meta.json')); await symlink(outsideMetadata, resolve(folder, 'meta.json'));
    await assert.rejects(editMedia(f.root, 'proof', 'photo', { expectedRevision: result.metadataRevision, meta: { ...JSON.parse(raw), title: 'Changed' } }), /ELOOP|symbolic|links/);
    assert.equal(await readFile(outsideMetadata, 'utf8'), raw);
    await symlink(resolve(f.root, 'documents/proof'), resolve(f.root, 'documents/linked'));
    await assert.rejects(importMedia(f.root, 'linked', details, upload), /ordinary local folders/);
    const lock = resolve(f.root, '.opendoc/locks/proof.lock');
    await symlink(outside, lock);
    await assert.rejects(importMedia(f.root, 'proof', details, upload), /document lock/);
    await rm(lock);
    await rm(resolve(f.root, '.opendoc'), { recursive: true });
    await symlink(outside, resolve(f.root, '.opendoc'));
    await assert.rejects(importMedia(f.root, 'proof', details, upload), /ordinary local folders/);
    assert.deepEqual(await readdir(outside), ['metadata.json']);
  } finally { await f.cleanup(); }
});

test('a later import cleans only abandoned private stages and preserves active or unexpected contents', async () => {
  const f = await fixture();
  try {
    const staging = resolve(f.root, '.opendoc/media-imports'); await mkdir(staging, { recursive: true });
    const abandoned = resolve(staging, `2147483647-${randomUUID()}`); await mkdir(abandoned); await writeFile(resolve(abandoned, 'meta.json'), '{}');
    const unexpected = resolve(staging, `2147483647-${randomUUID()}`); await mkdir(unexpected); await writeFile(resolve(unexpected, 'user-notes.txt'), 'Preserve this.');
    const active = resolve(staging, `${process.pid}-${randomUUID()}`); await mkdir(active); await writeFile(resolve(active, 'meta.json'), '{}');
    await importMedia(f.root, 'proof', details, upload);
    await assert.rejects(readFile(resolve(abandoned, 'meta.json')), /ENOENT/);
    assert.equal(await readFile(resolve(unexpected, 'user-notes.txt'), 'utf8'), 'Preserve this.');
    assert.equal(await readFile(resolve(active, 'meta.json'), 'utf8'), '{}');
  } finally { await f.cleanup(); }
});
