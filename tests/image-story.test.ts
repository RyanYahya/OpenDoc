import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, projectRoot } from './helpers';
import { TemplateCatalog, createFromTemplate } from '../src/server/templates';
import { renderEntry, renderOnce } from '../src/server/render';

async function imageStoryFixture(){
  const f=await fixture();await mkdir(resolve(f.root,'templates'),{recursive:true});
  await cp(resolve(projectRoot,'templates/image-story'),resolve(f.root,'templates/image-story'),{recursive:true});return f;
}

test('image-story catalog is a neutral skeleton with seven layouts and no bundled artwork',async()=>{
  const f=await imageStoryFixture();const catalog=new TemplateCatalog(f.root);
  try{
    const files=await readdir(resolve(f.root,'templates/image-story'),{recursive:true});
    assert.ok(files.every(file=>!file.endsWith('.png')&&!file.endsWith('.jpg')&&!file.endsWith('.jpeg')));
    const preview=await catalog.preview('image-story');assert.equal(preview.error,undefined);
    assert.equal(preview.artifact!.pages.length,7);assert.equal(preview.artifact!.meta.theme,'neutral');
    assert.deepEqual(preview.artifact!.media,[]);assert.deepEqual(preview.artifact!.issues,[]);
    for(const page of preview.artifact!.pages)assert.ok(page.fragments.some(block=>block.id.includes('-image')||block.id.includes('-secondary')));
    assert.deepEqual(await readdir(resolve(f.root,'documents')),['proof']);
  }finally{await catalog.close();await f.cleanup();}
});

test('creation makes independent placeholders, adapted themes, project membership and writable instance titles',async()=>{
  const f=await imageStoryFixture();try{
    for(const theme of ['neutral','opendoc-neutral']){
      const title=`A new visual story in ${theme}`;
      const created=await createFromTemplate(f.root,'image-story',{id:`story-${theme}`,projectId:'test-project',theme,title});
      const result=await renderOnce(f.root,created.id);
      assert.deepEqual(result.artifact.issues,[]);assert.equal(result.artifact.pages.length,2);
      assert.equal(result.artifact.meta.theme,theme);assert.equal(result.artifact.provenance!.template,'templates/image-story/index.tsx');
      assert.deepEqual(result.artifact.media,[]);
      const source=await readFile(resolve(f.root,created.entry),'utf8');assert.match(source,/from "\.\/theme"/);assert.doesNotMatch(source,/__OPENDOC_/);
      const projects=JSON.parse(await readFile(resolve(f.root,'projects.json'),'utf8'));assert.equal(projects.assignments[created.id],'test-project');
      assert.ok((await readdir(resolve(f.root,'documents',created.id))).includes('assets.json'));
      const heading=result.artifact.textTargets!.find(target=>target.text===title&&target.runs.some(run=>run.source));
      assert.ok(heading,'The title remains editable');
      assert.ok(heading.runs.filter(run=>run.source).every(run=>run.source!.file===`documents/${created.id}/index.tsx`));
    }
  }finally{await f.cleanup();}
});

test('sparse and long cases preserve the skeleton, deliberate title adjustment, and normal prose flow',async()=>{
  const f=await imageStoryFixture();try{
    for(const length of ['sparse','long']){
      const entry=resolve(f.root,`templates/image-story/${length}.tsx`);
      await writeFile(entry,`import {Specimen} from './preview';export {meta} from './preview';export default function Proof(){return <Specimen length="${length}"/>}`);
      const result=await renderEntry(f.root,entry,`image-story-${length}`);
      assert.deepEqual(result.artifact.issues,[]);
      if(length==='sparse')assert.equal(result.artifact.pages.length,1);
      else{assert.ok(result.artifact.pages.length>3);assert.match(result.artifact.blocks['long-passage-20'].text,/END OF STORY/);}
    }
    const entry=resolve(f.root,'templates/image-story/letter.tsx');
    await writeFile(entry,`import {Specimen} from './preview';import {neutral}from'../../themes';export {meta}from'./preview';export default function Proof(){return <Specimen length="sparse" theme={{...neutral,pageSize:'Letter'}}/>}`);
    const result=await renderEntry(f.root,entry,'letter');assert.deepEqual(result.artifact.issues,[]);assert.equal(result.artifact.pages[0].width,612);
  }finally{await f.cleanup();}
});

test('excessive feature copy is rejected instead of silently clipping within an image page',async()=>{
  const f=await imageStoryFixture();try{
    await writeFile(f.entry,`import {ImageStory,ImageStoryPage}from'../../templates/image-story';import{neutral}from'../../themes';export const meta={title:'Too much copy',description:'Boundary proof',theme:'neutral'};export default function Proof(){return <ImageStory title={meta.title}><ImageStoryPage id="feature" theme={neutral} title="Short title" lead={'This feature copy belongs in flowing Pages. '.repeat(150)}/></ImageStory>}`);
    await assert.rejects(renderOnce(f.root,'proof'),/clipped|beyond page/);
  }finally{await f.cleanup();}
});
