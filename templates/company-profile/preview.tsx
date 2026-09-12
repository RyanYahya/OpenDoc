import { CompanyProfile, ProfileSlide, ProfileRegion, ProfileText, ProfileImage, ProfileRule, ProfileRow } from './index';
import { neutral as theme } from '../../themes';

const title = 'Company profile';
const themeId = 'neutral';
export const meta = { title, description: 'A company profile with replaceable content and image positions.', kind: 'company profile', theme: themeId };


// This content belongs to the instance. Replace placeholders with supplied facts.
// Remove irrelevant slides, keep IDs stable, and add slides rather than squeezing copy.
// Image example: image={{item:'team-at-work',position:{x:0.6,y:0.5}}}
export default function Specimen() {
  return <CompanyProfile title={title} theme={theme}>
    <ProfileSlide id="profile-cover" theme={theme} cover title={title} eyebrow="COMPANY PROFILE / [EDITION DATE]" folio="01">
      <ProfileImage id="cover-image" theme={theme} x={560} y={0} width={400} height={540} label="Signature project or place" />
      <ProfileRegion x={40} y={364} width={450} height={104}>
        <ProfileText id="cover-positioning" theme={theme} size={23}>[Company name] helps [audience] achieve [specific outcome].</ProfileText>
        <ProfileText id="cover-context" theme={theme} size={13} muted>[Prepared for audience / geography / edition]</ProfileText>
      </ProfileRegion>
    </ProfileSlide>

    <ProfileSlide id="profile-snapshot" theme={theme} title="The company at a glance." eyebrow="01 / INTRODUCTION" folio="02">
      <ProfileRegion x={40} y={196} width={428} height={266}>
        <ProfileText id="snapshot-positioning" theme={theme} size={29}>[What you do, for whom, and the useful difference you make.]</ProfileText>
        <ProfileText id="snapshot-description" theme={theme} size={18} muted>[Explain the business in plain language. State the actual scale and scope; distinguish the company from a group or partner network.]</ProfileText>
      </ProfileRegion>
      <ProfileRule theme={theme} x={510} y={202} width={410} />
      <ProfileRegion x={530} y={216} width={175} height={108}>
        <ProfileText id="snapshot-founded-label" theme={theme} size={12} label>ESTABLISHED</ProfileText>
        <ProfileText id="snapshot-founded" theme={theme} size={27}>[Year]</ProfileText>
      </ProfileRegion>
      <ProfileRegion x={740} y={216} width={180} height={108}>
        <ProfileText id="snapshot-base-label" theme={theme} size={12} label>BASED IN</ProfileText>
        <ProfileText id="snapshot-base" theme={theme} size={27}>[Location]</ProfileText>
      </ProfileRegion>
      <ProfileRule theme={theme} x={510} y={338} width={410} />
      <ProfileRegion x={530} y={354} width={175} height={116}>
        <ProfileText id="snapshot-team-label" theme={theme} size={12} label>TEAM / CAPACITY</ProfileText>
        <ProfileText id="snapshot-team" theme={theme} size={22}>[Verified figure]</ProfileText>
      </ProfileRegion>
      <ProfileRegion x={740} y={354} width={180} height={116}>
        <ProfileText id="snapshot-status-label" theme={theme} size={12} label>OWNERSHIP / STATUS</ProfileText>
        <ProfileText id="snapshot-status" theme={theme} size={22}>[Accurate status]</ProfileText>
      </ProfileRegion>
    </ProfileSlide>

    <ProfileSlide id="profile-purpose" theme={theme} title="The belief behind the work." eyebrow="02 / POINT OF VIEW" folio="03">
      <ProfileRegion x={40} y={204} width={585} height={210}>
        <ProfileText id="purpose-statement" theme={theme} size={39}>[A clear point of view about what should improve in your field.]</ProfileText>
      </ProfileRegion>
      <ProfileRegion x={680} y={204} width={240} height={256}>
        <ProfileText id="purpose-practice-label" theme={theme} size={12} label>IN PRACTICE</ProfileText>
        <ProfileText id="purpose-practice" theme={theme} size={20}>[Describe the decision or behavior this belief changes. Show a useful principle instead of a list of generic values.]</ProfileText>
      </ProfileRegion>
      <ProfileRule theme={theme} x={40} y={444} width={585} />
      <ProfileRegion x={40} y={456} width={585} height={26}><ProfileText id="purpose-proof" theme={theme} size={12} muted>[One practical example, documented policy, or relevant commitment.]</ProfileText></ProfileRegion>
    </ProfileSlide>

    <ProfileSlide id="profile-capabilities" theme={theme} title="What we bring to the table." eyebrow="03 / CAPABILITIES" folio="04">
      <ProfileRegion x={40} y={196} width={880} height={282}>
        <ProfileRow id="capability-discovery" theme={theme} number="01" title="[Core capability]" detail="[Name the buyer's need and the concrete deliverable you provide.]" />
        <ProfileRow id="capability-delivery" theme={theme} number="02" title="[Core capability]" detail="[Describe a distinct service, product, or expertise. Avoid overlapping categories.]" />
        <ProfileRow id="capability-support" theme={theme} number="03" title="[Core capability]" detail="[Explain the outcome and a specific differentiator you can substantiate.]" />
      </ProfileRegion>
    </ProfileSlide>

    <ProfileSlide id="profile-sectors" theme={theme} title="Where our expertise is relevant." eyebrow="04 / SECTORS & CONTEXTS" folio="05">
      <ProfileImage id="sector-primary-image" theme={theme} x={40} y={192} width={510} height={236} label="Sector / product / operating context" />
      <ProfileImage id="sector-secondary-image" theme={theme} x={574} y={192} width={346} height={106} label="Second context" />
      <ProfileImage id="sector-detail-image" theme={theme} x={574} y={322} width={150} height={106} label="Detail" />
      <ProfileRegion x={746} y={322} width={174} height={108}>
        <ProfileText id="sector-detail" theme={theme} size={16}>[A specific use case that makes the sector relevant.]</ProfileText>
      </ProfileRegion>
      <ProfileRegion x={40} y={443} width={510} height={40}><ProfileText id="sector-primary" theme={theme} size={17}>[Sector] / [typical need or application]</ProfileText></ProfileRegion>
      <ProfileRegion x={574} y={443} width={346} height={40}><ProfileText id="sector-secondary" theme={theme} size={15} muted>[Additional verified sectors, if useful]</ProfileText></ProfileRegion>
    </ProfileSlide>

    <ProfileSlide id="profile-method" theme={theme} title="How the work moves forward." eyebrow="05 / OPERATING MODEL" folio="06">
      <ProfileRule theme={theme} x={40} y={216} width={880} />
      <ProfileRegion x={40} y={232} width={202} height={236}>
        <ProfileText id="method-align-number" theme={theme} size={34} muted>01</ProfileText>
        <ProfileText id="method-align-title" theme={theme} size={24}>[Understand]</ProfileText>
        <ProfileText id="method-align-detail" theme={theme} size={18}>[How needs, context, and success criteria become clear.]</ProfileText>
        <ProfileText id="method-align-output" theme={theme} size={12} muted>OUTPUT / [Decision or artifact]</ProfileText>
      </ProfileRegion>
      <ProfileRegion x={266} y={232} width={202} height={236}>
        <ProfileText id="method-shape-number" theme={theme} size={34} muted>02</ProfileText>
        <ProfileText id="method-shape-title" theme={theme} size={24}>[Shape]</ProfileText>
        <ProfileText id="method-shape-detail" theme={theme} size={18}>[How options become an agreed approach with clear ownership.]</ProfileText>
        <ProfileText id="method-shape-output" theme={theme} size={12} muted>OUTPUT / [Decision or artifact]</ProfileText>
      </ProfileRegion>
      <ProfileRegion x={492} y={232} width={202} height={236}>
        <ProfileText id="method-deliver-number" theme={theme} size={34} muted>03</ProfileText>
        <ProfileText id="method-deliver-title" theme={theme} size={24}>[Deliver]</ProfileText>
        <ProfileText id="method-deliver-detail" theme={theme} size={18}>[How work is produced, checked, and handed over.]</ProfileText>
        <ProfileText id="method-deliver-output" theme={theme} size={12} muted>OUTPUT / [Decision or artifact]</ProfileText>
      </ProfileRegion>
      <ProfileRegion x={718} y={232} width={202} height={236}>
        <ProfileText id="method-improve-number" theme={theme} size={34} muted>04</ProfileText>
        <ProfileText id="method-improve-title" theme={theme} size={24}>[Improve]</ProfileText>
        <ProfileText id="method-improve-detail" theme={theme} size={18}>[How performance, learning, or ongoing support is handled.]</ProfileText>
        <ProfileText id="method-improve-output" theme={theme} size={12} muted>OUTPUT / [Decision or artifact]</ProfileText>
      </ProfileRegion>
    </ProfileSlide>

    <ProfileSlide id="profile-case-context" theme={theme} title="[A project that shows the work.]" eyebrow="06 / SELECTED WORK" folio="07">
      <ProfileImage id="case-hero-image" theme={theme} x={40} y={196} width={580} height={280} label="Actual project / product / result" />
      <ProfileRegion x={656} y={196} width={264} height={280}>
        <ProfileText id="case-client-label" theme={theme} size={12} label>CLIENT / CONTEXT</ProfileText>
        <ProfileText id="case-client" theme={theme} size={23}>[Named with permission, or accurately anonymized]</ProfileText>
        <ProfileText id="case-role-label" theme={theme} size={12} label>OUR ROLE</ProfileText>
        <ProfileText id="case-role" theme={theme} size={18}>[Specific scope. Distinguish your contribution from the wider project.]</ProfileText>
        <ProfileText id="case-period" theme={theme} size={13} muted>[Location / delivery period / status]</ProfileText>
      </ProfileRegion>
    </ProfileSlide>

    <ProfileSlide id="profile-case-evidence" theme={theme} title="What changed, and how we know." eyebrow="06 / SELECTED WORK — EVIDENCE" folio="08">
      <ProfileRegion x={40} y={200} width={264} height={210}>
        <ProfileText id="case-challenge-label" theme={theme} size={12} label>THE CHALLENGE</ProfileText>
        <ProfileText id="case-challenge" theme={theme} size={22}>[The starting situation and constraints that mattered.]</ProfileText>
      </ProfileRegion>
      <ProfileRegion x={342} y={200} width={264} height={210}>
        <ProfileText id="case-action-label" theme={theme} size={12} label>OUR CONTRIBUTION</ProfileText>
        <ProfileText id="case-action" theme={theme} size={22}>[The concrete intervention and the part your team owned.]</ProfileText>
      </ProfileRegion>
      <ProfileRegion x={644} y={200} width={276} height={210}>
        <ProfileText id="case-outcome-label" theme={theme} size={12} label>THE OBSERVED RESULT</ProfileText>
        <ProfileText id="case-outcome" theme={theme} size={28}>[Verified outcome]</ProfileText>
        <ProfileText id="case-outcome-context" theme={theme} size={15} muted>[Unit, baseline, period, and qualification where needed.]</ProfileText>
      </ProfileRegion>
      <ProfileRule theme={theme} x={40} y={430} width={880} />
      <ProfileRegion x={40} y={444} width={880} height={38}>
        <ProfileText id="case-source" theme={theme} size={13} muted>Evidence / [Source, date, measurement method, permission, and limits of attribution.]</ProfileText>
      </ProfileRegion>
    </ProfileSlide>

    <ProfileSlide id="profile-footprint" theme={theme} title="Present where the work happens." eyebrow="07 / PRESENCE & REACH" folio="09">
      <ProfileRegion x={40} y={200} width={400} height={276}>
        <ProfileText id="footprint-base-label" theme={theme} size={12} label>OFFICE / OPERATING BASE</ProfileText>
        <ProfileText id="footprint-base" theme={theme} size={26}>[Actual location]</ProfileText>
        <ProfileText id="footprint-service-label" theme={theme} size={12} label>ACTIVE SERVICE AREA</ProfileText>
        <ProfileText id="footprint-service" theme={theme} size={22}>[Locations you can currently serve]</ProfileText>
        <ProfileText id="footprint-model" theme={theme} size={17} muted>[Explain local presence, remote delivery, or partner coverage accurately. Include relevant limits.]</ProfileText>
      </ProfileRegion>
      <ProfileImage id="footprint-image" theme={theme} x={486} y={196} width={434} height={234} label="Workplace / facility / local context" />
      <ProfileRegion x={486} y={445} width={434} height={35}><ProfileText id="footprint-caption" theme={theme} size={13} muted>[Location and truthful caption; date if relevant]</ProfileText></ProfileRegion>
    </ProfileSlide>

    <ProfileSlide id="profile-people" theme={theme} title="The people accountable for the work." eyebrow="08 / PEOPLE & EXPERTISE" folio="10">
      <ProfileImage id="people-lead-image" theme={theme} x={40} y={196} width={266} height={164} label="Portrait / team at work" />
      <ProfileImage id="people-delivery-image" theme={theme} x={346} y={196} width={266} height={164} label="Portrait / team at work" />
      <ProfileImage id="people-specialist-image" theme={theme} x={652} y={196} width={268} height={164} label="Portrait / team at work" />
      <ProfileRegion x={40} y={376} width={266} height={104}>
        <ProfileText id="people-lead-name" theme={theme} size={22}>[Name / role]</ProfileText>
        <ProfileText id="people-lead-expertise" theme={theme} size={16} muted>[Relevant expertise and what this person is accountable for.]</ProfileText>
      </ProfileRegion>
      <ProfileRegion x={346} y={376} width={266} height={104}>
        <ProfileText id="people-delivery-name" theme={theme} size={22}>[Name / role]</ProfileText>
        <ProfileText id="people-delivery-expertise" theme={theme} size={16} muted>[Relevant expertise and what this person is accountable for.]</ProfileText>
      </ProfileRegion>
      <ProfileRegion x={652} y={376} width={268} height={104}>
        <ProfileText id="people-specialist-name" theme={theme} size={22}>[Name / role]</ProfileText>
        <ProfileText id="people-specialist-expertise" theme={theme} size={16} muted>[Relevant expertise and what this person is accountable for.]</ProfileText>
      </ProfileRegion>
    </ProfileSlide>

    <ProfileSlide id="profile-assurance" theme={theme} title="The standards we can stand behind." eyebrow="09 / CREDENTIALS & RESPONSIBILITY — OPTIONAL" folio="11">
      <ProfileRegion x={40} y={196} width={880} height={282}>
        <ProfileRow id="assurance-credential" theme={theme} number="01" title="[Credential / license]" detail="[Issuer, exact scope, current status, expiry, and verification source. Omit if not applicable.]" />
        <ProfileRow id="assurance-quality" theme={theme} number="02" title="[Quality / governance]" detail="[A real process or policy, its owner, and evidence of how it is applied.]" />
        <ProfileRow id="assurance-responsibility" theme={theme} number="03" title="[Responsibility]" detail="[A documented commitment or measured result. Distinguish future goals from achieved outcomes.]" />
      </ProfileRegion>
    </ProfileSlide>

    <ProfileSlide id="profile-contact" theme={theme} cover title="Start a useful conversation." titleSize={48} eyebrow="10 / CONTACT" folio="12">
      <ProfileImage id="contact-image" theme={theme} x={560} y={0} width={400} height={540} label="People / product / place" />
      <ProfileRegion x={40} y={354} width={464} height={124}>
        <ProfileText id="contact-name" theme={theme} size={21}>[Contact name / role]</ProfileText>
        <ProfileText id="contact-email" theme={theme} size={18}>[Email] / [Phone]</ProfileText>
        <ProfileText id="contact-website" theme={theme} size={18}>[Website] / [Office or time zone]</ProfileText>
        <ProfileText id="contact-invitation" theme={theme} size={13} muted>[A clear reason to connect and the next conversation to have.]</ProfileText>
      </ProfileRegion>
    </ProfileSlide>
  </CompanyProfile>;
}
