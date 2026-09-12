import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { Block, Heading, MediaFrame, Paragraph, Presentation, Slide, TextSlot, type ImageFrameOptions } from 'opendoc';
import { themePage, themeType, type DocTheme } from 'opendoc/themes';

type Box = { x: number; y: number; w: number; h: number };
const at = ({x,y,w,h}: Box): F.Style => ({position:'absolute',left:x,top:y,width:w,height:h,overflow:'hidden'});
export type PitchImageSource = Pick<ImageFrameOptions,'fit'|'position'|'radius'> & {item:string;alt?:string};

export function PitchDeck(props: Parameters<typeof Presentation>[0]) { return <Presentation {...props}/>; }

/** A fixed slide canvas with an optional claim-led header. All narrative stays with the caller. */
export function PitchSlide({id,theme,title,eyebrow,children,dark=false,titleSize=38,titleWidth=864,footer}: {
  id:string;theme:DocTheme;title?:ReactNode;eyebrow?:ReactNode;children?:ReactNode;
  dark?:boolean;titleSize?:number;titleWidth?:number;footer?:ReactNode;
}) {
  const ink=dark?theme.paper:theme.ink;
  return <Slide id={id} padding={0} style={{...themePage(theme).style,backgroundColor:dark?theme.ink:theme.paper,lineBreaking:'greedy'}}>
    {eyebrow && <F.View style={at({x:48,y:32,w:864,h:22})}><Paragraph id={`${id}-eyebrow`} role="label" style={{fontFamily:theme.body,fontSize:11,lineHeight:1.2,marginBottom:0,color:ink}}><TextSlot slot="eyebrow" from="eyebrow">{eyebrow}</TextSlot></Paragraph></F.View>}
    {title && <F.View style={at({x:48,y:66,w:titleWidth,h:102})}><Heading id={`${id}-title`} level={2} style={{fontSize:titleSize,lineHeight:1.12,marginTop:0,marginBottom:0,color:ink}}><TextSlot slot="title" from="title">{title}</TextSlot></Heading></F.View>}
    {children}
    {footer && <F.View style={at({x:48,y:502,w:802,h:20})}><Paragraph id={`${id}-footer`} role="caption" style={{fontFamily:theme.body,fontSize:10,lineHeight:1.15,marginBottom:0,color:ink}}><TextSlot slot="footer" from="footer">{footer}</TextSlot></Paragraph></F.View>}
    <F.View style={at({x:888,y:502,w:24,h:20})}><F.Text style={{...themeType(theme,'small'),fontFamily:theme.body,fontSize:10,lineHeight:1.15,textAlign:'left',color:ink}}>{'{{pageNumber}}'}</F.Text></F.View>
  </Slide>;
}

/** Bounded, native, caller-owned copy. Explicit sizes are for presentation distance. */
export function PitchText({id,theme,body,size=22,weight=400,color,role='body',...box}: Box & {
  id:string;theme:DocTheme;body:ReactNode;size?:number;weight?:400|600;color?:string;role?:'body'|'label'|'caption'|'display';
}) {
  const typography = role==='display'?themeType(theme,'h1'):role==='body'?{fontFamily:theme.body}:themeType(theme,role);
  return <F.View style={at(box)}><Paragraph id={id} style={{...typography,fontFamily:role==='display'?theme.heading:theme.body,fontSize:size,fontWeight:weight,lineHeight:role==='display'?1.06:1.25,marginTop:0,marginBottom:0,color:color??theme.ink}}><TextSlot slot="body" from="body">{body}</TextSlot></Paragraph></F.View>;
}

/** Structural surfaces do not introduce content or identities based on page order. */
export function PitchPanel({id,theme,dark=false,rule=false,children,...box}:Box & {id:string;theme:DocTheme;dark?:boolean;rule?:boolean;children?:ReactNode}) {
  return <Block id={id} style={{...at(box),backgroundColor:dark?theme.ink:theme.paper,...(rule?{borderWidth:1,borderColor:theme.line}:{})}}>{children}</Block>;
}

/** An omitted source is an intentional placeholder; a named missing item must fail normally. */
export function PitchImage({id,theme,image,label,detail,...box}:Box & {id:string;theme:DocTheme;image?:PitchImageSource;label:string;detail?:string}) {
  return <Block id={id} style={at(box)}>{image ? <MediaFrame {...image} width={box.w} height={box.h}/> : <F.View style={{width:box.w,height:box.h,borderWidth:1,borderColor:theme.line,backgroundColor:theme.paper,justifyContent:'center',padding:24}}>
    <Paragraph id={`${id}-label`} style={{fontFamily:theme.body,fontSize:18,fontWeight:600,lineHeight:1.2,textAlign:'center',marginBottom:detail?10:0,color:theme.ink}}><TextSlot slot="label" from="label">{label}</TextSlot></Paragraph>
    {detail && <Paragraph id={`${id}-detail`} role="caption" style={{fontFamily:theme.body,fontSize:12,lineHeight:1.3,textAlign:'center',marginBottom:0,color:theme.muted}}><TextSlot slot="detail" from="detail">{detail}</TextSlot></Paragraph>}
  </F.View>}</Block>;
}
