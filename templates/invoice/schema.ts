import { calculatePricing, date, object, optionalText, parsePricing, paymentMinor, text, type PricingData } from '../_shared/commerce';

export interface InvoiceData {
  schemaVersion: 1; title: string; number: string; issuedOn: string; dueOn?: string; reference?: string;
  seller: { name: string; details?: string }; customer: { name: string; details?: string };
  synthetic: boolean; introduction?: string; pricing: PricingData; amountPaid?: string;
  paymentInstructions?: string; paymentReference?: string; notes: { id: string; title: string; text: string }[];
}

export function calculateInvoice(data: InvoiceData) {
  const totals = calculatePricing(data.pricing);
  const paidMinor = data.amountPaid === undefined ? 0n : paymentMinor(data.amountPaid, data.pricing.currency, 'invoice.amountPaid');
  if (paidMinor > totals.totalMinor) throw new Error('invoice.amountPaid: cannot exceed the invoice total; a credit balance needs a separate explicit treatment.');
  return { ...totals, paidMinor, balanceMinor: totals.totalMinor - paidMinor };
}

export function parseInvoice(input: unknown): InvoiceData {
  const value = object(input, ['schemaVersion', 'title', 'number', 'issuedOn', 'dueOn', 'reference', 'seller', 'customer', 'synthetic', 'introduction', 'pricing', 'amountPaid', 'paymentInstructions', 'paymentReference', 'notes'], 'invoice');
  if (value.schemaVersion !== 1) throw new Error('invoice.schemaVersion: expected 1.');
  if (typeof value.synthetic !== 'boolean') throw new Error('invoice.synthetic: explicitly supply true or false.');
  const party = (input: unknown, path: string) => {
    const data = object(input, ['name', 'details'], path);
    return { name: text(data.name, `${path}.name`, 180, 1), details: optionalText(data.details, `${path}.details`, 700, 8) };
  };
  const issuedOn = date(value.issuedOn, 'invoice.issuedOn');
  const dueOn = value.dueOn === undefined || value.dueOn === null ? undefined : date(value.dueOn, 'invoice.dueOn');
  if (dueOn && dueOn < issuedOn) throw new Error('invoice.dueOn: must be on or after issuedOn.');
  if (value.notes !== undefined && !Array.isArray(value.notes)) throw new Error('invoice.notes: expected an array.');
  const seen = new Set<string>();
  const notes = ((value.notes ?? []) as unknown[]).map((raw, index) => {
    const path = `invoice.notes[${index}]`, note = object(raw, ['id', 'title', 'text'], path), id = text(note.id, `${path}.id`, 100);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id) || seen.has(id)) throw new Error(`${path}.id: supply a unique stable ID.`);
    seen.add(id);
    return { id, title: text(note.title, `${path}.title`, 120), text: text(note.text, `${path}.text`) };
  });
  const data: InvoiceData = {
    schemaVersion: 1, title: text(value.title, 'invoice.title', 300), number: text(value.number, 'invoice.number', 80, 1), issuedOn, dueOn,
    reference: optionalText(value.reference, 'invoice.reference', 180, 1), seller: party(value.seller, 'invoice.seller'), customer: party(value.customer, 'invoice.customer'),
    synthetic: value.synthetic, introduction: optionalText(value.introduction, 'invoice.introduction'), pricing: parsePricing(value.pricing),
    amountPaid: value.amountPaid === undefined || value.amountPaid === null ? undefined : text(value.amountPaid, 'invoice.amountPaid', 20, 1),
    paymentInstructions: optionalText(value.paymentInstructions, 'invoice.paymentInstructions'), paymentReference: optionalText(value.paymentReference, 'invoice.paymentReference', 180, 1), notes,
  };
  calculateInvoice(data);
  return data;
}
