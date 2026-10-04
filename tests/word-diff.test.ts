import test from 'node:test';
import assert from 'node:assert/strict';
import { compactDiff, compacts, diffWords, hasChanges, wordTokens, type DiffChunk } from '../src/shared/word-diff';

const changes = (chunks: DiffChunk[]) => chunks.flatMap(chunk => chunk.type === 'change' ? [[chunk.removed, chunk.added]] : []);
const side = (chunks: DiffChunk[], which: 'removed' | 'added') => chunks.map(chunk => chunk.type === 'same' ? chunk.text : chunk.type === 'change' ? chunk[which] : '…').join('');

test('tokens keep words, spaces, and punctuation apart and rejoin to the original text', () => {
  for (const text of ['Don’t stop, e-mail 3.5% now.', 'مرحبا،  بك في  OpenDoc!', 'Plan (الخطة) – v2', '']) assert.equal(wordTokens(text).join(''), text);
  assert.deepEqual(wordTokens('Hello, world.').filter(token => token.trim()), ['Hello', ',', 'world', '.']);
});

test('Latin text marks only the words that changed, and both sides rebuild the originals', () => {
  const before = 'The current lease ends in December, and the new floor gives each team its own room.';
  const after = 'The current lease ends on 31 December. The new floor gives each team its own room.';
  const { chunks } = diffWords(before, after);
  assert.equal(side(chunks, 'removed'), before);
  assert.equal(side(chunks, 'added'), after);
  assert.deepEqual(changes(chunks), [['in', 'on 31'], [', and the', '. The']]);
  assert.ok(hasChanges(diffWords(before, after)));
});

test('adjacent changes separated only by spaces or punctuation read as one replacement', () => {
  assert.deepEqual(changes(diffWords('The quick brown fox.', 'A slow brown fox.').chunks), [['The quick', 'A slow']]);
});

test('Arabic and mixed-script text compare word by word', () => {
  const arabic = diffWords('يبدأ الانتقال في نوفمبر القادم.', 'يبدأ الانتقال في ديسمبر القادم.');
  assert.deepEqual(changes(arabic.chunks), [['نوفمبر', 'ديسمبر']]);
  const mixed = diffWords('The report (التقرير) is ready for Ahmed.', 'The report (التقرير النهائي) is ready for Sara.');
  assert.deepEqual(changes(mixed.chunks), [['', ' النهائي'], ['Ahmed', 'Sara']]);
  assert.equal(side(mixed.chunks, 'added'), 'The report (التقرير النهائي) is ready for Sara.');
  // Arabic punctuation is its own token, like Latin punctuation.
  assert.deepEqual(changes(diffWords('أولاً، ثم ثانياً', 'أولاً؛ ثم ثانياً').chunks), [['،', '؛']]);
});

test('punctuation-only and whitespace-only edits', () => {
  assert.deepEqual(changes(diffWords('Ready.', 'Ready!').chunks), [['.', '!']]);
  const spacing = diffWords('Two  spaces\tand a tab', 'Two spaces and a tab');
  assert.equal(hasChanges(spacing), false, 'Spacing alone is not a wording change.');
  assert.deepEqual(spacing.chunks, [{ type: 'same', text: 'Two spaces and a tab' }]);
});

test('added, removed, identical, and rewritten wording', () => {
  assert.deepEqual(diffWords('', 'New text').chunks, [{ type: 'change', removed: '', added: 'New text' }]);
  assert.deepEqual(diffWords('Old text', '').chunks, [{ type: 'change', removed: 'Old text', added: '' }]);
  assert.deepEqual(diffWords('Same', 'Same'), { chunks: [{ type: 'same', text: 'Same' }], kept: 1 });
  assert.ok(diffWords('Completely different words here', 'Nothing alike remains at all').kept < 0.2, 'A rewrite keeps little, so it need not be marked word by word.');
});

test('compact view keeps context around each change and shares gaps between both sides', () => {
  const words = Array.from({ length: 40 }, (_, index) => `w${index}`);
  const before = `${words.join(' ')}.`;
  const after = before.replace('w5 ', 'five ').replace('w30', 'thirty');
  const { chunks } = diffWords(before, after);
  const compact = compactDiff(chunks, 3);
  assert.ok(compacts(chunks, 3));
  assert.equal(side(compact, 'removed'), '…w2 w3 w4 w5 w6 w7 w8…w27 w28 w29 w30 w31 w32 w33…');
  assert.equal(side(compact, 'added'), '…w2 w3 w4 five w6 w7 w8…w27 w28 w29 thirty w31 w32 w33…');
  assert.equal(compact[0].type, 'gap', 'Long unchanged openings collapse.');
  // Context starts and ends at a word, never at stray punctuation beside a gap.
  const sentences = diffWords('One two three four five six seven eight nine. Ten eleven twelve.', 'One two three four five six seven eight nine. Ten eleven thirteen.').chunks;
  assert.equal(side(compactDiff(sentences, 2), 'added'), '…Ten eleven thirteen.');
  assert.equal(compacts(diffWords('Short and sweet.', 'Short and neat.').chunks, 3), false, 'Short text is shown in full.');
});
