import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, projectRoot } from './helpers';
import { renderEntry, renderOnce } from '../src/server/render';
import { createFromTemplate } from '../src/server/templates';

async function proposalFixture(){const f=await fixture();await mkdir(resolve(f.root,'templates'),{recursive:true});await cp(resolve(projectRoot,'templates/proposal-deck'),resolve(f.root,'templates/proposal-deck'),{recursive:true});return f;}

test('proposal deck preserves fourteen fixed slides and handles sparse, long-title and second-theme cases',async()=>{
  const f=await proposalFixture();try{
    for(const variant of ['typical','sparse','long','second-theme']){
      const entry=resolve(f.root,`templates/proposal-deck/proof-${variant}.tsx`);
      const themeImport=variant==='second-theme'?"import {theme} from '../../themes/opendoc-neutral';":"";
      await writeFile(entry,`import {Specimen}from'./preview';${themeImport}export const meta={title:'Proposal proof',description:'Synthetic layout proof',theme:'${variant==='second-theme'?'opendoc-neutral':'neutral'}'};export default function Proof(){return <Specimen ${variant==='second-theme'?'theme={theme}':`length="${variant}"`}/>} `);
      const result=await renderEntry(f.root,entry,`proposal-${variant}`);assert.equal(result.artifact.format,'presentation');
      assert.equal(result.artifact.pages.length,variant==='sparse'?1:14);assert.deepEqual(result.artifact.issues,[]);
      assert.ok(result.artifact.pages.every(page=>page.width===960&&page.height===540));assert.deepEqual(result.artifact.media,[]);
      if(variant==='typical'){
        assert.deepEqual(result.artifact.slides?.map(slide=>slide.id),['commission','recommendation','situation','outcomes','approach','workstreams','deliverables','scope-boundary','roadmap','governance','proof-story','investment','delivery-conditions','next-decision']);
        for(const id of ['commission-image','approach-visual','proof-story-image'])assert.ok(result.artifact.blocks[id]);
        assert.match(result.artifact.blocks['deliverable-handover-acceptance-text'].text,/successful\s+handover/);
      }
    }
    assert.deepEqual(await readdir(resolve(f.root,'documents')),['proof']);
  }finally{await f.cleanup();}
});

test('proposal creation keeps content local, adapted theme, format, project and provenance',async()=>{
  const f=await proposalFixture();try{
    const created=await createFromTemplate(f.root,'proposal-deck',{id:'client-proposal',projectId:'test-project',title:'A specific client proposal',theme:'neutral'});
    const result=await renderOnce(f.root,created.id);assert.equal(result.artifact.pages.length,14);assert.equal(result.artifact.format,'presentation');
    assert.deepEqual(result.artifact.issues,[]);assert.equal(result.artifact.provenance?.template,'templates/proposal-deck/index.tsx');
    const source=await readFile(resolve(f.root,created.entry),'utf8');assert.match(source,/from "\.\/theme"/);assert.doesNotMatch(source,/__OPENDOC_/);
    const manifest=JSON.parse(await readFile(resolve(f.root,'projects.json'),'utf8'));assert.equal(manifest.assignments[created.id],'test-project');assert.equal(manifest.formats[created.id],'presentation');
    assert.ok((await readdir(resolve(f.root,'documents',created.id))).includes('assets.json'));
    const targets=result.artifact.textTargets??[];
    for(const text of ['A specific client proposal','[Named output and format]','[The client outcome this engagement is designed to enable.]']){
      const target=targets.find(target=>target.text===text&&target.runs.some(run=>run.source));assert.ok(target,`editable instance text: ${text}`);
      assert.ok(target.runs.filter(run=>run.source).every(run=>run.source!.file===`documents/${created.id}/index.tsx`));
    }
    assert.ok(targets.every(target=>target.runs.filter(run=>run.source).every(run=>run.source!.file.startsWith(`documents/${created.id}/`))));
  }finally{await f.cleanup();}
});

test('proposal rejects in-page collisions from long ledger cells, workstream copy and slide titles',async()=>{
  const f=await proposalFixture();try{
    const created=await createFromTemplate(f.root,'proposal-deck',{id:'bounded-proposal',projectId:'test-project',title:'Bounded proposal',theme:'neutral'});
    const entry=resolve(f.root,created.entry), source=await readFile(entry,'utf8');
    const cases=[
      source.replace('acceptance="[Objective completeness or quality criterion]"',`acceptance={${JSON.stringify('An acceptance line.\n'.repeat(6).trim())}}`),
      source.replace('[Activities and decisions that establish the baseline and test the critical assumptions.]','A workstream activity with context. '.repeat(10)),
      source.replace('title="Translate the idea into work."',`title={${JSON.stringify('A title line.\n'.repeat(5).trim())}}`),
    ];
    for(const [index,changed] of cases.entries()){
      assert.notEqual(changed,source);await writeFile(entry,changed);
      await assert.rejects(renderOnce(f.root,created.id),/[Cc]lipp|[Ss]lide|[Pp]resentation layout/,`Bounded collision case ${index+1}`);
    }
  }finally{await f.cleanup();}
});
