import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { Block, Logo, MediaFrame, Presentation, Slide, TextSlot, type ImageFrameOptions } from 'opendoc';
import { themeType, type DocTheme } from 'opendoc/themes';

export type BrandImageSource = Pick<ImageFrameOptions, 'fit' | 'position' | 'radius'> & { item: string; alt?: string };
export type BrandBox = { x: number; y: number; w: number; h: number };
const position = ({ x, y, w, h }: BrandBox): F.Style => ({ position: 'absolute', left: x, top: y, width: w, height: h });

/** A presentation made from independent, reorderable brand-system compositions. */
export function BrandGuidelines(props: Parameters<typeof Presentation>[0]) { return <Presentation {...props}/>; }

export function BrandSlide({ id, theme, section, folio, dark = false, children }: {
  id: string; theme: DocTheme; section: ReactNode; folio: ReactNode; dark?: boolean; children: ReactNode;
}) {
  return <Slide id={id} padding={0} style={{ backgroundColor: dark ? theme.ink : theme.paper, lineBreaking: 'greedy' }}>
    <Block id={`${id}-section`} style={{...position({x:40,y:26,w:800,h:25}),overflow:'hidden'}}><F.Text style={{...themeType(theme,'label'),fontSize:11,fontWeight:400,color:dark?theme.paper:theme.muted,lineHeight:1.2,margin:0}}><TextSlot slot="section" from="section">{section}</TextSlot></F.Text></Block>
    <Block id={`${id}-folio`} style={{...position({x:870,y:26,w:50,h:25}),overflow:'hidden'}}><F.Text style={{fontFamily:theme.body,fontSize:11,fontWeight:400,color:dark?theme.paper:theme.muted,lineHeight:1.2,margin:0,textAlign:'right'}}><TextSlot slot="folio" from="folio">{folio}</TextSlot></F.Text></Block>
    {children}
  </Slide>;
}

/** Text stays native and binds to the instance's children, including direct JSX text. */
export function BrandText({ id, theme, x, y, w, h, children, size = 18, role = 'body', color, align = 'left', weight, leading = 1.2 }: BrandBox & {
  id: string; theme: DocTheme; children: ReactNode; size?: number; role?: 'body' | 'title' | 'label';
  color?: string; align?: 'left' | 'center' | 'right'; weight?: 400 | 600 | 700; leading?: number;
}) {
  const type = role === 'title' ? themeType(theme, 'h1') : role === 'label' ? themeType(theme, 'label') : { fontFamily: theme.body };
  return <Block id={id} style={{...position({ x, y, w, h }), overflow:'hidden'}}>
    <F.Text style={{ ...type, fontSize: size, fontWeight: weight ?? (role === 'title' ? 600 : 400), color: color ?? theme.ink, lineHeight: leading, margin: 0, textAlign: align }}>
      <TextSlot slot="text" from="children">{children}</TextSlot>
    </F.Text>
  </Block>;
}

/** Supplied artwork must be valid managed media. No image means an intentional visual brief. */
export function BrandImage({ id, theme, x, y, w, h, image, logo, label, detail, dark = false }: BrandBox & {
  id: string; theme: DocTheme; image?: BrandImageSource; logo?: { name?: string; variation?: string; alt?: string };
  label: ReactNode; detail?: ReactNode; dark?: boolean;
}) {
  if (image && logo) throw new Error(`Brand image ${id}: choose managed media or a bound logo, not both.`);
  const background = dark ? theme.ink : theme.line;
  const foreground = dark ? theme.paper : theme.ink;
  return <Block id={id} style={position({ x, y, w, h })}>
    {image ? <MediaFrame {...image} width={w} height={h}/> : logo ? <F.View style={{ width:w, height:h, backgroundColor:background, alignItems:'center', justifyContent:'center', padding:24 }}><Logo {...logo} width={w-48} height={h-48}/></F.View> : <F.View style={{width:w,height:h,backgroundColor:background,borderWidth:0.5,borderColor:dark?theme.muted:theme.line}}>
      <F.View style={{position:'absolute',left:16,top:16,width:18,height:18,borderLeftWidth:1,borderTopWidth:1,borderColor:foreground}}/>
      <F.View style={{position:'absolute',left:w-34,top:h-34,width:18,height:18,borderRightWidth:1,borderBottomWidth:1,borderColor:foreground}}/>
      <F.View style={{position:'absolute',left:24,top:h/2-25,width:w-48,height:50,justifyContent:'center',overflow:'hidden'}}>
        <F.Text style={{fontFamily:theme.heading,fontSize:w<190?16:22,fontWeight:400,color:foreground,textAlign:'center',lineHeight:1.15}}><TextSlot slot="label" from="label">{label}</TextSlot></F.Text>
      </F.View>
      {detail && <F.View style={{position:'absolute',left:20,top:h-43,width:w-40,height:30,overflow:'hidden'}}><F.Text style={{fontFamily:theme.body,fontSize:10,color:foreground,textAlign:'center',lineHeight:1.2}}><TextSlot slot="detail" from="detail">{detail}</TextSlot></F.Text></F.View>}
    </F.View>}
  </Block>;
}

export function BrandPanel({ theme, x, y, w, h, color, outline = false }: BrandBox & { theme: DocTheme; color?: string; outline?: boolean }) {
  return <F.View style={{...position({x,y,w,h}),backgroundColor:color ?? theme.paper,...(outline?{borderWidth:1,borderColor:theme.muted}:{})}}/>;
}

export function BrandRule({ theme, x, y, w, color }: { theme: DocTheme; x:number; y:number; w:number; color?:string }) {
  return <F.View style={{position:'absolute',left:x,top:y,width:w,height:1,backgroundColor:color??theme.line}}/>;
}
