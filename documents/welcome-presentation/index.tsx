import type { ReactNode } from 'react';
import { Presentation, Slide, Paragraph, Heading, Block, View, MediaFrame, Logo, Strong, Cite, References, type DocumentMeta } from 'opendoc';
import { colors as c } from '../../themes/opendoc-neutral';
import { theme } from './theme';
import studio from './media/studio-rhythm/data.json';

export const meta: DocumentMeta = {
  title: 'Welcome to OpenDoc',
  description: 'An illustrated presentation tour: ideas, composition, imagery, evidence, shared assets, feedback, and a reviewed PDF.',
  kind: 'A guided tour', theme: theme.id,
};
const slideTheme = { ...theme, fontSize: 20, lineHeight: 1.35, paragraphGap: 12,
  design: { ...theme.design, typography: { ...theme.design?.typography,
    body: { fontSize: 20, lineHeight: 1.35 }, small: { fontSize: 16, lineHeight: 1.4 },
    h1: { fontSize: 44, fontWeight: 600 as const, lineHeight: 1.08, letterSpacing: -1, marginTop: 0, marginBottom: 16 },
    h2: { fontSize: 25, fontWeight: 600 as const, lineHeight: 1.15, marginTop: 0, marginBottom: 12 },
  } },
};
const label = { fontFamily: 'OpenDoc Mono', fontSize: 11, letterSpacing: 1, lineHeight: 1.3, marginBottom: 0 };
const note = { fontSize: 12, lineHeight: 1.35, color: c.muted, marginBottom: 0 };
function At({ x, y, w, children }: { x: number; y: number; w: number; children: ReactNode }) {
  return <View style={{ position: 'absolute', left: x, top: y, width: w }}>{children}</View>;
}
function Rule({ x=48, y, w=864, color=c.rule }: { x?: number; y: number; w?: number; color?: string }) {
  return <View style={{ position:'absolute', left:x, top:y, width:w, height:0.6, backgroundColor:color }}/>;
}
function Folio({ id, n, dark=false }: { id: string; n: string; dark?: boolean }) {
  return <><Rule y={500} color={dark?c.inverseRule:c.rule}/><At x={48} y={513} w={800}><Paragraph id={`${id}-running-label`} style={{...label,fontSize:9,color:dark?c.inverseMuted:c.muted}}>OPENDOC / A GUIDED TOUR</Paragraph></At><At x={870} y={510} w={42}><Paragraph id={`${id}-folio`} style={{...note,textAlign:'right',color:dark?c.inverseMuted:c.muted}}>{n}</Paragraph></At></>;
}
function Sheet({ x,y,w,h,blue=false }: {x:number;y:number;w:number;h:number;blue?:boolean}) {
  return <View style={{position:'absolute',left:x,top:y,width:w,height:h,backgroundColor:blue?c.blue:c.white,borderWidth:blue?0:0.7,borderColor:c.rule,padding:22}}>
    <View style={{height:5,width:w*.35,backgroundColor:blue?c.inverse:c.ink,marginBottom:24}}/>
    {[.86,.72,.84,.56].map((width,i)=><View key={i} style={{height:2,width:(w-44)*width,backgroundColor:blue?'#9AAAFD':c.rule,marginBottom:10}}/>)}
    <View style={{height:h*.25,marginTop:10,backgroundColor:blue?'#6B83FC':c.stone}}/>
  </View>;
}
const stages = ['research','drafting','design','review'] as const;
const totals = stages.map(key => studio.documents.reduce((sum,row)=>sum+row[key],0));
const total = totals.reduce((a,b)=>a+b,0);

export default function WelcomePresentation() {
return <Presentation title={meta.title} author="OpenDoc" theme={slideTheme} references={{
  workspace:{author:'OpenDoc',title:'Workspace guide: README.md',year:'2026'},
  authoring:{author:'OpenDoc',title:'Authoring: docs/AUTHORING.md',year:'2026'},
  media:{author:'OpenDoc',title:'Media and assets: docs/MEDIA.md and docs/ASSETS.md',year:'2026'},
}}>
  <Slide id="welcome" padding={0}>
    <At x={48} y={38} w={165}><Block id="welcome-logo"><Logo width={165}/></Block></At>
    <At x={48} y={139} w={510}>
      <Paragraph id="welcome-label" style={{...label,color:c.blue,marginBottom:24}}>THE POSSIBILITIES START HERE</Paragraph>
      <Heading id="welcome-title" level={1} style={{fontSize:70,lineHeight:1.01,letterSpacing:-2.6,marginBottom:24}}>{'Welcome to\nOpenDoc.'}</Heading>
      <Paragraph id="welcome-lead" style={{fontSize:24,width:440}}>A local place to make work you are proud to share.</Paragraph>
    </At>
    <Block id="welcome-paper-composition"><Sheet x={622} y={124} w={202} h={274}/><Sheet x={682} y={174} w={202} h={274} blue/><Sheet x={578} y={230} w={202} h={228}/></Block>
    <At x={48} y={454} w={480}><Paragraph id="welcome-caption" style={note}>An illustrated tour, made with the same tools you will use.</Paragraph></At>
    <Folio id="welcome" n="01"/>
  </Slide>

  <Slide id="the-working-relationship" padding={0}>
    <At x={48} y={46} w={850}><Paragraph id="relationship-label" style={{...label,color:c.blue,marginBottom:20}}>01 / FROM INTENT TO ARTIFACT</Paragraph><Heading id="relationship-title" level={1}>You direct. The work takes shape.</Heading><Paragraph id="relationship-lead" style={{width:730,color:c.muted}}>Bring the idea and material. Develop the writing and design with your coding agent. Read the result in OpenDoc.</Paragraph></At>
    <Rule y={254}/>
    <At x={48} y={282} w={245}><Paragraph id="relationship-you-label" style={{...label,color:c.blue,marginBottom:17}}>YOU</Paragraph><Heading id="relationship-you-title" level={2}>Set the direction.</Heading><Paragraph id="relationship-you-copy">The reader, the purpose, the source material, and what good looks like.</Paragraph></At>
    <At x={354} y={282} w={245}><Paragraph id="relationship-agent-label" style={{...label,color:c.blue,marginBottom:17}}>YOUR CODING AGENT</Paragraph><Heading id="relationship-agent-title" level={2}>Author the work.</Heading><Paragraph id="relationship-agent-copy">Writing, layout, images, charts, and revisions in the local source.</Paragraph></At>
    <At x={660} y={282} w={252}><Paragraph id="relationship-app-label" style={{...label,color:c.blue,marginBottom:17}}>OPENDOC</Paragraph><Heading id="relationship-app-title" level={2}>Make it tangible.</Heading><Paragraph id="relationship-app-copy">The real PDF, with selection, corrections, comments, and export.</Paragraph></At>
    <At x={48} y={463} w={840}><Paragraph id="relationship-local-note" style={note}>OpenDoc has no built-in AI chat. You choose the external agent and what you share with it.</Paragraph></At>
    <Folio id="the-working-relationship" n="02"/>
  </Slide>

  <Slide id="give-work-a-home" padding={0}>
    <At x={48} y={46} w={800}><Paragraph id="home-label" style={{...label,color:c.blue,marginBottom:20}}>02 / BEGIN</Paragraph><Heading id="home-title" level={1}>Give good work a home.</Heading></At>
    <At x={48} y={179} w={360}><Paragraph id="home-projects">Create a project for a client, a course, or a body of work. Choose a default theme for a consistent starting point.</Paragraph><Paragraph id="home-create" style={{marginTop:20}}>Choose <Strong>Create presentation</Strong>, copy the prompt, and add your brief in your coding agent. Your project travels with it. <Cite source="workspace"/></Paragraph></At>
    <View style={{position:'absolute',left:480,top:178,width:432,height:252,backgroundColor:c.stone,padding:28}}>
      <Paragraph id="home-project-label" style={{...label,color:c.muted,marginBottom:12}}>PROJECT</Paragraph><Heading id="home-project-name" level={2}>Getting started</Heading><View style={{height:1,backgroundColor:c.rule,marginTop:8,marginBottom:24}}/>
      <View style={{flexDirection:'row',gap:28}}><View style={{width:172}}><Paragraph id="home-documents" style={{fontSize:24,fontWeight:600}}>Documents</Paragraph><Paragraph id="home-document-example" style={{fontSize:16,color:c.muted}}>The written field guide</Paragraph></View><View style={{width:172}}><Paragraph id="home-presentations" style={{fontSize:24,fontWeight:600}}>Presentations</Paragraph><Paragraph id="home-presentation-example" style={{fontSize:16,color:c.muted}}>The tour you are reading</Paragraph></View></View>
    </View>
    <At x={480} y={448} w={420}><Paragraph id="home-library-note" style={note}>Separate library pages. One project. The same editing tools.</Paragraph></At><Folio id="give-work-a-home" n="03"/>
  </Slide>

  <Slide id="a-useful-brief" padding={0} style={{backgroundColor:c.night}}>
    <At x={48} y={46} w={820}><Paragraph id="brief-label" style={{...label,color:c.inverseMuted,marginBottom:24}}>03 / START THE CONVERSATION</Paragraph><Heading id="brief-title" level={1} style={{color:c.inverse}}>A good brief gives the work direction.</Heading></At>
    <View style={{position:'absolute',left:48,top:178,width:4,height:181,backgroundColor:c.blue}}/>
    <At x={76} y={171} w={788}><Paragraph id="brief-example" style={{fontFamily:'OpenDoc Serif',fontStyle:'italic',fontSize:32,lineHeight:1.3,color:c.inverse}}>Create a presentation from my notes for a first client meeting. Explain the problem, our approach, and the next decision. Flag missing facts. Review every slide before handing it back.</Paragraph></At>
    <Rule y={395} color={c.inverseRule}/>
    <At x={48} y={419} w={180}><Paragraph id="brief-reader" style={{...label,color:c.inverseMuted}}>READER</Paragraph><Paragraph id="brief-reader-value" style={{fontSize:18,color:c.inverse,marginTop:8}}>A first-time client</Paragraph></At>
    <At x={276} y={419} w={180}><Paragraph id="brief-purpose" style={{...label,color:c.inverseMuted}}>PURPOSE</Paragraph><Paragraph id="brief-purpose-value" style={{fontSize:18,color:c.inverse,marginTop:8}}>A next decision</Paragraph></At>
    <At x={504} y={419} w={180}><Paragraph id="brief-material" style={{...label,color:c.inverseMuted}}>MATERIAL</Paragraph><Paragraph id="brief-material-value" style={{fontSize:18,color:c.inverse,marginTop:8}}>Your existing notes</Paragraph></At>
    <At x={732} y={419} w={180}><Paragraph id="brief-standard" style={{...label,color:c.inverseMuted}}>STANDARD</Paragraph><Paragraph id="brief-standard-value" style={{fontSize:18,color:c.inverse,marginTop:8}}>Checked, honest, clear</Paragraph></At><Folio id="a-useful-brief" n="04" dark/>
  </Slide>

  <Slide id="compose-with-intention" padding={0}>
    <At x={48} y={46} w={860}><Paragraph id="composition-label" style={{...label,color:c.blue,marginBottom:20}}>04 / COMPOSE</Paragraph><Heading id="composition-title" level={1}>Let the slide change its pace.</Heading><Paragraph id="composition-intro" style={{width:755,color:c.muted}}>Use scale, space, and a clear grid. Give each idea the composition it needs.</Paragraph></At>
    <Block id="composition-title-study"><View style={{position:'absolute',left:48,top:235,width:272,height:153,backgroundColor:c.white,borderWidth:.6,borderColor:c.rule,padding:22}}><View style={{width:90,height:3,backgroundColor:c.blue,marginBottom:22}}/><View style={{width:185,height:17,backgroundColor:c.ink,marginBottom:8}}/><View style={{width:142,height:17,backgroundColor:c.ink,marginBottom:17}}/><View style={{width:188,height:3,backgroundColor:c.rule}}/></View></Block>
    <Block id="composition-comparison-study"><View style={{position:'absolute',left:344,top:235,width:272,height:153,backgroundColor:c.white,borderWidth:.6,borderColor:c.rule,padding:22,flexDirection:'row',gap:18}}>{[0,1].map(i=><View key={i} style={{width:105}}><View style={{width:40,height:4,backgroundColor:i?c.blue:c.ink,marginBottom:22}}/>{[95,81,98,70].map((w,j)=><View key={j} style={{width:w,height:3,backgroundColor:c.rule,marginBottom:10}}/>)}</View>)}</View></Block>
    <Block id="composition-visual-study"><View style={{position:'absolute',left:640,top:235,width:272,height:153,backgroundColor:c.night,padding:22,flexDirection:'row',gap:20}}><View style={{width:73}}><View style={{height:4,width:42,backgroundColor:c.blue,marginBottom:24}}/><View style={{height:10,width:70,backgroundColor:c.inverse,marginBottom:8}}/><View style={{height:10,width:53,backgroundColor:c.inverse}}/></View><View style={{width:135,height:109,backgroundColor:c.stone}}/></View></Block>
    <At x={48} y={407} w={272}><Heading id="composition-claim" level={2} style={{fontSize:22}}>One strong statement</Heading><Paragraph id="composition-claim-copy" style={{fontSize:16,color:c.muted}}>A new idea deserves room.</Paragraph></At>
    <At x={344} y={407} w={272}><Heading id="composition-compare" level={2} style={{fontSize:22}}>Two related thoughts</Heading><Paragraph id="composition-compare-copy" style={{fontSize:16,color:c.muted}}>A grid makes comparison natural.</Paragraph></At>
    <At x={640} y={407} w={272}><Heading id="composition-visual" level={2} style={{fontSize:22}}>An image with a job</Heading><Paragraph id="composition-visual-copy" style={{fontSize:16,color:c.muted}}>Let a visual carry the explanation.</Paragraph></At><Folio id="compose-with-intention" n="05"/>
  </Slide>

  <Slide id="ideas-taking-form" padding={0} style={{backgroundColor:c.night}}>
    <At x={48} y={48} w={370}><Paragraph id="imagery-label" style={{...label,color:c.inverseMuted,marginBottom:31}}>05 / IMAGINE</Paragraph><Heading id="imagery-title" level={1} style={{fontSize:51,color:c.inverse,lineHeight:1.06}}>{'Ideas\ntaking form.'}</Heading><Paragraph id="imagery-copy" style={{fontSize:21,color:c.inverseMuted,marginTop:20}}>Give the image a subject, a mood, and a place in the story.</Paragraph><Paragraph id="imagery-provenance" style={{fontSize:17,color:c.inverseMuted,marginTop:24}}>Keep its prompt, attribution, and source notes with the artwork.</Paragraph></At>
    <At x={456} y={48} w={456}><Block id="imagery-paper-sculpture"><MediaFrame item="paper-architecture" width={456} height={380} fit="cover"/></Block></At>
    <At x={456} y={445} w={452}><Paragraph id="imagery-caption" style={{...note,color:c.inverseMuted}}>AI-generated paper sculpture from the welcome guide. An imagined scene, not documentary evidence.</Paragraph></At><Folio id="ideas-taking-form" n="06" dark/>
  </Slide>

  <Slide id="evidence-with-a-story" padding={0} style={{backgroundColor:c.white}}>
    <At x={48} y={43} w={850}><Paragraph id="evidence-label" style={{...label,color:c.blue,marginBottom:15}}>06 / EXPLAIN</Paragraph><Heading id="evidence-title" level={1}>The shape of a working season.</Heading></At>
    <At x={48} y={133} w={864}><Paragraph id="evidence-summary" style={{fontSize:17,color:c.muted}}>{`24 fictional documents · 12 weeks · ${total} hours: research ${totals[0]}, drafting ${totals[1]}, design ${totals[2]}, review ${totals[3]}.`}</Paragraph></At>
    <At x={48} y={165} w={864}><Block id="evidence-chart"><MediaFrame item="studio-rhythm" width={864} height={300} fit="contain"/></Block></At>
    <At x={48} y={473} w={860}><Paragraph id="evidence-caption" style={{...note,fontSize:11}}>Synthetic demonstration data from the welcome guide. No activity or product performance was measured.</Paragraph></At><Folio id="evidence-with-a-story" n="07"/>
  </Slide>

  <Slide id="a-voice-in-type" padding={0}>
    <At x={48} y={46} w={864}><Paragraph id="type-label" style={{...label,color:c.blue,marginBottom:20}}>07 / FIND THE VOICE</Paragraph><Heading id="type-title" level={1}>Rigorous can still feel alive.</Heading></At>
    <At x={48} y={181} w={252}><Paragraph id="type-sans" style={{fontSize:112,fontWeight:600,lineHeight:1,letterSpacing:-4,color:c.blue}}>Aa</Paragraph><Heading id="type-sans-title" level={2} style={{fontSize:22,marginTop:20}}>Clear and direct</Heading><Paragraph id="type-sans-copy" style={{fontSize:18,color:c.muted}}>Sans carries the argument.</Paragraph></At>
    <At x={354} y={181} w={252}><Paragraph id="type-serif" style={{fontFamily:'OpenDoc Serif',fontStyle:'italic',fontSize:112,lineHeight:1,letterSpacing:-4}}>Aa</Paragraph><Heading id="type-serif-title" level={2} style={{fontSize:22,marginTop:20}}>A reflective voice</Heading><Paragraph id="type-serif-copy" style={{fontSize:18,color:c.muted}}>Serif italic changes the pace.</Paragraph></At>
    <At x={660} y={201} w={252}><Paragraph id="type-theme-copy" style={{fontSize:21}}>A theme gives the work a visual language: fonts, colors, and a sense of proportion.</Paragraph><Paragraph id="type-local-copy" style={{fontSize:18,color:c.muted,marginTop:15}}>This deck uses OpenDoc Neutral, with typography composed for the slide.</Paragraph></At>
    <Rule y={430}/><At x={48} y={447} w={864}><Paragraph id="type-theme-boundary" style={{fontSize:16,color:c.muted}}>Start with a pitch, proposal, company profile, or brand guidelines template. Adapt the typography and colors to your theme.</Paragraph></At><Folio id="a-voice-in-type" n="08"/>
  </Slide>

  <Slide id="keep-the-materials" padding={0}>
    <At x={48} y={46} w={860}><Paragraph id="assets-label" style={{...label,color:c.blue,marginBottom:20}}>08 / KEEP</Paragraph><Heading id="assets-title" level={1}>A home for every asset.</Heading></At>
    <At x={48} y={171} w={245}><Paragraph id="assets-logo-label" style={{...label,color:c.muted,marginBottom:22}}>SHARED / LOGOS</Paragraph><Block id="assets-wordmark"><Logo width={196}/></Block><Paragraph id="assets-logo-copy" style={{fontSize:19,marginTop:24}}>Import the identity once. Choose a variation that works on the actual PDF background.</Paragraph></At>
    <At x={354} y={171} w={245}><Paragraph id="assets-font-label" style={{...label,color:c.muted,marginBottom:22}}>SHARED / FONTS</Paragraph><Paragraph id="assets-font-sample" style={{fontSize:48,fontWeight:600,lineHeight:1.1}}>Aa Bb Cc</Paragraph><Paragraph id="assets-font-copy" style={{fontSize:19,marginTop:24}}>Keep original font faces. Inspect their real PDF specimen, then bind the family you want.</Paragraph></At>
    <At x={660} y={171} w={252}><Paragraph id="assets-media-label" style={{...label,color:c.muted,marginBottom:22}}>OWNED / MEDIA</Paragraph><Paragraph id="assets-media-sample" style={{fontFamily:'OpenDoc Mono',fontSize:18,lineHeight:1.3,marginBottom:0}}>{'image + data\nrecipe + source notes'}</Paragraph><Paragraph id="assets-media-copy" style={{fontSize:19,marginTop:24}}>Keep prepared visuals with the document. Review and record a chart again when its inputs change.</Paragraph></At>
    <Rule y={435}/><At x={48} y={453} w={864}><Paragraph id="assets-version-note" style={{fontSize:16,color:c.muted}}>Each document keeps its saved logo and font versions until you explicitly update them. <Cite source="media"/></Paragraph></At><Folio id="keep-the-materials" n="09"/>
  </Slide>

  <Slide id="read-notice-revise" padding={0}>
    <At x={48} y={46} w={860}><Paragraph id="review-label" style={{...label,color:c.blue,marginBottom:20}}>09 / REFINE</Paragraph><Heading id="review-title" level={1}>The next draft is yours.</Heading><Paragraph id="review-intro" style={{color:c.muted}}>Select native text or a component. Make a correction, or leave feedback for your agent.</Paragraph></At>
    <View style={{position:'absolute',left:48,top:226,width:516,height:191,backgroundColor:c.wash,padding:28}}><Paragraph id="review-practice-label" style={{...label,color:c.blue,marginBottom:22}}>TRY IT ON THIS SLIDE</Paragraph><Paragraph id="review-practice" style={{fontSize:30,lineHeight:1.22,marginBottom:0}}>This sentence is ready for your first edit.</Paragraph></View>
    <At x={612} y={226} w={300}><Heading id="review-edit-title" level={2} style={{fontSize:24}}>Edit the wording.</Heading><Paragraph id="review-edit-copy" style={{fontSize:18}}>Choose Edit. Make a few corrections, use Undo or Redo, then Save all.</Paragraph><Heading id="review-comment-title" level={2} style={{fontSize:24,marginTop:19}}>Comment on the idea.</Heading><Paragraph id="review-comment-copy" style={{fontSize:18}}>Ask for a stronger argument, a source check, or a new composition.</Paragraph></At>
    <At x={48} y={445} w={516}><Paragraph id="review-saved-note" style={{...note,fontSize:14}}>Saved corrections reach the local source. Comments keep their history.</Paragraph></At><Folio id="read-notice-revise" n="10"/>
  </Slide>

  <Slide id="one-canvas-one-thought" padding={0}>
    <At x={48} y={46} w={864}><Paragraph id="canvas-label" style={{...label,color:c.blue,marginBottom:20}}>10 / THINK IN SLIDES</Paragraph><Heading id="canvas-title" level={1}>One canvas. One complete thought.</Heading></At>
    <View style={{position:'absolute',left:48,top:190,width:512,height:288,backgroundColor:c.white,borderWidth:1,borderColor:c.rule,padding:26}}>
      <Paragraph id="canvas-ratio" style={{fontSize:67,fontWeight:600,lineHeight:1,color:c.blue}}>16:9</Paragraph><Paragraph id="canvas-size" style={{...label,marginTop:10,color:c.muted}}>960 × 540 POINTS</Paragraph><View style={{height:1,backgroundColor:c.rule,marginTop:30,marginBottom:23}}/><Paragraph id="canvas-promise" style={{fontSize:23}}>Every authored slide becomes one PDF page.</Paragraph>
    </View>
    <At x={612} y={190} w={300}><Heading id="canvas-fit-title" level={2}>Make the content fit.</Heading><Paragraph id="canvas-fit-copy" style={{fontSize:19}}>Shorten the thought, recompose the slide, or add another slide deliberately.</Paragraph><Heading id="canvas-overflow-title" level={2} style={{marginTop:26}}>Overflow needs a revision.</Heading><Paragraph id="canvas-overflow-copy" style={{fontSize:19}}>Content cannot spill into a continuation slide. An invalid revision blocks export. <Cite source="authoring"/></Paragraph></At><Folio id="one-canvas-one-thought" n="11"/>
  </Slide>

  <Slide id="export-with-care" padding={0} style={{backgroundColor:c.night}}>
    <At x={48} y={46} w={850}><Paragraph id="export-label" style={{...label,color:c.inverseMuted,marginBottom:24}}>11 / SHARE</Paragraph><Heading id="export-title" level={1} style={{fontSize:54,color:c.inverse}}>Made here. Ready to share.</Heading><Paragraph id="export-lead" style={{color:c.inverseMuted,fontSize:23,width:770}}>Export the revision you have read, checked, and made your own.</Paragraph></At>
    <Rule y={242} color={c.inverseRule}/>
    <At x={48} y={269} w={245}><Paragraph id="export-save-number" style={{fontSize:39,color:c.blue}}>01</Paragraph><Heading id="export-save-title" level={2} style={{color:c.inverse}}>Save and review.</Heading><Paragraph id="export-save-copy" style={{fontSize:18,color:c.inverseMuted}}>Save pending corrections. Inspect every slide, including figures and final details.</Paragraph></At>
    <At x={354} y={269} w={245}><Paragraph id="export-pdf-number" style={{fontSize:39,color:c.blue}}>02</Paragraph><Heading id="export-pdf-title" level={2} style={{color:c.inverse}}>Save the PDF.</Heading><Paragraph id="export-pdf-copy" style={{fontSize:18,color:c.inverseMuted}}>Choose Export, name the file, then Save PDF. Download another copy when you need it.</Paragraph></At>
    <At x={660} y={269} w={252}><Paragraph id="export-version-number" style={{fontSize:39,color:c.blue}}>03</Paragraph><Heading id="export-version-title" level={2} style={{color:c.inverse}}>Keep the version.</Heading><Paragraph id="export-version-copy" style={{fontSize:18,color:c.inverseMuted}}>Previous exports keeps your saved files. A later edit does not change an earlier PDF.</Paragraph></At><Folio id="export-with-care" n="12" dark/>
  </Slide>

  <Slide id="behind-the-tour" padding={0}>
    <At x={48} y={46} w={864}><Paragraph id="sources-label" style={{...label,color:c.blue,marginBottom:20}}>12 / THE MATERIAL BEHIND THE TOUR</Paragraph><Heading id="sources-title" level={1}>A demonstration you can inspect.</Heading></At>
    <At x={48} y={170} w={470}><References title="Local workspace guides" headingStyle={{fontSize:23,marginTop:0,marginBottom:20}}/></At>
    <At x={582} y={170} w={330}><Heading id="sources-example-title" level={2}>About the examples</Heading><Paragraph id="sources-example-copy" style={{fontSize:19}}>The studio data are synthetic. The paper sculpture was AI-generated for the welcome document. The brief and quotations are original OpenDoc copy.</Paragraph><Paragraph id="sources-preservation" style={{fontSize:18,color:c.muted,marginTop:18}}>Their prepared files and provenance are kept in this presentation’s Media folder.</Paragraph></At>
    <At x={48} y={441} w={860}><Paragraph id="sources-local-note" style={{fontSize:16,color:c.muted}}>Your source, assets, feedback, and PDFs stay local. Keep the workspace in your backup routine.</Paragraph></At><Folio id="behind-the-tour" n="13"/>
  </Slide>

  <Slide id="your-next-idea" padding={0} style={{backgroundColor:c.night}}>
    <At x={48} y={50} w={830}><Paragraph id="closing-label" style={{...label,color:c.inverseMuted}}>THE NEXT PAGE IS YOURS</Paragraph></At>
    <At x={48} y={152} w={838}><Heading id="closing-title" level={1} style={{fontFamily:'OpenDoc Serif',fontStyle:'italic',fontWeight:400,fontSize:59,lineHeight:1.13,letterSpacing:-1,color:c.inverse}}>{'Bring an idea worth\nputting on a page.'}</Heading><Paragraph id="closing-copy" style={{fontSize:24,lineHeight:1.35,width:655,color:c.inverseMuted,marginTop:27}}>Choose a project. Give your agent a brief. Make something you are proud to share.</Paragraph></At>
    <View style={{position:'absolute',left:48,top:424,width:64,height:4,backgroundColor:c.blue}}/>
    <At x={48} y={454} w={800}><Paragraph id="closing-source" style={{...note,color:c.inverseMuted}}>Welcome to OpenDoc · Presentation edition · Getting started</Paragraph></At><Folio id="your-next-idea" n="14" dark/>
  </Slide>
</Presentation>;
}
