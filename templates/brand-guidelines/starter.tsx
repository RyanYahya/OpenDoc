import { BrandGuidelines, BrandSlide as Slide, BrandText as Text, BrandImage as Image, BrandPanel as Panel, BrandRule as Rule } from '../../templates/brand-guidelines';
import { TextSlot } from 'opendoc';
import type { DocTheme } from 'opendoc/themes';
// @ts-ignore The selected local theme module is inserted when this starter becomes a document.
import { theme } from "__OPENDOC_THEME_MODULE__";

const title = "__OPENDOC_TITLE__";
export const meta = { title, description: 'A brand identity handbook with editable visual briefs and usage rules.', kind: 'brand guidelines', format: 'presentation', theme: "__OPENDOC_THEME__" };
export const provenance = { template: 'templates/brand-guidelines/index.tsx' };

// This entire skeleton belongs to the instance. Omit/reorder slides and adapt compositions.
// Keep IDs stable. Replace every bracketed brief with approved brand content.
// Artwork: import document media, then add image={{item:'your-media-id'}} to an Image.
// Shared marks: bind the logo first, then add logo={{variation:'approved-variation'}}.
// Choose the variation for the actual PDF background. Image slots never recolor artwork.
export function GuidelinesSkeleton({ theme, title, sparse = false }: { theme: DocTheme; title: string; sparse?: boolean }) {
  return <BrandGuidelines title={title} theme={theme}>
    <Slide id="brand-opening" theme={theme} section="BRAND GUIDELINES" folio="01">
      <Image id="opening-image" theme={theme} x={510} y={74} w={410} h={426} label="The brand, in one image" detail="[Opening artwork / approved crop]"/>
      <Text id="opening-title" theme={theme} x={40} y={115} w={440} h={200} size={title.length > 42 ? 40 : 58} role="title"><TextSlot slot="title" from="title">{title}</TextSlot></Text>
      <Rule theme={theme} x={40} y={379} w={400}/>
      <Text id="opening-description" theme={theme} x={40} y={400} w={390} h={56} size={19}>[A concise invitation into the brand’s world.]</Text>
      <Text id="opening-edition" theme={theme} x={40} y={477} w={420} h={20} size={11}>[Brand owner] / [Edition] / [Review date]</Text>
    </Slide>
    {!sparse && <>
      <Slide id="brand-premise" theme={theme} section="01 / FOUNDATION" folio="02" dark>
        <Text id="premise-title" theme={theme} x={40} y={88} w={825} h={169} size={48} role="title" color={theme.paper}>[The belief that gives this brand a reason to exist.]</Text>
        <Rule theme={theme} x={40} y={295} w={880} color={theme.muted}/>
        <Text id="premise-audience-label" theme={theme} x={40} y={330} w={245} h={25} size={12} color={theme.paper}>WHO WE ARE FOR</Text>
        <Text id="premise-audience" theme={theme} x={40} y={372} w={245} h={112} size={21} color={theme.paper}>[Name the people and the need that matters to them.]</Text>
        <Text id="premise-promise-label" theme={theme} x={347} y={330} w={245} h={25} size={12} color={theme.paper}>OUR PROMISE</Text>
        <Text id="premise-promise" theme={theme} x={347} y={372} w={245} h={112} size={21} color={theme.paper}>[The meaningful benefit we consistently deliver.]</Text>
        <Text id="premise-proof-label" theme={theme} x={654} y={330} w={245} h={25} size={12} color={theme.paper}>HOW WE PROVE IT</Text>
        <Text id="premise-proof" theme={theme} x={654} y={372} w={245} h={112} size={21} color={theme.paper}>[An observable behavior that earns the promise.]</Text>
      </Slide>
      <Slide id="brand-voice" theme={theme} section="01 / VOICE" folio="03">
        <Text id="voice-title" theme={theme} x={40} y={80} w={820} h={65} size={39} role="title">Personality, made practical.</Text>
        <Text id="voice-principle" theme={theme} x={40} y={172} w={285} h={170} size={32} role="title">[We sound like this. We make people feel this.]</Text>
        <Text id="voice-context" theme={theme} x={40} y={402} w={270} h={83} size={17}>[How tone changes for a launch, a support reply, or a difficult moment.]</Text>
        <Panel theme={theme} x={365} y={170} w={555} h={149} color={theme.line}/>
        <Text id="voice-use-label" theme={theme} x={389} y={189} w={485} h={24} size={11}>WRITE IT THIS WAY</Text>
        <Text id="voice-use" theme={theme} x={389} y={229} w={485} h={66} size={24}>[A concrete, approved example of our voice in use.]</Text>
        <Rule theme={theme} x={365} y={352} w={555}/>
        <Text id="voice-avoid-label" theme={theme} x={389} y={374} w={485} h={24} size={11}>AVOID / WHY</Text>
        <Text id="voice-avoid" theme={theme} x={389} y={412} w={485} h={72} size={21}>[Rewrite an off-brand phrase and explain what changes.]</Text>
      </Slide>
      <Slide id="brand-world" theme={theme} section="01 / EXPRESSION BOARD" folio="04">
        <Text id="world-title" theme={theme} x={40} y={78} w={820} h={60} size={39} role="title">A world you can recognize.</Text>
        <Image id="world-hero" theme={theme} x={40} y={156} w={360} h={342} label="[Defining scene]" detail="[Subject / point of view]"/>
        <Image id="world-material" theme={theme} x={416} y={156} w={242} h={190} label="[Material / texture]"/>
        <Image id="world-gesture" theme={theme} x={674} y={156} w={246} h={190} label="[Human gesture]"/>
        <Image id="world-detail" theme={theme} x={416} y={362} w={242} h={136} label="[Unexpected detail]"/>
        <Text id="world-logic" theme={theme} x={690} y={378} w={215} h={115} size={20}>[Three qualities connect these images. Name them.]</Text>
      </Slide>
      <Slide id="brand-primary-mark" theme={theme} section="02 / PRIMARY MARK" folio="05">
        <Text id="mark-title" theme={theme} x={40} y={78} w={760} h={60} size={39} role="title">Our signature.</Text>
        <Image id="primary-mark-artwork" theme={theme} x={40} y={151} w={880} h={264} label="[Primary mark / approved master artwork]" detail="[Use a bound logo or contained artwork]"/>
        <Text id="mark-purpose" theme={theme} x={40} y={443} w={400} h={57} size={19}>[What this mark expresses and when it is the default.]</Text>
        <Text id="mark-source" theme={theme} x={527} y={443} w={393} h={57} size={15}>[Asset name / approved formats / owner / version]</Text>
      </Slide>
      <Slide id="brand-mark-variants" theme={theme} section="02 / MARK VARIANTS" folio="06">
        <Text id="variants-title" theme={theme} x={40} y={78} w={820} h={60} size={39} role="title">One identity. The right expression.</Text>
        <Image id="variant-light" theme={theme} x={40} y={158} w={430} h={209} label="[Mark on a light field]" detail="[Approved variation]"/>
        <Image id="variant-dark" theme={theme} x={490} y={158} w={430} h={209} label="[Mark on a dark field]" detail="[Approved reverse variation]" dark/>
        <Text id="variant-light-rule" theme={theme} x={40} y={389} w={410} h={99} size={20}>[Default use, background requirements, and exceptions for this version.]</Text>
        <Text id="variant-dark-rule" theme={theme} x={490} y={389} w={410} h={99} size={20}>[When a reverse, compact, or partner lockup is permitted. Omit unused variants.]</Text>
      </Slide>
      <Slide id="brand-mark-measurements" theme={theme} section="02 / SPACE & SIZE" folio="07">
        <Text id="measurements-title" theme={theme} x={40} y={78} w={820} h={60} size={39} role="title">Make room for the mark.</Text>
        <Panel theme={theme} x={40} y={160} w={541} h={294} outline/>
        <Image id="clearspace-diagram" theme={theme} x={91} y={211} w={439} h={192} label="[Measured clear-space diagram]" detail="[Upload the approved annotated construction]"/>
        <Text id="clearspace-caption" theme={theme} x={40} y={472} w={541} h={31} size={12}>[Define the reference unit and required space. Diagram is a placeholder.]</Text>
        <Text id="size-digital-label" theme={theme} x={633} y={170} w={280} h={25} size={12}>DIGITAL MINIMUM</Text>
        <Text id="size-digital" theme={theme} x={633} y={212} w={280} h={72} size={27}>[Approved size in px + conditions]</Text>
        <Rule theme={theme} x={633} y={306} w={287}/>
        <Text id="size-print-label" theme={theme} x={633} y={333} w={280} h={25} size={12}>PRINT MINIMUM</Text>
        <Text id="size-print" theme={theme} x={633} y={375} w={280} h={103} size={27}>[Approved size in mm + production method]</Text>
      </Slide>
      <Slide id="brand-mark-misuse" theme={theme} section="02 / CORRECT USE" folio="08">
        <Text id="misuse-title" theme={theme} x={40} y={78} w={820} h={60} size={39} role="title">Show the boundary, not just the rule.</Text>
        <Image id="misuse-proportion" theme={theme} x={40} y={162} w={280} h={220} label="[Proportion example]"/>
        <Image id="misuse-background" theme={theme} x={340} y={162} w={280} h={220} label="[Background example]"/>
        <Image id="misuse-lockup" theme={theme} x={640} y={162} w={280} h={220} label="[Lockup example]"/>
        <Text id="misuse-proportion-rule" theme={theme} x={40} y={405} w={270} h={89} size={18}>[Identify the incorrect change and show the approved correction.]</Text>
        <Text id="misuse-background-rule" theme={theme} x={340} y={405} w={270} h={89} size={18}>[Explain the legibility or contrast issue for this application.]</Text>
        <Text id="misuse-lockup-rule" theme={theme} x={640} y={405} w={270} h={89} size={18}>[Specify which master artwork or lockup should replace it.]</Text>
      </Slide>
      <Slide id="brand-color-roles" theme={theme} section="03 / COLOR" folio="09">
        <Text id="color-title" theme={theme} x={40} y={78} w={820} h={60} size={39} role="title">A palette with a job to do.</Text>
        <Panel theme={theme} x={40} y={158} w={430} h={213} color={theme.ink}/>
        <Panel theme={theme} x={490} y={158} w={205} h={213} color={theme.line}/>
        <Panel theme={theme} x={715} y={158} w={205} h={213} color={theme.paper} outline/>
        <Text id="color-primary" theme={theme} x={64} y={187} w={380} h={86} size={32} role="title" color={theme.paper}>[Signature color]</Text>
        <Text id="color-primary-values" theme={theme} x={64} y={315} w={380} h={36} size={13} color={theme.paper}>[HEX / RGB / CMYK / spot specification]</Text>
        <Text id="color-support" theme={theme} x={511} y={187} w={163} h={86} size={24}>[Supporting color]</Text>
        <Text id="color-surface" theme={theme} x={736} y={187} w={163} h={86} size={24}>[Surface color]</Text>
        <Text id="color-roles" theme={theme} x={40} y={402} w={525} h={69} size={21}>[Explain dominant, supporting, accent, and functional roles. Add verified specifications for each.]</Text>
        <Text id="color-placeholder-note" theme={theme} x={640} y={407} w={280} h={81} size={13}>These swatches show the current presentation theme. Replace them with approved brand colors; widths do not prescribe usage ratios.</Text>
      </Slide>
      <Slide id="brand-accessibility" theme={theme} section="03 / ACCESSIBLE COMBINATIONS" folio="10">
        <Text id="contrast-title" theme={theme} x={40} y={78} w={840} h={60} size={39} role="title">Color has to work for people.</Text>
        <Panel theme={theme} x={40} y={164} w={422} h={183} color={theme.ink}/>
        <Text id="contrast-dark-sample" theme={theme} x={65} y={195} w={370} h={108} size={43} role="title" color={theme.paper}>[Text on a dark surface]</Text>
        <Panel theme={theme} x={486} y={164} w={434} h={183} color={theme.line}/>
        <Text id="contrast-light-sample" theme={theme} x={511} y={195} w={380} h={108} size={43} role="title">[Text on a light surface]</Text>
        <Text id="contrast-evidence" theme={theme} x={40} y={377} w={420} h={113} size={18}>[Record tested foreground / background values, ratio, text size, target standard, and result for each pairing.]</Text>
        <Text id="contrast-other-cues" theme={theme} x={486} y={377} w={424} h={113} size={18}>[Demonstrate labels, shapes, or patterns alongside color. Recheck text and marks over the actual crop.]</Text>
      </Slide>
      <Slide id="brand-type-specimen" theme={theme} section="04 / TYPOGRAPHY" folio="11" dark>
        <Text id="type-large" theme={theme} x={35} y={93} w={800} h={172} size={130} role="title" color={theme.paper}>Aa Bb Cc</Text>
        <Text id="type-line" theme={theme} x={42} y={285} w={830} h={75} size={32} color={theme.paper}>[Words should feel unmistakably ours.]</Text>
        <Rule theme={theme} x={40} y={396} w={880} color={theme.muted}/>
        <Text id="type-display" theme={theme} x={40} y={428} w={265} h={70} size={17} color={theme.paper}>[Display family / approved weights / purpose]</Text>
        <Text id="type-body" theme={theme} x={350} y={428} w={265} h={70} size={17} color={theme.paper}>[Text family / approved weights / purpose]</Text>
        <Text id="type-access" theme={theme} x={655} y={428} w={265} h={70} size={17} color={theme.paper}>[Font source / license / fallback / language coverage]</Text>
      </Slide>
      <Slide id="brand-type-hierarchy" theme={theme} section="04 / HIERARCHY IN USE" folio="12">
        <Text id="hierarchy-title" theme={theme} x={40} y={78} w={820} h={60} size={39} role="title">Let the reader find their way.</Text>
        <Panel theme={theme} x={40} y={160} w={553} h={337} color={theme.line}/>
        <Text id="hierarchy-kicker" theme={theme} x={68} y={187} w={493} h={25} size={12}>[EYEBROW / CONTEXT]</Text>
        <Text id="hierarchy-heading" theme={theme} x={68} y={231} w={493} h={100} size={38} role="title">[A headline with a clear role.]</Text>
        <Text id="hierarchy-body" theme={theme} x={68} y={347} w={475} h={89} size={19}>[Use a short real passage to show hierarchy, line length, paragraph rhythm, and emphasis.]</Text>
        <Text id="hierarchy-caption" theme={theme} x={68} y={459} w={485} h={23} size={11}>[Caption / source / contextual detail]</Text>
        <Text id="hierarchy-rules" theme={theme} x={637} y={177} w={272} h={168} size={22}>[Specify role, size, line height, weight, and spacing for the formats you actually use.]</Text>
        <Rule theme={theme} x={637} y={365} w={283}/>
        <Text id="hierarchy-note" theme={theme} x={637} y={392} w={272} h={96} size={17}>[Show allowed variation and the point where a new composition is needed. These specimen sizes are not brand rules.]</Text>
      </Slide>
      <Slide id="brand-photography" theme={theme} section="05 / PHOTOGRAPHY" folio="13">
        <Text id="photography-title" theme={theme} x={40} y={78} w={840} h={60} size={39} role="title">Our point of view, through a lens.</Text>
        <Image id="photography-human" theme={theme} x={40} y={158} w={270} h={337} label="[People]" detail="[Casting / gesture / context]"/>
        <Image id="photography-place" theme={theme} x={326} y={158} w={280} h={206} label="[Place / environment]"/>
        <Image id="photography-detail" theme={theme} x={622} y={158} w={298} h={206} label="[Object / detail]"/>
        <Text id="photography-principles" theme={theme} x={326} y={392} w={582} h={100} size={22}>[Define subject, light, composition, color treatment, and emotional quality. Use examples that make each choice visible.]</Text>
      </Slide>
      <Slide id="brand-crop" theme={theme} section="05 / CROP & COMPOSITION" folio="14">
        <Text id="crop-title" theme={theme} x={40} y={78} w={840} h={60} size={39} role="title">The crop is part of the story.</Text>
        <Image id="crop-wide" theme={theme} x={40} y={160} w={554} h={255} label="[Wide crop / subject in context]" detail="[Specify focal point and text-safe area]"/>
        <Image id="crop-tall" theme={theme} x={618} y={160} w={154} h={255} label="[Portrait crop]"/>
        <Image id="crop-square" theme={theme} x={792} y={160} w={128} h={128} label="[Square]"/>
        <Text id="crop-small-note" theme={theme} x={792} y={310} w={128} h={106} size={15}>[What must survive at smaller sizes?]</Text>
        <Text id="crop-rules" theme={theme} x={40} y={444} w={866} h={58} size={19}>[Show the same approved image across formats. Explain the allowed crop, subject protection, overlays, and legibility checks.]</Text>
      </Slide>
      <Slide id="brand-graphic-language" theme={theme} section="06 / GRAPHIC LANGUAGE" folio="15">
        <Text id="language-title" theme={theme} x={40} y={78} w={840} h={60} size={39} role="title">The details that make it ours.</Text>
        <Image id="language-motif" theme={theme} x={40} y={158} w={422} h={250} label="[Signature shape / pattern]"/>
        <Image id="language-icons" theme={theme} x={486} y={158} w={434} h={147} label="[Icon or illustration family]"/>
        <Image id="language-motion" theme={theme} x={486} y={325} w={434} h={83} label="[Motion storyboard / sequence]"/>
        <Text id="language-geometry" theme={theme} x={40} y={434} w={422} h={68} size={18}>[Explain construction, scale, line weight, density, and relationship to the mark.]</Text>
        <Text id="language-purpose" theme={theme} x={486} y={434} w={424} h={68} size={18}>[Name the purpose and boundaries. Omit modules the brand does not use.]</Text>
      </Slide>
      <Slide id="brand-digital-applications" theme={theme} section="07 / DIGITAL APPLICATIONS" folio="16">
        <Text id="digital-title" theme={theme} x={40} y={78} w={840} h={60} size={39} role="title">A system, out in the world.</Text>
        <Image id="digital-hero" theme={theme} x={40} y={160} w={527} h={293} label="[Website / product / digital campaign]" detail="[Approved example / actual breakpoint]"/>
        <Image id="digital-mobile" theme={theme} x={591} y={160} w={145} h={293} label="[Mobile]"/>
        <Image id="digital-social" theme={theme} x={760} y={160} w={160} h={160} label="[Social]"/>
        <Text id="digital-transfer" theme={theme} x={760} y={342} w={160} h={111} size={17}>[What stays consistent across formats?]</Text>
        <Text id="digital-caption" theme={theme} x={40} y={476} w={880} h={30} size={12}>[Annotate the decisions: hierarchy, color, mark, imagery, spacing, and voice.]</Text>
      </Slide>
      <Slide id="brand-physical-applications" theme={theme} section="07 / PHYSICAL APPLICATIONS" folio="17">
        <Text id="physical-title" theme={theme} x={40} y={78} w={840} h={60} size={39} role="title">The brand has a physical life.</Text>
        <Image id="physical-environment" theme={theme} x={40} y={158} w={550} h={338} label="[Space / signage / environmental application]" detail="[Artwork + production context]"/>
        <Image id="physical-object" theme={theme} x={610} y={158} w={310} h={203} label="[Object / packaging / print]"/>
        <Text id="physical-specification" theme={theme} x={610} y={385} w={296} h={110} size={19}>[Specify material, finish, scale, print process, supplier proof, and relevant limitations.]</Text>
      </Slide>
      <Slide id="brand-handoff" theme={theme} section="08 / ASSETS & OWNERSHIP" folio="18" dark>
        <Text id="handoff-title" theme={theme} x={40} y={82} w={830} h={120} size={48} role="title" color={theme.paper}>Make the right thing easy to find.</Text>
        <Rule theme={theme} x={40} y={239} w={880} color={theme.muted}/>
        <Text id="handoff-assets-label" theme={theme} x={40} y={270} w={392} h={25} size={12} color={theme.paper}>SOURCE OF TRUTH</Text>
        <Text id="handoff-assets" theme={theme} x={40} y={314} w={392} h={90} size={24} color={theme.paper}>[Asset library / templates / master files / access instructions]</Text>
        <Text id="handoff-rights" theme={theme} x={40} y={427} w={392} h={73} size={16} color={theme.paper}>[Image credits, model permissions, font licenses, and partner-mark restrictions.]</Text>
        <Text id="handoff-owner-label" theme={theme} x={520} y={270} w={385} h={25} size={12} color={theme.paper}>DECISIONS & MAINTENANCE</Text>
        <Text id="handoff-owner" theme={theme} x={520} y={314} w={385} h={90} size={24} color={theme.paper}>[Owner / contact / approval path / exception process]</Text>
        <Text id="handoff-version" theme={theme} x={520} y={427} w={385} h={73} size={16} color={theme.paper}>[Version / published date / next review / change log location]</Text>
      </Slide>
    </>}
  </BrandGuidelines>;
}

export default function BrandGuidelinesDocument() { return <GuidelinesSkeleton theme={theme} title={title}/>; }
