import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { createDocument, CreateDocumentError, listStarters } from '../src/server/create';
import { createFromTemplate } from '../src/server/templates';
import { renderOnce } from '../src/server/render';
import { fixture, projectRoot } from './helpers';

const exec = promisify(execFile);

test('optional starter examples cannot be mutated through list results', () => {
  const original = structuredClone(listStarters());
  assert.ok(original.length);
  const first = listStarters();
  first[0].name = 'Changed'; first.pop();
  assert.deepEqual(listStarters(), original);
});

test('agent creation needs no starter or category and renders an unconstrained document', async () => {
  const f = await fixture();
  try {
    const cli = resolve(projectRoot, 'src/server/create-cli.ts');
    const created = await exec(process.execPath, ['--import', 'tsx', cli, 'open-brief', '--project', 'test-project', '--title', 'An open brief', '--json'], { cwd: f.root });
    const entry = resolve(f.root, JSON.parse(created.stdout).entry);
    const source = await readFile(entry, 'utf8');
    assert.match(source, /from 'opendoc'/);
    assert.ok(!source.includes('<Section'));
    assert.ok(!source.includes('<Paragraph'));
    const rendered = await renderOnce(f.root, 'open-brief');
    assert.equal(rendered.artifact.meta.kind, undefined);
    assert.equal(rendered.artifact.meta.theme, 'neutral');
    assert.equal(rendered.artifact.pages.length, 1);
    assert.ok(!rendered.artifact.issues?.some(issue => issue.severity === 'error'));
    const manifest = JSON.parse(await readFile(resolve(f.root, 'projects.json'), 'utf8'));
    assert.equal(manifest.assignments['open-brief'], 'test-project');
    await writeFile(entry, source.replace('"description": ""', '"description": "", "kind": "quotation"'));
    assert.equal((await renderOnce(f.root, 'open-brief')).artifact.meta.kind, 'quotation');
    await writeFile(entry, source.replace('"description": ""', '"description": "", "kind": 42'));
    await assert.rejects(renderOnce(f.root, 'open-brief'), /meta.kind must be a nonempty descriptive label/);
    manifest.projects[0].defaultTheme = 'civic-spectrum';
    await writeFile(resolve(f.root, 'projects.json'), JSON.stringify(manifest));
    const themed = await createDocument(f.root, { projectId: 'test-project', title: 'Project default' });
    assert.equal((await renderOnce(f.root, themed.id)).artifact.meta.theme, 'civic-spectrum');
    await assert.rejects(createDocument(f.root, { projectId: 'test-project', id: 'open-brief', title: 'Do not replace' }), /already exists/);
  } finally { await f.cleanup(); }
});

test('creation writes a readable pure document and safely preserves literal title characters', async () => {
  const f = await fixture();
  try {
    const title = 'A "quoted" title: `backticks`, ${process.exit(1)}, <tags> & apostrophe’s';
    const created = await createDocument(f.root, { projectId: 'test-project', id: 'literal-title', starter: 'article', title });
    assert.deepEqual(created, { id: 'literal-title', title, starter: 'article', projectId: 'test-project', entry: 'documents/literal-title/index.tsx' });
    assert.deepEqual(await readdir(resolve(f.root, 'documents/literal-title')), ['assets.json', 'index.tsx', 'media', 'theme.tsx']);
    const result = await renderOnce(f.root, created.id);
    assert.equal(result.artifact.meta.title, title);
    assert.ok(Object.values(result.artifact.blocks).some(block => block.text.replace(/\s+/g, ' ').includes('`backticks`, ${process.exit(1)}, <tags>')));
  } finally { await f.cleanup(); }
});

test('creation derives a stable readable ID and validates all supplied fields before writing', async () => {
  const f = await fixture();
  try {
    assert.equal((await createDocument(f.root, { projectId: 'test-project', starter: 'report', title: '  Études: a Student’s Report  ' })).id, 'etudes-a-students-report');
    const invalid = [
      null, [], 'article', {}, { starter: 'article', title: ' ' }, { starter: 'missing', title: 'Valid' },
      { starter: 'article', title: 'Title', theme: 'missing' },
      ...['../escape', '/absolute', 'with space', 'Uppercase', 'a--b', '.hidden', 'trailing-', 'a'.repeat(81), '', null].map(id => ({ starter: 'article', title: 'Valid', id })),
      ...['a'.repeat(161), 'Two\nlines', 'Null\0character', 'Separating\u2028lines'].map(title => ({ starter: 'article', title })),
    ];
    for (const input of invalid) {
      const candidate = input && typeof input === 'object' && !Array.isArray(input) ? { ...input, projectId: 'test-project' } : input;
      await assert.rejects(createDocument(f.root, candidate), error => error instanceof CreateDocumentError && error.status === 400, JSON.stringify(input));
    }
    assert.deepEqual((await readdir(resolve(f.root, 'documents'))).sort(), ['etudes-a-students-report', 'proof']);
  } finally { await f.cleanup(); }
});

test('duplicate and simultaneous creation never overwrite a document, empty folder, or feedback', async () => {
  const f = await fixture();
  try {
    await writeFile(resolve(f.root, 'documents/proof/data.json'), '{"keep":true}\n');
    await writeFile(resolve(f.root, 'documents/proof/comments.json'), '["keep feedback"]\n');
    const original = await readFile(f.entry, 'utf8');
    await assert.rejects(createDocument(f.root, { projectId: 'test-project', id: 'proof', starter: 'report', title: 'Replacement' }), error => error instanceof CreateDocumentError && error.code === 'ALREADY_EXISTS' && error.message.endsWith('Choose a different document ID.'));
    assert.equal(await readFile(f.entry, 'utf8'), original);
    assert.equal(await readFile(resolve(f.root, 'documents/proof/data.json'), 'utf8'), '{"keep":true}\n');
    assert.equal(await readFile(resolve(f.root, 'documents/proof/comments.json'), 'utf8'), '["keep feedback"]\n');
    await assert.rejects(createDocument(f.root, { projectId: 'test-project', starter: 'report', title: 'Proof' }), /Choose a different title\.$/);
    await mkdir(resolve(f.root, 'documents/reserved'));
    await assert.rejects(createDocument(f.root, { projectId: 'test-project', id: 'reserved', starter: 'article', title: 'Existing folder' }), /already exists/);
    assert.deepEqual(await readdir(resolve(f.root, 'documents/reserved')), []);
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => createDocument(f.root, { projectId: 'test-project', id: 'one-owner', starter: 'report', title: `Report ${i}` })));
    const successes = attempts.filter(result => result.status === 'fulfilled');
    assert.equal(successes.length, 1);
    for (const attempt of attempts) if (attempt.status === 'rejected') assert.equal((attempt.reason as CreateDocumentError).code, 'ALREADY_EXISTS');
    assert.deepEqual(await readdir(resolve(f.root, 'documents/one-owner')), ['assets.json', 'index.tsx', 'media', 'theme.tsx']);
    const winner = successes[0].value;
    assert.ok((await readFile(resolve(f.root, winner.entry), 'utf8')).includes(JSON.stringify(winner.title)));
  } finally { await f.cleanup(); }
});

test('creation refuses symlink destinations and a symlinked documents root', async () => {
  const f = await fixture();
  const outside = await mkdtemp(resolve(tmpdir(), 'opendoc-outside-'));
  try {
    await writeFile(resolve(outside, 'keep.txt'), 'Keep this file.');
    await symlink(outside, resolve(f.root, 'documents/linked'), 'dir');
    await assert.rejects(createDocument(f.root, { projectId: 'test-project', id: 'linked', starter: 'article', title: 'Linked' }), /already exists/);
    await symlink(resolve(outside, 'absent'), resolve(f.root, 'documents/broken'), 'dir');
    await assert.rejects(createDocument(f.root, { projectId: 'test-project', id: 'broken', starter: 'article', title: 'Broken' }), /already exists/);
    await rm(resolve(f.root, 'documents'), { recursive: true });
    await symlink(outside, resolve(f.root, 'documents'), 'dir');
    await assert.rejects(createDocument(f.root, { projectId: 'test-project', id: 'outside', starter: 'report', title: 'Outside' }), error => error instanceof CreateDocumentError && error.code === 'UNSAFE_PATH');
    assert.deepEqual(await readdir(outside), ['keep.txt']);
    assert.equal(await readFile(resolve(outside, 'keep.txt'), 'utf8'), 'Keep this file.');
  } finally { await f.cleanup(); await rm(outside, { recursive: true, force: true }); }
});

test('each prose starter renders a useful draft with stable targets and no fabricated citations', async () => {
  const f = await fixture();
  try {
    for (const starter of listStarters()) {
      const created = await createDocument(f.root, { projectId: 'test-project', starter: starter.id, title: `${starter.name}: a first draft` });
      const result = await renderOnce(f.root, created.id);
      assert.equal(result.artifact.meta.kind, starter.kind);
      assert.ok(result.artifact.pages.length >= 1 && result.artifact.pages.length <= 2);
      assert.ok(Object.keys(result.artifact.blocks).length >= 6);
      assert.ok(!Object.keys(result.artifact.blocks).some(id => id.startsWith('reference-')));
      assert.ok(!result.artifact.issues?.some(issue => issue.severity === 'error'));
    }
  } finally { await f.cleanup(); }
});

test('monthly creation uses edited starter data and leaves current schema validation to rendering', async () => {
  const f = await fixture();
  try {
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    await createFromTemplate(f.root, 'monthly-report', { projectId: 'test-project', title: 'Before schema edit' });
    const examplePath = resolve(f.root, 'templates/monthly-report/data.json');
    const schemaPath = resolve(f.root, 'templates/monthly-report/schema.ts');
    const example = JSON.parse(await readFile(examplePath, 'utf8'));
    const originalSchema = await readFile(schemaPath, 'utf8');
    const editedSchema = originalSchema
      .replace("fields(data, ['schemaVersion',", "fields(data, ['localNote', 'schemaVersion',")
      .replace("sourceNote: text(data.sourceNote, 'report.sourceNote'),", "sourceNote: text(data.localNote, 'report.localNote') + ': ' + text(data.sourceNote, 'report.sourceNote'),");
    assert.notEqual(editedSchema, originalSchema);
    await writeFile(schemaPath, editedSchema);
    await writeFile(examplePath, JSON.stringify({ ...example, localNote: 'A locally extended report' }));
    const created = await createFromTemplate(f.root, 'monthly-report', { projectId: 'test-project', title: 'After schema edit' });
    const copied = JSON.parse(await readFile(resolve(f.root, 'documents', created.id, 'data.json'), 'utf8'));
    assert.equal(copied.localNote, 'A locally extended report');
    const rendered = await renderOnce(f.root, created.id);
    assert.ok(Object.values(rendered.artifact.blocks).some(block => /A locally extended report/.test(block.text)));
  } finally { await f.cleanup(); }
});

test('malformed or escaping starter JSON creates no folder; schema errors remain correctable document errors', async () => {
  const f = await fixture();
  try {
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    const examplePath = resolve(f.root, 'templates/monthly-report/data.json');
    for (const content of ['{broken', '[]', 'null', '42', '"text"']) {
      await writeFile(examplePath, content);
      await assert.rejects(createFromTemplate(f.root, 'monthly-report', { projectId: 'test-project', title: 'Invalid starter' }));
      assert.deepEqual(await readdir(resolve(f.root, 'documents')), ['proof']);
    }
    await rm(examplePath);
    await symlink(resolve(projectRoot, 'templates/monthly-report/data.json'), examplePath);
    await assert.rejects(createFromTemplate(f.root, 'monthly-report', { projectId: 'test-project', title: 'Escaping data' }), /outside/);
    assert.deepEqual(await readdir(resolve(f.root, 'documents')), ['proof']);
    await rm(examplePath);
    await writeFile(examplePath, JSON.stringify({ title: '__OPENDOC_TITLE__' }));
    const created = await createFromTemplate(f.root, 'monthly-report', { projectId: 'test-project', title: 'Needs data' });
    await assert.rejects(renderOnce(f.root, created.id), /Monthly report data needs attention/);
    assert.deepEqual(JSON.parse(await readFile(resolve(f.root, 'documents', created.id, 'data.json'), 'utf8')), { title: 'Needs data' });
    assert.ok((await readdir(resolve(f.root, 'documents', created.id))).includes('index.tsx'));
  } finally { await f.cleanup(); }
});

test('missing starter assets leave no partial document and the CLI lists and creates locally', async () => {
  const f = await fixture();
  try {
    await assert.rejects(createFromTemplate(f.root, 'monthly-report', { projectId: 'test-project', title: 'Monthly missing' }));
    assert.deepEqual(await readdir(resolve(f.root, 'documents')), ['proof']);
    const cli = resolve(projectRoot, 'src/server/create-cli.ts');
    const listed = await exec(process.execPath, ['--import', 'tsx', cli, '--', '--list', '--json'], { cwd: f.root });
    assert.deepEqual(JSON.parse(listed.stdout).starters, listStarters());
    const created = await exec(process.execPath, ['--import', 'tsx', cli, '--', 'cli-report', '--project', 'test-project', '--starter', 'report', '--title', 'A local report', '--json'], { cwd: f.root });
    assert.equal(JSON.parse(created.stdout).id, 'cli-report');
    assert.ok((await readFile(resolve(f.root, 'documents/cli-report/index.tsx'), 'utf8')).includes('A local report'));
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    const templated = await exec(process.execPath, ['--import', 'tsx', cli, 'cli-monthly', '--project', 'test-project', '--template', 'monthly-report', '--title', 'A template report', '--json'], { cwd: f.root });
    assert.equal(JSON.parse(templated.stdout).template, 'monthly-report');
    assert.equal((await renderOnce(f.root, 'cli-monthly')).artifact.meta.title, 'A template report');
    await assert.rejects(exec(process.execPath, ['--import', 'tsx', cli, '--starter', 'report', '--template', 'monthly-report'], { cwd: f.root }), /Choose --starter or --template/);
    await assert.rejects(exec(process.execPath, ['--import', 'tsx', cli, '--list', '--title', 'Conflicting'], { cwd: f.root }), /cannot be combined/);
  } finally { await f.cleanup(); }
});

test('a failure before publication removes partial files while preserving user additions', async t => {
  const f = await fixture();
  try {
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    let preserveUserAddition = false;
    t.mock.method(fs.promises, 'link', async (_source: string, destination: string) => {
      const folder = resolve(destination, '..');
      assert.ok((await readFile(resolve(folder, 'data.json'), 'utf8')).includes('Synthetic'));
      assert.ok(!(await readdir(folder)).includes('index.tsx'), 'No document is discoverable before its data is complete.');
      if (preserveUserAddition) await writeFile(resolve(folder, 'user-notes.txt'), 'Keep my notes.');
      throw Object.assign(new Error('Simulated publication failure'), { code: 'EIO' });
    });
    syncBuiltinESMExports();
    await assert.rejects(createFromTemplate(f.root, 'monthly-report', { projectId: 'test-project', id: 'failed', title: 'Synthetic failure' }), /Simulated publication failure/);
    assert.ok(!(await readdir(resolve(f.root, 'documents'))).includes('failed'));
    preserveUserAddition = true;
    await assert.rejects(createFromTemplate(f.root, 'monthly-report', { projectId: 'test-project', id: 'user-added', title: 'Synthetic failure' }), /Simulated publication failure/);
    assert.deepEqual(await readdir(resolve(f.root, 'documents/user-added')), ['user-notes.txt']);
    assert.equal(await readFile(resolve(f.root, 'documents/user-added/user-notes.txt'), 'utf8'), 'Keep my notes.');
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await f.cleanup(); }
});
