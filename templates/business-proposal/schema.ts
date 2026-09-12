import { validateTemplateInput } from 'opendoc/template';
import { object, parsePricing, type PricingData } from '../_shared/commerce';

/** Only optional commercial data has a schema; proposal prose remains ordinary authored blocks. */
export interface ProposalPricingData { synthetic: boolean; pricing: PricingData }
function parseProposalPricingInput(input: unknown): ProposalPricingData {
  const value = object(input, ['synthetic', 'pricing'], 'proposalPricing');
  if (typeof value.synthetic !== 'boolean') throw new Error('proposalPricing.synthetic: explicitly supply true or false.');
  return { synthetic: value.synthetic, pricing: parsePricing(value.pricing) };
}

export function parseProposalPricing(input: unknown): ProposalPricingData {
  return validateTemplateInput(parseProposalPricingInput, input);
}
