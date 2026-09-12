import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMonthlyReport } from '../templates/monthly-report/schema';

const example = (name = 'typical'): Record<string, any> => JSON.parse(readFileSync(new URL(`../templates/monthly-report/examples/${name}.json`, import.meta.url), 'utf8'));

test('all sample editions validate, preserve their source data, and are visibly synthetic', () => {
  for (const name of ['sparse', 'typical', 'long']) {
    const data = example(name);
    const before = structuredClone(data);
    const report = parseMonthlyReport(data);
    assert.deepEqual(data, before);
    assert.equal(report.synthetic, true);
    assert.notEqual(report, data);
    assert.ok(report.summary.length);
  }
  assert.equal(parseMonthlyReport(example('long')).actions.length, 48);
});

test('optional empty sections and empty text normalize without losing numeric zero', () => {
  const data = example('sparse');
  delete data.highlights;
  data.risks = null;
  data.preparedBy = '   ';
  data.metrics[0] = { id: 'zero', label: 'Zero is a value', value: 0, target: 0, precision: 0, unit: '  ', note: null };
  const report = parseMonthlyReport(data);
  assert.deepEqual(report.highlights, []);
  assert.deepEqual(report.risks, []);
  assert.deepEqual(report.notes, []);
  assert.equal(report.preparedBy, undefined);
  assert.equal(report.metrics[0].value, 0);
  assert.equal(report.metrics[0].target, 0);
  assert.equal(report.metrics[0].unit, undefined);
  assert.equal(report.metrics[0].note, undefined);
});

test('calendar validation handles leap years, impossible dates, and reversed periods', () => {
  const data = example();
  data.period = { start: '2024-02-01', end: '2024-02-29' };
  assert.equal(parseMonthlyReport(data).period.end, '2024-02-29');
  for (const bad of ['2023-02-29', '1900-02-29', '2026-04-31', '2026-00-12', '2026-12-00', '0000-01-01', '2026-2-01', '2026-13-01']) {
    data.period.end = bad;
    assert.throws(() => parseMonthlyReport(data), /report\.period\.end: use a real/);
  }
  data.period = { start: '2000-02-01', end: '2000-02-29' };
  assert.doesNotThrow(() => parseMonthlyReport(data));
  data.period = { start: '2026-08-31', end: '2026-08-01' };
  assert.throws(() => parseMonthlyReport(data), /report\.period\.end: must be on or after/);
  data.period = { start: '2026-08-01', end: '2026-08-31' };
  data.actions[0].due = '2026-02-30';
  assert.throws(() => parseMonthlyReport(data), /report\.actions\[0\]\.due: use a real calendar date/);
});

test('validation reports multiple precise paths in one actionable error', () => {
  const data = example();
  data.title = ' ';
  data.metircs = [];
  data.metrics[0].value = Infinity;
  data.metrics[1].target = NaN;
  data.metrics[2].precision = 1.5;
  data.actions[0].status = 'done';
  data.risks[0].level = 'critical';
  delete data.synthetic;
  assert.throws(() => parseMonthlyReport(data), error => {
    assert.ok(error instanceof Error);
    for (const path of ['report.title', 'report.metircs', 'report.metrics[0].value', 'report.metrics[1].target', 'report.metrics[2].precision', 'report.actions[0].status', 'report.risks[0].level', 'report.synthetic']) assert.ok(error.message.includes(path), path);
    return true;
  });
});

test('records require unique stable IDs while reordering preserves identities', () => {
  const data = example();
  const original = parseMonthlyReport(data);
  data.highlights.reverse();
  assert.deepEqual(parseMonthlyReport(data).highlights.map(item => item.id), original.highlights.map(item => item.id).reverse());
  data.highlights[1].id = data.highlights[0].id;
  assert.throws(() => parseMonthlyReport(data), /report\.highlights\[1\]\.id: duplicate ID/);
  data.highlights[1].id = '../invalid id';
  assert.throws(() => parseMonthlyReport(data), /report\.highlights\[1\]\.id: use a stable ID/);
});

test('malformed values cannot masquerade as omitted sections', () => {
  const data = example();
  data.highlights = {};
  data.metrics = 'none';
  data.actions = [null];
  assert.throws(() => parseMonthlyReport(data), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /report\.highlights: expected an array/);
    assert.match(error.message, /report\.metrics: expected an array/);
    assert.match(error.message, /report\.actions\[0\]: expected an object/);
    return true;
  });
  assert.throws(() => parseMonthlyReport(null), /report: expected an object/);
  assert.throws(() => parseMonthlyReport([]), /report: expected an object/);
});
