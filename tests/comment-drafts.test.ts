import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommentDraftStore } from '../src/app/commentDrafts';

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test('unsent drafts survive document navigation and a fresh reader session, clearing only submitted or emptied text', () => {
  const session = storage();
  const original = createCommentDraftStore(() => session);
  original.set('report', 'constructor', 'Clarify the opening.');
  original.set('report', 'body', 'Keep this unfinished note.');
  original.set('article', 'body', 'A separate document draft.');
  assert.equal(original.read('report').constructor, 'Clarify the opening.');

  const reloaded = createCommentDraftStore(() => session);
  assert.equal(reloaded.read('report').constructor, 'Clarify the opening.');
  assert.equal(reloaded.read('report').body, 'Keep this unfinished note.');
  reloaded.clearSubmitted('report', 'constructor', 'Clarify the opening.');
  assert.equal(Object.hasOwn(reloaded.read('report'), 'constructor'), false);
  assert.equal(reloaded.read('report').body, 'Keep this unfinished note.');
  assert.equal(reloaded.read('article').body, 'A separate document draft.');

  reloaded.set('report', 'body', '');
  const afterClear = createCommentDraftStore(() => session);
  assert.deepEqual(Object.keys(afterClear.read('report')), []);
  assert.equal(afterClear.read('article').body, 'A separate document draft.');
});

test('saved draft values are validated without treating prototype names as inherited data', () => {
  const drafts = createCommentDraftStore(() => ({
    getItem: () => '{"constructor":"Constructor note","__proto__":"Prototype note","invalid":42,"nested":{"text":"invalid"}}',
    setItem: () => {}, removeItem: () => {},
  })).read('report');
  assert.equal(Object.getPrototypeOf(drafts), null);
  assert.equal(Object.hasOwn(drafts, 'constructor'), true);
  assert.equal(drafts.constructor, 'Constructor note');
  assert.equal(drafts.__proto__, 'Prototype note');
  assert.equal(Object.hasOwn(drafts, 'toString'), false);
  assert.equal(Object.hasOwn(drafts, 'invalid'), false);
  assert.equal(Object.hasOwn(drafts, 'nested'), false);
});

test('unavailable storage retains drafts in memory and a completed save preserves newer typing', () => {
  const drafts = createCommentDraftStore(() => { throw new Error('Storage is unavailable'); });
  drafts.set('report', 'body', 'Submitted version');
  drafts.set('report', 'body', 'A newer draft typed during submission');
  drafts.clearSubmitted('report', 'body', 'Submitted version');
  assert.equal(drafts.read('report').body, 'A newer draft typed during submission');
  drafts.set('article', 'body', 'Another document');
  assert.equal(drafts.read('report').body, 'A newer draft typed during submission');
  drafts.clearSubmitted('report', 'body', 'A newer draft typed during submission');
  assert.equal(Object.hasOwn(drafts.read('report'), 'body'), false);
  assert.equal(drafts.read('article').body, 'Another document');
});
