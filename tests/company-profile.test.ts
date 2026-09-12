import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, projectRoot } from './helpers';
import { TemplateCatalog, createFromTemplate } from '../src/server/templates';
import { renderEntry, renderOnce } from '../src/server/render';
import { importMedia } from '../src/server/media-cli';

async function profileFixture() {
  const f = await fixture();
  await mkdir(resolve(f.root, 'templates'), { recursive: true });
  await cp(resolve(projectRoot, 'templates/company-profile'), resolve(f.root, 'templates/company-profile'), { recursive: true });
  return f;
}

test('company-profile catalog presents twelve neutral slides with explicit proof and media placeholders', async () => {
  const f = await profileFixture();
  const catalog = new TemplateCatalog(f.root);
  try {
    const result = await catalog.preview('company-profile');
    assert.equal(result.error, undefined);
    const artifact = result.artifact!;
    assert.equal(artifact.format, 'presentation');
    assert.equal(artifact.pages.length, 12);
    assert.equal(artifact.meta.theme, 'neutral');
    assert.deepEqual(artifact.issues, []);
    assert.deepEqual(artifact.media, []);
    assert.ok(artifact.pages.every(page => page.width === 960 && page.height === 540));
    assert.equal(new Set(artifact.slides!.map(slide => slide.id)).size, 12);
    for (const id of ['case-source', 'snapshot-team', 'people-lead-expertise', 'footprint-model', 'assurance-credential-detail', 'contact-email']) assert.ok(artifact.blocks[id], id);
    assert.match(artifact.blocks['case-source'].text, /measurement method/);
    assert.match(artifact.blocks['assurance-credential-detail'].text, /expiry/);
    assert.deepEqual(await readdir(resolve(f.root, 'documents')), ['proof']);
    const files = await readdir(resolve(f.root, 'templates/company-profile'), { recursive: true });
    assert.ok(files.every(file => !/\.(?:png|jpe?g)$/i.test(file)));
  } finally { await catalog.close(); await f.cleanup(); }
});

test('company-profile creation preserves local content, editable fields, theme adapter, membership, and presentation format', async () => {
  const f = await profileFixture();
  try {
    for (const theme of ['neutral', 'opendoc-neutral']) {
      const title = `Profile ${theme === 'neutral' ? 'one' : 'two'}`;
      const created = await createFromTemplate(f.root, 'company-profile', { id: `profile-${theme}`, projectId: 'test-project', title, theme });
      const result = await renderOnce(f.root, created.id);
      assert.deepEqual(result.artifact.issues, []);
      assert.equal(result.artifact.pages.length, 12);
      assert.equal(result.artifact.format, 'presentation');
      assert.equal(result.artifact.meta.theme, theme);
      assert.equal(result.artifact.provenance!.template, 'templates/company-profile/index.tsx');
      const source = await readFile(resolve(f.root, created.entry), 'utf8');
      assert.match(source, /from "\.\/theme"/);
      assert.doesNotMatch(source, /__OPENDOC_/);
      const projects = JSON.parse(await readFile(resolve(f.root, 'projects.json'), 'utf8'));
      assert.equal(projects.assignments[created.id], 'test-project');
      assert.equal(projects.formats[created.id], 'presentation');
      assert.ok((await readdir(resolve(f.root, 'documents', created.id))).includes('assets.json'));
      for (const id of ['profile-cover-title', 'profile-cover-eyebrow', 'profile-cover-folio', 'cover-image', 'snapshot-positioning', 'case-source', 'capability-discovery-title', 'capability-discovery-number']) {
        const target = result.artifact.textTargets!.find(target => target.blockId === id && target.runs.some(run => run.source));
        assert.ok(target, `Editable instance field: ${id}`);
        assert.ok(target.runs.filter(run => run.source).every(run => run.source!.file === `documents/${created.id}/index.tsx`), id);
      }
    }
  } finally { await f.cleanup(); }
});

test('company-profile sparse and explicitly adapted long copy preserve slide boundaries; excessive copy is rejected', async () => {
  const f = await profileFixture();
  try {
    const entry = resolve(f.root, 'templates/company-profile/sparse.tsx');
    await writeFile(entry, `import{CompanyProfile,ProfileSlide}from'./index';import{neutral}from'../../themes';export const meta={title:'Short profile',description:'Sparse layout proof',theme:'neutral'};export default function Proof(){return <CompanyProfile title={meta.title} theme={neutral}><ProfileSlide id="minimal-opening" theme={neutral} title="A small company." cover/></CompanyProfile>}`);
    const sparse = await renderEntry(f.root, entry, 'company-profile-sparse');
    assert.deepEqual(sparse.artifact.issues, []);
    assert.equal(sparse.artifact.pages.length, 1);
    const created = await createFromTemplate(f.root, 'company-profile', { id: 'profile-long', projectId: 'test-project', title: 'A longer company name with a precise description of its specialist capabilities', theme: 'neutral' });
    const file = resolve(f.root, created.entry);
    const original = await readFile(file, 'utf8');
    const adapted = original.replace('cover title={title}', 'cover title={title} titleSize={32}')
      .replace('[Core capability]', '[Research, strategy, and technical advice]')
      .replace('[Name the buyer\'s need and the concrete deliverable you provide.]', '[Define the buyer need and the concrete deliverable, including boundaries, expertise, and the practical benefit.]')
      .replace('[A project that shows the work.]', '[A complex assignment that demonstrates specialist expertise and a carefully defined contribution.]')
      .replace('[Specific scope. Distinguish your contribution from the wider project.]', '[State the exact scope and delivery responsibility. Explain the contribution and the limits of attribution.]');
    await writeFile(file, adapted);
    const long = await renderOnce(f.root, created.id);
    assert.equal(long.artifact.pages.length, 12);
    assert.deepEqual(long.artifact.issues, []);
    assert.match(long.artifact.blocks['profile-cover-title'].text, /specialist capabilities/);
    assert.match(long.artifact.blocks['case-role'].text, /limits of\s+attribution/);
    await writeFile(file, adapted.replace('[The starting situation and constraints that mattered.]', 'Too much case-study copy belongs on another slide. '.repeat(100)));
    await assert.rejects(renderOnce(f.root, created.id), /[Ss]lide|[Cc]lipp|beyond page/);
    await writeFile(file, adapted.replace('[Name the buyer\'s need and the concrete deliverable you provide.]', 'Too much ledger copy. '.repeat(100)).replace('[Define the buyer need and the concrete deliverable, including boundaries, expertise, and the practical benefit.]', 'Too much ledger copy. '.repeat(100)));
    await assert.rejects(renderOnce(f.root, created.id), /[Ss]lide|[Cc]lipp|beyond page/);
  } finally { await f.cleanup(); }
});

test('company-profile image positions accept managed media and do not hide broken supplied artwork', async () => {
  const f = await profileFixture();
  try {
    const created = await createFromTemplate(f.root, 'company-profile', { id: 'profile-media', projectId: 'test-project', title: 'Media placement proof', theme: 'neutral' });
    const file = resolve(f.root, created.entry);
    const original = await readFile(file, 'utf8');
    await writeFile(file, original.replace('label="Signature project or place"', 'image={{item:"proof-art",fit:"contain"}}'));
    await assert.rejects(renderOnce(f.root, created.id), /media|proof-art|Media/);
    await importMedia(f.root, created.id, 'proof-art', resolve(projectRoot, 'assets/brand/wordmark.png'), 'Test artwork', 'OpenDoc local artwork used only to exercise the frame in a disposable proof.', 'image');
    const result = await renderOnce(f.root, created.id);
    assert.deepEqual(result.artifact.issues, []);
    assert.equal(result.artifact.pages.length, 12);
    assert.equal(result.artifact.media!.length, 1);
    assert.ok(result.artifact.pages[0].fragments.some(fragment => fragment.id === 'cover-image'));
  } finally { await f.cleanup(); }
});
