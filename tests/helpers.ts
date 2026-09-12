import { mkdtemp, mkdir, symlink, writeFile, readFile, rm, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { Workspace } from '../src/server/workspace';
import assert from 'node:assert/strict';
import type { RenderArtifact } from '../src/shared/types';
export const projectRoot = resolve(import.meta.dirname, '..');

// Check ownership on a template's existing render instead of rendering it again.
export function assertInstanceTitle(artifact: RenderArtifact, id: string, title: string, file = 'index.tsx') {
  const targets = artifact.textTargets ?? [];
  const heading = targets.find(target => target.text === title && target.runs.some(run => run.source));
  assert.ok(heading, `${id}: title remains editable`);
  const binding = heading.runs.find(run => run.source)!.source!;
  assert.equal(binding.file, `documents/${id}/${file}`);
  assert.equal(binding.value, title);
  assert.ok(heading.lines.length, `${id}: title has PDF geometry`);
  assert.ok(targets.every(target => target.runs.every(run => !run.source || run.source.file.startsWith(`documents/${id}/`))), `${id}: shared template text must not be writable`);
}

export async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'opendoc-test-'));
  for (const folder of ['src', 'assets', 'node_modules']) await symlink(resolve(projectRoot, folder), resolve(root, folder), 'dir');
  await cp(resolve(projectRoot, 'themes'), resolve(root, 'themes'), { recursive: true });
  await mkdir(resolve(root, 'documents/proof'), { recursive: true });
  await writeFile(resolve(root, 'projects.json'), JSON.stringify({ version: 1, projects: [{ id: 'test-project', name: 'Test project', defaultTheme: null }], assignments: { proof: 'test-project' } }));
  await writeFile(resolve(root, 'package.json'), '{"type":"module"}');
  await writeFile(resolve(root, 'index.html'), await readFile(resolve(projectRoot, 'index.html')));
  await writeFile(resolve(root, 'documents/proof/index.tsx'), source());
  return { root, cleanup: () => rm(root, { recursive: true, force: true }), entry: resolve(root, 'documents/proof/index.tsx') };
}
export function source(extra = '', trailing = '') {
  return `import {Document,Pages,Heading,Paragraph,DataTable,Cite,References} from '../../src/document';
export const meta={title:'Proof document',description:'Test fixture',kind:'report',theme:'neutral'};
export default function Proof(){return <Document title="Proof" references={{one:{title:'First source',url:'https://example.com/one'},two:{title:'Second source',url:'https://example.com/two'}}}><Pages title="Proof">
<Heading id="title" level={1}>A first draft with office efficiency</Heading>
${extra}
<Paragraph id="target">A stable paragraph with figures, confidence, and finished drafts. <Cite source="one"/> Then <Cite source="two"/> Again <Cite source="one"/></Paragraph>
${trailing}
<References/></Pages></Document>}`;
}
export async function until(fn: () => boolean | Promise<boolean>, timeout = 15_000) {
  const start = Date.now();
  while (!(await fn())) { if (Date.now() - start > timeout) throw new Error('Timed out waiting for test condition.'); await new Promise(r => setTimeout(r, 40)); }
}
export async function settled(workspace: Workspace) { await until(() => workspace.list().length > 0 && workspace.list().every(s => s.status !== 'rendering')); }
