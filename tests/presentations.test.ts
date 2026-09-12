import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture } from './helpers';
import { renderOnce } from '../src/server/render';
import { createDocument } from '../src/server/create';
import { readProjects, createProject, assignProject } from '../src/server/projects';
import { duplicateDocument, deleteDocument, restoreDocument } from '../src/server/documents';
import { Workspace } from '../src/server/workspace';
import { settled } from './helpers';
import { TextEditService } from '../src/server/edits';
import { addComment, readComments } from '../src/server/comments';
import { resolveCommentAnchor } from '../src/shared/anchors';
import { exportDocuments } from '../src/server/export-batch';
import type { DocumentState } from '../src/shared/types';
import { assertSlideLayout } from '../src/server/preflight';
import type { LayoutInfo } from '@formepdf/core';

function deck(body: string) {
  return `import {Presentation,Slide,Document,Page,Pages,PageBreak,Heading,Paragraph,Block,View,Text,Image} from '../../src/document';
export const meta={title:'Presentation proof',description:'Synthetic test material',theme:'neutral'};
export default function Proof(){return <Presentation title={meta.title}>${body}</Presentation>}`;
}

test('slides render as separate wide pages with native editable text and stable identities', async () => {
  const f = await fixture();
  const manifestFile = resolve(f.root, 'projects.json');
  const manifest = JSON.parse(await readFile(manifestFile,'utf8'));
  await writeFile(manifestFile, JSON.stringify({...manifest, formats:{proof:'presentation'}}));
  try {
    await writeFile(f.entry, deck('<Slide id="opening"><Heading id="title" style={{fontSize:44}}>A clear opening</Heading><Paragraph id="body" style={{fontSize:24}}>Editable presentation text.</Paragraph></Slide><Slide id="ending"><Paragraph id="last">A clear ending.</Paragraph></Slide>'));
    const { artifact, directory } = await renderOnce(f.root, 'proof');
    assert.equal(artifact.format, 'presentation');
    assert.deepEqual(artifact.slides, [{ id: 'opening' }, { id: 'ending' }]);
    assert.deepEqual(artifact.pages.map(({width,height}) => [width,height]), [[960,540],[960,540]]);
    assert.ok(artifact.pages[0].fragments.some(fragment => fragment.id === 'body'));
    assert.ok(!artifact.pages[1].fragments.some(fragment => fragment.id === 'body'));
    assert.ok(artifact.textTargets?.some(target => target.blockId === 'body' && target.runs.some(run => run.source)));
    const layout = JSON.parse(await readFile(resolve(directory,'layout.json'),'utf8'));
    assert.ok(JSON.stringify(layout).includes('Editable presentation text.'));
  } finally { await f.cleanup(); }
});

test('overflow and clipping fail instead of making continuation slides exportable', async () => {
  const f = await fixture();
  const manifestFile = resolve(f.root, 'projects.json');
  const manifest = JSON.parse(await readFile(manifestFile,'utf8'));
  await writeFile(manifestFile, JSON.stringify({...manifest, formats:{proof:'presentation'}}));
  try {
    const imagePath = resolve(f.root,'documents/proof/image.png');
    await writeFile(imagePath,await readFile(resolve(f.root,'assets/brand/wordmark.png')));
    for (const body of [
      `<Paragraph id="long" style={{fontSize:30}}>${'Too much text for one slide. '.repeat(200)}</Paragraph>`,
      '<Block id="clipped" style={{height:12,overflow:"hidden"}}><Paragraph id="words" style={{fontSize:24}}>Text must remain visible.</Paragraph></Block>',
      '<Paragraph id="outside" style={{position:"absolute",left:950,top:100,width:200,fontSize:24}}>Outside the slide.</Paragraph>',
      `<Block id="oversized-image"><Image src={${JSON.stringify(imagePath)}} style={{width:1200,height:300}}/></Block>`,
      '<Block id="oversized-panel" style={{width:1200,height:300,backgroundColor:"#242424"}}/>',
      '<Block id="panel-frame" style={{width:80,height:80,overflow:"hidden"}}><View style={{width:200,height:200,backgroundColor:"#242424"}}/></Block>',
    ]) {
      await writeFile(f.entry, deck(`<Slide id="overflow">${body}</Slide><Slide id="next"><Paragraph id="next-body">Untouched slide.</Paragraph></Slide>`));
      await assert.rejects(renderOnce(f.root, 'proof'), /[Ss]lide|[Pp]resentation layout/);
    }
    await writeFile(f.entry, deck('<Slide id="repaired"><Paragraph id="short">Now it fits.</Paragraph></Slide>'));
    assert.equal((await renderOnce(f.root,'proof')).artifact.pages.length,1);
  } finally { await f.cleanup(); }
});

test('presentations reject flowing pages, page breaks, nested slides, and content outside slides', async () => {
  const f = await fixture();
  const manifestFile = resolve(f.root, 'projects.json');
  const manifest = JSON.parse(await readFile(manifestFile,'utf8'));
  await writeFile(manifestFile, JSON.stringify({...manifest, formats:{proof:'presentation'}}));
  try {
    for (const body of [
      '<Slide id="outer"><Slide id="inner"/></Slide>',
      '<Slide id="outer"><PageBreak/></Slide>',
      '<Pages title="Wrong"><Paragraph id="wrong">Flowing content.</Paragraph></Pages>',
      '<Slide id="outer"><Page><Text>Nested page.</Text></Page></Slide>',
      '<Paragraph id="orphan">Outside a slide.</Paragraph>',
      '',
    ]) {
      await writeFile(f.entry, deck(body));
      await assert.rejects(renderOnce(f.root, 'proof'), /[Ss]lide|[Pp]resentation/);
    }
  } finally { await f.cleanup(); }
});

test('creation, discovery before rendering, and lifecycle operations retain presentation format', async () => {
  const f = await fixture();
  const workspace = new Workspace(f.root);
  try {
    await createDocument(f.root, { id:'deck', title:'A presentation', projectId:'test-project', format:'presentation' });
    assert.equal((await readProjects(f.root)).formats?.deck,'presentation');
    assert.ok((await readFile(resolve(f.root,'documents/deck/theme.tsx'),'utf8')).includes('neutral'));
    assert.ok(JSON.parse(await readFile(resolve(f.root,'documents/deck/assets.json'),'utf8')));
    await workspace.discover();
    assert.equal(workspace.states.get('deck')?.format,'presentation');
    assert.equal(workspace.states.get('deck')?.status,'rendering');
    assert.equal(workspace.states.get('proof')?.format,'document');
    await workspace.refresh(); await settled(workspace);
    assert.equal(workspace.states.get('deck')?.status,'ready');
    const previous = workspace.states.get('deck')!.artifact!.hash;
    await writeFile(resolve(f.root,'documents/deck/index.tsx'),'export default = broken');
    workspace.invalidate('deck'); await settled(workspace);
    assert.equal(workspace.states.get('deck')?.status,'error');
    assert.equal(workspace.states.get('deck')?.format,'presentation');
    assert.equal(workspace.states.get('deck')?.artifact?.hash,previous);
    const copy = await duplicateDocument(f.root,'deck','A presentation');
    assert.equal((await readProjects(f.root)).formats?.[copy.id],'presentation');
    await createProject(f.root,{id:'another',name:'Another'});
    await assignProject(f.root,copy.id,'another');
    const removed = await deleteDocument(f.root,copy.id);
    assert.equal((await readProjects(f.root)).formats?.[copy.id],undefined);
    await restoreDocument(f.root,removed.restoreId);
    assert.equal((await readProjects(f.root)).formats?.[copy.id],'presentation');
    assert.equal((await readProjects(f.root)).assignments[copy.id],'another');
    await assert.rejects(createDocument(f.root,{title:'Bad starter',projectId:'test-project',format:'presentation',starter:'report'}),/starters/);
  } finally { await workspace.close(); await f.cleanup(); }
});

test('draft edits, saves, comments, and export share slide validation and survive reordering', async () => {
  const f = await fixture();
  const service = new TextEditService(f.root);
  try {
    const manifest = await readProjects(f.root);
    await writeFile(resolve(f.root,'projects.json'),JSON.stringify({...manifest,formats:{proof:'presentation'}}));
    const opening = '<Slide id="opening"><Heading id="title">An opening</Heading><Paragraph id="body" style={{fontSize:24}}>A short original sentence.</Paragraph></Slide>';
    const ending = '<Slide id="ending"><Paragraph id="last">An independent ending.</Paragraph></Slide>';
    await writeFile(f.entry,deck(opening+ending));
    const original = await readFile(f.entry,'utf8');
    const {artifact} = await renderOnce(f.root,'proof');
    const state: DocumentState = {id:'proof',format:'presentation',status:'ready',revision:1,artifact};
    const target = artifact.textTargets!.find(target=>target.blockId==='body')!;
    const input = (replacement:string) => ({revision:1,hash:artifact.hash,edits:[{targetId:target.id,start:0,end:target.text.length,replacement}]});
    const draft = await service.preview('proof',input('A revised sentence.'),state);
    assert.equal(draft.artifact.pages.length,2);
    assert.match(draft.artifact.blocks.body.text,/A revised sentence/);
    assert.equal(await readFile(f.entry,'utf8'),original);
    await assert.rejects(service.preview('proof',input('Overflowing text. '.repeat(200)),state),/[Ss]lide/);
    await assert.rejects(service.apply('proof',input('Overflowing text. '.repeat(200)),state),/[Ss]lide/);
    assert.equal(await readFile(f.entry,'utf8'),original);
    await service.apply('proof',input('A revised sentence.'),state);
    await addComment(f.root,'proof',{blockId:'body',text:'Keep this with its slide.',quote:'A revised sentence.'});
    await writeFile(f.entry,deck(ending+opening.replace('A short original sentence.','A revised sentence.')));
    const reordered = (await renderOnce(f.root,'proof')).artifact;
    assert.equal(reordered.textTargets!.find(value=>value.id===target.id)?.lines[0].page,2);
    const comments = await readComments(f.root,'proof');
    assert.equal(resolveCommentAnchor(reordered,comments[0]).selection?.page,2);
    const [exported] = await exportDocuments(f.root,['proof']);
    assert.equal(exported.status,'success');
    const output = await readFile(resolve(f.root,'output/proof.pdf'));
    await writeFile(f.entry,deck('<Slide id="broken"><Paragraph id="too-long">'+ 'Too much content. '.repeat(1000)+'</Paragraph></Slide>'));
    assert.equal((await exportDocuments(f.root,['proof']))[0].status,'error');
    assert.deepEqual(await readFile(resolve(f.root,'output/proof.pdf')),output);
  } finally { await service.close(); await f.cleanup(); }
});

test('equal page counts cannot hide shifted components or duplicated slide identities', () => {
  const node = (id:string, children:unknown[] = []) => ({sourceLocation:{file:`opendoc:block:${id}`,line:1,column:1},children});
  const layout = {pages:[{width:960,height:540,elements:[node('one',[node('foreign')])]}, {width:960,height:540,elements:[node('two')]}]} as unknown as LayoutInfo;
  assert.throws(()=>assertSlideLayout(layout,[{id:'one'},{id:'two'}],{foreign:{id:'foreign',slideId:'two',kind:'paragraph',text:'Moved text'}}),/foreign moved onto slide one/);
  layout.pages[0].elements=[];
  assert.throws(()=>assertSlideLayout(layout,[{id:'one'},{id:'two'}],{}),/Slide one/);
  layout.pages[0].elements=[node('two') as never];
  assert.throws(()=>assertSlideLayout(layout,[{id:'one'},{id:'two'}],{}),/Slide one/);
});

test('registered format and authored root must agree, including a format change after rendering', async () => {
  const f=await fixture();
  const workspace=new Workspace(f.root);
  try {
    await writeFile(f.entry,deck('<Slide id="only"><Paragraph id="copy">A slide.</Paragraph></Slide>'));
    await assert.rejects(renderOnce(f.root,'proof'),/must use the Document root/);
    const manifest=await readProjects(f.root);
    await writeFile(resolve(f.root,'projects.json'),JSON.stringify({...manifest,formats:{proof:'presentation'}}));
    await workspace.refresh(); await settled(workspace);
    assert.equal(workspace.states.get('proof')?.status,'ready');
    await writeFile(resolve(f.root,'projects.json'),JSON.stringify(manifest));
    await workspace.refreshProjects(); await settled(workspace);
    assert.equal(workspace.states.get('proof')?.format,'document');
    assert.equal(workspace.states.get('proof')?.status,'error');
    assert.match(workspace.states.get('proof')?.error ?? '',/must use the Document root/);
  } finally {await workspace.close(); await f.cleanup();}
});
