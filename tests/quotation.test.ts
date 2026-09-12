import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { calculatePricing, money, parsePricing } from '../templates/_shared/commerce';
import { parseQuotation } from '../templates/quotation/schema';
import typical from '../templates/quotation/examples/typical.json';
import { createFromTemplate } from '../src/server/templates';
import { renderOnce } from '../src/server/render';
import { assertInstanceTitle, fixture, projectRoot } from './helpers';

test('quotation pricing uses decimal input and rounds each line and net tax half up', () => {
  const before = structuredClone(typical);
  const parsed = parseQuotation(typical), totals = calculatePricing(parsed.pricing);
  assert.deepEqual(typical, before);
  assert.deepEqual([totals.subtotalMinor, totals.discountMinor, totals.taxMinor, totals.totalMinor], [122500n, 2500n, 12000n, 132000n]);
  assert.equal(money(totals.totalMinor, parsed.pricing.currency), 'USD 1,320.00');
  const fractional = parsePricing({ currency: { code: 'USD', decimals: 2 }, items: [1, 2, 3].map(id => ({ id: `line-${id}`, description: 'Rounding example', quantity: '0.333', unitPrice: '0.05' })), discount: '0.01', tax: { label: 'Example tax', ratePercent: '10' } });
  const rounded = calculatePricing(fractional);
  assert.deepEqual(rounded.items.map(item => item.amountMinor), [2n, 2n, 2n]);
  assert.deepEqual([rounded.subtotalMinor, rounded.netMinor, rounded.taxMinor, rounded.totalMinor], [6n, 5n, 1n, 6n]);
  for (const [code, decimals, price, expected] of [['JPY', 0, '1', 'JPY 1'], ['KWD', 3, '0.001', 'KWD 0.001']] as const) {
    const data = parsePricing({ currency: { code, decimals }, items: [{ id: 'half', description: 'Half unit', quantity: '0.5', unitPrice: price }] });
    assert.equal(money(calculatePricing(data).totalMinor, data.currency), expected);
  }
  const zero = parsePricing({ currency: { code: 'USD', decimals: 2 }, items: [{ id: 'free', description: 'No charge', quantity: '1', unitPrice: '0.00' }], tax: { label: 'Supplied rate', ratePercent: '0' } });
  assert.equal(calculatePricing(zero).totalMinor, 0n);
});

test('quotation input rejects invalid amounts, dates, duplicate IDs, and unknown fields', () => {
  const invalidPricing = [
    { currency: { code: 'USD' } }, { currency: { code: 'USD', decimals: 2.5 } },
    { discount: '999999999.00' }, { tax: { label: 'Tax', ratePercent: '101' } },
    { items: [] }, { items: [typical.pricing.items[0], typical.pricing.items[0]] },
    ...[0, NaN, Infinity, '0', '-1', '1e2', '1.0001', '1,000'].map(quantity => ({ items: [{ ...typical.pricing.items[0], quantity }] })),
    ...[-1, 12.5, '1.001', '-0.01'].map(unitPrice => ({ items: [{ ...typical.pricing.items[0], unitPrice }] })),
    { unexpectedTotal: '1.00' },
    { items: [{ ...typical.pricing.items[0], description: 'Line\n'.repeat(9) }] },
    { items: [{ ...typical.pricing.items[0], unit: 'two\nlines' }] },
    { items: [{ ...typical.pricing.items[0], quantity: '999999999', unitPrice: '999999999' }] },
  ];
  for (const pricing of invalidPricing) assert.throws(() => parseQuotation({ ...typical, pricing: { ...typical.pricing, ...pricing } }), /pricing/);
  for (const change of [{ issuedOn: '2026-02-30' }, { validUntil: '2026-01-01' }, { synthetic: undefined }, { total: 100 }, { terms: [typical.terms[0], typical.terms[0]] }, { seller: { name: 'Two\nlines' } }, { client: { name: 'Example', details: 'Line\n'.repeat(9) } }]) assert.throws(() => parseQuotation({ ...typical, ...change }), /quotation/);
  assert.equal(parseQuotation({ ...typical, issuedOn: '2028-02-29', validUntil: '2028-03-01' }).issuedOn, '2028-02-29');
});

test('quotation creation owns its JSON, preserves literal titles and provenance, and edits independently', async () => {
  const f = await fixture();
  try {
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    const title = 'A "quoted" ${title} & <scope>';
    const created = await createFromTemplate(f.root, 'quotation', { projectId: 'test-project', id: 'quoted-scope', title, theme: 'neutral' });
    const file = resolve(f.root, 'documents', created.id, 'data.json');
    const original = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(original.title, title);
    let result = await renderOnce(f.root, created.id);
    assertInstanceTitle(result.artifact, created.id, title, 'data.json');
    assert.deepEqual(result.artifact.issues, []);
    assert.equal(result.artifact.meta.title, title);
    assert.equal(result.artifact.meta.theme, 'neutral');
    assert.equal(result.artifact.provenance?.dataFile, 'documents/quoted-scope/data.json');
    assert.equal(result.artifact.provenance?.template, 'templates/quotation/index.tsx');
    assert.equal(result.artifact.pages.length, 1);
    const second = await createFromTemplate(f.root, 'quotation', { projectId: 'test-project', title: 'Another quote', theme: 'field-manual' });
    original.title = 'Revised from local data';
    original.pricing.items[0].unitPrice = '200.00';
    await writeFile(file, JSON.stringify(original));
    result = await renderOnce(f.root, created.id);
    assert.equal(result.artifact.meta.title, original.title);
    assert.equal(calculatePricing(parseQuotation(original).pricing).totalMinor, 143000n);
    assert.match(result.artifact.blocks['pricing-totals'].text, /Quoted total USD 1,430\.00/);
    const secondData = JSON.parse(await readFile(resolve(f.root, 'documents', second.id, 'data.json'), 'utf8'));
    assert.equal(secondData.pricing.items[0].unitPrice, '160.00');
    assert.equal(JSON.parse(await readFile(resolve(f.root, 'templates/quotation/data.json'), 'utf8')).title, '__OPENDOC_TITLE__');
    await assert.rejects(createFromTemplate(f.root, 'quotation', { projectId: 'test-project', id: created.id, title: 'Overwrite', theme: 'neutral' }), /already exists/);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).title, original.title);
    const literal = await createFromTemplate(f.root, 'editorial-essay', { projectId: 'test-project', title: '__OPENDOC_DOCUMENT_ID__', theme: 'neutral' });
    assert.equal((await renderOnce(f.root, literal.id)).artifact.meta.title, '__OPENDOC_DOCUMENT_ID__', 'A title that resembles an internal marker remains literal user text');
  } finally { await f.cleanup(); }
});
