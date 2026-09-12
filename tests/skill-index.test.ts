import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillIndex } from '../src/shared/skill-index';

const root = fileURLToPath(new URL('..', import.meta.url));
const skillsRoot = resolve(root, '.agents/skills');

test('every shipped skill appears under its invocable name with a short UI description', async () => {
  const names = await readdir(skillsRoot);
  assert.ok(names.length, 'The shipped skill index must not be empty');
  const entries: Record<string, string> = {};
  for (const name of names) {
    assert.match(name, /^opendoc-[a-z-]+$/);
    const folder = resolve(skillsRoot, name);
    const skill = await readFile(resolve(folder, 'SKILL.md'), 'utf8');
    assert.ok(skill.startsWith(`---\nname: ${name}\n`));
    assert.match(skill, /^description: .+/m);
    assert.doesNotMatch(skill, /disable-model-invocation: true/);
    const path = resolve(folder, 'agents/openai.yaml');
    const metadata = await readFile(path, 'utf8');
    assert.ok(metadata.includes(`$${name}`), 'The prompt invokes its own skill');
    assert.doesNotMatch(metadata, /allow_implicit_invocation:\s*false/);
    entries[path] = metadata;
  }
  const index = skillIndex(entries);
  assert.deepEqual(index.map(skill => skill.name), names.sort());
  for (const skill of index) assert.ok(skill.description.length <= 80, skill.name);
});

test('root routing, skill workflow, and disclosed-reference links resolve after renaming', async () => {
  const files = ['AGENTS.md', ...((await readdir(skillsRoot, { recursive: true })).map(file => `.agents/skills/${file}`))];
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const path = resolve(root, file);
    const content = await readFile(path, 'utf8');
    for (const [, href] of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^https?:/.test(href)) continue;
      assert.ok((await stat(resolve(dirname(path), href.split('#')[0]))).isFile(), `${file}: ${href}`);
    }
  }
});

test('index descriptions preserve quoted text and fail clearly on missing metadata', () => {
  const path = '/.agents/skills/opendoc-example/agents/openai.yaml';
  assert.equal(skillIndex({ [path]: 'interface:\n  short_description: "Use \\"quoted\\" text."\n' })[0].description, 'Use "quoted" text.');
  assert.throws(() => skillIndex({ [path]: 'interface:\n' }), /Invalid skill index metadata/);
  assert.throws(() => skillIndex({ [path]: '  short_description: ""\n' }), /Missing skill description/);
});
