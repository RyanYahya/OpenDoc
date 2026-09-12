import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, settled } from './helpers';
import { readMedia, parseMediaMeta, mediaFreshness } from '../src/media/files';
import { recordMedia } from '../src/server/media-cli';
import { scanMaterials } from '../src/server/materials';
import { renderOnce } from '../src/server/render';
import { Workspace } from '../src/server/workspace';
import { groupMedia } from '../src/shared/media';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAIAAABwJOjsAAAAOUlEQVR4nO3NQQEAIAwDsVIzqMEF/jXw3QzcHjQGsvY9muCRVYlBJrMqMcZc1SXGmKu6xBhzlT6PH78GAQA/IUyuAAAAAElFTkSuQmCC','base64');
const meta = {title:'Budget comparison',description:'Synthetic cost comparison.',file:'image.png',kind:'chart',sources:['sources/original.csv'],data:'data.json',recipe:'recipe.json'};
async function materials(root: string, id='budget') {
  const folder=resolve(root,'documents/proof/media',id);await mkdir(folder,{recursive:true});
  await mkdir(resolve(root,'documents/proof/sources'),{recursive:true});
  await writeFile(resolve(root,'documents/proof/sources/original.csv'),'item,cost\nA,10\nB,20\n');
  await writeFile(resolve(folder,'image.png'),png);
  await writeFile(resolve(folder,'meta.json'),JSON.stringify(meta));
  await writeFile(resolve(folder,'data.json'),'[{"item":"A","cost":10},{"item":"B","cost":20}]');
  await writeFile(resolve(folder,'recipe.json'),'{"type":"bar"}');
  return folder;
}
function mediaSource(item='budget') { return `import {Document,Pages,Paragraph,Figure,Media} from '../../src/document';export const meta={title:'Managed media proof',description:'Synthetic fixture',kind:'report',theme:'neutral'};export default function Proof(){return <Document title={meta.title}><Pages title={meta.title}><Paragraph id="opening">A figure with traceable local data.</Paragraph><Figure id="budget-figure" caption="Synthetic comparison"><Media item="${item}" width={120}/></Figure></Pages></Document>}`; }

test('media owns preparation files while source locations remain author-managed notes', async()=>{
  assert.equal(parseMediaMeta(meta).title,meta.title);
  assert.deepEqual(parseMediaMeta({...meta,sources:['../research/paper.pdf','/archive/large.csv','https://example.org/paper']}).sources,['../research/paper.pdf','/archive/large.csv','https://example.org/paper']);
  for(const patch of [{title:''},{description:''},{kind:'video'},{file:'../private.png'},{file:'image.svg'},{sources:['']},{data:'../source.json'},{recipe:'/tmp/a.py'},{sources:['sources/a','sources/a']},{unknown:true}]) assert.throws(()=>parseMediaMeta({...meta,...patch}));
  const f=await fixture();try{const folder=await materials(f.root);const document=resolve(f.root,'documents/proof');const asset=readMedia(document,'budget');assert.deepEqual([asset.width,asset.height],[40,20]);assert.equal(mediaFreshness(asset).freshness,'unrecorded');await recordMedia(f.root,'proof','budget');assert.equal(mediaFreshness(readMedia(document,'budget')).freshness,'current');await writeFile(resolve(document,'sources/original.csv'),'changed original');assert.deepEqual(mediaFreshness(readMedia(document,'budget')).changedInputs,[]);await rm(resolve(document,'sources/original.csv'));assert.equal(mediaFreshness(readMedia(document,'budget')).freshness,'current');const recordFile=resolve(folder,'generation.json');const record=JSON.parse(await readFile(recordFile,'utf8'));record.inputs['sources/original.csv']='historical-source-hash';await writeFile(recordFile,JSON.stringify(record));assert.equal(mediaFreshness(readMedia(document,'budget')).freshness,'current');await rm(resolve(folder,'data.json'));await symlink(resolve(f.root,'package.json'),resolve(folder,'data.json'));assert.throws(()=>readMedia(document,'budget'),/Linked files/);}finally{await f.cleanup();}
});

test('changed prepared data still prevents stale media export and preserves the last preview',async()=>{
  const f=await fixture();const workspace=new Workspace(f.root);
  try{await materials(f.root);await materials(f.root,'another-chart');await recordMedia(f.root,'proof','budget');await recordMedia(f.root,'proof','another-chart');await writeFile(f.entry,mediaSource());await workspace.refresh();await settled(workspace);const first=workspace.states.get('proof')!;assert.equal(first.status,'ready');assert.deepEqual(first.artifact?.media,[{item:'budget',blockId:'budget-figure'}]);const hash=first.artifact?.hash;
    const file=resolve(f.root,'documents/proof/media/budget/data.json');await writeFile(file,'[{"item":"A","cost":30}]');workspace.noteChange(file);await workspace.flushChanges();await settled(workspace);assert.equal(first.status,'error');assert.match(first.error!,/needs regeneration/);assert.equal(first.artifact?.hash,hash);
    const catalog=await scanMaterials(f.root,workspace.list());assert.equal(catalog.media.length,2);assert.equal(catalog.media.find(item=>item.id==='budget')?.freshness,'stale');assert.equal(catalog.media.find(item=>item.id==='another-chart')?.freshness,'current');assert.equal('sources' in catalog,false);assert.equal(catalog.media.find(item=>item.id==='budget')?.usageKnown,false);
    // Recording is an explicit author action after regenerating and reviewing the output.
    await recordMedia(f.root,'proof','budget');workspace.noteChange(resolve(f.root,'documents/proof/media/budget/generation.json'));await workspace.flushChanges();await settled(workspace);assert.equal(first.status,'ready');
  }finally{await workspace.close();await f.cleanup();}
});

test('the browser groups equal bytes without merging metadata or claiming unused images are used',async()=>{
 const f=await fixture();try{await materials(f.root);await materials(f.root,'second-copy');await recordMedia(f.root,'proof','budget');await recordMedia(f.root,'proof','second-copy');await writeFile(f.entry,mediaSource());const rendered=await renderOnce(f.root,'proof');const catalog=await scanMaterials(f.root,[{id:'proof',status:'ready',revision:1,artifact:rendered.artifact}]);const groups=groupMedia(catalog.media);assert.equal(groups.length,1);assert.equal(groups[0].length,2);assert.equal(catalog.media[0].usedIn[0].blockId,'budget-figure');assert.equal(catalog.media[1].usedIn.length,0);
 await writeFile(resolve(f.root,'documents/proof/media/second-copy/image.png'),Buffer.concat([png,Buffer.from('different contents')]));const changed=await scanMaterials(f.root,[{id:'proof',status:'ready',revision:1,artifact:rendered.artifact}]);assert.equal(groupMedia(changed.media).length,2);
 await writeFile(resolve(f.root,'documents/proof/media/second-copy/meta.json'),'{bad json');const broken=await scanMaterials(f.root,[{id:'proof',status:'ready',revision:1,artifact:rendered.artifact}]);assert.equal(broken.media.length,2);assert.ok(broken.media[1].error);assert.equal(broken.media[0].error,undefined);
 }finally{await f.cleanup();}
});

test('materials HTTP serves owned files, current image bytes, and selected media context', {timeout:30_000}, async()=>{
  const {spawn}=await import('node:child_process');
  const {projectRoot,until}=await import('./helpers');
  const f=await fixture();
  await materials(f.root);await recordMedia(f.root,'proof','budget');await writeFile(f.entry,mediaSource());
  const child=spawn(process.execPath,['--import','tsx',resolve(projectRoot,'src/server/index.ts')],{cwd:f.root,env:{...process.env,OPENDOC_PORT:'0'},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  try {
    let connection:{origin:string;token:string}|undefined;
    await until(async()=>{try{connection=JSON.parse(await readFile(resolve(f.root,'.opendoc/server.json'),'utf8'));return true;}catch{if(child.exitCode!==null)throw new Error(logs);return false;}});
    const {origin,token}=connection!;
    await until(async()=>{const docs=await fetch(`${origin}/api/documents`).then(r=>r.json());return docs[0]?.status==='ready';});
    const catalog=await fetch(`${origin}/api/materials`).then(r=>r.json());
    assert.equal(catalog.media[0].freshness,'current');
    const response=await fetch(`${origin}/api/materials/proof/image?item=budget&hash=${catalog.media[0].hash}`);
    assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
    assert.equal((await fetch(`${origin}/api/materials/proof/image?item=budget&hash=old`)).status,409);
    const sourceResponse=await fetch(`${origin}/api/materials/proof/file?path=sources%2Foriginal.csv`);
    assert.equal(sourceResponse.status,400);
    const prepared=await fetch(`${origin}/api/materials/proof/file?path=media%2Fbudget%2Fdata.json`);assert.equal(prepared.status,200);assert.match(prepared.headers.get('content-disposition')!,/^attachment;/);assert.deepEqual(await prepared.json(),[{item:'A',cost:10},{item:'B',cost:20}]);
    for(const path of ['../package.json','sources/../../package.json','index.tsx','media/budget/../../../package.json'])assert.equal((await fetch(`${origin}/api/materials/proof/file?path=${encodeURIComponent(path)}`)).status,400);
    const headers={'Content-Type':'application/json','X-OpenDoc-Token':token,Origin:origin};
    assert.equal((await fetch(`${origin}/api/context`,{method:'POST',headers,body:JSON.stringify({documentId:'proof',blockId:null,page:1,mediaId:'budget'})})).status,200);
    const context=JSON.parse(await readFile(resolve(f.root,'.opendoc/current.json'),'utf8'));assert.equal(context.mediaId,'budget');assert.equal(context.selectedMedia.folder,'documents/proof/media/budget');assert.equal(context.selectedMedia.freshness,'current');assert.equal('sources' in context.materials,false);
    await writeFile(resolve(f.root,'documents/proof/media/budget/data.json'),'[]');
    await until(async()=>{const next=await fetch(`${origin}/api/materials`).then(r=>r.json());return next.media[0]?.freshness==='stale';});
  } finally {
    child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);if(child.exitCode===null)child.kill('SIGKILL');await f.cleanup();
  }
});
