import * as F from '@formepdf/react';
import { DataTable, Paragraph, Strong } from 'opendoc';
import { neutral } from '../../themes';
import { type DocTheme } from 'opendoc/themes';
import { BusinessProposal, ProposalHeading, ProposalPricing, parseProposalPricing } from './index';
import typical from './examples/typical.json';
import sparse from './examples/sparse.json';
import long from './examples/long.json';

export const meta = { title: 'Business proposal', description: 'A Neutral proposal specimen with illustrative prose, scope, and pricing.', kind: 'proposal' as const, theme: 'neutral' };
const paragraph = 'This is placeholder prose for the proposal. It demonstrates how the author can explain the work, its boundaries, and the value it is intended to create. No client need, capability, or outcome is being claimed. In an authored proposal, the reader and the actual work determine the sequence, evidence, and level of detail.';

export function Specimen({ length = 'typical', theme = neutral, cover = false, priced = true }: { length?: 'sparse' | 'typical' | 'long'; theme?: DocTheme; cover?: boolean; priced?: boolean } = {}) {
  const minimal = length === 'sparse';
  const pricing = parseProposalPricing({ sparse, typical, long }[length]);
  return <BusinessProposal title={meta.title} theme={theme} cover={cover}
    subtitle={minimal ? undefined : 'A clear account of the work, its delivery, and the commercial details.'}
    preparedFor={minimal ? undefined : 'Example client'} preparedBy={minimal ? undefined : 'Example team'}
    date={minimal ? undefined : 'Date placeholder'} reference={minimal ? undefined : 'Proposal reference placeholder'}
    openingNote={minimal ? undefined : 'Illustrative layout specimen. All parties, scope, schedules, and amounts are placeholders; no real offer or evidence is claimed.'}
    runningTitle={cover || length === 'long' ? 'Proposal · Example client' : undefined}
    acceptance={minimal ? undefined : 'Optional acceptance wording placeholder. Supply the actual review and approval process, or omit this area if acceptance is recorded elsewhere.'}>
    <F.View wrap={false}>
      <ProposalHeading id="specimen-opening-heading">The proposed work</ProposalHeading>
      <Paragraph id="specimen-opening-lead">A short opening stays with its heading. The author chooses the argument and organization; this specimen supplies a layout, not a sales method.</Paragraph>
    </F.View>
    <Paragraph id="specimen-opening">{paragraph}</Paragraph>
    {!minimal && <>
      {length === 'long' && Array.from({ length: 10 }, (_, index) => <Paragraph key={index} id={`specimen-detail-${index + 1}`}>{paragraph}</Paragraph>)}
      <F.View wrap={false}>
        <ProposalHeading id="specimen-schedule-heading">Deliverables and timing</ProposalHeading>
        <Paragraph id="specimen-schedule-lead">This illustrative schedule shows how scope and timing can share a table. Replace it with the actual commitments and dependencies.</Paragraph>
      </F.View>
      <DataTable id="specimen-schedule" columns={[{ label: 'Deliverable', width: 2 }, { label: 'Timing', width: 1.3 }, { label: 'Review', width: 1.5 }]}
        rows={Array.from({ length: length === 'long' ? 18 : 3 }, (_, index) => [`Example deliverable ${index + 1}`, 'Timing placeholder', 'Review placeholder'])} />
    </>}
    {priced && <>
      <F.View wrap={false} style={{ breakBefore: !minimal }}>
        <ProposalHeading id="specimen-pricing-heading">Commercial details</ProposalHeading>
        <Paragraph id="specimen-pricing-lead">A separate pricing section gives the numbers room to read. Its position is an authored choice; pricing can move or be omitted.</Paragraph>
      </F.View>
      <ProposalPricing id="specimen-pricing" data={pricing} theme={theme} />
      {!minimal && <Paragraph id="specimen-commercial-note" style={{ fontSize: 10 }}><Strong>Commercial note. </Strong>This placeholder makes room for supplied assumptions, exclusions, and payment terms. No condition is invented by the template.</Paragraph>}
    </>}
  </BusinessProposal>;
}
export default Specimen;
