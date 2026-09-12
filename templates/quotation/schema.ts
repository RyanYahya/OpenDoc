import { date, object, optionalText, parsePricing, text, type PricingData } from '../_shared/commerce';
export interface QuotationData {
  schemaVersion: 1; title: string; number: string; issuedOn: string; validUntil?: string;
  seller: { name: string; details?: string }; client: { name: string; details?: string };
  synthetic: boolean; introduction?: string; pricing: PricingData;
  terms: { id: string; title: string; text: string }[]; acceptance?: string;
}
export function parseQuotation(input: unknown): QuotationData {
  const data = object(input, ['schemaVersion', 'title', 'number', 'issuedOn', 'validUntil', 'seller', 'client', 'synthetic', 'introduction', 'pricing', 'terms', 'acceptance'], 'quotation');
  if (data.schemaVersion !== 1) throw new Error('quotation.schemaVersion: expected 1.');
  if (typeof data.synthetic !== 'boolean') throw new Error('quotation.synthetic: explicitly supply true or false.');
  const party = (input: unknown, path: string) => { const value = object(input, ['name', 'details'], path); return { name: text(value.name, `${path}.name`, 180, 1), details: optionalText(value.details, `${path}.details`, 700, 8) }; };
  const issuedOn = date(data.issuedOn, 'quotation.issuedOn');
  const validUntil = data.validUntil === undefined || data.validUntil === null ? undefined : date(data.validUntil, 'quotation.validUntil');
  if (validUntil && validUntil < issuedOn) throw new Error('quotation.validUntil: must be on or after issuedOn.');
  if (data.terms !== undefined && !Array.isArray(data.terms)) throw new Error('quotation.terms: expected an array.');
  const seen = new Set<string>();
  const terms = ((data.terms ?? []) as unknown[]).map((raw, i) => {
    const path = `quotation.terms[${i}]`, term = object(raw, ['id', 'title', 'text'], path), id = text(term.id, `${path}.id`, 100);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id) || seen.has(id)) throw new Error(`${path}.id: supply a unique stable ID.`);
    seen.add(id);
    return { id, title: text(term.title, `${path}.title`, 120), text: text(term.text, `${path}.text`) };
  });
  return { schemaVersion: 1, title: text(data.title, 'quotation.title', 300), number: text(data.number, 'quotation.number', 80), issuedOn, validUntil,
    seller: party(data.seller, 'quotation.seller'), client: party(data.client, 'quotation.client'), synthetic: data.synthetic,
    introduction: optionalText(data.introduction, 'quotation.introduction'), pricing: parsePricing(data.pricing), terms, acceptance: optionalText(data.acceptance, 'quotation.acceptance') };
}
