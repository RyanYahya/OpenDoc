import { PitchDeck, PitchSlide, PitchText, PitchPanel, PitchImage } from '../../templates/pitch-deck';
// @ts-ignore The selected local theme module is inserted when this starter becomes a document.
import { theme } from "__OPENDOC_THEME_MODULE__";

const title = "__OPENDOC_TITLE__";
export const meta = { title, description:'A venture pitch. Replace all prompts with supported company material.', kind:'pitch deck', theme:"__OPENDOC_THEME__" };
export const provenance = {template:'templates/pitch-deck/index.tsx'};

// This is your editable story, not a required slide order. Keep stable IDs when reordering.
// Add managed image={{item:'your-media-id'}} to a PitchImage after importing and reviewing media.
// Sources, dates and assumptions belong beside the relevant evidence. Move detail to explicit appendix slides.
export default function Deck() {
  return <PitchDeck title={title} theme={theme}>
    <PitchSlide id="purpose" theme={theme} dark eyebrow="COMPANY PURPOSE" footer="[Founder name]  /  [Contact]  /  [Date]">
      <PitchText id="company-name" theme={theme} x={48} y={108} w={680} h={150} body={title} role="display" size={64} weight={600} color={theme.paper}/>
      <PitchText id="company-promise" theme={theme} x={48} y={290} w={720} h={112} body="We help [specific customer] achieve [valuable outcome]." size={32} color={theme.paper}/>
      <PitchText id="round-context" theme={theme} x={48} y={448} w={760} h={30} body="[Fundraising stage]  /  One plain sentence. No category jargon." size={16} color={theme.paper}/>
    </PitchSlide>

    <PitchSlide id="problem" theme={theme} eyebrow="THE CUSTOMER PAIN" title="A real person. An expensive problem." footer="Evidence placeholder: source, date and customer context.">
      <PitchText id="customer-situation" theme={theme} x={48} y={186} w={390} h={90} body="[Customer] struggles to [important job]." role="display" size={32} weight={600}/>
      <PitchText id="customer-consequence" theme={theme} x={48} y={312} w={360} h={118} body="Describe the cost of the current workaround in time, money or lost opportunity." size={23}/>
      <PitchPanel id="pain-evidence-panel" theme={theme} dark x={492} y={177} w={420} h={291}/>
      <PitchText id="pain-evidence-label" theme={theme} x={524} y={208} w={356} h={25} body="VOICE OF THE CUSTOMER" role="label" size={11} color={theme.paper}/>
      <PitchText id="pain-evidence" theme={theme} x={524} y={258} w={350} h={128} body="[A short, permissioned customer quote or measured observation.]" size={28} color={theme.paper}/>
      <PitchText id="pain-attribution" theme={theme} x={524} y={425} w={350} h={25} body="[Attribution / study / interview date]" size={13} color={theme.paper}/>
    </PitchSlide>

    <PitchSlide id="solution" theme={theme} eyebrow="THE SOLUTION" title="Show the change your product makes." footer="Replace these prompts with one concrete customer outcome.">
      <PitchPanel id="before-panel" theme={theme} rule x={48} y={178} w={416} h={286}/>
      <PitchPanel id="after-panel" theme={theme} dark x={484} y={178} w={428} h={286}/>
      <PitchText id="before-label" theme={theme} x={76} y={205} w={360} h={24} body="TODAY" role="label" size={12}/>
      <PitchText id="before-outcome" theme={theme} x={76} y={252} w={360} h={110} body="[The frustrating status quo]" role="display" size={34} weight={600}/>
      <PitchText id="before-detail" theme={theme} x={76} y={390} w={360} h={52} body="Describe the workaround, not a straw man." size={18}/>
      <PitchText id="after-label" theme={theme} x={512} y={205} w={372} h={24} body="WITH YOUR PRODUCT" role="label" size={12} color={theme.paper}/>
      <PitchText id="after-outcome" theme={theme} x={512} y={252} w={372} h={110} body="[A clear, valuable improvement]" role="display" size={34} weight={600} color={theme.paper}/>
      <PitchText id="after-detail" theme={theme} x={512} y={390} w={372} h={52} body="Explain the unique insight that makes it possible." size={18} color={theme.paper}/>
    </PitchSlide>

    <PitchSlide id="product" theme={theme} eyebrow="THE PRODUCT" title="Make the experience immediately clear." footer="Product visual placeholder. Show the real experience; label concept work as a concept.">
      <PitchImage id="product-visual" theme={theme} x={48} y={175} w={558} h={291} label="Product demonstration" detail="Use one cropped product view, physical product photograph or simplified demonstration."/>
      <PitchText id="product-first" theme={theme} x={646} y={188} w={266} h={70} body="01  [Start with the customer's action]" size={23} weight={600}/>
      <PitchText id="product-second" theme={theme} x={646} y={286} w={266} h={70} body="02  [Show the useful transformation]" size={23} weight={600}/>
      <PitchText id="product-third" theme={theme} x={646} y={384} w={266} h={70} body="03  [End with the result]" size={23} weight={600}/>
    </PitchSlide>

    <PitchSlide id="why-now" theme={theme} dark eyebrow="WHY NOW" footer="Evidence placeholder: dates and sources for the enabling changes.">
      <PitchText id="timing-claim" theme={theme} x={48} y={96} w={820} h={148} body={"What changed\nthat makes this possible now?"} role="display" size={53} weight={600} color={theme.paper}/>
      <PitchText id="timing-shift" theme={theme} x={48} y={302} w={254} h={122} body={"[Technology shift]\nWhat became possible?"} size={25} color={theme.paper}/>
      <PitchText id="timing-behavior" theme={theme} x={350} y={302} w={254} h={122} body={"[Behavior shift]\nWhat do customers now expect?"} size={25} color={theme.paper}/>
      <PitchText id="timing-window" theme={theme} x={652} y={302} w={260} h={122} body={"[Market opening]\nWhy act in this window?"} size={25} color={theme.paper}/>
    </PitchSlide>

    <PitchSlide id="traction" theme={theme} eyebrow="TRACTION / VALIDATION" title="Lead with your strongest honest evidence." footer="Evidence placeholder: unit, period, cohort, source and whether observed or estimated.">
      <PitchText id="traction-primary" theme={theme} x={48} y={190} w={304} h={93} body="[Metric]" role="display" size={60} weight={600}/>
      <PitchText id="traction-definition" theme={theme} x={48} y={302} w={294} h={100} body="State what it measures and why it shows customers value the product." size={23}/>
      <PitchText id="traction-stage-note" theme={theme} x={48} y={426} w={294} h={45} body="Pre-launch? Use validated learning or committed pilots." size={14}/>
      <PitchImage id="traction-chart" theme={theme} x={400} y={180} w={512} h={285} label="Evidence chart or customer proof" detail="Add actual data with readable axes and a period. No invented growth curve."/>
    </PitchSlide>

    <PitchSlide id="market" theme={theme} eyebrow="MARKET POTENTIAL" title="Start with a customer you can actually reach." footer="Sizing placeholder: show source dates, assumptions, calculation and currency.">
      <PitchText id="market-beachhead" theme={theme} x={48} y={177} w={830} h={55} body="[Specific initial customer segment + geography]" size={27} weight={600}/>
      <PitchPanel id="market-formula-panel" theme={theme} dark x={48} y={255} w={864} h={122}/>
      <PitchText id="market-count" theme={theme} x={76} y={276} w={244} h={77} body={"[Customers]\nReachable accounts"} size={24} color={theme.paper}/>
      <PitchText id="market-multiply" theme={theme} x={338} y={289} w={40} h={50} body="×" size={36} color={theme.paper}/>
      <PitchText id="market-value" theme={theme} x={398} y={276} w={224} h={77} body={"[Annual value]\nPer account"} size={24} color={theme.paper}/>
      <PitchText id="market-equals" theme={theme} x={640} y={289} w={40} h={50} body="=" size={36} color={theme.paper}/>
      <PitchText id="market-result" theme={theme} x={704} y={276} w={180} h={77} body={"[Market]\nAnnual value"} size={24} color={theme.paper}/>
      <PitchText id="market-expansion" theme={theme} x={48} y={415} w={850} h={52} body="Then explain the credible path into adjacent customers or new uses." size={23}/>
    </PitchSlide>

    <PitchSlide id="business-model" theme={theme} eyebrow="BUSINESS MODEL" title="Who pays, for what, and why it works." footer="Economics placeholder: separate measured performance from assumptions.">
      <PitchPanel id="business-pricing-panel" theme={theme} dark x={48} y={178} w={328} h={288}/>
      <PitchText id="business-pricing-label" theme={theme} x={76} y={206} w={270} h={25} body="PRICING UNIT" role="label" size={12} color={theme.paper}/>
      <PitchText id="business-pricing" theme={theme} x={76} y={256} w={270} h={116} body={"[Price]\nper [unit]"} role="display" size={42} weight={600} color={theme.paper}/>
      <PitchText id="business-payer" theme={theme} x={76} y={404} w={270} h={42} body="[Buyer / budget owner]" size={19} color={theme.paper}/>
      <PitchText id="business-value" theme={theme} x={424} y={192} w={472} h={98} body={"[Why this is worth paying for]\nConnect price with the buyer's value."} size={25} weight={600}/>
      <PitchText id="business-economics" theme={theme} x={424} y={326} w={472} h={125} body={"[Economics that matter]\nExplain cost to serve, margin or repeat behavior using the measures relevant to your business."} size={23}/>
    </PitchSlide>

    <PitchSlide id="go-to-market" theme={theme} eyebrow="GO TO MARKET" title="A focused route to the first repeatable growth." footer="Channel evidence placeholder. Distinguish tested acquisition from the plan.">
      <PitchText id="gtm-entry-label" theme={theme} x={48} y={185} w={252} h={40} body="01 / FIND" role="label" size={15}/>
      <PitchText id="gtm-entry" theme={theme} x={48} y={247} w={252} h={170} body={"[Entry channel]\nWhere does your first audience already gather?"} size={25}/>
      <PitchText id="gtm-convert-label" theme={theme} x={352} y={185} w={252} h={40} body="02 / CONVERT" role="label" size={15}/>
      <PitchText id="gtm-convert" theme={theme} x={352} y={247} w={252} h={170} body={"[First value moment]\nWhat moves a prospect from interest into use?"} size={25}/>
      <PitchText id="gtm-repeat-label" theme={theme} x={656} y={185} w={256} h={40} body="03 / REPEAT" role="label" size={15}/>
      <PitchText id="gtm-repeat" theme={theme} x={656} y={247} w={256} h={170} body={"[Repeatable engine]\nWhat evidence makes you believe this can scale?"} size={25}/>
      <PitchText id="gtm-learning" theme={theme} x={48} y={438} w={850} h={36} body="[One next experiment and the success criterion that earns more investment.]" size={18}/>
    </PitchSlide>

    <PitchSlide id="alternatives" theme={theme} eyebrow="COMPETITION / ALTERNATIVES" title="Show the trade-off that lets you win." footer="Comparison placeholder: verify alternatives, criteria and dates. Include doing nothing.">
      <PitchText id="alternatives-column" theme={theme} x={48} y={174} w={254} h={27} body="CUSTOMER CHOICE" role="label" size={11}/>
      <PitchText id="alternatives-strength-column" theme={theme} x={348} y={174} w={242} h={27} body="WHY THEY CHOOSE IT" role="label" size={11}/>
      <PitchText id="alternatives-gap-column" theme={theme} x={642} y={174} w={270} h={27} body="WHERE YOU DIFFER" role="label" size={11}/>
      <PitchPanel id="alternatives-current-rule" theme={theme} rule x={48} y={211} w={864} h={1}/>
      <PitchText id="alternatives-current" theme={theme} x={48} y={228} w={254} h={65} body="[Current workaround]" size={23} weight={600}/>
      <PitchText id="alternatives-current-strength" theme={theme} x={348} y={228} w={242} h={65} body="[Its genuine strength]" size={21}/>
      <PitchText id="alternatives-current-gap" theme={theme} x={642} y={228} w={270} h={65} body="[Your relevant advantage]" size={21}/>
      <PitchPanel id="alternatives-direct-rule" theme={theme} rule x={48} y={307} w={864} h={1}/>
      <PitchText id="alternatives-direct" theme={theme} x={48} y={326} w={254} h={65} body="[Direct competitor]" size={23} weight={600}/>
      <PitchText id="alternatives-direct-strength" theme={theme} x={348} y={326} w={242} h={65} body="[Its genuine strength]" size={21}/>
      <PitchText id="alternatives-direct-gap" theme={theme} x={642} y={326} w={270} h={65} body="[Your relevant advantage]" size={21}/>
      <PitchText id="alternatives-durability" theme={theme} x={48} y={429} w={840} h={47} body="[Explain why the advantage can endure as alternatives improve.]" size={22} weight={600}/>
    </PitchSlide>

    <PitchSlide id="team" theme={theme} eyebrow="THE TEAM" title="Why this team is right for this problem." footer="Team placeholders. Include relevant experience and real roles; use permissioned portraits.">
      <PitchImage id="founder-one-portrait" theme={theme} x={48} y={178} w={178} h={180} label="Founder portrait"/>
      <PitchImage id="founder-two-portrait" theme={theme} x={354} y={178} w={178} h={180} label="Founder portrait"/>
      <PitchText id="founder-one-name" theme={theme} x={48} y={381} w={274} h={42} body="[Name / role]" size={25} weight={600}/>
      <PitchText id="founder-one-fit" theme={theme} x={48} y={428} w={274} h={52} body="[One specific reason this person belongs here.]" size={18}/>
      <PitchText id="founder-two-name" theme={theme} x={354} y={381} w={274} h={42} body="[Name / role]" size={25} weight={600}/>
      <PitchText id="founder-two-fit" theme={theme} x={354} y={428} w={274} h={52} body="[One specific reason this person belongs here.]" size={18}/>
      <PitchPanel id="team-insight-panel" theme={theme} dark x={660} y={178} w={252} h={302}/>
      <PitchText id="team-insight" theme={theme} x={686} y={212} w={200} h={226} body={"[The earned insight]\nWhat have you learned together that others miss?"} size={28} color={theme.paper}/>
    </PitchSlide>

    <PitchSlide id="financial-position" theme={theme} eyebrow="FINANCIAL POSITION" title="Make the current position easy to understand." footer="Financial placeholders: currency, as-of date, period and basis. Label projections explicitly.">
      <PitchText id="financial-actuals-label" theme={theme} x={48} y={185} w={386} h={26} body="ACTUALS / AS OF [DATE]" role="label" size={12}/>
      <PitchText id="financial-actuals" theme={theme} x={48} y={238} w={386} h={184} body={"[Revenue, if any]\n[Cash and burn]\n[Runway at current plan]"} size={29}/>
      <PitchPanel id="financial-plan-panel" theme={theme} rule x={484} y={177} w={428} h={287}/>
      <PitchText id="financial-plan-label" theme={theme} x={512} y={205} w={372} h={26} body="PLAN / KEY ASSUMPTIONS" role="label" size={12}/>
      <PitchText id="financial-plan" theme={theme} x={512} y={258} w={372} h={149} body={"[What drives the model]\nName the assumptions that matter and the next evidence needed."} size={27}/>
      <PitchText id="financial-detail" theme={theme} x={48} y={441} w={386} h={38} body="Put detailed schedules in an appendix." size={17}/>
    </PitchSlide>

    <PitchSlide id="funding-ask" theme={theme} eyebrow="THE RAISE" title="Fund the next proof point." footer="Funding placeholders: currency, intended runway, milestone dates and dependencies.">
      <PitchText id="raise-amount" theme={theme} x={48} y={185} w={348} h={120} body={"[Raise\namount]"} role="display" size={48} weight={600}/>
      <PitchText id="raise-purpose" theme={theme} x={48} y={344} w={328} h={112} body={"[Runway / use of funds]\nExplain what this capital allows you to prove."} size={24}/>
      <PitchText id="milestone-product" theme={theme} x={452} y={190} w={460} h={74} body={"01  [Product milestone]\n[Success criterion + target date]"} size={23}/>
      <PitchText id="milestone-market" theme={theme} x={452} y={293} w={460} h={74} body={"02  [Customer milestone]\n[Success criterion + target date]"} size={23}/>
      <PitchText id="milestone-business" theme={theme} x={452} y={396} w={460} h={74} body={"03  [Business milestone]\n[Success criterion + target date]"} size={23}/>
    </PitchSlide>

    <PitchSlide id="vision" theme={theme} dark eyebrow="THE VISION" footer="[Founder name]  /  [Email]  /  [Website]">
      <PitchText id="vision-promise" theme={theme} x={48} y={106} w={822} h={220} body={"If this works,\nwhat becomes possible?"} role="display" size={62} weight={600} color={theme.paper}/>
      <PitchText id="vision-future" theme={theme} x={48} y={347} w={750} h={85} body="[Describe the company you intend to build in five years.]" size={28} color={theme.paper}/>
      <PitchText id="vision-next-step" theme={theme} x={48} y={449} w={800} h={35} body="[Clear next step for the investor]" size={20} color={theme.paper}/>
    </PitchSlide>
  </PitchDeck>;
}
