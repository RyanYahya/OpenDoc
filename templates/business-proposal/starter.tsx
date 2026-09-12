import { BusinessProposal, ProposalPricing, parseProposalPricing } from '../../templates/business-proposal';
import { Paragraph } from 'opendoc';
// @ts-ignore The selected local theme module is inserted when this starter becomes a document.
import { theme } from "__OPENDOC_THEME_MODULE__";
import data from './data.json';
const title = "__OPENDOC_TITLE__";
const documentId = "__OPENDOC_DOCUMENT_ID__";
const themeId = "__OPENDOC_THEME__";
const pricing = parseProposalPricing(data);
export const meta = { title, description: 'A business proposal, ready for your content.', kind: 'proposal' as const, theme: themeId };
export const provenance = { template: 'templates/business-proposal/index.tsx', dataFile: `documents/${documentId}/data.json` };
// Bind a shared logo, pass <Logo slot="primary" /> through the logo option, or pass null to omit it.
export default function Proposal() {
  return <BusinessProposal title={title} theme={theme} preparedFor="Client name" preparedBy="Your team">
    <Paragraph id="proposal-opening">Your proposal begins here. Explain the work in the order that serves the reader, and add the scope, deliverables, schedule, and evidence it needs.</Paragraph>
    <ProposalPricing id="proposal-commercial" data={pricing} theme={theme} />
  </BusinessProposal>;
}
