import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createFromTemplate, readTemplate, TemplateCatalog } from '../src/server/templates';
import { runCreateCli } from '../src/server/create-cli';
import { renderOnce } from '../src/server/render';
import { readProjects } from '../src/server/projects';
import { fixture, projectRoot } from './helpers';

async function presentationFixture() {
  const f = await fixture();
  const folder = resolve(f.root, 'templates/slide-proof');
  await mkdir(folder, { recursive: true });
  const descriptor = { name: 'Slide proof', description: 'A disposable presentation.', format: '16:9 · Proof', documentFormat: 'presentation', structure: ['A single native slide.'] };
  await writeFile(resolve(folder, 'template.json'), JSON.stringify(descriptor));
  await writeFile(resolve(folder, 'AGENTS.md'), 'A disposable test skeleton.');
  await writeFile(resolve(folder, 'index.tsx'), `export { Presentation, Slide, Heading } from '../../src/document';`);
  await writeFile(resolve(folder, 'preview.tsx'), `import { Presentation, Slide, Heading } from './index'; import { neutral } from '../../themes'; export const meta={title:'Proof',description:'Test',theme:'neutral'}; export default function Preview(){return <Presentation title={meta.title} theme={neutral}><Slide id="opening"><Heading id="title">Proof</Heading></Slide></Presentation>}`);
  await writeFile(resolve(folder, 'starter.tsx'), `import { Presentation, Slide, Heading } from '../../templates/slide-proof';
import { theme } from "__OPENDOC_THEME_MODULE__";
export const meta={title:"__OPENDOC_TITLE__",description:'Test',theme:"__OPENDOC_THEME__"};
export const provenance={template:'templates/slide-proof/index.tsx'};
export default function Deck(){return <Presentation title={meta.title} theme={theme}><Slide id="opening"><Heading id="title">{meta.title}</Heading></Slide></Presentation>}`);
  await cp(resolve(projectRoot, 'templates/editorial-essay'), resolve(f.root, 'templates/editorial-essay'), { recursive: true });
  return { ...f, folder, descriptor };
}

test('catalog format groups existing documents and real slides while rejecting mismatched specimens', async () => {
  const f = await presentationFixture(); const catalog = new TemplateCatalog(f.root);
  try {
    const items = await catalog.list();
    assert.equal(items.find(item => item.id === 'slide-proof')?.descriptor.documentFormat, 'presentation');
    assert.equal(items.find(item => item.id === 'editorial-essay')?.descriptor.documentFormat ?? 'document', 'document');
    const preview = await catalog.preview('slide-proof');
    assert.equal(preview.error, undefined);
    assert.equal(preview.artifact?.format, 'presentation');
    assert.deepEqual(preview.artifact?.pages.map(page => [page.width, page.height]), [[960, 540]]);
    assert.deepEqual(await readdir(resolve(f.root, 'documents')), ['proof']);
    await writeFile(resolve(f.folder, 'template.json'), JSON.stringify({ ...f.descriptor, documentFormat: 'document' }));
    catalog.invalidate('slide-proof');
    assert.match((await catalog.preview('slide-proof')).error!, /matching its documentFormat/);
    await writeFile(resolve(f.folder, 'template.json'), JSON.stringify({ ...f.descriptor, documentFormat: 'landscape' }));
    await assert.rejects(readTemplate(f.root, 'slide-proof'), /documentFormat/);
  } finally { await catalog.close(); await f.cleanup(); }
});

test('template creation and CLI infer presentation identity and preserve adapted theme and local content', async () => {
  const f = await presentationFixture();
  try {
    const title = 'A "quoted" deck';
    const created = await createFromTemplate(f.root, 'slide-proof', { title, id: 'deck', projectId: 'test-project', theme: 'opendoc-neutral' });
    assert.equal(created.format, 'presentation');
    const manifest = await readProjects(f.root);
    assert.equal(manifest.formats?.deck, 'presentation');
    assert.equal(manifest.assignments.deck, 'test-project');
    assert.match(await readFile(resolve(f.root, 'documents/deck/index.tsx'), 'utf8'), /from "\.\/theme"/);
    assert.ok(JSON.parse(await readFile(resolve(f.root, 'documents/deck/assets.json'), 'utf8')));
    const { artifact } = await renderOnce(f.root, 'deck');
    assert.equal(artifact.meta.title, title);
    assert.equal(artifact.meta.theme, 'opendoc-neutral');
    assert.equal(artifact.provenance?.template, 'templates/slide-proof/index.tsx');
    assert.equal(artifact.format, 'presentation');
    assert.equal(artifact.slides?.[0].id, 'opening');
    for (const [id, args] of [['inferred', []], ['explicit', ['--format', 'presentation']]] as const) {
      await runCreateCli([id, '--title', 'CLI deck', '--project', 'test-project', '--template', 'slide-proof', ...args], f.root);
      assert.equal((await readProjects(f.root)).formats?.[id], 'presentation');
    }
    const original = await readFile(resolve(f.root, created.entry), 'utf8');
    await assert.rejects(createFromTemplate(f.root, 'slide-proof', { title: 'Replacement', id: 'deck', projectId: 'test-project' }), /already exists/);
    assert.equal(await readFile(resolve(f.root, created.entry), 'utf8'), original);
    for (const [template, format] of [['slide-proof', 'document'], ['editorial-essay', 'presentation']]) {
      await assert.rejects(runCreateCli(['mismatch', '--title', 'Wrong format', '--project', 'test-project', '--template', template, '--format', format], f.root), /matching template/);
      assert.ok(!(await readdir(resolve(f.root, 'documents'))).includes('mismatch'));
    }
  } finally { await f.cleanup(); }
});
