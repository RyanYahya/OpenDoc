import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { Block, Heading, MediaFrame, Paragraph, Presentation, Slide, TextSlot, type ImageFrameOptions } from 'opendoc';
import { themePage, themeType, type DocTheme } from 'opendoc/themes';

export type ProposalImage = Pick<ImageFrameOptions, 'fit' | 'position' | 'radius'> & { item: string; alt?: string };
type BoxProps = { x: number; y: number; w: number; h?: number };
const box = ({x,y,w,h}:BoxProps):F.Style => ({position:'absolute',left:x,top:y,width:w,...(h===undefined?{}:{height:h})});

export function ProposalDeck(props:Parameters<typeof Presentation>[0]) { return <Presentation {...props}/>; }

/** A slide shell, not a compulsory argument. Every visible word is supplied by its caller. */
export function ProposalSlide({id,theme,title,eyebrow,footer,number,children,dark=false,layout='standard',titleSize=38}:{
  id:string;theme:DocTheme;title:ReactNode;eyebrow?:ReactNode;footer?:ReactNode;number?:ReactNode;children?:ReactNode;
  dark?:boolean;layout?:'standard'|'cover'|'case'|'closing';titleSize?:number;
}) {
  const ink=dark?theme.paper:theme.ink, muted=dark?theme.line:theme.muted;
  const titleBox=layout==='cover'?{x:64,y:178,w:536,h:170}:layout==='case'?{x:596,y:78,w:316,h:92}:layout==='closing'?{x:88,y:135,w:766,h:145}:{x:88,y:76,w:824,h:92};
  return <Slide id={id} padding={0} style={{...themePage(theme).style,backgroundColor:dark?theme.ink:theme.paper,lineBreaking:'greedy'}}>
    {layout==='standard'&&<F.View style={{position:'absolute',left:48,top:40,width:2,height:454,backgroundColor:dark?theme.muted:theme.line}}/>}
    {eyebrow&&<Block id={`${id}-eyebrow-frame`} style={{...box({x:layout==='cover'?64:layout==='case'?596:88,y:40,w:layout==='case'?316:790,h:28}),overflow:'hidden'}}><Paragraph id={`${id}-eyebrow`} role="label" style={{...themeType(theme,'label'),fontSize:11,lineHeight:1.15,margin:0,color:muted}}><TextSlot slot="eyebrow" from="eyebrow">{eyebrow}</TextSlot></Paragraph></Block>}
    <Block id={`${id}-title-frame`} style={{...box(titleBox),overflow:'hidden'}}><Heading id={`${id}-title`} level={1} style={{...themeType(theme,'h1'),fontSize:layout==='cover'?titleSize+12:layout==='closing'?titleSize+10:titleSize,lineHeight:1.06,margin:0,color:ink}}><TextSlot slot="title" from="title">{title}</TextSlot></Heading></Block>
    {children}
    {footer&&<Paragraph id={`${id}-footer`} role="small" style={{...box({x:layout==='cover'?64:88,y:508,w:735}),...themeType(theme,'small'),fontSize:9,lineHeight:1.1,margin:0,color:muted}}><TextSlot slot="footer" from="footer">{footer}</TextSlot></Paragraph>}
    {number&&<Paragraph id={`${id}-number`} role="small" style={{...box({x:864,y:505,w:48}),...themeType(theme,'small'),fontSize:12,lineHeight:1.1,margin:0,color:muted,textAlign:'right'}}><TextSlot slot="number" from="number">{number}</TextSlot></Paragraph>}
  </Slide>;
}

export function ProposalPanel({id,x,y,w,h,theme,children,fill=false,dark=false,padding=0}:BoxProps&{id:string;h:number;theme:DocTheme;children?:ReactNode;fill?:boolean;dark?:boolean;padding?:number}) {
  return <Block id={id} style={{...box({x,y,w,h}),overflow:'hidden',padding,backgroundColor:fill?(dark?theme.ink:theme.line):undefined}}>{children}</Block>;
}
export function ProposalCopy({id,theme,children,size=18,dark=false,bold=false,gap=12,color}: {id:string;theme:DocTheme;children:ReactNode;size?:number;dark?:boolean;bold?:boolean;gap?:number;color?:string}) {
  return <Paragraph id={id} style={{fontFamily:bold?theme.heading:theme.body,fontSize:size,fontWeight:bold?600:400,lineHeight:1.28,color:color??(dark?theme.paper:theme.ink),marginTop:0,marginBottom:gap}}><TextSlot slot="copy" from="children">{children}</TextSlot></Paragraph>;
}
export function ProposalLabel({id,theme,children,dark=false}: {id:string;theme:DocTheme;children:ReactNode;dark?:boolean}) {
  return <Paragraph id={id} role="label" style={{...themeType(theme,'label'),fontSize:11,lineHeight:1.1,marginTop:0,marginBottom:14,color:dark?theme.line:theme.muted}}><TextSlot slot="label" from="children">{children}</TextSlot></Paragraph>;
}
export function ProposalRule({x,y,w,theme,dark=false}:Omit<BoxProps,'h'>&{theme:DocTheme;dark?:boolean}) {return <F.View style={{...box({x,y,w,h:1}),backgroundColor:dark?theme.muted:theme.line}}/>;}

/** An omitted item deliberately reserves image space; a supplied missing item fails preflight. */
export function ProposalPicture({id,x,y,w,h,theme,image,label}:{id:string;x:number;y:number;w:number;h:number;theme:DocTheme;image?:ProposalImage;label:ReactNode}) {
  return <Block id={id} style={{...box({x,y,w,h}),overflow:'hidden'}}>{image?<MediaFrame {...image} width={w} height={h}/>:<F.View style={{width:w,height:h,backgroundColor:theme.line,padding:24,justifyContent:'flex-end'}}>
    <F.View style={{position:'absolute',left:24,top:24,width:38,height:38,borderWidth:1,borderColor:theme.muted}}/>
    <Paragraph id={`${id}-label`} role="caption" style={{...themeType(theme,'caption'),fontSize:12,lineHeight:1.3,margin:0,color:theme.ink}}><TextSlot slot="label" from="label">{label}</TextSlot></Paragraph>
  </F.View>}</Block>;
}

/** Four independently owned cells. Keep row IDs stable when deliverables move. */
export function ProposalLedgerRow({id,theme,y,deliverable,acceptance,owner,timing,header=false}:{id:string;theme:DocTheme;y:number;deliverable:ReactNode;acceptance:ReactNode;owner:ReactNode;timing:ReactNode;header?:boolean}) {
  const fields=[['deliverable',deliverable,88,250],['acceptance',acceptance,358,260],['owner',owner,638,122],['timing',timing,780,132]] as const;
  return <>{fields.map(([slot,value,x,w])=><Block key={slot} id={`${id}-${slot}`} style={{...box({x,y,w,h:header?23:72}),overflow:'hidden'}}><Paragraph id={`${id}-${slot}-text`} style={{fontFamily:header?theme.heading:theme.body,fontSize:header?11:16,lineHeight:1.27,fontWeight:header?600:400,color:header?theme.muted:theme.ink,margin:0}}><TextSlot slot={slot} from={slot}>{value}</TextSlot></Paragraph></Block>)}<ProposalRule x={88} y={y+(header?27:79)} w={824} theme={theme}/></>;
}
