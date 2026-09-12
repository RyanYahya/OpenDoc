import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DocumentAssets } from '../src/shared/assets';
import type { DocumentState, RenderArtifact } from '../src/shared/types';
import { assetUsage } from '../src/assets/usage';
import { fixture } from './helpers';

const oldRef = { id: 'studio', revision: 'a'.repeat(64) }, newRef = { id: 'studio', revision: 'b'.repeat(64) };
function artifact(bindings: DocumentAssets, used = true, date = '2026-09-10T00:00:00.000Z'): RenderArtifact {
  return { meta: { title: 'Rendered document name', description: '', theme: 'neutral' }, blocks: {}, pages: [], hash: 'd'.repeat(64), renderedAt: date,
    provenance: { entry: 'documents/proof/index.tsx' }, assetBindings: bindings,
    assets: used ? [{ kind: 'logo', ...oldRef, variation: 'primary' }] : [] };
}
async function storedArtifact(root: string, value: RenderArtifact, label = 'proof') {
  const directory = resolve(root, '.opendoc/renders', `${label}-${randomUUID()}`);
  await mkdir(directory, { recursive: true }); await writeFile(resolve(directory, 'artifact.json'), JSON.stringify(value));
}

test('asset usage distinguishes saved choices, actual PDF use, and current readiness using live states', async () => {
  const f = await fixture();
  try {
    await writeFile(resolve(f.root, 'documents/proof/assets.json'), JSON.stringify({ version: 1, logo: oldRef }));
    await writeFile(resolve(f.root, 'themes/neutral/assets.json'), JSON.stringify({ version: 1, logo: { id: 'studio' } }));
    await writeFile(resolve(f.root, 'themes/neutral/index.ts'), "export const theme={id:'neutral',name:'Neutral usage proof'}; throw new Error('Do not evaluate');");
    const state: DocumentState = { id: 'proof', name: 'A chosen name', status: 'ready', revision: 1, artifact: artifact({ version: 1, logo: oldRef }) };
    const current = await assetUsage(f.root, 'logo', 'studio', [state]);
    assert.deepEqual(current.documents, [{ id: 'proof', name: 'A chosen name', revision: oldRef.revision, roles: ['logo'], rendered: true, current: true }]);
    assert.equal(current.themes[0].name, 'Neutral usage proof');
    state.status = 'error';
    assert.equal((await assetUsage(f.root, 'logo', 'studio', [state])).documents[0].current, false);
    state.status = 'ready'; state.artifact = artifact({ version: 1, logo: oldRef }, false);
    assert.deepEqual((await assetUsage(f.root, 'logo', 'studio', [state])).documents[0], { id: 'proof', name: 'A chosen name', revision: oldRef.revision, roles: ['logo'], rendered: false, current: false });
    state.artifact = artifact({ version: 1, logo: oldRef });
    await writeFile(resolve(f.root, 'documents/proof/assets.json'), JSON.stringify({ version: 1, logo: newRef }));
    const rebound = (await assetUsage(f.root, 'logo', 'studio', [state])).documents;
    assert.deepEqual(rebound.map(row => ({ revision: row.revision, rendered: row.rendered, current: row.current })), [
      { revision: oldRef.revision, rendered: true, current: false }, { revision: newRef.revision, rendered: false, current: false },
    ]);
    await writeFile(resolve(f.root, 'documents/proof/assets.json'), '{"version":1}');
    const unbound = (await assetUsage(f.root, 'logo', 'studio', [state])).documents;
    assert.equal(unbound.length, 1); assert.equal(unbound[0].rendered, true); assert.equal(unbound[0].current, false);
  } finally { await f.cleanup(); }
});

test('CLI usage reads only the newest matching artifact and never infers current readiness', async () => {
  const f = await fixture();
  try {
    await writeFile(resolve(f.root, 'documents/proof/assets.json'), JSON.stringify({ version: 1, logos: { partner: oldRef } }));
    await storedArtifact(f.root, artifact({ version: 1, logos: { partner: oldRef } }));
    const state = (await assetUsage(f.root, 'logo', 'studio')).documents[0];
    assert.equal(state.rendered, true); assert.equal(state.current, false); assert.deepEqual(state.roles, ['logo:partner']);
    assert.equal(state.name, 'Rendered document name');
    await storedArtifact(f.root, { ...artifact({ version: 1 }, false, '2026-09-11T00:00:00.000Z'), meta: { title: 'Newest document', description: '', theme: 'neutral' } });
    await storedArtifact(f.root, { ...artifact({ version: 1, logo: oldRef }, true, '2026-09-12T00:00:00.000Z'), provenance: { entry: 'themes/proof/preview.tsx' } });
    const latest = (await assetUsage(f.root, 'logo', 'studio')).documents[0];
    assert.equal(latest.rendered, false); assert.equal(latest.name, 'Newest document');
  } finally { await f.cleanup(); }
});

test('usage preserves Trash relationships, isolates corrupt neighbors, and never evaluates names', async () => {
  const f = await fixture();
  try {
    const receipt = resolve(f.root, '.opendoc/trash', randomUUID());
    await mkdir(resolve(receipt, 'document'), { recursive: true });
    await writeFile(resolve(receipt, 'receipt.json'), JSON.stringify({ id: 'proof', name: 'Archived brand brief', deletedAt: '2026-09-10T12:00:00.000Z' }));
    await writeFile(resolve(receipt, 'document/index.tsx'), await readFile(f.entry, 'utf8'));
    await writeFile(resolve(receipt, 'document/assets.json'), JSON.stringify({ version: 1, logo: oldRef }));
    await writeFile(resolve(f.root, 'documents/proof/assets.json'), JSON.stringify({ version: 1, logo: newRef }));
    await storedArtifact(f.root, artifact({ version: 1, logo: oldRef }));
    await storedArtifact(f.root, { ...artifact({ version: 1, logo: newRef }, false, '2026-09-11T00:00:00.000Z'), assets: [{ kind: 'logo', ...newRef }] });
    await mkdir(resolve(f.root, 'documents/broken')); await writeFile(resolve(f.root, 'documents/broken/index.tsx'), 'throw new Error("Never evaluate this");'); await writeFile(resolve(f.root, 'documents/broken/assets.json'), '{');
    await mkdir(resolve(f.root, 'themes/dynamic')); await writeFile(resolve(f.root, 'themes/dynamic/index.ts'), 'throw new Error("Never evaluate this theme"); export const theme={id:"dynamic",name:compute()};');
    await writeFile(resolve(f.root, 'themes/dynamic/assets.json'), JSON.stringify({ version: 1, logo: { id: 'studio' } }));
    const result = await assetUsage(f.root, 'logo', 'studio');
    assert.equal(result.themes[0].name, 'dynamic');
    const trashed = result.documents.filter(row => row.trashed);
    assert.equal(trashed.length, 1); assert.equal(trashed[0].revision, oldRef.revision); assert.equal(trashed[0].name, 'Archived brand brief');
    assert.equal(trashed[0].rendered, true); assert.equal(trashed[0].current, false);
    assert.equal(result.documents.find(row => !row.trashed)!.revision, newRef.revision);
  } finally { await f.cleanup(); }
});
