import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { applicationRoot } from '../src/runtime/paths';
import { GuideError, readGuide } from '../src/server/guides';

test('independent workspaces read canonical installed guides and keep live local overrides', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opendoc-runtime-guides-'));
  try {
    for (const file of ['README.md', 'AGENTS.md', 'VALIDATION.md', 'THIRD_PARTY.md', 'templates/AGENTS.md', 'vendor/formepdf/README.md', 'docs/AUTHORING.md', '.agents/skills/opendoc-create/SKILL.md']) {
      assert.deepEqual(await readGuide(root, file), { file, markdown: await readFile(resolve(applicationRoot, file), 'utf8') });
    }
    await mkdir(resolve(root, 'docs'));
    await writeFile(resolve(root, 'docs/AUTHORING.md'), '# Workspace authoring');
    assert.deepEqual(await readGuide(root, 'docs/AUTHORING.md'), { file: 'docs/AUTHORING.md', markdown: '# Workspace authoring' });
    await writeFile(resolve(root, 'docs/AUTHORING.md'), '# Updated workspace authoring');
    assert.equal((await readGuide(root, 'docs/AUTHORING.md')).markdown, '# Updated workspace authoring');
    await rm(resolve(root, 'docs/AUTHORING.md'));
    assert.equal((await readGuide(root, 'docs/AUTHORING.md')).markdown, await readFile(resolve(applicationRoot, 'docs/AUTHORING.md'), 'utf8'));

    for (const file of ['themes/neutral/design.md', 'templates/monthly-report/README.md', 'docs/no-such-guide.md']) {
      await assert.rejects(readGuide(root, file), error => error instanceof GuideError && error.status === 404);
    }
    for (const file of ['node_modules/another-package/README.md', 'node_modules/opendoc/src/README.md', 'node_modules/opendoc/docs/../README.md', 'docs/../README.md', '.agents/skills/../../README.md']) {
      await assert.rejects(readGuide(root, file), error => error instanceof GuideError && error.status === 400);
    }
    assert.deepEqual(await readGuide(root, 'node_modules/opendoc/docs/AUTHORING.md'), {
      file: 'node_modules/opendoc/docs/AUTHORING.md', markdown: await readFile(resolve(applicationRoot, 'docs/AUTHORING.md'), 'utf8'),
    });
    await mkdir(resolve(root, 'templates/local'), { recursive: true });
    await writeFile(resolve(root, 'templates/local/AGENTS.md'), '# Editable local template');
    assert.deepEqual(await readGuide(root, 'node_modules/opendoc/templates/local/AGENTS.md'), { file: 'templates/local/AGENTS.md', markdown: '# Editable local template' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('installed guide fallback does not hide unsafe or invalid workspace overrides', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opendoc-runtime-guide-overrides-'));
  try {
    await mkdir(resolve(root, 'docs'));
    await symlink(resolve(applicationRoot, 'docs/AUTHORING.md'), resolve(root, 'docs/AUTHORING.md'));
    await assert.rejects(readGuide(root, 'docs/AUTHORING.md'), /outside the workspace/);
    await rm(resolve(root, 'docs/AUTHORING.md'));

    await mkdir(resolve(root, '.opendoc'));
    await writeFile(resolve(root, '.opendoc/private.md'), 'Private workspace information');
    await symlink(resolve(root, '.opendoc/private.md'), resolve(root, 'docs/AUTHORING.md'));
    await assert.rejects(readGuide(root, 'docs/AUTHORING.md'), error => error instanceof GuideError && error.status === 400);
    await rm(resolve(root, 'docs/AUTHORING.md'));

    await mkdir(resolve(root, 'docs/AUTHORING.md'));
    await assert.rejects(readGuide(root, 'docs/AUTHORING.md'), /regular Markdown file/);
    await rm(resolve(root, 'docs/AUTHORING.md'), { recursive: true });

    await writeFile(resolve(root, 'docs/AUTHORING.md'), 'x'.repeat(128_001));
    await assert.rejects(readGuide(root, 'docs/AUTHORING.md'), /too large/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
