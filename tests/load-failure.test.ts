import test from 'node:test';
import assert from 'node:assert/strict';
import { isLoadFailure, retryDelay } from '../src/app/loadFailure';

test('failed view imports are told apart from errors inside a view', () => {
  // Chromium, Firefox, Safari, and bundler wording for a module that could not be fetched.
  assert.ok(isLoadFailure(new TypeError('Failed to fetch dynamically imported module: http://127.0.0.1:4310/assets/Reader-x.js')));
  assert.ok(isLoadFailure(new TypeError('error loading dynamically imported module: http://127.0.0.1:4310/assets/Reader-x.js')));
  assert.ok(isLoadFailure(new TypeError('Importing a module script failed.')));
  assert.ok(isLoadFailure(Object.assign(new Error('Loading chunk 3 failed.'), { name: 'ChunkLoadError' })));
  assert.equal(isLoadFailure(new TypeError("Cannot read properties of undefined (reading 'pages')")), false);
  assert.equal(isLoadFailure('Failed to fetch dynamically imported module'), false);
  assert.equal(isLoadFailure(null), false);
});

test('failed workspace loads retry sooner first, then back off to a ceiling', () => {
  assert.equal(retryDelay(0), 0, 'Nothing has failed, so nothing waits.');
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(failures => retryDelay(failures)), [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]);
  assert.equal(retryDelay(500), 30_000, 'Long outages keep the ceiling instead of overflowing.');
  assert.equal(retryDelay(3, 500, 1_500), 1_500);
});
