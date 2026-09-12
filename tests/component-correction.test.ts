import test from 'node:test';
import assert from 'node:assert/strict';
import { canCorrectComponent, componentCorrection } from '../src/app/componentCorrection';
import type { TextTarget } from '../src/shared/selection';

function target(parts: (string | { generated: string })[]): TextTarget {
  let text = '';
  const runs = parts.map(part => {
    const start = text.length, value = typeof part === 'string' ? part : part.generated;
    text += value;
    return typeof part === 'string'
      ? { start, end: text.length, source: { file: 'documents/proof/index.tsx', digest: 'digest', start, end: text.length, kind: 'jsx-text' as const, value } }
      : { start, end: text.length, protected: true };
  });
  return { id: 'paragraph:text', blockId: 'paragraph', slot: 'text', text, runs, lines: [] };
}

test('whole-component corrections preserve surrounding formatted and generated runs', () => {
  const mixed = target(['Plain ', 'bold', ' ending ', { generated: '[1]' }]);
  assert.equal(canCorrectComponent(mixed), true);
  assert.deepEqual(componentCorrection(mixed, 'Plain stronger ending [1]'), { start: 6, end: 10, replacement: 'stronger' });
  assert.deepEqual(componentCorrection(mixed, 'Plain  ending [1]'), { start: 6, end: 10, replacement: '' });
  assert.equal(componentCorrection(mixed, 'Plain bold ending [2]'), undefined);
  assert.equal(componentCorrection(mixed, 'New stronger ending [1]'), undefined);
  assert.equal(componentCorrection(mixed, 'Plain new bold ending [1]'), undefined, 'An insertion on a formatting boundary must not guess which style owns it.');
});

test('a plain component supports complete replacement, while generated-only components remain read-only', () => {
  const plain = target(['A complete paragraph.']);
  assert.deepEqual(componentCorrection(plain, 'Entirely new text.'), { start: 0, end: 21, replacement: 'Entirely new text.' });
  assert.deepEqual(componentCorrection(plain, ''), { start: 0, end: 21, replacement: '' });
  assert.equal(componentCorrection(plain, plain.text), undefined);
  const generated = target([{ generated: '42' }]);
  assert.equal(canCorrectComponent(generated), false);
  assert.equal(componentCorrection(generated, '43'), undefined);
});
