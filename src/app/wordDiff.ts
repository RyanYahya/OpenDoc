/**
 * Word-level differences between two wordings, for the history panel's Then/Now view.
 * Words, spaces, and punctuation are separate tokens, so Arabic, Latin, and mixed text
 * compare word by word, and a changed comma does not mark its whole sentence.
 */
export type DiffChunk =
  | { type: 'same'; text: string }
  | { type: 'change'; removed: string; added: string }
  /** Unchanged words left out of a compact view. */
  | { type: 'gap' };

export interface WordDiff {
  chunks: DiffChunk[];
  /** Share of the longer wording, by characters, that both versions keep. */
  kept: number;
}

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'word' }) : undefined;
const fallbackTokens = /\s+|[\p{L}\p{M}\p{N}_‌‍ـ'’]+|[^\s\p{L}\p{M}\p{N}]/gu;
const space = /^\s+$/u;
const wordLike = /[\p{L}\p{N}]/u;

/** Split text into words, whitespace runs, and punctuation. Joining the tokens returns the text. */
export function wordTokens(text: string): string[] {
  if (!text) return [];
  if (!segmenter) return text.match(fallbackTokens) ?? [];
  const tokens: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    // Keep each whitespace run whole so spacing changes compare as one token.
    if (space.test(segment) && tokens.length && space.test(tokens.at(-1)!)) tokens[tokens.length - 1] += segment;
    else tokens.push(segment);
  }
  return tokens;
}

// Any two whitespace runs are equal: spacing alone is not a wording change.
const key = (token: string) => space.test(token) ? ' ' : token;
const maxCells = 250_000;

type Op = { type: 'same' | 'removed' | 'added'; text: string };

function diffTokens(a: string[], b: string[]): Op[] {
  let start = 0;
  while (start < a.length && start < b.length && key(a[start]) === key(b[start])) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && key(a[endA - 1]) === key(b[endB - 1])) { endA--; endB--; }
  const ops: Op[] = b.slice(0, start).map(text => ({ type: 'same', text }));
  const midA = a.slice(start, endA), midB = b.slice(start, endB);
  if (midA.length * midB.length > maxCells) {
    // Very long rewrites skip the alignment; the whole middle reads as replaced.
    ops.push(...midA.map(text => ({ type: 'removed' as const, text })), ...midB.map(text => ({ type: 'added' as const, text })));
  } else {
    // Longest common subsequence over the differing middle.
    const n = midA.length, m = midB.length;
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      table[i][j] = key(midA[i]) === key(midB[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && key(midA[i]) === key(midB[j])) { ops.push({ type: 'same', text: midB[j] }); i++; j++; }
      else if (j < m && (i === n || table[i][j + 1] >= table[i + 1][j])) ops.push({ type: 'added', text: midB[j++] });
      else ops.push({ type: 'removed', text: midA[i++] });
    }
  }
  ops.push(...b.slice(endB).map(text => ({ type: 'same' as const, text })));
  return ops;
}

/**
 * Compare two wordings word by word. Unchanged spaces and punctuation between two changes
 * join them, so "the quick fox" → "a slow fox" reads as one replacement, not four.
 */
export function diffWords(before: string, after: string): WordDiff {
  const ops = diffTokens(wordTokens(before), wordTokens(after));
  const chunks: DiffChunk[] = [];
  for (let index = 0; index < ops.length; index++) {
    const op = ops[index];
    const last = chunks.at(-1);
    if (op.type === 'same') {
      // A run of only spaces or punctuation between changes belongs to the change.
      let end = index;
      while (end < ops.length && ops[end].type === 'same' && !wordLike.test(ops[end].text)) end++;
      if (last?.type === 'change' && end > index && end < ops.length && ops[end].type !== 'same') {
        const text = ops.slice(index, end).map(item => item.text).join('');
        last.removed += text; last.added += text;
        index = end - 1;
        continue;
      }
      if (last?.type === 'same') last.text += op.text; else chunks.push({ type: 'same', text: op.text });
    } else {
      const change = last?.type === 'change' ? last : (chunks.push({ type: 'change', removed: '', added: '' }), chunks.at(-1) as Extract<DiffChunk, { type: 'change' }>);
      if (op.type === 'removed') change.removed += op.text; else change.added += op.text;
    }
  }
  const shared = chunks.reduce((total, chunk) => total + (chunk.type === 'same' ? chunk.text.trim().length : 0), 0);
  const longest = Math.max(before.trim().length, after.trim().length);
  return { chunks, kept: longest ? Math.min(1, shared / longest) : 1 };
}

/** True when some words differ, as opposed to spacing only. */
export const hasChanges = (diff: WordDiff) => diff.chunks.some(chunk => chunk.type === 'change' && (chunk.removed.trim() || chunk.added.trim()));

/** Keep the first or last `count` words of a text, at token boundaries. */
function keepWords(text: string, count: number, from: 'start' | 'end') {
  const tokens = wordTokens(text);
  const order = from === 'start' ? tokens : [...tokens].reverse();
  let words = 0, length = 0;
  for (const token of order) {
    if (wordLike.test(token) && ++words > count) break;
    length++;
  }
  const kept = order.slice(0, length);
  // Context ends at a word, so a gap never sits beside stray punctuation or spaces.
  while (kept.length && !wordLike.test(kept.at(-1)!)) kept.pop();
  return (from === 'start' ? kept : kept.reverse()).join('');
}

const countWords = (text: string) => wordTokens(text).filter(token => wordLike.test(token)).length;

/**
 * A compact view of a long comparison: each change keeps `context` words on either side,
 * and longer unchanged stretches become gaps. Both wordings share the same gaps.
 */
export function compactDiff(chunks: DiffChunk[], context = 6): DiffChunk[] {
  const result: DiffChunk[] = [];
  chunks.forEach((chunk, index) => {
    if (chunk.type !== 'same') { result.push(chunk); return; }
    const first = index === 0, last = index === chunks.length - 1;
    const limit = first || last ? context : context * 2 + 2;
    if (countWords(chunk.text) <= limit) { result.push(chunk); return; }
    if (!first) result.push({ type: 'same', text: keepWords(chunk.text, context, 'start') });
    result.push({ type: 'gap' });
    if (!last) result.push({ type: 'same', text: keepWords(chunk.text, context, 'end') });
  });
  return result;
}

/** True when compacting leaves out words, so a "Show full text" control is worth offering. */
export const compacts = (chunks: DiffChunk[], context = 6) => compactDiff(chunks, context).some(chunk => chunk.type === 'gap');
