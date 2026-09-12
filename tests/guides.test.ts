import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { GuideError, readGuide } from '../src/server/guides';
import { fixture, projectRoot, until } from './helpers';

test('guide reads are current, bounded, and limited to allowed canonical Markdown paths', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opendoc-guides-'));
  const outside = await mkdtemp(resolve(tmpdir(), 'opendoc-outside-guide-'));
  try {
    const paths = ['README.md', 'AGENTS.md', 'VALIDATION.md', 'THIRD_PARTY.md', 'docs/nested/review.md', 'templates/AGENTS.md', 'templates/example/README.md', 'themes/example/design.md', '.agents/skills/example/SKILL.md', 'vendor/formepdf/README.md'];
    for (const file of paths) {
      await mkdir(dirname(resolve(root, file)), { recursive: true });
      await writeFile(resolve(root, file), `# ${file}`);
      assert.deepEqual(await readGuide(root, file), { file, markdown: `# ${file}` });
    }
    await writeFile(resolve(root, 'docs/nested/review.md'), '# Revised guide');
    await symlink(resolve(root, 'docs/nested/review.md'), resolve(root, 'docs/alias.md'));
    assert.deepEqual(await readGuide(root, 'docs/alias.md'), { file: 'docs/nested/review.md', markdown: '# Revised guide' });
    for (const file of [null, '', '/README.md', '../README.md', 'docs/../README.md', 'docs//review.md', 'docs\\review.md', 'https://example.com/README.md', 'README.md#topic', 'README.md?query=1', '.opendoc/current.json', 'package.json', 'documents/example/notes.md', 'src/app/ui/README.md', '.agents/private.md', 'docs/.hidden.md']) {
      await assert.rejects(readGuide(root, file), error => error instanceof GuideError && error.status === 400);
    }
    await mkdir(resolve(root, '.opendoc'));
    await writeFile(resolve(root, '.opendoc/private.md'), 'Private runtime information');
    await symlink(resolve(root, '.opendoc/private.md'), resolve(root, 'docs/masked.md'));
    await assert.rejects(readGuide(root, 'docs/masked.md'), error => error instanceof GuideError && error.status === 400);
    await writeFile(resolve(outside, 'private.md'), 'Outside the workspace');
    await symlink(resolve(outside, 'private.md'), resolve(root, 'docs/outside.md'));
    await assert.rejects(readGuide(root, 'docs/outside.md'), /outside the workspace/);
    await mkdir(resolve(root, 'docs/folder.md'));
    await assert.rejects(readGuide(root, 'docs/folder.md'), /regular Markdown file/);
    await writeFile(resolve(root, 'docs/large.md'), 'x'.repeat(128_001));
    await assert.rejects(readGuide(root, 'docs/large.md'), /too large/);
    await assert.rejects(readGuide(root, 'docs/missing.md'), error => error instanceof GuideError && error.status === 404 && /docs\/missing.md/.test(error.message));
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('production guide API follows local authoring links without exposing workspace source', { timeout: 15_000 }, async () => {
  const f = await fixture();
  await rm(resolve(f.root, 'documents/proof'), { recursive: true });
  await mkdir(resolve(f.root, 'dist'));
  await writeFile(resolve(f.root, 'dist/index.html'), '<!doctype html><title>OpenDoc</title>');
  await mkdir(resolve(f.root, 'templates/example'), { recursive: true });
  await mkdir(resolve(f.root, 'docs'));
  await writeFile(resolve(f.root, 'templates/example/AGENTS.md'), '# Example\n\nRead the [contract](README.md).');
  await writeFile(resolve(f.root, 'templates/example/README.md'), '# Contract\n\nRead [Authoring](../../docs/AUTHORING.md).');
  await writeFile(resolve(f.root, 'docs/AUTHORING.md'), '# Authoring');
  const child = spawn(process.execPath, ['--import', 'tsx', resolve(projectRoot, 'src/server/index.ts'), '--production'], { cwd: f.root, env: { ...process.env, OPENDOC_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', value => logs += value); child.stderr.on('data', value => logs += value);
  try {
    let origin = '';
    await until(async () => {
      try { origin = JSON.parse(await readFile(resolve(f.root, '.opendoc/server.json'), 'utf8')).origin; return true; }
      catch { if (child.exitCode !== null) throw new Error(logs); return false; }
    });
    const get = (file: string) => fetch(`${origin}/api/guides?path=${encodeURIComponent(file)}`);
    const initial = await fetch(`${origin}/api/templates/example/guide`).then(response => response.json());
    assert.equal(initial.file, 'templates/example/AGENTS.md');
    assert.match(initial.markdown, /\[contract\]\(README.md\)/);
    const contract = await get('templates/example/README.md');
    assert.equal(contract.status, 200); assert.equal(contract.headers.get('cache-control'), 'no-store');
    assert.equal((await contract.json()).file, 'templates/example/README.md');
    assert.deepEqual(await (await get('docs/AUTHORING.md')).json(), { file: 'docs/AUTHORING.md', markdown: '# Authoring' });
    await writeFile(resolve(f.root, 'docs/AUTHORING.md'), '# Updated authoring');
    assert.equal((await (await get('docs/AUTHORING.md')).json()).markdown, '# Updated authoring');
    const theme = await fetch(`${origin}/api/themes/neutral/guide`).then(response => response.json());
    assert.equal(theme.file, 'themes/neutral/design.md'); assert.ok(theme.markdown.length > 0);
    const missing = await get('docs/missing.md');
    assert.equal(missing.status, 404); assert.match((await missing.json()).error, /docs\/missing.md/);
    for (const path of ['../README.md', '.opendoc/server.json', 'src/server/index.ts', 'documents/proof/notes.md']) assert.equal((await get(path)).status, 400);
    assert.equal((await fetch(`${origin}/api/guides`)).status, 400);
    assert.equal((await fetch(`${origin}/README.md`)).status, 404, 'Guides stay behind the bounded API rather than a general static file server.');
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await until(() => child.exitCode !== null, 5000).catch(async () => { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }); }
    await f.cleanup();
  }
});
