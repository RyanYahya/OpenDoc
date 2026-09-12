import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renameDocument, duplicateDocument, deleteDocument, restoreDocument } from '../src/server/documents';
import { readProjects, createProject, assignProject, deleteProject } from '../src/server/projects';
import { createFromTemplate } from '../src/server/templates';
import { renderOnce } from '../src/server/render';
import { fixture, projectRoot } from './helpers';

test('rename preserves the stable ID, authored title, PDF, and project membership', async () => {
  const f = await fixture();
  try {
    const original = await readFile(f.entry);
    const before = await renderOnce(f.root, 'proof');
    await renameDocument(f.root, 'proof', { name: '  Board review  ' });
    assert.equal((await readProjects(f.root)).names?.proof, 'Board review');
    assert.equal((await readProjects(f.root)).assignments.proof, 'test-project');
    assert.deepEqual(await readFile(f.entry), original);
    const after = await renderOnce(f.root, 'proof');
    assert.equal(after.artifact.hash, before.artifact.hash);
    assert.equal(after.artifact.meta.title, 'Proof document');
    for (const name of ['', 'a\nb', 'x'.repeat(161), null]) await assert.rejects(renameDocument(f.root, 'proof', { name }), /name/);
    assert.equal((await readProjects(f.root)).names?.proof, 'Board review');
    await assert.rejects(renameDocument(f.root, 'missing', { name: 'Gone' }), /no longer exists/);
  } finally { await f.cleanup(); }
});

test('concurrent duplicates copy saved content and assets into unique folders in the original project', async () => {
  const f = await fixture();
  try {
    await renameDocument(f.root, 'proof', { name: 'Review copy' });
    await mkdir(resolve(f.root, 'documents/proof/media/image'), { recursive: true });
    const bytes = Buffer.from([0, 127, 255, 1]);
    await writeFile(resolve(f.root, 'documents/proof/media/image/asset.png'), bytes);
    await writeFile(resolve(f.root, 'documents/proof/comments.json'), '[]\n');
    const source = await readFile(f.entry);
    const copies = await Promise.all(Array.from({ length: 3 }, () => duplicateDocument(f.root, 'proof', 'Proof document')));
    assert.equal(new Set(copies.map(copy => copy.id)).size, 3);
    for (const copy of copies) {
      assert.equal(copy.name, 'Copy of Review copy');
      assert.equal((await readProjects(f.root)).assignments[copy.id], 'test-project');
      assert.deepEqual(await readFile(resolve(f.root, 'documents', copy.id, 'index.tsx')), source);
      assert.deepEqual(await readFile(resolve(f.root, 'documents', copy.id, 'media/image/asset.png')), bytes);
      assert.equal(await readFile(resolve(f.root, 'documents', copy.id, 'comments.json'), 'utf8'), '[]\n');
    }
    await writeFile(resolve(f.root, 'documents', copies[0].id, 'media/image/asset.png'), 'changed');
    assert.deepEqual(await readFile(resolve(f.root, 'documents/proof/media/image/asset.png')), bytes);
  } finally { await f.cleanup(); }
});

test('template duplicates render with independent, editable data and stable record identities', async () => {
  const f = await fixture();
  try {
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    await createFromTemplate(f.root, 'monthly-report', { projectId: 'test-project', id: 'monthly', title: 'Monthly' });
    const copy = await duplicateDocument(f.root, 'monthly', 'Monthly');
    const originalData = await readFile(resolve(f.root, 'documents/monthly/data.json'), 'utf8');
    assert.equal(await readFile(resolve(f.root, 'documents', copy.id, 'data.json'), 'utf8'), originalData);
    const rendered = await renderOnce(f.root, copy.id);
    assert.equal(rendered.artifact.provenance?.dataFile, `documents/${copy.id}/data.json`);
    const changedData = { ...JSON.parse(originalData), title: 'Independent title' };
    await writeFile(resolve(f.root, 'documents', copy.id, 'data.json'), JSON.stringify(changedData));
    assert.equal((await renderOnce(f.root, copy.id)).artifact.meta.title, 'Independent title');
    assert.equal(await readFile(resolve(f.root, 'documents/monthly/data.json'), 'utf8'), originalData);
    await createFromTemplate(f.root, 'invoice', { projectId: 'test-project', id: 'invoice', title: 'Invoice' });
    const invoiceCopy = await duplicateDocument(f.root, 'invoice', 'Invoice');
    const invoice = await renderOnce(f.root, invoiceCopy.id);
    const sources = invoice.artifact.textTargets?.flatMap(target => target.runs.flatMap(run => run.source ? [run.source] : [])) ?? [];
    assert.ok(sources.some(source => source.file === `documents/${invoiceCopy.id}/data.json`));
    assert.ok(sources.every(source => source.file.startsWith(`documents/${invoiceCopy.id}/`)));
    assert.equal(await readFile(resolve(f.root, 'documents', invoiceCopy.id, 'data.json'), 'utf8'), await readFile(resolve(f.root, 'documents/invoice/data.json'), 'utf8'));
  } finally { await f.cleanup(); }
});

test('delete and restore preserve every file and metadata, and collisions never overwrite a document', async () => {
  const f = await fixture();
  try {
    await renameDocument(f.root, 'proof', { name: 'Keep me' });
    await writeFile(resolve(f.root, 'documents/proof/comments.json'), '[{"text":"Keep this feedback"}]');
    const original = await readFile(f.entry);
    const removed = await deleteDocument(f.root, 'proof');
    assert.deepEqual(await readdir(resolve(f.root, 'documents')), []);
    assert.equal((await readProjects(f.root)).assignments.proof, undefined);
    assert.equal((await readProjects(f.root)).names?.proof, undefined);
    await mkdir(resolve(f.root, 'documents/proof'));
    await writeFile(f.entry, 'Do not replace');
    await assert.rejects(restoreDocument(f.root, removed.restoreId), /already uses/);
    assert.equal(await readFile(f.entry, 'utf8'), 'Do not replace');
    await rm(resolve(f.root, 'documents/proof'), { recursive: true });
    await restoreDocument(f.root, removed.restoreId);
    assert.deepEqual(await readFile(f.entry), original);
    assert.equal(await readFile(resolve(f.root, 'documents/proof/comments.json'), 'utf8'), '[{"text":"Keep this feedback"}]');
    assert.equal((await readProjects(f.root)).names?.proof, 'Keep me');
    assert.equal((await readProjects(f.root)).assignments.proof, 'test-project');
    await assert.rejects(restoreDocument(f.root, removed.restoreId), /already been restored/);
    await assert.rejects(restoreDocument(f.root, '../proof'), /Invalid/);
  } finally { await f.cleanup(); }
});

test('folder links and unsupported copy files fail without changing user data', async () => {
  const f = await fixture();
  try {
    const before = await readFile(resolve(f.root, 'projects.json'), 'utf8');
    await symlink(resolve(f.root, 'documents/proof'), resolve(f.root, 'documents/alias'), 'dir');
    await assert.rejects(deleteDocument(f.root, 'alias'), /regular local/);
    await symlink(f.entry, resolve(f.root, 'documents/proof/linked.tsx'));
    await assert.rejects(duplicateDocument(f.root, 'proof', 'Proof'), /link or special file/);
    assert.equal(await readFile(resolve(f.root, 'projects.json'), 'utf8'), before);
    assert.deepEqual((await readdir(resolve(f.root, 'documents'))).sort(), ['alias', 'proof']);
    assert.ok((await readFile(f.entry, 'utf8')).includes('Proof document'));
  } finally { await f.cleanup(); }
});

test('restore retains its backup when the original project has been removed', async () => {
  const f = await fixture();
  try {
    await createProject(f.root, { id: 'temporary', name: 'Temporary' });
    await assignProject(f.root, 'proof', 'temporary');
    const removed = await deleteDocument(f.root, 'proof');
    await deleteProject(f.root, 'temporary');
    await assert.rejects(restoreDocument(f.root, removed.restoreId), /no longer exists/);
    assert.ok((await readFile(resolve(f.root, '.opendoc/trash', removed.restoreId, 'document/index.tsx'), 'utf8')).includes('Proof document'));
    await createProject(f.root, { id: 'temporary', name: 'Temporary' });
    await restoreDocument(f.root, removed.restoreId);
    assert.equal((await readProjects(f.root)).assignments.proof, 'temporary');
  } finally { await f.cleanup(); }
});
