import type { DocumentSelection, TextTarget } from '../shared/selection';

export interface PdfTextSpan {
  text: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfSpanMapping {
  targetId: string;
  blockId: string;
  /** Logical bounds for each PDF character, including normalized whitespace. */
  starts: number[];
  ends: number[];
  /** Layout-only glyphs have an empty logical range and are never editable. */
  synthetic?: boolean[];
}

/** Invert a proved logical range without changing the browser's selection. */
export function pdfSpanRangeForSelection(mapping: PdfSpanMapping | undefined, selection: DocumentSelection | null | undefined): { start: number; end: number } | null {
  if (!mapping || mapping.targetId !== selection?.targetId || mapping.blockId !== selection.blockId
    || !Number.isInteger(selection.start) || !Number.isInteger(selection.end) || selection.end! <= selection.start!) return null;
  let start = -1, end = -1;
  for (let index = 0; index < mapping.starts.length; index += 1) {
    const overlaps = mapping.ends[index] > selection.start! && mapping.starts[index] < selection.end!;
    const crossedHyphen = mapping.synthetic?.[index] && mapping.starts[index] > selection.start! && mapping.starts[index] < selection.end!;
    if (!overlaps && !crossedHyphen) continue;
    if (start < 0) start = index;
    end = index + 1;
  }
  return start < 0 ? null : { start, end };
}

function characters(text: string) {
  const offsets: number[] = [];
  let value = '';
  // PDF text runs may omit spaces between separately painted words. Align the
  // complete line's non-whitespace characters, preserving original offsets.
  // No case folding, punctuation substitution, or fuzzy text matching occurs.
  for (let index = 0; index < text.length; index += 1) {
    if (/\s/u.test(text[index])) continue;
    value += text[index];
    offsets.push(index);
  }
  return { value, offsets };
}

function sharesLine(span: PdfTextSpan, line: TextTarget['lines'][number]) {
  if (span.page !== line.page) return false;
  const middle = span.y + span.height / 2;
  const lineMiddle = line.y + line.height / 2;
  const verticalDistance = Math.abs(middle - lineMiddle);
  const overlap = Math.min(span.x + span.width, line.x + line.width) - Math.max(span.x, line.x);
  return verticalDistance <= Math.max(span.height, line.height) * 0.55 + 1
    && overlap >= Math.min(span.width, line.width) * 0.5 - 1;
}

/**
 * Map complete PDF lines, then retain mappings only where the geometry and
 * ordered text identify one target. A repeated phrase alone is insufficient.
 */
export function mapPdfTextSpans(spans: PdfTextSpan[], targets: TextTarget[]): Array<PdfSpanMapping | undefined> {
  const proposals: PdfSpanMapping[][] = spans.map(() => []);
  const pages = new Set(spans.map(span => span.page));
  const paintedCharacters = spans.map(span => characters(span.text).value);
  for (const target of targets) {
    for (const line of target.lines) {
      if (!pages.has(line.page)) continue;
      if (line.start < 0 || line.end > target.text.length || line.end <= line.start) continue;
      const logical = characters(target.text.slice(line.start, line.end));
      const laidOut = characters(line.text).value;
      const discretionaryHyphen = laidOut.endsWith('-') && laidOut.slice(0, -1) === logical.value;
      if (!logical.value || (logical.value !== laidOut && !discretionaryHyphen)) continue;
      const indices = spans.flatMap((span, index) => paintedCharacters[index] && sharesLine(span, line) ? [index] : []);
      const painted = indices.map(index => spans[index].text).join('');
      if (characters(painted).value !== laidOut) continue;

      let logicalIndex = 0;
      for (const index of indices) {
        const value = spans[index].text;
        const starts: number[] = [];
        const ends: number[] = [];
        const synthetic: boolean[] = [];
        for (let offset = 0; offset < value.length; offset += 1) {
          synthetic.push(false);
          if (/\s/u.test(value[offset])) {
            const previous = logical.offsets[logicalIndex - 1];
            const next = logical.offsets[logicalIndex];
            starts.push(line.start + (previous === undefined ? 0 : previous + 1));
            ends.push(line.start + (next ?? line.end - line.start));
          } else if (discretionaryHyphen && logicalIndex === logical.offsets.length && value[offset] === '-') {
            // Only omit a final hyphen proved by the complete layout line and
            // logical slice. Authored hyphens retain their normal source range.
            starts.push(line.end);
            ends.push(line.end);
            synthetic[offset] = true;
          } else {
            starts.push(line.start + logical.offsets[logicalIndex]);
            ends.push(line.start + logical.offsets[logicalIndex] + 1);
            logicalIndex += 1;
          }
        }
        proposals[index].push({ targetId: target.id, blockId: target.blockId, starts, ends,
          ...(synthetic.some(Boolean) ? { synthetic } : {}) });
      }
    }
  }
  return proposals.map(matches => matches.length === 1 ? matches[0] : undefined);
}
