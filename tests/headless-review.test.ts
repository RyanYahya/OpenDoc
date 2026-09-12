import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { access, cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { exportDocuments } from '../src/server/export-batch';
import { publishReview, reviewTarget } from '../src/server/review';
import type { RenderArtifact } from '../src/shared/types';
import { ExportChangedError } from '../src/server/export-file';
import { parseReviewArgs } from '../src/server/review-cli';
import { fixture, projectRoot, source, until } from './helpers';

const exec = promisify(execFile);
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('review requires exactly one contained document or specimen identity', () => {
  assert.deepEqual(parseReviewArgs(['proof', '--json']), { help: false, json: true, target: { kind: 'document', id: 'proof' } });
  assert.equal(parseReviewArgs(['--theme', 'neutral']).target?.kind, 'theme');
  assert.equal(parseReviewArgs(['--template', 'executive-brief']).target?.kind, 'template');
  for (const args of [[], ['proof', 'other'], ['proof', '--theme', 'neutral'], ['--theme', 'neutral', '--template', 'brief'], ['../outside'], ['--theme', '../neutral'], ['--theme', ''], ['--theme', '', 'proof'], ['--theme', 'neutral', '--theme', 'neutral']]) assert.throws(() => parseReviewArgs(args));
});

test('direct exports ignore a live GUI session, while normal exports preserve its authority', async () => {
  const f = await fixture();
  let requests = 0;
  const server = createServer((_request, response) => { requests++; response.writeHead(503, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Current GUI preview is invalid.' })); });
  await new Promise<void>(accept => server.listen(0, '127.0.0.1', accept));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    await mkdir(resolve(f.root, '.opendoc'));
    await writeFile(resolve(f.root, '.opendoc/server.json'), JSON.stringify({ origin: `http://127.0.0.1:${address.port}`, token: 'test-token' }));
    const [direct] = await exportDocuments(f.root, ['proof'], { mode: 'direct' });
    assert.equal(direct.status, 'success');
    assert.equal(requests, 0);
    const [normal] = await exportDocuments(f.root, ['proof']);
    assert.equal(normal.status, 'error');
    if (normal.status === 'error') assert.match(normal.error, /Current GUI preview/);
    assert.equal(requests, 1);
  } finally { await new Promise<void>(accept => server.close(() => accept())); await f.cleanup(); }
});

test('review returns exact PDF bytes, page images, extracted text, and stable source IDs; failures retain the set', { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    await mkdir(resolve(f.root, '.opendoc'));
    await writeFile(resolve(f.root, '.opendoc/server.json'), 'not a GUI session');
    const reviewed = await reviewTarget(f.root, { kind: 'document', id: 'proof' });
    if (reviewed.status !== 'ready') throw new Error(reviewed.error);
    const saved = await readFile(reviewed.outputs.review);
    const pdf = await readFile(reviewed.outputs.pdf);
    assert.equal(sha256(pdf), reviewed.hash);
    assert.equal(reviewed.visualReview, 'required');
    assert.equal(reviewed.factualReview, 'required');
    assert.equal(reviewed.pages.length, reviewed.pageCount);
    assert.ok(reviewed.blocks.some(block => block.id === 'target' && block.source?.file === 'documents/proof/index.tsx'));
    assert.match(await readFile(reviewed.outputs.text, 'utf8'), /stable paragraph/);
    for (const page of reviewed.pages) {
      const png = await readFile(page.image);
      assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(png.readUInt32BE(16), Math.ceil(page.width * 1.5));
      assert.equal(png.readUInt32BE(20), Math.ceil(page.height * 1.5));
      assert.ok((await readFile(page.text, 'utf8')).trim());
    }
    const artifact: RenderArtifact = {
      hash: reviewed.hash, renderedAt: reviewed.renderedAt, format: reviewed.format, issues: reviewed.issues,
      meta: { title: 'Proof', description: 'Review fixture', theme: 'neutral' },
      pages: reviewed.pages.map(page => ({ width: page.width, height: page.height, fragments: page.blockIds.map(id => ({ id, x: 0, y: 0, width: 1, height: 1 })) })),
      blocks: Object.fromEntries(reviewed.blocks.map(block => [block.id, block])),
    };
    await assert.rejects(publishReview(f.root, { kind: 'document', id: 'proof' }, artifact, pdf, () => false), ExportChangedError);
    assert.deepEqual(await readFile(reviewed.outputs.review), saved, 'A source change after rasterization cannot replace the prior set.');
    const note = resolve(reviewed.outputs.directory, 'personal-notes.txt');
    await writeFile(note, 'Keep my review notes.');
    await assert.rejects(publishReview(f.root, { kind: 'document', id: 'proof' }, artifact, pdf, () => true), /contains other files/);
    assert.equal(await readFile(note, 'utf8'), 'Keep my review notes.');
    await rm(note);
    await assert.rejects(publishReview(f.root, { kind: 'document', id: 'proof' }, artifact, pdf, () => {
      writeFileSync(note, 'Added while the next review was being prepared.');
      return true;
    }), /review files changed during preparation/);
    assert.equal(await readFile(note, 'utf8'), 'Added while the next review was being prepared.');
    assert.deepEqual(await readFile(reviewed.outputs.pdf), pdf);
    assert.deepEqual(await readFile(reviewed.outputs.review), saved);
    await rm(note);
    const originalText = await readFile(reviewed.outputs.text);
    await assert.rejects(publishReview(f.root, { kind: 'document', id: 'proof' }, artifact, pdf, () => {
      writeFileSync(reviewed.outputs.text, 'A concurrent correction to the extracted text.');
      return true;
    }), /review files changed during preparation/);
    assert.equal(await readFile(reviewed.outputs.text, 'utf8'), 'A concurrent correction to the extracted text.');
    assert.deepEqual(await readFile(reviewed.outputs.pdf), pdf);
    assert.deepEqual(await readFile(reviewed.outputs.review), saved);
    await writeFile(reviewed.outputs.text, originalText);
    await publishReview(f.root, { kind: 'document', id: 'proof' }, artifact, pdf, () => true);
    assert.deepEqual(await readFile(reviewed.outputs.review), saved, 'Replacing an existing review publishes the whole exact set.');
    await writeFile(f.entry, source('<Paragraph id="outside" style={{marginLeft:-100}}>An off-page paragraph.</Paragraph>'));
    const failed = await reviewTarget(f.root, { kind: 'document', id: 'proof' });
    assert.equal(failed.status, 'error');
    if (failed.status === 'error') {
      assert.equal(failed.updated, false);
      assert.equal(failed.previousOutputRetained, true);
      assert.ok(failed.issues.some(issue => issue.code === 'page-overflow' && issue.blockId === 'outside' && issue.page === 1));
    }
    assert.deepEqual(await readFile(reviewed.outputs.review), saved);
    assert.deepEqual(await readFile(reviewed.outputs.pdf), pdf);
    await writeFile(f.entry, `import {writeFileSync} from 'node:fs'; import {resolve} from 'node:path';\n` + source().replace('function Proof(){return', 'function Proof(){writeFileSync(resolve(process.cwd(),".opendoc/review-started"),"started"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,450); return'));
    const pending = reviewTarget(f.root, { kind: 'document', id: 'proof' });
    await until(async () => access(resolve(f.root, '.opendoc/review-started')).then(() => true, () => false));
    await writeFile(f.entry, source().replace('Proof document', 'A newer draft'));
    const stale = await pending;
    assert.equal(stale.status, 'error');
    if (stale.status === 'error') assert.match(stale.error, /changed during export/);
    assert.deepEqual(await readFile(reviewed.outputs.review), saved);
    assert.deepEqual(await readdir(resolve(f.root, '.opendoc/renders')), []);
    assert.deepEqual(await readdir(resolve(f.root, 'output/reviews/documents')), ['proof']);
  } finally { await f.cleanup(); }
});

test('template check and preview validate their catalog and publish exact bytes without creating documents', { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    await cp(resolve(projectRoot, 'templates/executive-brief'), resolve(f.root, 'templates/executive-brief'), { recursive: true });
    const run = (...args: string[]) => exec(process.execPath, ['--import', 'tsx', resolve(projectRoot, 'src/server/templates-cli.ts'), ...args, '--json'], { cwd: f.root, timeout: 15_000 });
    const checked = JSON.parse((await run('check', 'executive-brief')).stdout);
    assert.equal(checked.status, 'ready');
    await assert.rejects(access(resolve(f.root, 'output/templates/executive-brief.pdf')), { code: 'ENOENT' });
    const preview = JSON.parse((await run('preview', 'executive-brief')).stdout);
    const bytes = await readFile(preview.output);
    assert.equal(sha256(bytes), preview.hash);
    assert.deepEqual(await readdir(resolve(f.root, 'documents')), ['proof']);
    const descriptor = resolve(f.root, 'templates/executive-brief/template.json');
    const previous = await readFile(descriptor, 'utf8');
    await writeFile(descriptor, '{}');
    const invalid = await reviewTarget(f.root, { kind: 'template', id: 'executive-brief' });
    assert.equal(invalid.status, 'error');
    if (invalid.status === 'error') assert.match(invalid.error, /template.name/);
    assert.deepEqual(await readFile(preview.output), bytes);
    await writeFile(descriptor, previous);
    await mkdir(resolve(f.root, 'elsewhere'));
    await rm(resolve(f.root, 'output/templates'), { recursive: true });
    await symlink(resolve(f.root, 'elsewhere'), resolve(f.root, 'output/templates'));
    await assert.rejects(run('preview', 'executive-brief'), /symbolic links/);
    assert.deepEqual(await readdir(resolve(f.root, 'elsewhere')), []);
    await symlink(resolve(f.root, 'elsewhere'), resolve(f.root, 'output/reviews'));
    const unsafe = await reviewTarget(f.root, { kind: 'theme', id: 'neutral' });
    assert.equal(unsafe.status, 'error');
    if (unsafe.status === 'error') assert.match(unsafe.error, /symbolic links/);
    assert.deepEqual(await readdir(resolve(f.root, 'elsewhere')), []);
  } finally { await f.cleanup(); }
});
