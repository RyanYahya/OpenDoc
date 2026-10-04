import test from 'node:test';
import assert from 'node:assert/strict';
import { carryRange, isPhrase, nearestBox, phraseFromText, phraseSelection, savedPhrase, trimRange, wordRange } from '../src/app/phraseSelection';
import { anchorForSelection, resolveCommentAnchor } from '../src/shared/anchors';
import type { TextTarget } from '../src/shared/selection';
import type { RenderArtifact } from '../src/shared/types';

function target(text: string, id = 'opening:text'): TextTarget {
  return { id, blockId: 'opening', slot: 'text', text, runs: [{ start: 0, end: text.length }],
    lines: [{ page: 1, x: 40, y: 80, width: 300, height: 20, text: text.slice(0, 20), start: 0, end: 20 },
      { page: 2, x: 40, y: 40, width: 300, height: 20, text: text.slice(20), start: 20, end: text.length }] };
}

test('a drag widens to the whole words it touches, in Latin and Arabic text', () => {
  const text = 'Quarterly revenue grew, beyond the forecast.';
  assert.deepEqual(wordRange(text, 12, 19), { start: 10, end: 22 }, 'Partial words widen to “revenue grew”.');
  assert.deepEqual(wordRange(text, 22, 24), { start: 22, end: 23 }, 'Punctuation and spaces are not widened into words.');
  assert.equal(wordRange(text, 9, 10), undefined, 'Whitespace alone is not a phrase.');
  const arabic = 'نمت الإيرادات هذا العام';
  const range = wordRange(arabic, 5, 6)!;
  assert.equal(arabic.slice(range.start, range.end), 'الإيرادات');
  assert.deepEqual(trimRange('  two words  ', 13, 0), { start: 2, end: 11 }, 'Reversed ranges are normalized and trimmed.');
});

test('a phrase is part of one text component; the whole text remains a component selection', () => {
  const opening = target('The opening phrase continues onto the next page.');
  const phrase = phraseSelection(opening, { start: 4, end: 18 }, 1, 'preview')!;
  assert.deepEqual(phrase, { blockId: 'opening', targetId: 'opening:text', start: 4, end: 18, quote: 'opening phrase', page: 1, renderHash: 'preview' });
  assert.equal(phraseSelection(opening, { start: 29, end: 33 }, 1)?.page, 2, 'The page follows the line where the phrase begins.');
  assert.equal(phraseSelection(opening, { start: 0, end: opening.text.length }, 1), undefined);
  assert.equal(phraseSelection(opening, { start: 4, end: 400 }, 1), undefined);
  assert.equal(isPhrase(phrase, opening), true);
  assert.equal(isPhrase({ ...phrase, start: 0, end: opening.text.length }, opening), false);
  assert.equal(isPhrase({ blockId: 'opening', page: 1 }, opening), false);
  assert.equal(isPhrase(phrase, target(opening.text, 'other:text')), false);
});

test('ranges carry across versions only through unchanged wording', () => {
  const before = 'The quick fox jumps.', after = 'The quick brown fox jumps.';
  assert.deepEqual(carryRange(before, after, { start: 4, end: 9 }), { start: 4, end: 9 });
  assert.deepEqual(carryRange(before, after, { start: 10, end: 19 }), { start: 16, end: 25 }, 'Text after the edit shifts to “fox jumps”.');
  assert.equal(carryRange(before, after, { start: 4, end: 13 }), undefined, 'A range spanning the edit has no proven counterpart.');
  assert.equal(carryRange(before, before, { start: 4, end: 30 }), undefined);
});

test('the text editor selection becomes a phrase in the displayed text', () => {
  const shown = target('Revenue grew in every region this year.');
  const draft = 'Revenue grew strongly in every region this year.';
  const phrase = phraseFromText(shown, draft, draft.indexOf('every'), draft.indexOf(' this'), 1)!;
  assert.equal(phrase.quote, 'every region');
  assert.equal(phrase.start, shown.text.indexOf('every'));
  assert.equal(phraseFromText(shown, draft, draft.indexOf('strongly'), draft.indexOf(' in'), 1), undefined, 'Unsaved words cannot anchor feedback.');
  assert.equal(phraseFromText(shown, shown.text, 0, shown.text.length, 1), undefined, 'Selecting everything comments on the component.');
  assert.equal(phraseFromText(shown, shown.text, 7, 8, 1), undefined, 'A collapsed or whitespace selection comments on the component.');
});

test('phrase comments anchor against saved text while a draft is previewed', () => {
  const saved = target('Revenue grew in every region this year.');
  const previewed = target('Revenue grew strongly in every region this year.');
  const selection = phraseSelection(previewed, { start: previewed.text.indexOf('every'), end: previewed.text.indexOf(' this') }, 1)!;
  assert.deepEqual(savedPhrase(previewed, saved, selection), { targetId: 'opening:text', start: 16, end: 28, quote: 'every region' });
  assert.equal(savedPhrase(previewed, saved, phraseSelection(previewed, { start: 13, end: 21 }, 1)), undefined);
  assert.equal(savedPhrase(previewed, saved, { ...selection, quote: 'stale' }), undefined);
  assert.equal(savedPhrase(saved, saved, { ...selection, start: 0, end: saved.text.length, quote: saved.text }), undefined);
});

test('a phrase made from the page anchors durably, and positional fields keep only the quote', () => {
  const text = 'Revenue grew in every region this year.';
  const artifact = (stable?: boolean): RenderArtifact => ({
    meta: { title: 'Proof', description: '', theme: 'neutral' }, hash: 'pdf-hash', renderedAt: '',
    blocks: { opening: { id: 'opening', kind: 'paragraph', text } },
    pages: [{ width: 595, height: 842, fragments: [{ id: 'opening', x: 40, y: 80, width: 300, height: 40 }] }],
    textTargets: [{ ...target(text), ...(stable === undefined ? {} : { stable }) }],
  });
  const range = wordRange(text, text.indexOf('very'), text.indexOf('very') + 1)!;
  const selection = phraseSelection(artifact().textTargets![0], range, 1)!;
  assert.equal(selection.quote, 'every');
  const anchor = anchorForSelection(artifact(), selection)!;
  assert.deepEqual([anchor.quote, anchor.prefix, anchor.suffix], ['every', 'Revenue grew in ', ' region this year.']);
  assert.equal(resolveCommentAnchor(artifact(), { blockId: 'opening', quote: anchor.quote, anchor }).selection?.start, selection.start);
  assert.equal(anchorForSelection(artifact(false), selection), undefined, 'Anonymous positional slots fall back to block-level feedback.');
});

test('hit testing prefers the pointer’s line, then the nearest character', () => {
  const box = (left: number, top: number) => ({ left, top, right: left + 10, bottom: top + 10 });
  assert.equal(nearestBox([box(0, 0), box(20, 0), box(0, 20)], 24, 5), 1);
  assert.equal(nearestBox([box(0, 0), box(200, 18)], 150, 22), 1, 'A far character on the same line beats a near one on another line.');
  assert.equal(nearestBox([null, box(0, 0)], 5, 5), 1);
  assert.equal(nearestBox([{ left: 0, top: 0, right: 0, bottom: 10 }], 0, 5), -1, 'Empty boxes cannot be hit.');
});
