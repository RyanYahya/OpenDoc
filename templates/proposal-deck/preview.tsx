import { ProposalDeck, ProposalSlide, ProposalPanel as Panel, ProposalCopy as Copy, ProposalLabel as Label, ProposalRule as Rule, ProposalPicture as Picture, ProposalLedgerRow as Row } from './index';
import { neutral } from '../../themes';
import { type DocTheme } from 'opendoc/themes';

const title = 'A better outcome, together.';
export const meta = { title, description: 'A client proposal skeleton. Replace all placeholders with agreed scope and supported evidence.', kind: 'client proposal', theme: 'neutral' };
export const provenance = { template: 'templates/proposal-deck/index.tsx' };

// All copy lives in this instance. Omit, reorder or adapt slides to the actual decision.
// Add reviewed document-owned media via image={{item:'your-image'}}. Never invent case results or commercial terms.
export function Specimen({length='typical',theme=neutral}: {length?:'sparse'|'typical'|'long';theme?:DocTheme}={}) {
  const title = length==='long' ? 'A considered proposal for improving the client experience across a complex organization' : meta.title;
  if(length==='sparse') return <ProposalDeck title={title} theme={theme}><ProposalSlide id="sparse-decision" theme={theme} layout="closing" title="A focused proposal." eyebrow="CLIENT DECISION"><Panel id="sparse-request" x={88} y={300} w={650} h={194} theme={theme}><Copy id="sparse-request-copy" theme={theme} size={24}>[One recommendation and the next decision.]</Copy></Panel></ProposalSlide></ProposalDeck>;
  return <ProposalDeck title={title} theme={theme}>
    <ProposalSlide id="commission" theme={theme} layout="cover" title={title} titleSize={length==='long'?25:38} eyebrow="A PROPOSAL FOR [CLIENT]" footer="[Prepared by] · [Version / date]" number="01">
      <Picture id="commission-image" x={644} y={0} w={316} h={488} theme={theme} label="Image position · the client's world, desired experience or project site"/>
      <Panel id="commission-summary" x={64} y={364} w={510} h={124} theme={theme}>
        <Copy id="commission-promise" theme={theme} size={24}>[The client outcome this engagement is designed to enable.]</Copy>
        <Copy id="commission-context" theme={theme} size={14}>[Client organization] / [Project or opportunity reference]</Copy>
      </Panel>
    </ProposalSlide>

    <ProposalSlide id="recommendation" theme={theme} title={length==='long'?'A longer recommendation headline can explain the client decision with useful context.':'The recommendation, at a glance.'} titleSize={length==='long'?31:38} eyebrow="01 / THE DECISION" footer="Proposal skeleton · replace with an agreed client brief" number="02">
      <Panel id="recommendation-memo" x={88} y={190} w={515} h={304} theme={theme}>
        <Label id="recommendation-label" theme={theme}>WE RECOMMEND</Label>
        <Copy id="recommendation-statement" theme={theme} size={30} bold>[A specific course of action that answers the client's highest priority.]</Copy>
        <Copy id="recommendation-rationale" theme={theme}>[Why this approach fits the situation, and the trade-off it makes.]</Copy>
      </Panel>
      <Rule x={638} y={178} w={274} theme={theme}/>
      <Panel id="recommendation-facts" x={658} y={196} w={254} h={298} theme={theme}>
        <Label id="recommendation-outcome-label" theme={theme}>VALUE TO [CLIENT]</Label>
        <Copy id="recommendation-outcome" theme={theme} size={16}>[Expected benefit and how it will be measured.]</Copy>
        <Label id="recommendation-effort-label" theme={theme}>COMMITMENT REQUIRED</Label>
        <Copy id="recommendation-effort" theme={theme} size={16}>[Investment basis, delivery period and client input.]</Copy>
        <Label id="recommendation-decision-label" theme={theme}>DECISION REQUESTED</Label>
        <Copy id="recommendation-decision" theme={theme} size={16}>[What the approver needs to authorize next.]</Copy>
      </Panel>
    </ProposalSlide>

    <ProposalSlide id="situation" theme={theme} title="Start with the client's reality." eyebrow="02 / UNDERSTANDING" number="03">
      <Panel id="situation-current" x={88} y={186} w={364} h={225} theme={theme}>
        <Label id="situation-current-label" theme={theme}>WHAT IS HAPPENING</Label>
        <Copy id="situation-current-title" theme={theme} size={28} bold>[The current state, in the client's words.]</Copy>
        <Copy id="situation-current-body" theme={theme}>[Who is affected, where friction occurs and what the client has already tried.]</Copy>
      </Panel>
      <Panel id="situation-stakes" x={510} y={186} w={402} h={225} theme={theme}>
        <Label id="situation-stakes-label" theme={theme}>WHY IT MATTERS NOW</Label>
        <Copy id="situation-stakes-title" theme={theme} size={28} bold>[The business consequence or opportunity.]</Copy>
        <Copy id="situation-stakes-body" theme={theme}>[The trigger, constraints and cost of leaving the situation unresolved. Separate facts from assumptions.]</Copy>
      </Panel>
      <Rule x={88} y={429} w={824} theme={theme}/>
      <Panel id="situation-source" x={88} y={447} w={824} h={47} theme={theme}><Copy id="situation-source-copy" theme={theme} size={13}>[Basis: client discovery / supplied brief / dated source. Note open questions for confirmation.]</Copy></Panel>
    </ProposalSlide>

    <ProposalSlide id="outcomes" theme={theme} title="Define what success will mean." eyebrow="03 / OUTCOMES" number="04">
      <Panel id="outcome-primary" x={88} y={188} w={248} h={252} theme={theme}>
        <Copy id="outcome-primary-number" theme={theme} size={54} bold>01</Copy>
        <Copy id="outcome-primary-title" theme={theme} size={24} bold>[Primary outcome]</Copy>
        <Copy id="outcome-primary-measure" theme={theme} size={16}>[Baseline → agreed target] · [Measure / evidence] · [Accountable owner]</Copy>
      </Panel>
      <Panel id="outcome-secondary" x={376} y={188} w={248} h={252} theme={theme}>
        <Copy id="outcome-secondary-number" theme={theme} size={54} bold>02</Copy>
        <Copy id="outcome-secondary-title" theme={theme} size={24} bold>[Second outcome]</Copy>
        <Copy id="outcome-secondary-measure" theme={theme} size={16}>[Baseline → agreed target] · [Measure / evidence] · [Accountable owner]</Copy>
      </Panel>
      <Panel id="outcome-enabler" x={664} y={188} w={248} h={252} theme={theme}>
        <Copy id="outcome-enabler-number" theme={theme} size={54} bold>03</Copy>
        <Copy id="outcome-enabler-title" theme={theme} size={24} bold>[Enabling outcome]</Copy>
        <Copy id="outcome-enabler-measure" theme={theme} size={16}>[Baseline → agreed target] · [Measure / evidence] · [Accountable owner]</Copy>
      </Panel>
      <Panel id="outcome-agreement" x={88} y={460} w={824} h={34} theme={theme}><Copy id="outcome-agreement-copy" theme={theme} size={13}>[Confirm measurement period, data access and acceptance authority before delivery begins.]</Copy></Panel>
    </ProposalSlide>

    <ProposalSlide id="approach" theme={theme} title="An approach shaped around the outcome." eyebrow="04 / RECOMMENDED APPROACH" titleSize={36} number="05">
      <Panel id="approach-reasoning" x={88} y={190} w={345} h={304} theme={theme}>
        <Label id="approach-principle-label" theme={theme}>THE CORE IDEA</Label>
        <Copy id="approach-principle" theme={theme} size={27} bold>[The organizing principle behind the solution.]</Copy>
        <Copy id="approach-logic" theme={theme} size={18}>[Explain how the approach produces the desired change. Include the important design choice.]</Copy>
        <Copy id="approach-alternative" theme={theme} size={14}>[Alternative considered and the reason for this recommendation.]</Copy>
      </Panel>
      <Picture id="approach-visual" x={484} y={182} w={428} h={245} theme={theme} label="Visual position · solution diagram, experience concept or annotated prototype"/>
      <Panel id="approach-caption" x={484} y={442} w={428} h={52} theme={theme}><Copy id="approach-caption-copy" theme={theme} size={13}>[Caption: connect the visual to a specific client benefit.]</Copy></Panel>
    </ProposalSlide>

    <ProposalSlide id="workstreams" theme={theme} title="Translate the idea into work." eyebrow="05 / DELIVERY APPROACH" number="06">
      <Panel id="workstream-discover" x={88} y={183} w={200} h={90} theme={theme}><Label id="workstream-discover-label" theme={theme}>WORKSTREAM 01</Label><Copy id="workstream-discover-title" theme={theme} size={24} bold>[Understand]</Copy></Panel>
      <Panel id="workstream-discover-detail" x={358} y={183} w={554} h={90} theme={theme}><Copy id="workstream-discover-body" theme={theme}>[Activities and decisions that establish the baseline and test the critical assumptions.]</Copy><Copy id="workstream-discover-output" theme={theme} size={13}>[Output → the next workstream needs this result.]</Copy></Panel>
      <Rule x={88} y={278} w={824} theme={theme}/>
      <Panel id="workstream-create" x={88} y={297} w={200} h={90} theme={theme}><Label id="workstream-create-label" theme={theme}>WORKSTREAM 02</Label><Copy id="workstream-create-title" theme={theme} size={24} bold>[Create]</Copy></Panel>
      <Panel id="workstream-create-detail" x={358} y={297} w={554} h={90} theme={theme}><Copy id="workstream-create-body" theme={theme}>[Activities that develop and test the proposed solution with the people who will use it.]</Copy><Copy id="workstream-create-output" theme={theme} size={13}>[Output → the next decision this work enables.]</Copy></Panel>
      <Rule x={88} y={392} w={824} theme={theme}/>
      <Panel id="workstream-enable" x={88} y={411} w={200} h={83} theme={theme}><Label id="workstream-enable-label" theme={theme}>WORKSTREAM 03</Label><Copy id="workstream-enable-title" theme={theme} size={24} bold>[Enable]</Copy></Panel>
      <Panel id="workstream-enable-detail" x={358} y={411} w={554} h={83} theme={theme}><Copy id="workstream-enable-body" theme={theme}>[Activities that support adoption, handover and measurement of the agreed results.]</Copy></Panel>
    </ProposalSlide>

    <ProposalSlide id="deliverables" theme={theme} title="Make the deliverables testable." eyebrow="06 / SCOPE & ACCEPTANCE" number="07">
      <Row id="deliverables-header" theme={theme} y={178} header deliverable="DELIVERABLE" acceptance="ACCEPTANCE EVIDENCE" owner="APPROVER" timing="DUE / GATE"/>
      <Row id="deliverable-baseline" theme={theme} y={222} deliverable="[Named output and format]" acceptance="[Objective completeness or quality criterion]" owner="[Client role]" timing="[Milestone]"/>
      <Row id="deliverable-solution" theme={theme} y={318} deliverable="[Named output and format]" acceptance="[Review method and evidence required]" owner="[Client role]" timing="[Milestone]"/>
      <Row id="deliverable-handover" theme={theme} y={414} deliverable="[Named output and format]" acceptance="[What demonstrates a successful handover]" owner="[Client role]" timing="[Milestone]"/>
    </ProposalSlide>

    <ProposalSlide id="scope-boundary" theme={theme} title="A clear boundary protects delivery." eyebrow="07 / SCOPE BOUNDARY" dark number="08">
      <Panel id="scope-included" x={88} y={185} w={360} h={230} theme={theme}>
        <Label id="scope-included-label" theme={theme} dark>INCLUDED</Label>
        <Copy id="scope-included-title" theme={theme} size={28} bold dark>[What we are responsible for.]</Copy>
        <Copy id="scope-included-copy" theme={theme} size={18} dark>[Services, audiences, locations, systems and review cycles included in this proposal.]</Copy>
      </Panel>
      <Panel id="scope-excluded" x={528} y={185} w={384} h={230} theme={theme}>
        <Label id="scope-excluded-label" theme={theme} dark>OUTSIDE THIS PROPOSAL</Label>
        <Copy id="scope-excluded-title" theme={theme} size={28} bold dark>[What would need separate agreement.]</Copy>
        <Copy id="scope-excluded-copy" theme={theme} size={18} dark>[Exclusions and optional future work. Be specific about ambiguous boundaries.]</Copy>
      </Panel>
      <Rule x={88} y={432} w={824} theme={theme} dark/>
      <Panel id="scope-change" x={88} y={448} w={824} h={46} theme={theme}><Copy id="scope-change-copy" theme={theme} size={14} dark>[Change route: who assesses scope, cost and timing impacts, and who approves a change.]</Copy></Panel>
    </ProposalSlide>

    <ProposalSlide id="roadmap" theme={theme} title="Sequence the work around decisions." eyebrow="08 / MILESTONES" number="09">
      <Rule x={88} y={200} w={824} theme={theme}/>
      <Panel id="roadmap-align" x={88} y={217} w={178} h={225} theme={theme}><Label id="roadmap-align-time" theme={theme}>[PERIOD / DATES]</Label><Copy id="roadmap-align-title" theme={theme} size={27} bold>[Align]</Copy><Copy id="roadmap-align-copy" theme={theme} size={16}>[Key activities and output.]</Copy><Label id="roadmap-align-gate-label" theme={theme}>DECISION GATE</Label><Copy id="roadmap-align-gate" theme={theme} size={15}>[Approve baseline and scope.]</Copy></Panel>
      <Panel id="roadmap-design" x={302} y={217} w={178} h={225} theme={theme}><Label id="roadmap-design-time" theme={theme}>[PERIOD / DATES]</Label><Copy id="roadmap-design-title" theme={theme} size={27} bold>[Develop]</Copy><Copy id="roadmap-design-copy" theme={theme} size={16}>[Key activities and output.]</Copy><Label id="roadmap-design-gate-label" theme={theme}>DECISION GATE</Label><Copy id="roadmap-design-gate" theme={theme} size={15}>[Select a direction.]</Copy></Panel>
      <Panel id="roadmap-validate" x={516} y={217} w={178} h={225} theme={theme}><Label id="roadmap-validate-time" theme={theme}>[PERIOD / DATES]</Label><Copy id="roadmap-validate-title" theme={theme} size={27} bold>[Validate]</Copy><Copy id="roadmap-validate-copy" theme={theme} size={16}>[Key activities and output.]</Copy><Label id="roadmap-validate-gate-label" theme={theme}>DECISION GATE</Label><Copy id="roadmap-validate-gate" theme={theme} size={15}>[Accept the tested result.]</Copy></Panel>
      <Panel id="roadmap-transfer" x={730} y={217} w={182} h={225} theme={theme}><Label id="roadmap-transfer-time" theme={theme}>[PERIOD / DATES]</Label><Copy id="roadmap-transfer-title" theme={theme} size={27} bold>[Transfer]</Copy><Copy id="roadmap-transfer-copy" theme={theme} size={16}>[Key activities and output.]</Copy><Label id="roadmap-transfer-gate-label" theme={theme}>DECISION GATE</Label><Copy id="roadmap-transfer-gate" theme={theme} size={15}>[Confirm handover.]</Copy></Panel>
      <Panel id="roadmap-dependency" x={88} y={460} w={824} h={34} theme={theme}><Copy id="roadmap-dependency-copy" theme={theme} size={13}>[Schedule basis: start condition, client review windows and dependencies. Confirm before committing dates.]</Copy></Panel>
    </ProposalSlide>

    <ProposalSlide id="governance" theme={theme} title="Make ownership visible." eyebrow="09 / PEOPLE & GOVERNANCE" number="10">
      <Panel id="governance-sponsor" x={88} y={186} w={248} h={190} theme={theme}><Label id="governance-sponsor-label" theme={theme}>CLIENT SPONSOR</Label><Copy id="governance-sponsor-name" theme={theme} size={26} bold>[Name / role]</Copy><Copy id="governance-sponsor-duty" theme={theme} size={17}>[Owns the business outcome and approves scope, investment and key decisions.]</Copy></Panel>
      <Panel id="governance-lead" x={376} y={186} w={248} h={190} theme={theme}><Label id="governance-lead-label" theme={theme}>DELIVERY LEAD</Label><Copy id="governance-lead-name" theme={theme} size={26} bold>[Name / role]</Copy><Copy id="governance-lead-duty" theme={theme} size={17}>[Owns day-to-day delivery, quality and the agreed escalation route.]</Copy></Panel>
      <Panel id="governance-team" x={664} y={186} w={248} h={190} theme={theme}><Label id="governance-team-label" theme={theme}>SPECIALIST TEAM</Label><Copy id="governance-team-name" theme={theme} size={26} bold>[Named roles]</Copy><Copy id="governance-team-duty" theme={theme} size={17}>[Relevant capability, allocation and responsibility. Confirm availability.]</Copy></Panel>
      <Rule x={88} y={392} w={824} theme={theme}/>
      <Panel id="governance-cadence" x={88} y={415} w={824} h={79} theme={theme}><Label id="governance-cadence-label" theme={theme}>HOW WE WORK TOGETHER</Label><Copy id="governance-cadence-copy" theme={theme} size={17}>[Working cadence] · [Decision forum] · [Reporting artifact] · [Escalation owner]</Copy></Panel>
    </ProposalSlide>

    <ProposalSlide id="proof-story" theme={theme} layout="case" title="Relevant work. Specific proof." titleSize={32} eyebrow="10 / EVIDENCE" number="11">
      <Picture id="proof-story-image" x={0} y={0} w={552} h={486} theme={theme} label="Case image position · approved project photograph, output or annotated evidence"/>
      <Panel id="proof-story-caption" x={36} y={498} w={495} h={30} theme={theme}><Copy id="proof-story-caption-copy" theme={theme} size={11}>[Client permission / image attribution / case reference]</Copy></Panel>
      <Panel id="proof-story-detail" x={596} y={184} w={316} h={310} theme={theme}>
        <Label id="proof-story-context-label" theme={theme}>COMPARABLE CHALLENGE</Label><Copy id="proof-story-context" theme={theme} size={16}>[Relevant context and why it resembles this engagement.]</Copy>
        <Label id="proof-story-action-label" theme={theme}>OUR CONTRIBUTION</Label><Copy id="proof-story-action" theme={theme} size={16}>[The team's actual scope and actions.]</Copy>
        <Label id="proof-story-result-label" theme={theme}>VERIFIABLE RESULT</Label><Copy id="proof-story-result" theme={theme} size={16}>[Supported outcome, measurement period and source. State limits to transferability.]</Copy>
      </Panel>
    </ProposalSlide>

    <ProposalSlide id="investment" theme={theme} title="Make the commercial choice clear." eyebrow="11 / INVESTMENT" number="12">
      <Panel id="investment-core" x={88} y={180} w={384} h={198} theme={theme}>
        <Label id="investment-core-label" theme={theme}>[OPTION A / CORE SCOPE]</Label><Copy id="investment-core-price" theme={theme} size={29} bold>[Amount + currency]</Copy><Copy id="investment-core-basis" theme={theme} size={15}>[Fixed fee / time basis / unit basis]</Copy><Copy id="investment-core-inclusion" theme={theme} size={17}>[Included outcomes, deliverables and capacity. Explain who this option fits.]</Copy>
      </Panel>
      <Panel id="investment-extended" x={530} y={180} w={382} h={198} theme={theme}>
        <Label id="investment-extended-label" theme={theme}>[OPTION B / EXTENDED SCOPE]</Label><Copy id="investment-extended-price" theme={theme} size={29} bold>[Amount + currency]</Copy><Copy id="investment-extended-basis" theme={theme} size={15}>[Same comparison basis as option A]</Copy><Copy id="investment-extended-inclusion" theme={theme} size={17}>[Additional value, scope and trade-offs. Omit this option if it is not useful.]</Copy>
      </Panel>
      <Rule x={88} y={389} w={824} theme={theme}/>
      <Panel id="investment-terms" x={88} y={406} w={824} h={88} theme={theme}><Label id="investment-terms-label" theme={theme}>COMMERCIAL BASIS TO CONFIRM</Label><Copy id="investment-terms-copy" theme={theme} size={15}>[Tax and expenses] · [Payment milestones / terms] · [Validity] · [Currency / assumptions] · [Reference the detailed quotation or agreement; do not leave material costs implicit.]</Copy></Panel>
    </ProposalSlide>

    <ProposalSlide id="delivery-conditions" theme={theme} title="Surface what delivery depends on." eyebrow="12 / ASSUMPTIONS & RISK" number="13">
      <Panel id="conditions-client" x={88} y={185} w={250} h={230} theme={theme}><Label id="conditions-client-label" theme={theme}>CLIENT DEPENDENCIES</Label><Copy id="conditions-client-title" theme={theme} size={26} bold>[What we need]</Copy><Copy id="conditions-client-copy" theme={theme} size={17}>[Access, data, people, decisions and facilities.]</Copy><Copy id="conditions-client-owner" theme={theme} size={14}>[Owner / required by / impact if late]</Copy></Panel>
      <Panel id="conditions-assumptions" x={376} y={185} w={248} h={230} theme={theme}><Label id="conditions-assumptions-label" theme={theme}>ASSUMPTIONS</Label><Copy id="conditions-assumptions-title" theme={theme} size={26} bold>[What must hold]</Copy><Copy id="conditions-assumptions-copy" theme={theme} size={17}>[Conditions underpinning scope, timing and price.]</Copy><Copy id="conditions-assumptions-owner" theme={theme} size={14}>[Validation owner / confirmation date]</Copy></Panel>
      <Panel id="conditions-risk" x={664} y={185} w={248} h={230} theme={theme}><Label id="conditions-risk-label" theme={theme}>PRIORITY RISK</Label><Copy id="conditions-risk-title" theme={theme} size={26} bold>[What could change]</Copy><Copy id="conditions-risk-copy" theme={theme} size={17}>[Cause → event → delivery consequence.]</Copy><Copy id="conditions-risk-owner" theme={theme} size={14}>[Mitigation / owner / escalation trigger]</Copy></Panel>
      <Rule x={88} y={429} w={824} theme={theme}/>
      <Panel id="conditions-followup" x={88} y={447} w={824} h={47} theme={theme}><Copy id="conditions-followup-copy" theme={theme} size={13}>[Open issues and how they will be resolved before the work is commissioned.]</Copy></Panel>
    </ProposalSlide>

    <ProposalSlide id="next-decision" theme={theme} layout="closing" title="A clear decision. A practical next step." titleSize={43} eyebrow="13 / NEXT DECISION" dark number="14">
      <Panel id="next-decision-request" x={88} y={302} w={520} h={145} theme={theme}><Copy id="next-decision-request-copy" theme={theme} size={24} dark>[Approve the chosen scope and commercial basis, or confirm the changes needed to proceed.]</Copy></Panel>
      <Panel id="next-decision-owner" x={676} y={312} w={236} h={141} theme={theme}><Label id="next-decision-owner-label" theme={theme} dark>DECISION OWNER / BY</Label><Copy id="next-decision-owner-copy" theme={theme} size={17} dark>[Approver] / [Agreed date]</Copy><Label id="next-decision-action-label" theme={theme} dark>ON AGREEMENT</Label><Copy id="next-decision-action-copy" theme={theme} size={17} dark>[Immediate next action and owner]</Copy></Panel>
      <Panel id="next-decision-contact" x={88} y={466} w={824} h={28} theme={theme}><Copy id="next-decision-contact-copy" theme={theme} size={13} dark>[Contact name] · [Email] · [Proposal reference]</Copy></Panel>
    </ProposalSlide>
  </ProposalDeck>;
}

export default Specimen;
