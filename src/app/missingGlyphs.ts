import type { ReviewIssue } from '../shared/types';

export interface MissingGlyphs {
  /** Up to six characters, each with its code point label, in the order the review found them. */
  characters: { character: string; code: string }[];
  /** Characters beyond those listed. */
  more: number;
  /** Pages or slides where they appear, ascending. */
  pages: number[];
  /** The first affected location, for navigation. */
  first?: { page?: number; blockId?: string };
}

const code = (character: string) => `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;

/** Summarize the render's missing-glyphs warnings for the reader notice. */
export function missingGlyphs(issues: ReviewIssue[]): MissingGlyphs | null {
  const found = issues.filter(issue => issue.code === 'missing-glyphs');
  if (!found.length) return null;
  const characters = [...new Set(found.flatMap(issue => issue.characters ?? []))];
  const pages = [...new Set(found.flatMap(issue => issue.page ? [issue.page] : []))].sort((a, b) => a - b);
  const first = found.find(issue => issue.page || issue.blockId);
  return {
    characters: characters.slice(0, 6).map(character => ({ character, code: code(character) })),
    more: Math.max(0, characters.length - 6),
    pages,
    ...(first ? { first: { page: first.page, blockId: first.blockId } } : {}),
  };
}

/** “slide 2”, “pages 2 and 5”, “pages 1, 3, and 4”. */
export function pageList(label: string, pages: number[]): string {
  const noun = label.toLowerCase() + (pages.length === 1 ? '' : 's');
  if (pages.length <= 2) return `${noun} ${pages.join(' and ')}`;
  return `${noun} ${pages.slice(0, -1).join(', ')}, and ${pages.at(-1)}`;
}
