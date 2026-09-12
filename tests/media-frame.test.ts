import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fixture, projectRoot, settled } from './helpers';
import { renderOnce } from '../src/server/render';
import { recordMedia } from '../src/server/media-cli';
import { Workspace } from '../src/server/workspace';
import { readMedia } from '../src/media/files';
import { framedMedia } from '../src/media/render';

async function colors(root:string) {
  const folder = resolve(root,'documents/proof/media/colors');
  await mkdir(folder,{recursive:true});
  const png = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="20"><path fill="#ff0000" d="M0 0h20v20H0z"/><path fill="#00ff00" d="M20 0h20v20H20z"/><path fill="#0000ff" d="M40 0h20v20H40z"/></svg>').render().asPng();
  await writeFile(resolve(folder,'image.png'),png);
  await writeFile(resolve(folder,'meta.json'),JSON.stringify({title:'Three color bands',description:'Synthetic geometry test, not artwork.',file:'image.png',kind:'image',data:'recipe.json'}));
  await writeFile(resolve(folder,'recipe.json'),'{}');
  await recordMedia(root,'proof','colors');
  return folder;
}
const prefix = `import {Document,Page,Paragraph,Media,MediaFrame,Block} from '../../src/document';export const meta={title:'Image rendering proof',description:'Synthetic geometry test',theme:'neutral'};`;
const pixel = (context:CanvasRenderingContext2D,x:number,y:number) => Array.from(context.getImageData(x,y,1,1).data);

test('image frames paint actual crops, alignment, containment and circular corners while text stays native',async()=>{
  const f = await fixture();
  try {
    await colors(f.root);
    await writeFile(f.entry,`${prefix}export default function Proof(){return <Document title={meta.title}>
      <Page size={{width:400,height:400}} margin={0} style={{backgroundColor:'#ffffff'}}>
        <Paragraph id="text" style={{position:'absolute',left:20,top:20}}>Selectable image frame proof</Paragraph>
        <Block id="left" style={{position:'absolute',left:20,top:60}}><MediaFrame item="colors" width={100} height={100} position={{x:0,y:0.5}}/></Block>
        <Block id="center" style={{position:'absolute',left:140,top:60}}><MediaFrame item="colors" width={100} height={100}/></Block>
        <Block id="right" style={{position:'absolute',left:260,top:60}}><MediaFrame item="colors" width={100} height={100} position={{x:1,y:0.5}}/></Block>
        <Block id="contain" style={{position:'absolute',left:20,top:200}}><MediaFrame item="colors" width={100} height={100} fit="contain"/></Block>
        <Block id="round" style={{position:'absolute',left:140,top:200}}><MediaFrame item="colors" width={100} height={100} radius={50}/></Block>
        <Block id="ordinary" style={{position:'absolute',left:260,top:200}}><Media item="colors" width={100} height={100}/></Block>
      </Page>
      <Page size={{width:160,height:160}} margin={20} style={{backgroundColor:'#ffffff'}} backgroundMedia="colors" backgroundSize="cover"><Paragraph id="managed">Managed background</Paragraph></Page>
      <Page size={{width:160,height:160}} margin={20} backgroundImage="./media/colors/image.png" backgroundSize="cover"><Paragraph id="local">Local background</Paragraph></Page>
      <Page size={{width:160,height:160}} margin={0} backgroundImage="./media/colors/image.png" backgroundSize="contain" backgroundPosition="bottom-right"/>
      <Page size={{width:160,height:160}} margin={0} backgroundImage="./media/colors/image.png" backgroundSize="cover" backgroundPosition="top-left"/>
      <Page size={{width:160,height:160}} margin={0} backgroundImage="./media/colors/image.png" backgroundSize="fill"/>
    </Document>}`);
    const result = await renderOnce(f.root,'proof');
    assert.deepEqual(result.artifact.issues,[]);
    assert.deepEqual(result.artifact.media?.map(use=>use.blockId),['left','center','right','contain','round','ordinary',undefined]);
    assert.ok(Math.abs(result.artifact.pages[0].fragments.find(block=>block.id==='ordinary')!.height-100/3)<0.001);
    const loading = getDocument({data:new Uint8Array(await readFile(resolve(result.directory,'document.pdf'))),standardFontDataUrl:resolve(projectRoot,'node_modules/pdfjs-dist/standard_fonts')+'/'});
    try {
      const pdf = await loading.promise;
      const factory = pdf.canvasFactory as {create(w:number,h:number):{canvas:HTMLCanvasElement;context:CanvasRenderingContext2D};destroy(target:unknown):void};
      for (let number=1;number<=pdf.numPages;number++) {
        const page=await pdf.getPage(number),viewport=page.getViewport({scale:1});
        const target=factory.create(Math.ceil(viewport.width),Math.ceil(viewport.height));
        try {
          await page.render({canvas:target.canvas,canvasContext:target.context,viewport}).promise;
          if(number===1){
            assert.deepEqual(pixel(target.context,70,110),[255,0,0,255]);
            assert.deepEqual(pixel(target.context,190,110),[0,255,0,255]);
            assert.deepEqual(pixel(target.context,310,110),[0,0,255,255]);
            assert.deepEqual(pixel(target.context,70,210),[255,255,255,255],'contain leaves transparent padding');
            assert.deepEqual(pixel(target.context,70,250),[0,255,0,255]);
            assert.deepEqual(pixel(target.context,142,202),[255,255,255,255],'round corner reveals the page');
            assert.deepEqual(pixel(target.context,190,250),[0,255,0,255]);
            assert.match((await page.getTextContent()).items.map(item=>'str'in item?item.str:'').join(' '),/Selectable image frame proof/);
          }else if(number<=3){
            for(const [x,y]of[[1,1],[158,1],[1,158],[158,158]]){
              // The crop boundary interpolates adjacent bands in this deliberately tiny source.
              const [r,g,b,a]=pixel(target.context,x,y);
              assert.ok(g>160 && r<100 && b<100 && a===255,`background page ${number} reaches every edge with the center band`);
            }
            assert.deepEqual(pixel(target.context,80,80),[0,255,0,255]);
          }else if(number===4){
            assert.deepEqual(pixel(target.context,80,40),[255,255,255,255]);
            assert.deepEqual(pixel(target.context,80,140),[0,255,0,255]);
          }else if(number===5){
            assert.deepEqual(pixel(target.context,80,80),[255,0,0,255]);
          }else{
            assert.deepEqual(pixel(target.context,20,80),[255,0,0,255]);
            assert.deepEqual(pixel(target.context,140,80),[0,0,255,255]);
          }
        }finally{factory.destroy(target);}
      }
    }finally{await loading.destroy();}
  }finally{await f.cleanup();}
});

test('frames validate geometry and fit before rasterizing',async()=>{
  const f=await fixture();try{
    await colors(f.root);const asset=readMedia(resolve(f.root,'documents/proof'),'colors');
    for(const patch of [{width:0},{height:NaN},{fit:'stretch'},{position:{x:-1,y:0}},{position:{x:0,y:Infinity}},{radius:51}])
      assert.throws(()=>framedMedia(asset,{width:100,height:100,...patch} as Parameters<typeof framedMedia>[1]),/MediaFrame/);
  }finally{await f.cleanup();}
});

test('managed frames and backgrounds reject stale inputs and keep the previous preview',async()=>{
  for(const markup of ['<MediaFrame item="colors" width={100} height={100}/>','<Page backgroundMedia="colors"><Paragraph id="title">Background</Paragraph></Page>']){
    const f=await fixture();const workspace=new Workspace(f.root);try{
      const folder=await colors(f.root);
      const content=markup.startsWith('<Page')?markup:`<Page><Block id="framed">${markup}</Block></Page>`;
      await writeFile(f.entry,`${prefix}export default function Proof(){return <Document title={meta.title}>${content}</Document>}`);
      await workspace.refresh();await settled(workspace);const state=workspace.states.get('proof')!;
      assert.equal(state.status,'ready',state.error);const previous=state.artifact!.hash;
      const input=resolve(folder,'recipe.json');await writeFile(input,'{"changed":true}');workspace.noteChange(input);await workspace.flushChanges();await settled(workspace);
      assert.equal(state.status,'error');assert.match(state.error!,/needs regeneration/);assert.equal(state.artifact!.hash,previous);
    }finally{await workspace.close();await f.cleanup();}
  }
});

test('missing page files and ambiguous background sources fail instead of exporting a blank image',async()=>{
  const f=await fixture();try{
    await writeFile(f.entry,`${prefix}export default function Proof(){return <Document title={meta.title}><Page backgroundImage="./absent.png"><Paragraph id="title">Missing artwork</Paragraph></Page></Document>}`);
    await assert.rejects(renderOnce(f.root,'proof'),/absent\.png/);
    await colors(f.root);
    await writeFile(f.entry,`${prefix}export default function Proof(){return <Document title={meta.title}><Page backgroundMedia="colors" backgroundImage="./media/colors/image.png"><Paragraph id="title">Ambiguous artwork</Paragraph></Page></Document>}`);
    await assert.rejects(renderOnce(f.root,'proof'),/not both/);
  }finally{await f.cleanup();}
});
