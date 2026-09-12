import test from 'node:test';
import assert from 'node:assert/strict';
import { readOpenEditor, recoverEditor } from '../src/app/editorRecovery';

const original = { hash: 'original', revision: 1, text: 'Original wording' };
const latest = { hash: 'latest', revision: 2, text: 'New authored wording' };

test('untouched open and recovered editors adopt later source text without creating an edit', () => {
  const result = recoverEditor({ targetId: 'body:text', text: original.text, baseline: original }, latest);
  assert.equal(result.record.text, latest.text);
  assert.deepEqual(result.record.baseline, latest);
  assert.equal(result.stage, false);
  assert.equal(result.error, undefined);
});

test('modified stale and legacy recovery text stays visible without staging against newer source', () => {
  for (const record of [
    { targetId: 'body:text', text: 'My rejected correction', baseline: original },
    { targetId: 'body:text', text: 'A legacy correction' },
  ]) {
    const result = recoverEditor(record, latest);
    assert.deepEqual(result.record, record);
    assert.equal(result.stage, false);
    assert.ok(result.error);
  }
});

test('same-version recovered text can resume, but an unchanged PDF cannot hide a newer source revision', () => {
  const record = { targetId: 'body:text', text: 'My correction', baseline: original };
  assert.equal(recoverEditor(record, original).stage, true);
  assert.ok(recoverEditor(record, { ...original, revision: 2 }).error);
});

test('accepted pending text keeps its own source guards and survives a successful draft refresh', () => {
  const record = { targetId: 'body:text', text: 'Accepted correction', baseline: original };
  const pending = { ...original, text: record.text };
  const restored = recoverEditor(record, latest, pending);
  assert.equal(restored.stage, false);
  assert.equal(restored.record.baseline?.revision, original.revision);
  assert.equal(restored.error, undefined);
  const refreshed = recoverEditor(restored.record, latest, { ...latest, text: record.text });
  assert.equal(refreshed.record.text, record.text);
  assert.equal(refreshed.record.baseline?.revision, latest.revision);
  assert.equal(refreshed.stage, false);
  assert.ok(recoverEditor({ ...record, text: 'Rejected extra text' }, latest, pending).error);
});

test('malformed provenance is treated as legacy, while untouched recovery cannot undo an accepted draft', () => {
  const legacy = readOpenEditor({ targetId: 'body:text', text: 'Old text', baseline: { hash: 'x', revision: '1', text: 'Old text' } })!;
  assert.equal(legacy.baseline, undefined);
  assert.equal(recoverEditor(legacy, latest).stage, false);
  const pending = { ...original, text: 'Newer accepted draft' };
  const recovered = recoverEditor({ targetId: 'body:text', text: original.text, baseline: original }, original, pending);
  assert.equal(recovered.record.text, pending.text);
  assert.equal(recovered.stage, false);
  const unchangedLegacy = recoverEditor({ targetId: 'body:text', text: latest.text }, latest);
  assert.equal(unchangedLegacy.error, undefined);
  assert.equal(unchangedLegacy.stage, false);
  assert.deepEqual(unchangedLegacy.record.baseline, latest);
});

test('typing back to the original value removes the pending change instead of restoring its newer draft', () => {
  const result = recoverEditor({ targetId: 'body:text', text: original.text, baseline: original }, original, { ...original, text: 'Accepted draft' }, true);
  assert.equal(result.record.text, original.text);
  assert.equal(result.stage, true);
  assert.equal(result.error, undefined);
});

test('typing on an older version retains even baseline-equal text for review instead of adopting new wording', () => {
  const record = { targetId: 'body:text', text: original.text, baseline: original };
  const result = recoverEditor(record, latest, undefined, true);
  assert.deepEqual(result.record, record);
  assert.equal(result.stage, false);
  assert.ok(result.error);
  const reviewedLegacy = recoverEditor({ targetId: 'body:text', text: latest.text }, latest, undefined, true);
  assert.deepEqual(reviewedLegacy.record.baseline, latest);
  assert.equal(reviewedLegacy.error, undefined);
});
