import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdir, readFile, readdir, unlink } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';
import { AssetStore } from '../src/assets/store';
import { withCommentLock } from '../src/server/comments';
import { deleteDocument } from '../src/server/documents';
import { fixture } from './helpers';

async function setup() {
  const f = await fixture();
  await unlink(resolve(f.root, 'assets')); await mkdir(resolve(f.root, 'assets'));
  const store = new AssetStore(f.root);
  const logo = await store.createLogo({ id: 'studio', name: 'Studio' }, { filename: 'studio.svg', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><rect width="100" height="40" fill="black"/></svg>') });
  return { ...f, store, pin: { id: logo.asset.id, revision: logo.asset.revision } };
}

test('a binding waiting behind deletion rejects without recreating the deleted document folder', async t => {
  for (const operation of ['bind', 'unbind'] as const) {
    const f = await setup();
    try {
      await f.store.bind('proof', 'logo', f.pin.id);
      let release!: () => void, entered!: () => void;
      const enteredLock = new Promise<void>(resolve => { entered = resolve; });
      const gate = new Promise<void>(resolve => { release = resolve; });
      const removing = withCommentLock(f.root, 'proof', async () => { entered(); await gate; return deleteDocument(f.root, 'proof'); });
      await enteredLock;
      let attempted!: () => void;
      const attemptedLock = new Promise<void>(resolve => { attempted = resolve; });
      const originalMkdir = fs.promises.mkdir;
      t.mock.method(fs.promises, 'mkdir', async (...args: Parameters<typeof fs.promises.mkdir>) => {
        if (String(args[0]).endsWith('/.opendoc/locks/proof.lock')) attempted();
        return originalMkdir(...args);
      });
      syncBuiltinESMExports();
      const saving = operation === 'bind' ? f.store.bind('proof', 'logo', f.pin.id, { name: 'partner' }) : f.store.unbind('proof', 'logo');
      const rejected = assert.rejects(saving, /changed|ENOENT|no longer exists/);
      await attemptedLock;
      release();
      const removed = await removing;
      await rejected;
      assert.deepEqual(await readdir(resolve(f.root, 'documents')), []);
      const trashed = JSON.parse(await readFile(resolve(f.root, '.opendoc/trash', removed.restoreId, 'document/assets.json'), 'utf8'));
      assert.deepEqual(trashed, { version: 1, logo: f.pin });
    } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await f.cleanup(); }
  }
});

test('file-first binding edits during save win against both bind and unbind', async t => {
  const f = await setup();
  try {
    const bindingsFile = resolve(f.root, 'documents/proof/assets.json');
    const initial = { version: 1, logo: f.pin };
    const latest = { version: 1, logo: f.pin, logos: { authored: f.pin } };
    const originalWrite = fs.promises.writeFile;
    let intercept = false;
    t.mock.method(fs.promises, 'writeFile', async (...args: Parameters<typeof fs.promises.writeFile>) => {
      const result = await originalWrite(...args);
      if (intercept && /\/\.assets-[^/]+\.tmp$/.test(String(args[0]))) {
        intercept = false;
        await originalWrite(bindingsFile, JSON.stringify(latest));
      }
      return result;
    });
    syncBuiltinESMExports();
    for (const operation of ['bind', 'unbind'] as const) {
      await originalWrite(bindingsFile, JSON.stringify(initial)); intercept = true;
      const saving = operation === 'bind' ? f.store.bind('proof', 'logo', f.pin.id, { name: 'requested' }) : f.store.unbind('proof', 'logo');
      await assert.rejects(saving, /asset choices changed.*Nothing was overwritten/);
      assert.deepEqual(JSON.parse(await readFile(bindingsFile, 'utf8')), latest);
      assert.ok(!(await readdir(resolve(f.root, 'documents/proof'))).some(file => file.startsWith('.assets-')));
    }
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await f.cleanup(); }
});

test('independent app and agent bindings serialize without dropping either named choice', async () => {
  const f = await setup();
  try {
    const other = new AssetStore(f.root);
    await Promise.all([f.store.bind('proof', 'logo', f.pin.id, { name: 'one' }), other.bind('proof', 'logo', f.pin.id, { name: 'two' })]);
    const saved = JSON.parse(await readFile(resolve(f.root, 'documents/proof/assets.json'), 'utf8'));
    assert.deepEqual(saved, { version: 1, logos: { one: f.pin, two: f.pin } });
  } finally { await f.cleanup(); }
});
