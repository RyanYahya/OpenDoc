import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, symlink, mkdir, utimes } from 'node:fs/promises';
import { resolve } from 'node:path';
import { addComment, changeComment, editComment, deleteComment, readComments, Conflict } from '../src/server/comments';
import { documentEntry } from '../src/server/render';
import { Workspace } from '../src/server/workspace';
import { getBlock } from '../src/shared/types';
import { fixture, settled, source } from './helpers';

test('concurrent feedback is retained and stale updates are rejected', async () => {
  const f = await fixture();
  try {
    await Promise.all(Array.from({ length: 8 }, (_, i) => addComment(f.root, 'proof', { blockId: 'target', text: `Comment ${i}`, quote: 'Paragraph' })));
    const rows = await readComments(f.root, 'proof');
    assert.equal(rows.length, 8); assert.equal(new Set(rows.map(c => c.id)).size, 8);
    await changeComment(f.root, 'proof', rows[0].id, 'resolved', 1);
    await assert.rejects(changeComment(f.root, 'proof', rows[0].id, 'open', 1), Conflict);
  } finally { await f.cleanup(); }
});

test('invalid feedback and traversal do not overwrite or expose files', async () => {
  const f = await fixture();
  try {
    const path = resolve(f.root, 'documents/proof/comments.json');
    await writeFile(path, '{ invalid');
    await assert.rejects(addComment(f.root, 'proof', { blockId: 'target', text: 'Hello', quote: '' }));
    assert.equal(await readFile(path, 'utf8'), '{ invalid');
    await assert.rejects(documentEntry(f.root, '../outside'), /Invalid document ID/);
    await symlink(resolve(f.root, 'src'), resolve(f.root, 'documents/escaped'));
    await assert.rejects(documentEntry(f.root, 'escaped'));
  } finally { await f.cleanup(); }
});

test('phrase anchors retain exact text and history beside legacy block comments', async () => {
  const f = await fixture();
  try {
    const quote = 'An exact phrase '.repeat(40);
    const anchor = { targetId: 'target:text', start: 3, end: 3 + quote.length, quote, prefix: 'An ', suffix: ' follows.' };
    await addComment(f.root, 'proof', { blockId: 'target', text: 'Review the selected wording.', quote, anchor });
    await addComment(f.root, 'proof', { blockId: 'target', text: 'Legacy whole-block feedback.', quote: 'Paragraph' });
    let rows = await readComments(f.root, 'proof');
    assert.deepEqual(rows[0].anchor, anchor);
    assert.equal(rows[0].quote, quote, 'Precise anchors must not truncate a selected passage.');
    assert.equal(rows[1].anchor, undefined);
    rows = await changeComment(f.root, 'proof', rows[0].id, 'resolved', 1);
    rows = await changeComment(f.root, 'proof', rows[0].id, 'open', 2);
    assert.deepEqual(rows[0].anchor, anchor);
    assert.deepEqual(rows[0].history.map(item => item.action), ['created', 'resolved', 'reopened']);
    await assert.rejects(addComment(f.root, 'proof', { blockId: 'target', text: 'Bad anchor', quote, anchor: { ...anchor, end: 4 } }), /phrase again/);
  } finally { await f.cleanup(); }
});

test('a constructor block is a valid comment target only while it is actually present', async () => {
  const f = await fixture();
  const workspace = new Workspace(f.root);
  try {
    await writeFile(f.entry, source('<Paragraph id="constructor">A real paragraph with a valid ID.</Paragraph>'));
    await workspace.refresh(); await settled(workspace);
    const artifact = workspace.states.get('proof')!.artifact!;
    const block = getBlock(artifact, 'constructor');
    assert.equal(block?.id, 'constructor');
    assert.equal(getBlock(artifact, 'toString'), undefined);
    await addComment(f.root, 'proof', { blockId: 'constructor', text: 'Keep this feedback when the passage is removed.', quote: block!.text });
    await workspace.setContext({ documentId: 'proof', blockId: 'constructor', page: 1 });
    const before = JSON.parse(await readFile(resolve(f.root, '.opendoc/current.json'), 'utf8'));
    assert.equal(before.selectedBlock.id, 'constructor');
    assert.equal(before.pendingComments[0].targetAvailable, true);

    await writeFile(f.entry, source());
    await workspace.refresh(); await settled(workspace); await workspace.writeContext();
    assert.equal(getBlock(workspace.states.get('proof')!.artifact, 'constructor'), undefined);
    const after = JSON.parse(await readFile(resolve(f.root, '.opendoc/current.json'), 'utf8'));
    assert.equal(after.selectedBlock, null);
    assert.equal(after.source, null);
    assert.equal(after.pendingComments[0].blockId, 'constructor');
    assert.equal(after.pendingComments[0].targetAvailable, false);
    assert.equal((await readComments(f.root, 'proof')).length, 1);
  } finally { await workspace.close(); await f.cleanup(); }
});

test('editing and deleting feedback checks versions and retains its history', async () => {
  const f = await fixture();
  try {
    const [original] = await addComment(f.root, 'proof', { blockId: 'target', text: 'First comment.', quote: 'stable' });
    const [edited] = await editComment(f.root, 'proof', original.id, 'Updated comment.', original.version);
    assert.equal(edited.text, 'Updated comment.');
    assert.equal(edited.quote, original.quote);
    assert.equal(edited.history.at(-1)?.previousText, 'First comment.');
    await assert.rejects(() => deleteComment(f.root, 'proof', original.id, original.version), Conflict);
    await assert.rejects(() => editComment(f.root, 'proof', original.id, 'Stale change.', original.version), Conflict);
    await assert.rejects(() => editComment(f.root, 'proof', original.id, ' ', edited.version));
    const [deleted] = await deleteComment(f.root, 'proof', original.id, edited.version);
    assert.equal(deleted.status, 'deleted');
    assert.equal(deleted.text, 'Updated comment.');
    assert.deepEqual(deleted.history.map(event => event.action), ['created', 'edited', 'deleted']);
    assert.equal((await readComments(f.root, 'proof'))[0].status, 'deleted');
    await assert.rejects(() => changeComment(f.root, 'proof', original.id, 'open', deleted.version), Conflict);
  } finally { await f.cleanup(); }
});

test('malformed saved records and duplicate comment IDs never get silently rewritten', async () => {
  const f = await fixture();
  try {
    const [comment] = await addComment(f.root, 'proof', { blockId: 'target', text: 'Keep this feedback.', quote: 'stable' });
    const file = resolve(f.root, 'documents/proof/comments.json');
    for (const invalid of [
      [comment, comment], [{ ...comment, quote: undefined }], [{ ...comment, version: 0 }],
      [{ ...comment, history: [null] }], [{ ...comment, history: [{ at: comment.createdAt, action: 'unknown' }] }],
      [{ ...comment, updatedAt: 'invalid' }],
    ]) {
      const original = JSON.stringify(invalid);
      await writeFile(file, original);
      await assert.rejects(changeComment(f.root, 'proof', comment.id, 'resolved', 1), /Invalid comments file/);
      assert.equal(await readFile(file, 'utf8'), original);
    }
  } finally { await f.cleanup(); }
});

test('feedback recovers abandoned locks from interrupted and dead sessions', async () => {
  const f = await fixture();
  try {
    const lock = resolve(f.root, '.opendoc/locks/proof.lock');
    for (const owner of [undefined, '{ interrupted', JSON.stringify({ pid: 2_147_483_647 })]) {
      await mkdir(lock, { recursive: true });
      if (owner !== undefined) await writeFile(resolve(lock, 'owner.json'), owner);
      const old = new Date(Date.now() - 60_000);
      await utimes(lock, old, old);
      await addComment(f.root, 'proof', { blockId: 'target', text: 'Recovered feedback.', quote: 'stable' });
    }
    assert.equal((await readComments(f.root, 'proof')).length, 3);
    await mkdir(lock);
    await writeFile(resolve(lock, 'owner.json'), JSON.stringify({ pid: process.pid }));
    const old = new Date(Date.now() - 60_000);
    await utimes(lock, old, old);
    await assert.rejects(addComment(f.root, 'proof', { blockId: 'target', text: 'Must wait for the live owner.', quote: 'stable' }), Conflict);
    assert.equal((await readComments(f.root, 'proof')).length, 3);
  } finally { await f.cleanup(); }
});
