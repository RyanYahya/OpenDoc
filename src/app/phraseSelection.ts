import type { DocumentSelection, TextTarget } from '../shared/selection';

export interface TextRange { start: number; end: number }

const words = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter(undefined, { granularity: 'word' }) : undefined;

/** Drop surrounding whitespace. Whitespace alone is not a phrase. */
export function trimRange(text: string, start: number, end: number): TextRange | undefined {
  let from = Math.max(0, Math.min(start, end)), to = Math.min(text.length, Math.max(start, end));
  while (from < to && /\s/u.test(text[from])) from += 1;
  while (to > from && /\s/u.test(text[to - 1])) to -= 1;
  return to > from ? { start: from, end: to } : undefined;
}

/** Widen a pointer range to the whole words it touches, in any script. */
export function wordRange(text: string, start: number, end: number): TextRange | undefined {
  const range = trimRange(text, start, end);
  if (!range || !words) return range;
  let { start: from, end: to } = range;
  for (const { segment, index, isWordLike } of words.segment(text)) {
    if (!isWordLike) continue;
    const segmentEnd = index + segment.length;
    if (index < from && segmentEnd > from) from = index;
    if (index < to && segmentEnd > to) to = segmentEnd;
  }
  return { start: from, end: to };
}

/**
 * Carry a range between two versions of the same text when it lies wholly in
 * their unchanged leading or trailing part. A range that touches changed
 * wording has no proven counterpart.
 */
export function carryRange(from: string, to: string, range: TextRange): TextRange | undefined {
  if (range.start < 0 || range.end > from.length || range.end <= range.start) return undefined;
  if (from === to) return range;
  const limit = Math.min(from.length, to.length);
  let prefix = 0;
  while (prefix < limit && from[prefix] === to[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < limit - prefix && from[from.length - 1 - suffix] === to[to.length - 1 - suffix]) suffix += 1;
  if (range.end <= prefix) return range;
  const shift = to.length - from.length;
  if (range.start >= from.length - suffix) return { start: range.start + shift, end: range.end + shift };
  return undefined;
}

/** True when a selection covers part, not all, of its text component. */
export function isPhrase(selection: DocumentSelection | null | undefined, target: TextTarget | undefined): boolean {
  return !!selection && !!target && selection.targetId === target.id && Number.isInteger(selection.start) && Number.isInteger(selection.end)
    && selection.end! > selection.start! && (selection.start! > 0 || selection.end! < target.text.length);
}

/** A phrase within one text component. The whole text, or none of it, stays a component selection. */
export function phraseSelection(target: TextTarget, range: TextRange | undefined, page: number, renderHash?: string): DocumentSelection | undefined {
  if (!range || range.start < 0 || range.end > target.text.length || range.end <= range.start
    || (range.start === 0 && range.end === target.text.length)) return undefined;
  const line = target.lines.find(item => item.start <= range.start && item.end > range.start);
  return { blockId: target.blockId, targetId: target.id, start: range.start, end: range.end,
    quote: target.text.slice(range.start, range.end), page: line?.page ?? page, ...(renderHash ? { renderHash } : {}) };
}

/** A range chosen in another copy of the component's text, such as the text editor's draft. */
export function phraseFromText(target: TextTarget, text: string, start: number, end: number, page: number, renderHash?: string) {
  const range = trimRange(text, start, end);
  return phraseSelection(target, range && carryRange(text, target.text, range), page, renderHash);
}

/**
 * Comments anchor against the saved document. A phrase chosen in previewed
 * draft wording keeps its range only where that wording is unchanged.
 */
export function savedPhrase(displayed: TextTarget | undefined, saved: TextTarget | undefined, selection: DocumentSelection | null | undefined) {
  if (!displayed || !saved || displayed.id !== saved.id || !isPhrase(selection, displayed)
    || displayed.text.slice(selection!.start, selection!.end) !== selection!.quote) return undefined;
  const range = carryRange(displayed.text, saved.text, { start: selection!.start!, end: selection!.end! });
  return range && { targetId: saved.id, ...range, quote: saved.text.slice(range.start, range.end) };
}

export interface Box { left: number; top: number; right: number; bottom: number }

/** The box nearest a point, preferring the same line over horizontal closeness. */
export function nearestBox(boxes: Array<Box | null | undefined>, x: number, y: number) {
  let best = -1, score = Infinity;
  boxes.forEach((box, index) => {
    if (!box || box.right <= box.left || box.bottom <= box.top) return;
    const dy = Math.max(0, box.top - y, y - box.bottom);
    const dx = Math.max(0, box.left - x, x - box.right);
    const value = dy * 1000 + dx;
    if (value < score) { best = index; score = value; }
  });
  return best;
}
