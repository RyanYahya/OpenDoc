import test from 'node:test';
import assert from 'node:assert/strict';
import { readSelection } from '../src/server/selection';

test('a selected phrase retains its page when the reader scrolls to another page', () => {
  const selected = { blockId: 'opening', page: 1, targetId: 'opening:children', start: 4, end: 10, quote: 'phrase', revision: 7, renderHash: 'current' };
  assert.deepEqual(readSelection(selected, 'opening'), selected);
  assert.equal(readSelection(null, null), null);
});

test('observed context excludes draft text and rejects malformed range identity', () => {
  const selected = { blockId: 'opening', page: 1, targetId: 'opening:children', start: 4, end: 10, quote: 'phrase' };
  assert.deepEqual(readSelection({ ...selected, draft: 'private unsaved text', instruction: 'not UI context' }, 'opening'), selected);
  assert.throws(() => readSelection(selected, 'different'), /active block/);
  assert.throws(() => readSelection({ ...selected, page: -1 }, 'opening'), /selection page/);
  assert.throws(() => readSelection({ ...selected, end: 3 }, 'opening'), /text range/);
  assert.throws(() => readSelection({ ...selected, quote: 'x'.repeat(8001) }, 'opening'), /shorter passage/);
});
