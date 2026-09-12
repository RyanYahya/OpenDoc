import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, projectRoot } from './helpers';
import { TemplateCatalog, createFromTemplate } from '../src/server/templates';
import { renderEntry, renderOnce } from '../src/server/render';
import { importMedia } from '../src/server/media-cli';
import { Resvg } from '@resvg/resvg-js';

async function brandFixture() {
  const f = await fixture();
  await mkdir(resolve(f.root, 'templates'), { recursive: true });
  await cp(resolve(projectRoot, 'templates/brand-guidelines'), resolve(f.root, 'templates/brand-guidelines'), { recursive: true });
  return f;
}

test('brand guidelines is an image-rich presentation skeleton with fixed slides and no invented artwork', async () => {
  const f = await brandFixture(); const catalog = new TemplateCatalog(f.root);
  try {
    const preview = await catalog.preview('brand-guidelines');
    assert.equal(preview.error, undefined);
    const artifact = preview.artifact!;
    assert.equal(artifact.format, 'presentation');
    assert.equal(artifact.pages.length, 18);
    assert.equal(artifact.meta.theme, 'neutral');
    assert.deepEqual(artifact.issues, []);
    assert.deepEqual(artifact.media, []);
    assert.ok(artifact.pages.every(page => page.width === 960 && page.height === 540));
    assert.equal(new Set(artifact.slides!.map(slide => slide.id)).size, 18);
    assert.match(artifact.blocks['color-placeholder-note'].text, /do not prescribe usage ratios/);
    assert.match(artifact.blocks['handoff-rights'].text, /permissions.*licenses/);
    assert.ok(artifact.pages.filter(page => page.fragments.some(block => /opening-image|world-hero|primary-mark-artwork|variant-light|clearspace-diagram|misuse-proportion|photography-human|crop-wide|language-motif|digital-hero|physical-environment/.test(block.id))).length >= 11);
    const files = await readdir(resolve(f.root, 'templates/brand-guidelines'), { recursive: true });
    assert.ok(files.every(file => !/\.(png|jpe?g)$/i.test(file)));
    assert.deepEqual(await readdir(resolve(f.root, 'documents')), ['proof']);
  } finally { await catalog.close(); await f.cleanup(); }
});

test('brand instances preserve chosen themes, project membership, and caller-owned text corrections', async () => {
  const f = await brandFixture();
  try {
    const created = await createFromTemplate(f.root, 'brand-guidelines', { id:'brand-handbook', projectId:'test-project', title:'A longer brand name with an equally considered identity system', theme:'opendoc-neutral' });
    const result = await renderOnce(f.root, created.id);
    assert.deepEqual(result.artifact.issues, []);
    assert.equal(result.artifact.pages.length, 18);
    assert.equal(result.artifact.meta.theme, 'opendoc-neutral');
    assert.equal(result.artifact.provenance!.template, 'templates/brand-guidelines/index.tsx');
    const source = await readFile(resolve(f.root, created.entry), 'utf8');
    assert.match(source, /from "\.\/theme"/); assert.doesNotMatch(source, /__OPENDOC_/);
    const projects = JSON.parse(await readFile(resolve(f.root,'projects.json'),'utf8'));
    assert.equal(projects.assignments[created.id], 'test-project');
    assert.ok((await readdir(resolve(f.root,'documents',created.id))).includes('assets.json'));
    for (const copy of ['A longer brand name with an equally considered identity system', 'BRAND GUIDELINES', '01', 'Personality, made practical.', '[Website / product / digital campaign]', '[Owner / contact / approval path / exception process]']) {
      const target = result.artifact.textTargets!.find(item => item.text === copy && item.runs.some(run => run.source));
      assert.ok(target, `Instance owns editable copy: ${copy}`);
      assert.ok(target.runs.filter(run => run.source).every(run => run.source!.file === `documents/${created.id}/index.tsx`));
    }
    assert.ok(result.artifact.textTargets!.every(target => target.runs.some(run => run.source)), 'Every visible starter string remains editable');
  } finally { await f.cleanup(); }
});

test('brand sparse and long specimens fit slides, while excessive text fails explicitly', async () => {
  const f = await brandFixture();
  try {
    for (const length of ['sparse', 'long']) {
      const entry = resolve(f.root, `templates/brand-guidelines/${length}.tsx`);
      await writeFile(entry, `import {Specimen} from './preview';export {meta} from './preview';export default function Proof(){return <Specimen length="${length}"/>}`);
      const result = await renderEntry(f.root, entry, `brand-${length}`);
      assert.deepEqual(result.artifact.issues, []);
      assert.equal(result.artifact.pages.length, length === 'sparse' ? 1 : 18);
    }
    const overflowEntry = resolve(f.root, 'templates/brand-guidelines/overflow.tsx');
    await writeFile(overflowEntry, `import{BrandGuidelines,BrandSlide,BrandText}from'../../templates/brand-guidelines';import{neutral}from'../../themes';export const meta={title:'Overflow proof',description:'Boundary test',theme:'neutral',format:'presentation'};export default function Proof(){return <BrandGuidelines title={meta.title} theme={neutral}><BrandSlide id="overfull" theme={neutral} section="Test" folio="1"><BrandText id="too-long" theme={neutral} x={40} y={90} w={420} h={60} size={36}>{'A brand story needs room to be read. '.repeat(150)}</BrandText></BrandSlide></BrandGuidelines>}`);
    await assert.rejects(renderEntry(f.root, overflowEntry, 'overflow'), /clipped|beyond|overflow|slide/i);
  } finally { await f.cleanup(); }
});

test('brand artwork slots render managed crops and containment and reject missing named media', async () => {
  const f = await brandFixture();
  try {
    const created = await createFromTemplate(f.root, 'brand-guidelines', { id:'brand-artwork', projectId:'test-project', title:'Synthetic artwork proof' });
    const input = resolve(f.root, 'artwork.png');
    await writeFile(input, new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240"><rect width="480" height="240" fill="#bedbd0"/><rect x="240" width="240" height="240" fill="#eac6b5"/><circle cx="240" cy="120" r="80" fill="#242424"/></svg>').render().asPng());
    await importMedia(f.root, created.id, 'artwork', input, 'Synthetic composition proof', 'Generated rectangles and a circle test crop and containment; not brand artwork.', 'illustration');
    const entry = resolve(f.root, created.entry);
    const source = `import{BrandGuidelines,BrandSlide,BrandImage,BrandText}from'../../templates/brand-guidelines';import{theme}from'./theme';export const meta={title:'Synthetic artwork proof',description:'Managed image exercise',theme:'neutral',format:'presentation'};export default function Proof(){return <BrandGuidelines title={meta.title} theme={theme}><BrandSlide id="artwork" theme={theme} section="SYNTHETIC ARTWORK PROOF" folio="1"><BrandImage id="crop" theme={theme} x={40} y={100} w={400} h={330} label="Crop placeholder" image={{item:'artwork',fit:'cover',position:{x:0.5,y:0.5}}}/><BrandImage id="contain" theme={theme} x={500} y={100} w={400} h={330} label="Contain placeholder" image={{item:'artwork',fit:'contain'}}/><BrandText id="artwork-note" theme={theme} x={40} y={463} w={860} h={35} size={18}>Synthetic composition: crop on the left; complete image on the right.</BrandText></BrandSlide></BrandGuidelines>}`;
    await writeFile(entry, source);
    const result = await renderOnce(f.root, created.id);
    assert.deepEqual(result.artifact.issues, []);
    assert.deepEqual(result.artifact.media, [{item:'artwork',blockId:'crop'},{item:'artwork',blockId:'contain'}]);
    assert.equal(result.artifact.pages.length, 1);
    await writeFile(entry, source.replaceAll("item:'artwork'", "item:'missing-artwork'"));
    await assert.rejects(renderOnce(f.root, created.id), /missing-artwork/);
  } finally { await f.cleanup(); }
});
