import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, rm, writeFile, utimes } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { createProject, updateProject, deleteProject, assignProject, readProjects } from '../src/server/projects';
import { createDocument } from '../src/server/create';
import { createFromTemplate } from '../src/server/templates';
import { renderOnce } from '../src/server/render';
import { fixture, projectRoot, until } from './helpers';
const exec = promisify(execFile);

test('project changes recover abandoned incomplete locks and preserve fresh reservations', async () => {
  const f = await fixture();
  try {
    await mkdir(resolve(f.root, '.opendoc'));
    const lock = resolve(f.root, '.opendoc/projects.lock');
    await writeFile(lock, '');
    const earlier = new Date(Date.now() - 60_000); await utimes(lock, earlier, earlier);
    await createProject(f.root, { id: 'recovered', name: 'Recovered' });
    await writeFile(lock, '');
    let completed = false;
    const waiting = createProject(f.root, { id: 'after-reservation', name: 'After reservation' }).then(() => { completed = true; });
    await new Promise(accept => setTimeout(accept, 100));
    assert.equal(completed, false);
    assert.equal(await readFile(lock, 'utf8'), '');
    await rm(lock); await waiting;
    assert.deepEqual((await readProjects(f.root)).projects.map(project => project.id), ['test-project', 'recovered', 'after-reservation']);
  } finally { await f.cleanup(); }
});

test('project changes recover a lock left by a terminated process', { timeout: 10_000 }, async () => {
  const f = await fixture();
  const holder = resolve(f.root, 'hold-lock.ts');
  await writeFile(holder, `import { withProjects } from ${JSON.stringify(resolve(projectRoot, 'src/server/projects.ts'))};\nawait withProjects(process.cwd(), async () => { process.stdout.write('locked'); await new Promise(() => setInterval(() => {}, 1000)); });`);
  const child = spawn(process.execPath, ['--import', 'tsx', holder], { cwd: f.root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', value => output += value);
  try {
    await until(() => output.includes('locked'));
    const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
    await createProject(f.root, { id: 'after-interruption', name: 'After interruption' });
    const projects = await readProjects(f.root);
    assert.ok(projects.projects.some(project => project.id === 'after-interruption'));
    assert.equal(projects.assignments.proof, 'test-project');
    await assert.rejects(readFile(resolve(f.root, '.opendoc/projects.lock')), { code: 'ENOENT' });
  } finally {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
    await f.cleanup();
  }
});

async function addLocalTheme(root: string) {
  await cp(resolve(root, 'themes/neutral'), resolve(root, 'themes/studio-brand'), { recursive: true });
  await writeFile(resolve(root, 'themes/studio-brand/index.ts'), `import { theme as base } from '../neutral';
export const theme = { ...base, id: 'studio-brand', name: 'Studio Brand' };
`);
}


test('a project is mandatory for browser and CLI creation, and missing registries stay empty', async () => {
  const f = await fixture();
  try {
    const before = await readdir(resolve(f.root, 'documents'));
    for (const projectId of [undefined, null, '', 'missing']) {
      await assert.rejects(createDocument(f.root, { id: 'rejected', title: 'Rejected', starter: 'article', projectId }), /project/i);
    }
    await assert.rejects(exec(process.execPath, ['--import', 'tsx', resolve(projectRoot, 'src/server/create-cli.ts'), 'rejected', '--title', 'Rejected', '--starter', 'article'], { cwd: f.root }), /Choose a project/);
    assert.deepEqual(await readdir(resolve(f.root, 'documents')), before);
    await rm(resolve(f.root, 'projects.json'));
    assert.deepEqual(await readProjects(f.root), { version: 1, projects: [], assignments: {} });
    await assert.rejects(createDocument(f.root, { id: 'rejected', title: 'Rejected', starter: 'article', projectId: 'test-project' }), /no longer exists/);
    assert.deepEqual(await readdir(resolve(f.root, 'documents')), before);
  } finally { await f.cleanup(); }
});

test('project defaults render across prose, data, and layout creation; overrides win', { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    await updateProject(f.root, 'test-project', { defaultTheme: 'civic-spectrum' });
    await createDocument(f.root, { projectId: 'test-project', id: 'prose', title: 'Prose', starter: 'report' });
    await createFromTemplate(f.root, 'monthly-report', { projectId: 'test-project', id: 'data', title: 'Data' });
    await createFromTemplate(f.root, 'editorial-essay', { projectId: 'test-project', id: 'layout', title: 'Layout' });
    await createDocument(f.root, { projectId: 'test-project', id: 'override', title: 'Override', starter: 'report', theme: 'field-manual' });
    await createFromTemplate(f.root, 'editorial-essay', { projectId: 'test-project', id: 'layout-override', title: 'Layout override', theme: 'neutral' });
    for (const [id, theme] of [['prose', 'civic-spectrum'], ['data', 'civic-spectrum'], ['layout', 'civic-spectrum'], ['override', 'field-manual'], ['layout-override', 'neutral']]) {
      const rendered = await renderOnce(f.root, id);
      assert.equal(rendered.artifact.meta.theme, theme);
      assert.ok(rendered.artifact.pages.length > 0);
      assert.equal((await readProjects(f.root)).assignments[id], 'test-project');
    }
    const before = await readFile(resolve(f.root, 'documents/prose/index.tsx'), 'utf8');
    await updateProject(f.root, 'test-project', { name: 'Renamed project', defaultTheme: 'neutral' });
    assert.equal(await readFile(resolve(f.root, 'documents/prose/index.tsx'), 'utf8'), before);
    await createDocument(f.root, { projectId: 'test-project', id: 'future', title: 'Future', starter: 'report' });
    assert.equal((await renderOnce(f.root, 'future')).artifact.meta.theme, 'neutral');
  } finally { await f.cleanup(); }
});

test('moving preserves source, media, feedback, and rendered bytes; only empty projects can be deleted', async () => {
  const f = await fixture();
  try {
    await createProject(f.root, { id: 'destination', name: 'Destination', defaultTheme: 'civic-spectrum' });
    const source = await readFile(f.entry);
    const files = { 'comments.json': '[{"id":"preserved","text":"Keep this feedback"}]', 'media/keep.txt': 'Preserve prepared media' };
    await mkdir(resolve(f.root, 'documents/proof/media'));
    for (const [name, text] of Object.entries(files)) await writeFile(resolve(f.root, 'documents/proof', name), text);
    const before = await renderOnce(f.root, 'proof');
    await assert.rejects(deleteProject(f.root, 'test-project'), /Move this project/);
    await assignProject(f.root, 'proof', 'destination');
    assert.deepEqual(await readFile(f.entry), source);
    for (const [name, text] of Object.entries(files)) assert.equal(await readFile(resolve(f.root, 'documents/proof', name), 'utf8'), text);
    assert.equal((await renderOnce(f.root, 'proof')).artifact.hash, before.artifact.hash);
    assert.equal((await readProjects(f.root)).assignments.proof, 'destination');
    await deleteProject(f.root, 'test-project');
    await assert.rejects(createDocument(f.root, { projectId: 'test-project', title: 'Gone', starter: 'report' }), /no longer exists/);
    await assert.rejects(assignProject(f.root, 'proof', null), /Choose a project/);
    await assert.rejects(assignProject(f.root, 'missing', 'destination'));
    await assert.rejects(deleteProject(f.root, 'destination'), /Move this project/);
  } finally { await f.cleanup(); }
});

test('concurrent command-line and service changes retain every assignment; invalid data is preserved', async () => {
  const f = await fixture();
  try {
    await Promise.all([
      ...Array.from({ length: 4 }, (_, i) => createDocument(f.root, { id: `service-${i}`, title: `Service ${i}`, starter: 'article', projectId: 'test-project' })),
      ...Array.from({ length: 3 }, (_, i) => exec(process.execPath, ['--import', 'tsx', resolve(projectRoot, 'src/server/create-cli.ts'), `cli-${i}`, '--project', 'test-project', '--title', `CLI ${i}`, '--starter', 'report'], { cwd: f.root })),
    ]);
    assert.equal(Object.keys((await readProjects(f.root)).assignments).length, 8);
    await assert.rejects(createProject(f.root, { id: 'another', name: 'TEST PROJECT' }), /already exists/);
    const malformed = '{"version":1,"projects":[],"assignments":{"proof":"missing"}}';
    await writeFile(resolve(f.root, 'projects.json'), malformed);
    await assert.rejects(createProject(f.root, { name: 'Do not replace' }), /invalid/);
    await assert.rejects(createDocument(f.root, { title: 'Do not create', starter: 'article', projectId: 'test-project' }), /invalid/);
    assert.equal(await readFile(resolve(f.root, 'projects.json'), 'utf8'), malformed);
  } finally { await f.cleanup(); }
});


test('new local themes work immediately for project defaults and every creation path', { timeout: 40_000 }, async () => {
  const f = await fixture();
  try {
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    // The services are already imported and have handled a creation before this theme exists.
    await createDocument(f.root, { projectId: 'test-project', id: 'before-theme', title: 'Before theme' });
    const registry = await readFile(resolve(f.root, 'themes/index.ts'), 'utf8');
    await addLocalTheme(f.root);
    await createProject(f.root, { id: 'brand-project', name: 'Brand project', defaultTheme: 'studio-brand' });
    await updateProject(f.root, 'test-project', { defaultTheme: 'studio-brand' });
    const literalTitle = 'Literal "__OPENDOC_THEME_MODULE__" and "__OPENDOC_THEME__"';
    await createDocument(f.root, { projectId: 'brand-project', id: 'brand-prose', title: 'Brand prose' });
    await createFromTemplate(f.root, 'monthly-report', { projectId: 'test-project', id: 'brand-monthly', title: 'Brand monthly' });
    await createFromTemplate(f.root, 'editorial-essay', { projectId: 'test-project', id: 'brand-layout', title: literalTitle });
    await createFromTemplate(f.root, 'invoice', { projectId: 'test-project', id: 'brand-invoice', title: 'Brand invoice' });
    for (const id of ['brand-prose', 'brand-monthly', 'brand-layout', 'brand-invoice']) {
      const source = await readFile(resolve(f.root, 'documents', id, 'index.tsx'), 'utf8');
      assert.match(source, /import \{ theme \} from ['"]\.\/theme['"]/);
      const adapter = await readFile(resolve(f.root, 'documents', id, 'theme.tsx'), 'utf8');
      assert.match(adapter, /from ['"]\.\.\/\.\.\/themes\/studio-brand['"]/);
      assert.match(adapter, /withDocumentAssets/);
      assert.ok(!source.includes('themes.find'));
      const rendered = await renderOnce(f.root, id);
      assert.equal(rendered.artifact.meta.theme, 'studio-brand');
      assert.ok(rendered.artifact.pages.length > 0);
      if (id === 'brand-layout') assert.equal(rendered.artifact.meta.title, literalTitle);
    }
    assert.equal(await readFile(resolve(f.root, 'themes/index.ts'), 'utf8'), registry, 'A new theme never needs registry edits.');
    await createDocument(f.root, { projectId: 'test-project', id: 'brand-override', title: 'Override', theme: 'field-manual' });
    assert.equal((await renderOnce(f.root, 'brand-override')).artifact.meta.theme, 'field-manual');
  } finally { await f.cleanup(); }
});

test('unavailable local themes reject defaults and document creation without leaving user data changes', async () => {
  const f = await fixture();
  try {
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    const before = await readFile(resolve(f.root, 'projects.json'), 'utf8');
    await assert.rejects(createProject(f.root, { id: 'missing-theme', name: 'Missing theme', defaultTheme: 'not-installed' }), /available theme/);
    await assert.rejects(updateProject(f.root, 'test-project', { defaultTheme: 'not-installed', name: 'Must not change' }), /available theme/);
    for (const theme of ['not-installed', '../neutral', '', false, {}]) {
      await assert.rejects(createDocument(f.root, { projectId: 'test-project', id: 'rejected-prose', title: 'Rejected', theme }), /available theme/);
      await assert.rejects(createFromTemplate(f.root, 'editorial-essay', { projectId: 'test-project', id: 'rejected-layout', title: 'Rejected', theme }), /available theme/);
    }
    assert.equal(await readFile(resolve(f.root, 'projects.json'), 'utf8'), before);
    assert.deepEqual(await readdir(resolve(f.root, 'documents')), ['proof']);
    await addLocalTheme(f.root);
    await updateProject(f.root, 'test-project', { defaultTheme: 'studio-brand' });
    await rm(resolve(f.root, 'themes/studio-brand'), { recursive: true });
    const removed = await readFile(resolve(f.root, 'projects.json'), 'utf8');
    assert.equal((await readProjects(f.root)).projects[0].defaultTheme, 'studio-brand', 'A removed default stays readable for repair.');
    await assert.rejects(createDocument(f.root, { projectId: 'test-project', id: 'removed-default', title: 'Removed default' }), /available theme/);
    assert.equal(await readFile(resolve(f.root, 'projects.json'), 'utf8'), removed);
    assert.deepEqual(await readdir(resolve(f.root, 'documents')), ['proof']);
    await createDocument(f.root, { projectId: 'test-project', id: 'repair-override', title: 'Repair override', theme: 'neutral' });
    assert.equal((await renderOnce(f.root, 'repair-override')).artifact.meta.theme, 'neutral');
  } finally { await f.cleanup(); }
});

test('template module placeholders are unambiguous before a document is published', async () => {
  const f = await fixture();
  try {
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    const starterFile = resolve(f.root, 'templates/editorial-essay/starter.tsx');
    const starter = await readFile(starterFile, 'utf8');
    const projects = await readFile(resolve(f.root, 'projects.json'), 'utf8');
    for (const source of [starter.replace('"__OPENDOC_THEME_MODULE__"', '"../../themes/neutral"'), `${starter}\n// "__OPENDOC_THEME_MODULE__"`]) {
      await writeFile(starterFile, source);
      await assert.rejects(createFromTemplate(f.root, 'editorial-essay', { projectId: 'test-project', id: 'ambiguous', title: 'Ambiguous' }), /exactly one quoted theme module placeholder/);
      assert.deepEqual(await readdir(resolve(f.root, 'documents')), ['proof']);
      assert.equal(await readFile(resolve(f.root, 'projects.json'), 'utf8'), projects);
    }
  } finally { await f.cleanup(); }
});
