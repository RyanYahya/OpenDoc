import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { Block, Document, Heading, MediaFrame, Page, Paragraph, TextSlot, type ImageFrameOptions } from 'opendoc';
import { themePage, themeType, type DocTheme } from 'opendoc/themes';

export type ImageStoryLayout = 'cover' | 'split-left' | 'split-top' | 'panorama' | 'diptych' | 'collage' | 'overlay';
export type StoryImage = Pick<ImageFrameOptions, 'fit' | 'position' | 'radius'> & { item: string; alt?: string };
export interface ImageStoryPageProps {
  /** A stable identity for this composition, independent of its physical page number. */
  id: string;
  theme: DocTheme;
  layout?: ImageStoryLayout;
  title: ReactNode;
  eyebrow?: ReactNode;
  image?: StoryImage;
  secondary?: StoryImage;
  detail?: StoryImage;
  lead?: ReactNode;
  children?: ReactNode;
  caption?: ReactNode;
  footer?: string;
  titleStyle?: F.Style;
  /** Cover text must contrast with the actual artwork. Defaults to white on an image. */
  coverColor?: string;
}

export function ImageStory({ children, ...props }: Parameters<typeof Document>[0]) {
  return <Document {...props}>{children}</Document>;
}

type Box = { x: number; y: number; w: number; h: number };
const boxStyle = ({x,y,w,h}: Box): F.Style => ({ position: 'absolute', left: x, top: y, width: w, height: h });

/** An omitted image is a visible starter placeholder. A supplied, broken media item is an error. */
function Picture({id, image, box, theme, backdrop=false}: {id:string;image?:StoryImage;box:Box;theme:DocTheme;backdrop?:boolean}) {
  return <Block id={id} style={boxStyle(box)}>
    {image ? <MediaFrame {...image} width={box.w} height={box.h}/> : <F.View style={{width:box.w,height:box.h,backgroundColor:theme.line,alignItems:backdrop?'flex-end':'center',justifyContent:backdrop?'flex-start':'center',padding:backdrop?24:0}}>
      <F.Text style={{fontFamily:theme.body,fontSize:10,color:theme.ink}}>Image position</F.Text>
    </F.View>}
  </Block>;
}

/** Bounded editorial pages, paired with ordinary Pages for long, naturally flowing content. */
export function ImageStoryPage({id,theme,layout='split-left',title,eyebrow,image,secondary,detail,lead,children,caption,footer='IMAGE STORY',titleStyle,coverColor}: ImageStoryPageProps) {
  if (!['cover','split-left','split-top','panorama','diptych','collage','overlay'].includes(layout)) throw new Error(`Unknown image-story layout: ${layout}.`);
  const page = themePage(theme);
  const W = page.size === 'Letter' ? 612 : 595.28, H = page.size === 'Letter' ? 792 : 841.89;
  const full = layout === 'cover' || layout === 'overlay';
  const foreground = layout === 'cover' && image ? coverColor ?? '#ffffff' : theme.ink;
  const footerColor = full && image ? coverColor ?? '#ffffff' : theme.muted;
  const picture = (slot:string, source:StoryImage|undefined, box:Box, backdrop=false) => <Picture id={`${id}-${slot}`} image={source} box={box} theme={theme} backdrop={backdrop}/>;
  const prose = <>{lead && <Paragraph id={`${id}-lead`} style={{color:foreground}}><TextSlot slot="lead" from="lead">{lead}</TextSlot></Paragraph>}{children}</>;
  const text = (box:Box, size:number, body:ReactNode=prose) => <F.View style={{...boxStyle(box),overflow:'hidden'}}>
    {eyebrow && <Paragraph id={`${id}-eyebrow`} role="label" baseStyle={{marginBottom:18}} style={{color:foreground}}><TextSlot slot="eyebrow" from="eyebrow">{eyebrow}</TextSlot></Paragraph>}
    <Heading id={`${id}-title`} level={layout==='cover'?1:2} baseStyle={{fontSize:size,lineHeight:1.08,marginTop:0,marginBottom:22}} style={{color:foreground,...titleStyle}}><TextSlot slot="title" from="title">{title}</TextSlot></Heading>
    <F.View style={{color:foreground}}>{body}</F.View>
  </F.View>;
  const body = (box:Box) => <F.View style={{...boxStyle(box),overflow:'hidden'}}>{prose}</F.View>;
  const note = (box:Box) => caption && <F.View style={{...boxStyle(box),overflow:'hidden'}}><Paragraph id={`${id}-caption`} role="caption" style={{marginBottom:0}}><TextSlot slot="caption" from="caption">{caption}</TextSlot></Paragraph></F.View>;
  return <Page size={page.size} margin={0} style={{...page.style,lineBreaking:'greedy',backgroundColor:theme.paper}}
    backgroundMedia={full ? image?.item : undefined} backgroundSize="cover" backgroundPosition="center">
    {layout === 'cover' && <>
      {!image && picture('image',undefined,{x:0,y:0,w:W,h:H},true)}
      {text({x:42,y:H*.23,w:W-110,h:H*.65},56)}
    </>}
    {layout === 'split-left' && <>
      {picture('image',image,{x:0,y:0,w:W/2,h:H})}
      {text({x:W/2+28,y:H*.22,w:W/2-56,h:H*.66},36)}
    </>}
    {layout === 'split-top' && <>
      {picture('image',image,{x:0,y:0,w:W,h:H/2})}
      {text({x:42,y:H/2+30,w:W-84,h:H/2-100},40)}
    </>}
    {layout === 'panorama' && <>
      {text({x:42,y:67,w:W-84,h:H*.22},43,null)}
      {picture('image',image,{x:0,y:H*.32,w:W,h:H*.2})}
      <F.View style={{position:'absolute',left:W-241,top:H*.47,width:211,height:211,backgroundColor:theme.paper}}/>
      {picture('secondary',secondary,{x:W-229,y:H*.47+12,w:187,h:187})}
      {body({x:42,y:H*.57,w:W-313,h:H*.32})}
      {note({x:W-229,y:H*.47+222,w:187,h:H*.16})}
    </>}
    {layout === 'diptych' && <>
      {text({x:42,y:67,w:W-84,h:H*.2},43,null)}
      {picture('image',image,{x:42,y:H*.29,w:(W-100)*.30,h:H*.43})}
      {picture('secondary',secondary,{x:58+(W-100)*.30,y:H*.29,w:(W-100)*.70,h:H*.43})}
      {body({x:42,y:H*.77,w:W-84,h:H*.15})}
    </>}
    {layout === 'collage' && <>
      {text({x:42,y:67,w:W-84,h:H*.15},43,null)}
      {picture('image',image,{x:42,y:H*.22,w:W*.365,h:H*.455})}
      {picture('secondary',secondary,{x:W*.465,y:H*.22,w:W*.535-42,h:W*.535-42})}
      {body({x:W*.465,y:H*.22+W*.535-24,w:W*.535-42,h:60})}
      {picture('detail',detail,{x:W*.26,y:H*.67,w:W*.74-42,h:H*.17})}
      {note({x:42,y:H*.875,w:W-84,h:H*.07})}
    </>}
    {layout === 'overlay' && <>
      {!image && picture('image',undefined,{x:0,y:0,w:W,h:H},true)}
      <F.View style={{position:'absolute',left:42,top:H*.28,width:W*.60,height:H*.59,backgroundColor:theme.paper}}/>
      {text({x:68,y:H*.28+28,w:W*.60-52,h:H*.59-56},44)}
    </>}
    {theme.runningFooter && <F.View style={{position:'absolute',left:layout==='split-left'?W/2+28:42,top:H-34,width:layout==='split-left'?W/2-56:W-84,flexDirection:'row',justifyContent:'space-between'}}>
      <F.Text style={{...themeType(theme,'small',{fontFamily:theme.body,fontSize:8}),color:footerColor}}>{footer}</F.Text>
      <F.Text style={{...themeType(theme,'small',{fontFamily:theme.body,fontSize:8}),color:footerColor}}>{'{{pageNumber}}'}</F.Text>
    </F.View>}
  </Page>;
}
