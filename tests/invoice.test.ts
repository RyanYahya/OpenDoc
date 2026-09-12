import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { calculateInvoice, parseInvoice } from '../templates/invoice/schema';
import typical from '../templates/invoice/examples/typical.json';
import { createFromTemplate } from '../src/server/templates';
import { renderOnce } from '../src/server/render';
import { assertInstanceTitle, fixture, projectRoot } from './helpers';

test('invoice payments reduce the post-tax balance without changing pricing or rounding', () => {
  const original = structuredClone(typical);
  for (const [amountPaid, expected] of [[undefined, 132000n], ['0.00', 132000n], ['320.00', 100000n], ['1320.00', 0n]] as const) {
    const totals = calculateInvoice(parseInvoice({ ...typical, amountPaid }));
    assert.deepEqual([totals.subtotalMinor, totals.discountMinor, totals.taxMinor, totals.totalMinor], [122500n, 2500n, 12000n, 132000n]);
    assert.equal(totals.balanceMinor, expected);
  }
  assert.deepEqual(typical, original);
  for (const [code, decimals, quantity, price, amountPaid, total] of [
    ['KWD', 3, '0.5', '0.001', '0.001', 1n],
    ['JPY', 0, '9000000', '999999999', '8999999991000000', 8999999991000000n],
  ] as const) {
    const totals = calculateInvoice(parseInvoice({ ...typical, pricing: { currency: { code, decimals }, items: [{ id: 'one', description: 'Precision example', quantity, unitPrice: price }] }, amountPaid }));
    assert.equal(totals.totalMinor, total);
    assert.equal(totals.balanceMinor, 0n);
  }
});

test('invoice rejects invalid payment precision, credit balances, bad dates, and ambiguous fields', () => {
  for (const amountPaid of [-1, 320, NaN, Infinity, '-0.01', '0.001', '1e2', '1,000', '1320.01', '9999999999999999']) assert.throws(() => parseInvoice({ ...typical, amountPaid }), /invoice.amountPaid/);
  for (const change of [{ dueOn: '2026-09-07' }, { dueOn: '2026-02-30' }, { issuedOn: 'not-a-date' }, { amountDue: '1.00' }, { status: 'paid' }, { synthetic: undefined }, { notes: [typical.notes[0], typical.notes[0]] }, { customer: { name: 'Multiple\nlines' } }]) assert.throws(() => parseInvoice({ ...typical, ...change }), /invoice/);
  assert.equal(parseInvoice({ ...typical, issuedOn: '2028-02-29', dueOn: '2028-03-01' }).dueOn, '2028-03-01');
});

test('invoice instances own their data and show matching opening and final balances after payment edits', async () => {
  const f = await fixture();
  try {
    await cp(resolve(projectRoot, 'templates'), resolve(f.root, 'templates'), { recursive: true });
    const first = await createFromTemplate(f.root, 'invoice', { projectId: 'test-project', title: 'Invoice "A" & ${title}', id: 'invoice-a', theme: 'neutral' });
    const second = await createFromTemplate(f.root, 'invoice', { projectId: 'test-project', title: 'Invoice B', theme: 'field-manual' });
    const path = resolve(f.root, 'documents', first.id, 'data.json');
    const data = JSON.parse(await readFile(path, 'utf8'));
    for (const [amountPaid, due] of [[undefined, '1,320.00'], ['0.00', '1,320.00'], ['320.00', '1,000.00'], ['1320.00', '0.00']] as const) {
      data.amountPaid = amountPaid;
      await writeFile(path, JSON.stringify(data));
      const result = await renderOnce(f.root, first.id);
      assertInstanceTitle(result.artifact, first.id, data.title, 'data.json');
      assert.deepEqual(result.artifact.issues, []);
      assert.equal(result.artifact.meta.title, data.title);
      assert.equal(result.artifact.meta.theme, 'neutral');
      assert.equal(result.artifact.provenance?.dataFile, 'documents/invoice-a/data.json');
      assert.equal(result.artifact.provenance?.template, 'templates/invoice/index.tsx');
      assert.ok(result.artifact.blocks['invoice-balance-summary'].text.endsWith(`Amount due USD ${due}`));
      assert.ok(result.artifact.blocks['pricing-totals'].text.endsWith(`Amount due USD ${due}`));
      assert.equal(result.artifact.blocks['pricing-totals'].text.includes('Payments received'), amountPaid !== undefined);
      assert.equal(result.artifact.pages.length, 1);
    }
    const otherData = JSON.parse(await readFile(resolve(f.root, 'documents', second.id, 'data.json'), 'utf8'));
    assert.equal(otherData.amountPaid, '320.00');
    const otherResult = await renderOnce(f.root, second.id);
    assert.equal(otherResult.artifact.meta.theme, 'field-manual');
    assert.ok(otherResult.artifact.blocks['pricing-totals'].text.endsWith('Amount due USD 1,000.00'));
    assert.equal(JSON.parse(await readFile(resolve(f.root, 'templates/invoice/data.json'), 'utf8')).amountPaid, '320.00');
  } finally { await f.cleanup(); }
});
