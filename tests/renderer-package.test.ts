import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectRoot } from './helpers';

test('all distributed renderer targets are valid WASM without machine-specific build paths', async () => {
  const localPath = /\/Users\/|(?<!\/build)\/home\/|[A-Z]:\\Users\\|\/(?:private\/)?var\/folders\//i;
  for (const target of ['pkg', 'pkg-web', 'pkg-node']) {
    const bytes = await readFile(resolve(projectRoot, 'node_modules/@formepdf/core', target, 'forme_bg.wasm'));
    assert.ok(WebAssembly.validate(bytes), `${target} must remain a valid WebAssembly module.`);
    assert.ok(!localPath.test(bytes.toString('latin1')), `${target} contains a machine-specific build path; rebuild with source-path remapping.`);
  }
});
