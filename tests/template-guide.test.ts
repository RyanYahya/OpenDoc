import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readTemplateGuide } from '../src/server/templates';
import { Markdown } from '../src/app/Markdown';
import { resolveGuideLink } from '../src/app/guideLinks';

test('template guides read current Markdown without requiring a working PDF', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'opendoc-guide-'));
  const folder = resolve(root, 'templates/example');
  try {
    await mkdir(folder, { recursive: true });
    const file = resolve(folder, 'AGENTS.md');
    await writeFile(file, '# Example\n\nAdapt this **starting point**.');
    assert.equal(await readTemplateGuide(root, 'example'), await readFile(file, 'utf8'));
    await writeFile(file, '# Revised guide');
    assert.equal(await readTemplateGuide(root, 'example'), '# Revised guide');
    await writeFile(file, '');
    assert.equal(await readTemplateGuide(root, 'example'), '');
    await writeFile(file, 'x'.repeat(128_001));
    await assert.rejects(readTemplateGuide(root, 'example'), /too large/);
    await rm(file);
    await assert.rejects(readTemplateGuide(root, 'example'), /ENOENT/);
    await writeFile(resolve(root, 'outside.md'), 'Outside the template');
    await symlink(resolve(root, 'outside.md'), file);
    await assert.rejects(readTemplateGuide(root, 'example'), /outside/);
    await assert.rejects(readTemplateGuide(root, '../example'), /Invalid template ID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('guide Markdown renders rich text without executable HTML or unsafe links', () => {
  const source = '# Guide\n\n## Layout\n\nUse **emphasis** and `titleStyle`.\n\n- Keep it flexible\n- [x] Review\n\n```tsx\n<Proposal />\n```\n\n| Choice | Value |\n| --- | --- |\n| Theme | Neutral |\n\n[Reference](https://example.com)\n\n[Unsafe](javascript:alert%281%29)\n\n<script>alert(1)</script>';
  const html = renderToStaticMarkup(createElement(Markdown, { children: source, file: 'templates/example/AGENTS.md', onNavigate: () => {} }));
  for (const expected of ['>Guide</h1>', '>Layout</h2>', '<strong>emphasis</strong>', '<code>titleStyle</code>', '<ul', '<pre>', '&lt;Proposal /&gt;', '<table>', 'type="checkbox"', 'href="https://example.com"', 'target="_blank"']) assert.ok(html.includes(expected), expected);
  assert.doesNotMatch(html, /<script|javascript:/);
});

test('guide links resolve relative to the current file through templates, docs, and skills', () => {
  assert.deepEqual(resolveGuideLink('templates/monthly-report/AGENTS.md', 'README.md'), { kind: 'guide', location: { file: 'templates/monthly-report/README.md' } });
  assert.deepEqual(resolveGuideLink('templates/monthly-report/README.md', '../../docs/MEDIA.md'), { kind: 'guide', location: { file: 'docs/MEDIA.md' } });
  assert.deepEqual(resolveGuideLink('docs/MEDIA.md', 'ASSETS.md'), { kind: 'guide', location: { file: 'docs/ASSETS.md' } });
  assert.deepEqual(resolveGuideLink('docs/THEMES.md', '../.agents/skills/opendoc-create-theme/SKILL.md'), { kind: 'guide', location: { file: '.agents/skills/opendoc-create-theme/SKILL.md' } });
  assert.deepEqual(resolveGuideLink('.agents/skills/opendoc-create-theme/SKILL.md', '../../../THIRD_PARTY.md'), { kind: 'guide', location: { file: 'THIRD_PARTY.md' } });
  assert.deepEqual(resolveGuideLink('templates/example/AGENTS.md', '/README.md'), { kind: 'guide', location: { file: 'README.md' } });
});

test('guide fragments stay attached to their file while source links are not navigable', () => {
  const file = 'templates/monthly-report/README.md';
  assert.deepEqual(resolveGuideLink(file, '#data-contract'), { kind: 'guide', location: { file, fragment: 'data-contract' } });
  assert.deepEqual(resolveGuideLink('templates/monthly-report/AGENTS.md', 'README.md#data-contract'), { kind: 'guide', location: { file, fragment: 'data-contract' } });
  assert.deepEqual(resolveGuideLink('docs/ASSETS.md', 'THEMES.md?from=assets#geometry%20rules'), { kind: 'guide', location: { file: 'docs/THEMES.md', fragment: 'geometry rules' } });
  assert.deepEqual(resolveGuideLink(file, 'https://example.com/guide#section'), { kind: 'external', href: 'https://example.com/guide#section' });
  for (const href of ['../src/app/colors.css', 'javascript:alert(1)', 'file:///README.md', 'README.md#%ZZ']) assert.equal(resolveGuideLink(file, href), undefined);
});

test('guide markup keeps local links inside the viewer and provides stable heading targets', () => {
  const source = '## Design *rules*\n\n[Contract](README.md#data-contract) · [Here](#design-rules) · [Source](../../src/app/colors.css) · [External](https://example.com)\n\n## Design rules';
  const html = renderToStaticMarkup(createElement(Markdown, { children: source, file: 'templates/example/AGENTS.md', onNavigate: () => {} }));
  assert.ok(html.includes('href="/api/guides?path=templates%2Fexample%2FREADME.md#data-contract"'));
  assert.ok(html.includes('href="/api/guides?path=templates%2Fexample%2FAGENTS.md#design-rules"'));
  assert.ok(html.includes('<span title="../../src/app/colors.css">Source</span>'));
  assert.ok(html.includes('data-guide-heading="design-rules"'));
  assert.ok(html.includes('data-guide-heading="design-rules-1"'));
  assert.equal(html.match(/target="_blank"/g)?.length, 1, 'Only the external website opens outside the guide.');
});
