import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, projectRoot } from './helpers';
import { renderEntry, renderOnce } from '../src/server/render';
import { createFromTemplate } from '../src/server/templates';
import { importMedia } from '../src/server/media-mutations';

async function pitchFixture() {
  const f=await fixture();
  await mkdir(resolve(f.root,'templates'),{recursive:true});
  await cp(resolve(projectRoot,'templates/pitch-deck'),resolve(f.root,'templates/pitch-deck'),{recursive:true});
  return f;
}

test('pitch specimen renders fourteen bounded slides with stable identities and honest empty visuals',async()=>{
  const f=await pitchFixture();
  try {
    const result=await renderEntry(f.root,resolve(f.root,'templates/pitch-deck/preview.tsx'),'pitch-preview');
    assert.equal(result.artifact.format,'presentation');
    assert.equal(result.artifact.pages.length,14);
    assert.equal(result.artifact.slides?.[0].id,'purpose');
    assert.equal(result.artifact.slides?.at(-1)?.id,'vision');
    assert.deepEqual(result.artifact.issues,[]);
    assert.deepEqual(result.artifact.media,[]);
    for(const page of result.artifact.pages)assert.deepEqual([page.width,page.height],[960,540]);
    assert.match(result.artifact.blocks['traction-chart-detail'].text,/actual data/);
    assert.match(result.artifact.blocks['financial-plan-label'].text,/ASSUMPTIONS/);
    assert.ok(Object.values(result.artifact.blocks).every(block=>!block.text.includes('\\n')),'Line breaks are real text, not printed escape sequences');
  } finally {await f.cleanup();}
});

test('the product position accepts owned managed media and preserves its comment identity',async()=>{
  const f=await pitchFixture();
  try {
    const created=await createFromTemplate(f.root,'pitch-deck',{id:'image-venture',projectId:'test-project',title:'Image proof'});
    await importMedia(f.root,created.id,{id:'product-image',title:'Product position proof',description:'Synthetic image for a disposable layout test.',kind:'image',sources:['Test fixture']},{filename:'proof.png',bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAIAAABwJOjsAAAAOUlEQVR4nO3NQQEAIAwDsVIzqMEF/jXw3QzcHjQGsvY9muCRVYlBJrMqMcZc1SXGmKu6xBhzlT6PH78GAQA/IUyuAAAAAElFTkSuQmCC','base64')});
    const entry=resolve(f.root,created.entry), source=await readFile(entry,'utf8');
    await writeFile(entry,source.replace('id="product-visual" theme={theme}','id="product-visual" theme={theme} image={{item:"product-image",fit:"contain"}}'));
    const result=await renderOnce(f.root,created.id);
    assert.deepEqual(result.artifact.issues,[]);assert.equal(result.artifact.pages.length,14);
    assert.deepEqual(result.artifact.media,[{item:'product-image',blockId:'product-visual'}]);
    assert.ok(result.artifact.pages[3].fragments.some(block=>block.id==='product-visual'));
    assert.equal(result.artifact.blocks['product-visual-label'],undefined,'The supplied visual replaces the empty state');
  }finally {await f.cleanup();}
});

test('creation retains the complete editable narrative, adapted theme, membership and presentation format',async()=>{
  const f=await pitchFixture();
  try {
    const created=await createFromTemplate(f.root,'pitch-deck',{id:'new-venture',projectId:'test-project',theme:'mckinsey-consulting',title:'A useful new venture'});
    const source=await readFile(resolve(f.root,created.entry),'utf8');
    assert.match(source,/from "\.\/theme"/);assert.doesNotMatch(source,/__OPENDOC_/);
    assert.match(source,/id="funding-ask"/);assert.match(source,/id="financial-position"/);
    const project=JSON.parse(await readFile(resolve(f.root,'projects.json'),'utf8'));
    assert.equal(project.assignments['new-venture'],'test-project');assert.equal(project.formats['new-venture'],'presentation');
    const result=await renderOnce(f.root,created.id);
    assert.equal(result.artifact.pages.length,14);assert.deepEqual(result.artifact.issues,[]);
    assert.equal(result.artifact.meta.theme,'mckinsey-consulting');
    assert.equal(result.artifact.provenance?.template,'templates/pitch-deck/index.tsx');
    for(const blockId of ['company-name','company-promise','traction-primary','raise-amount','vision-next-step']) {
      const target=result.artifact.textTargets?.find(item=>item.blockId===blockId);
      assert.ok(target?.runs.some(run=>run.source?.file===`documents/${created.id}/index.tsx`),`${blockId} is owned by the new instance`);
    }
  } finally {await f.cleanup();}
});

test('sparse and long-title variants retain explicit slides and reject overflowing copy',async()=>{
  const f=await pitchFixture();
  try {
    const prefix="import{PitchDeck,PitchSlide,PitchText}from'./index';import{neutral}from'../../themes';export const meta={title:'Boundary specimen',description:'Disposable verification',theme:'neutral'};";
    const entry=resolve(f.root,'templates/pitch-deck/variant.tsx');
    await writeFile(entry,`${prefix}export default function Proof(){return <PitchDeck title={meta.title} theme={neutral}><PitchSlide id="only" theme={neutral} title="A brief opening"/></PitchDeck>}`);
    assert.equal((await renderEntry(f.root,entry,'sparse')).artifact.pages.length,1);
    await writeFile(entry,`${prefix}export default function Proof(){return <PitchDeck title={meta.title} theme={neutral}><PitchSlide id="long-heading" theme={neutral} title="An unusually long but specific company description still deserves a clear and legible opening" titleSize={32}><PitchText id="long-lead" theme={neutral} x={48} y={202} w={800} h={180} body="A longer title uses an explicit composition adjustment. The body remains readable and the slide remains one page." size={28}/></PitchSlide></PitchDeck>}`);
    const result=await renderEntry(f.root,entry,'long');assert.equal(result.artifact.pages.length,1);assert.deepEqual(result.artifact.issues,[]);
    await writeFile(entry,`${prefix}export default function Proof(){return <PitchDeck title={meta.title} theme={neutral}><PitchSlide id="overflow" theme={neutral}><PitchText id="too-much" theme={neutral} x={48} y={80} w={600} h={150} body={'Excessive detail belongs in an appendix. '.repeat(150)}/></PitchSlide></PitchDeck>}`);
    await assert.rejects(renderEntry(f.root,entry,'overflow'),/[Ss]lide|[Pp]resentation|beyond/);
  } finally {await f.cleanup();}
});
