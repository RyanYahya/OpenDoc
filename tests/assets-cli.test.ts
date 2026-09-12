import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, projectRoot } from './helpers';
import { AssetStore } from '../src/assets/store';

const exec = promisify(execFile);
const cli = resolve(projectRoot, 'src/server/assets-cli.ts');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAIAAABwJOjsAAAAOUlEQVR4nO3NQQEAIAwDsVIzqMEF/jXw3QzcHjQGsvY9muCRVYlBJrMqMcZc1SXGmKu6xBhzlT6PH78GAQA/IUyuAAAAAElFTkSuQmCC', 'base64');

async function assetsFixture() {
  const f = await fixture();
  // Managed assets must be local ordinary files; never write through the shared test symlink.
  await rm(resolve(f.root, 'assets'));
  await mkdir(resolve(f.root, 'assets'));
  await writeFile(resolve(f.root, 'supplied.png'), png);
  await writeFile(resolve(f.root, 'supplied.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect x="4" y="4" width="72" height="32" fill="white"/></svg>');
  return f;
}

async function invoke(root: string, args: string[]) {
  return exec(process.execPath, ['--import', import.meta.resolve('tsx'), cli, ...args], { cwd: root, timeout: 40_000, maxBuffer: 2_000_000 });
}
async function json(root: string, args: string[]) { return JSON.parse((await invoke(root, args)).stdout); }
async function rejectsCli(root: string, args: string[], pattern: RegExp) {
  await assert.rejects(invoke(root, args), (error: unknown) => {
    const result = error as { code: number; stdout: string; stderr: string };
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, pattern);
    return true;
  });
}

test('asset CLI imports mixed logo variations and preserves exact document versions', { timeout: 90_000 }, async () => {
  const f = await assetsFixture();
  try {
    const created = await json(f.root, ['import', 'logo', '--id', 'acme', '--name', 'Acme', '--file', 'supplied.png', '--variation-name', 'On light backgrounds', '--variation-description', 'Use on white or pale paper.']);
    assert.equal(created.asset.variations[0].id, 'default');
    assert.equal(created.asset.variations[0].description, 'Use on white or pale paper.');
    assert.deepEqual(await readFile(resolve(f.root, 'supplied.png')), png);
    const saved = await json(f.root, ['bind', 'proof', 'logo', 'acme']);
    assert.deepEqual(saved.logo, { id: 'acme', revision: created.asset.revision });

    const changed = await json(f.root, ['add-variation', 'acme', '--id', 'on-dark', '--name', 'On dark backgrounds', '--description', 'White mark on dark pages.', '--file', 'supplied.svg', '--expected-revision', created.asset.revision]);
    assert.notEqual(changed.asset.revision, created.asset.revision);
    assert.equal(changed.asset.variations[1].original.mime, 'image/svg+xml');
    assert.equal(changed.asset.variations[1].image.mime, 'image/png');
    assert.equal(changed.asset.variations[1].image.width / changed.asset.variations[1].image.height, 2);
    assert.deepEqual(JSON.parse(await readFile(resolve(f.root, 'documents/proof/assets.json'), 'utf8')), saved);

    const inspected = await json(f.root, ['inspect', 'logo', 'acme', '--json']);
    assert.deepEqual(inspected, await new AssetStore(f.root).inspect('logo', 'acme'));
    const previous = await json(f.root, ['inspect', 'logo', 'acme', '--revision', created.asset.revision]);
    assert.equal(previous.asset.variations.length, 1);
    assert.equal(previous.head.revision, changed.asset.revision);

    const rebound = await json(f.root, ['bind', 'proof', 'logo', 'acme', '--name', 'partner', '--variation', 'on-dark']);
    assert.deepEqual(rebound.logo, saved.logo);
    assert.deepEqual(rebound.logos.partner, { id: 'acme', revision: changed.asset.revision, variation: 'on-dark' });
    const unbound = await json(f.root, ['unbind', 'proof', 'logo', '--name', 'partner']);
    assert.equal(unbound.logos.partner, undefined);
    assert.deepEqual(unbound.logo, saved.logo);

    const listed = await json(f.root, ['list', 'logo']);
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0].count, 2);
    assert.equal('variations' in listed.items[0], false);
  } finally { await f.cleanup(); }
});

test('asset CLI revisions, theme defaults, and archive undo use guarded shared services', { timeout: 90_000 }, async () => {
  const f = await assetsFixture();
  try {
    const created = await json(f.root, ['import', 'logo', '--id', 'brand', '--name', 'Brand', '--file', 'supplied.png']);
    await writeFile(resolve(f.root, 'revision.json'), JSON.stringify({ expectedRevision: created.asset.revision, name: 'Brand renamed', variation: { id: 'default', description: 'Default on pale paper.' } }));
    const revised = await json(f.root, ['revise', 'logo', 'brand', '--metadata', 'revision.json']);
    assert.equal(revised.asset.id, 'brand');
    assert.equal(revised.asset.name, 'Brand renamed');
    assert.equal(revised.asset.variations[0].id, 'default');
    assert.equal(revised.versions.length, 2);
    await rejectsCli(f.root, ['revise', 'logo', 'brand', '--metadata', 'revision.json'], /changed.*Reload/i);

    const before = await json(f.root, ['defaults', 'neutral']);
    assert.deepEqual(before.defaults, { version: 1 });
    await writeFile(resolve(f.root, 'defaults.json'), JSON.stringify({ version: 1, logo: { id: 'brand' } }));
    const assigned = await json(f.root, ['defaults', 'neutral', '--metadata', 'defaults.json', '--expected-revision', before.revision]);
    assert.deepEqual(assigned.defaults.logo, { id: 'brand' });
    await rejectsCli(f.root, ['defaults', 'neutral', '--metadata', 'defaults.json', '--expected-revision', before.revision], /defaults changed/i);
    await rejectsCli(f.root, ['archive', 'logo', 'brand', '--expected-revision', revised.asset.revision], /theme default/i);
    const archived = await json(f.root, ['archive', 'logo', 'brand', '--expected-revision', revised.asset.revision, '--clear-defaults']);
    assert.equal(archived.head.archived, true);
    assert.deepEqual((await json(f.root, ['defaults', 'neutral'])).defaults, { version: 1 });
    assert.equal((await json(f.root, ['list', 'logo'])).items.length, 0);
    assert.equal((await json(f.root, ['list', 'logo', '--archived'])).items[0].archived, true);
    const restored = await json(f.root, ['restore', 'logo', 'brand', '--expected-revision', revised.asset.revision]);
    assert.equal(restored.head.archived, undefined);
    assert.deepEqual((await json(f.root, ['defaults', 'neutral'])).defaults.logo, { id: 'brand' });
  } finally { await f.cleanup(); }
});

test('asset CLI rejects ambiguous arguments and malformed input without publishing an asset', { timeout: 90_000 }, async () => {
  const f = await assetsFixture();
  try {
    assert.match((await invoke(f.root, ['--help'])).stdout, /Binding saves an exact version/);
    await rejectsCli(f.root, ['list', 'logo', '--revision', 'unused'], /not used by list/);
    await rejectsCli(f.root, ['bind', 'proof', 'body-font', 'acme', '--variation', 'on-dark'], /not used by bind/);
    await rejectsCli(f.root, ['import', 'logo', '--name', 'Ambiguous', '--file', 'supplied.png', '--file', 'supplied.svg'], /exactly one --file/);
    await rejectsCli(f.root, ['import', 'logo', '--file', 'supplied.png'], /Provide --name/);
    await rejectsCli(f.root, ['revise', 'logo', 'acme'], /Provide --metadata/);
    await writeFile(resolve(f.root, 'metadata.json'), '[]');
    await rejectsCli(f.root, ['revise', 'logo', 'acme', '--metadata', 'metadata.json'], /JSON object/);
    await writeFile(resolve(f.root, 'bad.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/missing.png"/></svg>');
    await rejectsCli(f.root, ['import', 'logo', '--name', 'Bad artwork', '--file', 'bad.svg'], /external|self-contained|resource|image/i);
    assert.deepEqual((await json(f.root, ['list', 'logo'])).items, []);
  } finally { await f.cleanup(); }
});

test('asset CLI groups repeated font files, validates added faces, and binds semantic roles', { timeout: 90_000 }, async () => {
  const f = await assetsFixture();
  const font = (face: string) => resolve(projectRoot, `assets/fonts/OpenDocSans-${face}.ttf`);
  try {
    const imported = await json(f.root, ['import', 'font', '--id', 'reading-sans', '--name', 'Reading Sans', '--file', font('Regular'), '--file', font('Italic')]);
    assert.equal(imported.asset.faces.length, 2);
    assert.equal(imported.asset.compatibility.defaultEligible, false);
    await rejectsCli(f.root, ['bind', 'proof', 'body-font', 'reading-sans'], /not ready/i);
    const complete = await json(f.root, ['add-faces', 'reading-sans', '--file', font('Semibold'), '--file', font('SemiboldItalic'), '--expected-revision', imported.asset.revision]);
    assert.equal(complete.asset.faces.length, 4);
    assert.deepEqual(complete.asset.faces.filter((face: { weight: number }) => face.weight === 400).map((face: { id: string }) => face.id), imported.asset.faces.map((face: { id: string }) => face.id));
    assert.equal(complete.asset.compatibility.defaultEligible, true);
    assert.equal(complete.asset.specimen.mime, 'application/pdf');
    const body = await json(f.root, ['bind', 'proof', 'body-font', 'reading-sans']);
    assert.deepEqual(body.bodyFont, { id: 'reading-sans', revision: complete.asset.revision });
    const heading = await json(f.root, ['bind', 'proof', 'heading-font', 'reading-sans', '--revision', complete.asset.revision]);
    assert.deepEqual(heading.headingFont, body.bodyFont);
    assert.deepEqual((await json(f.root, ['unbind', 'proof', 'heading-font'])), body);
  } finally { await f.cleanup(); }
});
