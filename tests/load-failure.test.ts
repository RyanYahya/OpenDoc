import test from 'node:test';
import assert from 'node:assert/strict';
import { isLoadFailure } from '../src/app/loadFailure';

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
