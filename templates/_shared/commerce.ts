export function object(value: unknown, allowed: string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: expected an object.`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${path}.${key}: unknown field.`);
  return value as Record<string, unknown>;
}
export function text(value: unknown, path: string, max = 5000, maxLines = Infinity): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${path}: use nonempty text of at most ${max} characters.`);
  if (value.trim().split(/\r\n|\r|\n/).length > maxLines) throw new Error(`${path}: use at most ${maxLines} supplied lines so this field fits its layout.`);
  return value.trim();
}
export function optionalText(value: unknown, path: string, max = 5000, maxLines = Infinity) {
  return value === undefined || value === null ? undefined : text(value, path, max, maxLines);
}
export function date(value: unknown, path: string): string {
  const input = text(value, path, 10);
  const parsed = new Date(`${input}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || input.startsWith('0000') || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input) throw new Error(`${path}: use a real date in YYYY-MM-DD format.`);
  return input;
}
function decimal(value: unknown, places: number, path: string, positive = false, integerDigits = 9): string {
  if (typeof value !== 'string' || !new RegExp(`^(0|[1-9][0-9]{0,${integerDigits - 1}})${places ? `(\\.[0-9]{1,${places}})?` : ''}$`).test(value)) throw new Error(`${path}: use a nonnegative decimal string with at most ${integerDigits} integer digits and ${places} decimal places.`);
  if (positive && scaled(value, places) === 0n) throw new Error(`${path}: must be greater than zero.`);
  return value;
}
function scaled(value: string, places: number): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0') || '0');
}
const roundHalfUp = (value: bigint, divisor: bigint) => (value + divisor / 2n) / divisor;
export interface PricingData {
  currency: { code: string; decimals: number };
  items: { id: string; description: string; quantity: string; unit?: string; unitPrice: string }[];
  discount?: string;
  tax?: { label: string; ratePercent: string };
}

export function parsePricing(input: unknown): PricingData {
  const value = object(input, ['currency', 'items', 'discount', 'tax'], 'pricing');
  const currency = object(value.currency, ['code', 'decimals'], 'pricing.currency');
  if (typeof currency.code !== 'string' || !/^[A-Z]{3}$/.test(currency.code)) throw new Error('pricing.currency.code: supply a three-letter uppercase currency code.');
  if (typeof currency.decimals !== 'number' || !Number.isInteger(currency.decimals) || currency.decimals < 0 || currency.decimals > 3) throw new Error('pricing.currency.decimals: supply 0, 1, 2, or 3 explicitly.');
  const places = currency.decimals;
  if (!Array.isArray(value.items) || !value.items.length || value.items.length > 500) throw new Error('pricing.items: supply 1–500 line items.');
  const seen = new Set<string>();
  const items = value.items.map((raw, i) => {
    const path = `pricing.items[${i}]`;
    const item = object(raw, ['id', 'description', 'quantity', 'unit', 'unitPrice'], path);
    const id = text(item.id, `${path}.id`, 100);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id) || seen.has(id)) throw new Error(`${path}.id: supply a unique stable ID with letters, numbers, dots, underscores, or hyphens.`);
    seen.add(id);
    return { id, description: text(item.description, `${path}.description`, 600, 8), quantity: decimal(item.quantity, 3, `${path}.quantity`, true), unit: optionalText(item.unit, `${path}.unit`, 24, 1), unitPrice: decimal(item.unitPrice, places, `${path}.unitPrice`) };
  });
  let tax: PricingData['tax'];
  if (value.tax !== undefined && value.tax !== null) {
    const rate = object(value.tax, ['label', 'ratePercent'], 'pricing.tax');
    const ratePercent = decimal(rate.ratePercent, 2, 'pricing.tax.ratePercent');
    if (scaled(ratePercent, 2) > 10000n) throw new Error('pricing.tax.ratePercent: use a rate from 0 to 100.');
    tax = { label: text(rate.label, 'pricing.tax.label', 60, 1), ratePercent };
  }
  const result: PricingData = { currency: { code: currency.code, decimals: places }, items, discount: value.discount === undefined || value.discount === null ? undefined : decimal(value.discount, places, 'pricing.discount'), tax };
  calculatePricing(result);
  return result;
}

/** Integer arithmetic: round each line, then tax the discounted subtotal, half up. */
export function calculatePricing(data: PricingData) {
  const items = data.items.map(item => ({ ...item, amountMinor: roundHalfUp(scaled(item.quantity, 3) * scaled(item.unitPrice, data.currency.decimals), 1000n) }));
  const subtotalMinor = items.reduce((sum, item) => sum + item.amountMinor, 0n);
  const discountMinor = scaled(data.discount ?? '0', data.currency.decimals);
  if (discountMinor > subtotalMinor) throw new Error('pricing.discount: cannot exceed the subtotal.');
  const netMinor = subtotalMinor - discountMinor;
  const taxMinor = data.tax ? roundHalfUp(netMinor * scaled(data.tax.ratePercent, 2), 10000n) : 0n;
  const totalMinor = netMinor + taxMinor;
  if (subtotalMinor > BigInt(Number.MAX_SAFE_INTEGER) || totalMinor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('pricing: total exceeds the supported amount range.');
  return { items, subtotalMinor, discountMinor, netMinor, taxMinor, totalMinor };
}

export function money(minor: bigint, currency: PricingData['currency'], includeCode = true) {
  const scale = 10n ** BigInt(currency.decimals);
  const whole = (minor / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = currency.decimals ? `.${(minor % scale).toString().padStart(currency.decimals, '0')}` : '';
  return `${includeCode ? `${currency.code} ` : ''}${whole}${fraction}`;
}
export function unitPriceMinor(item: PricingData['items'][number], currency: PricingData['currency']) {
  return scaled(item.unitPrice, currency.decimals);
}

/** A supplied payment may cover the complete calculated total, not just one unit price. */
export function paymentMinor(input: unknown, currency: PricingData['currency'], path: string): bigint {
  const value = scaled(decimal(input, currency.decimals, path, false, 16), currency.decimals);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${path}: amount exceeds the supported range.`);
  return value;
}
