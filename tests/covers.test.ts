import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadImage } from '@napi-rs/canvas';
import { coverImage, coverWidth } from '../src/server/covers';
import { renderOnce } from '../src/server/render';
import { fixture } from './helpers';

test('a library cover is the first page as WebP, saved once beside its render', { timeout: 60_000 }, async () => {
  const f = await fixture();
  try {
    const { artifact, directory } = await renderOnce(f.root, 'proof');
    const copy = `${directory}-copy`;
    await cp(directory, copy, { recursive: true });
    // Requests that arrive together share one rasterization.
    const request = coverImage(directory);
    assert.equal(coverImage(directory), request);
    const first = await request;
    assert.equal(first.subarray(8, 12).toString('ascii'), 'WEBP');
    const image = await loadImage(first);
    const page = artifact.pages[0];
    assert.equal(image.width, coverWidth);
    assert.equal(image.height, Math.round(coverWidth * page.height / page.width));
    assert.deepEqual(await readFile(resolve(directory, 'cover.webp')), first);
    assert.deepEqual((await readdir(directory)).filter(name => name.startsWith('cover')), ['cover.webp'], 'No temporary file remains.');

    // The saved cover is served without reading the PDF again.
    await writeFile(resolve(directory, 'document.pdf'), 'not a PDF');
    assert.deepEqual(await coverImage(directory), first);

    // A failed cover is not saved and does not block the next one.
    await rm(resolve(copy, 'cover.webp'), { force: true });
    await writeFile(resolve(copy, 'document.pdf'), 'not a PDF');
    await assert.rejects(coverImage(copy));
    assert.deepEqual((await readdir(copy)).filter(name => name.startsWith('cover')), []);
    await rm(copy, { recursive: true, force: true });
    const fresh = await renderOnce(f.root, 'proof');
    assert.equal((await loadImage(await coverImage(fresh.directory))).width, coverWidth);
  } finally { await f.cleanup(); }
});
