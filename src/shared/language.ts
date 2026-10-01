/**
 * The language of an item is derived, never stored: OpenDoc counts Arabic-script and Latin
 * letters in its text and weighs them with the item's declared direction and language tag.
 * Digits, punctuation, and symbols count for neither script.
 */
export const languages = [
  { id: 'english', label: 'English' },
  { id: 'arabic', label: 'Arabic' },
  { id: 'bilingual', label: 'Bilingual' },
] as const;
export type Language = typeof languages[number]['id'];

export function isLanguage(value: unknown): value is Language {
  return languages.some(language => language.id === value);
}
export function languageLabel(language: Language) {
  return languages.find(item => item.id === language)!.label;
}
/** `arabic`, `Arabic`, or `العربية` select a language; anything else is undefined. */
export function parseLanguage(value: string): Language | undefined {
  const key = value.trim().toLowerCase();
  if (key === 'العربية' || key === 'ar') return 'arabic';
  if (key === 'en') return 'english';
  return languages.find(language => language.id === key)?.id;
}

export interface ScriptCounts { arabic: number; latin: number }
export interface DeclaredLanguage { lang?: string; direction?: string }

/** Long documents are sampled; their opening text is representative enough to classify. */
const sampleLimit = 200_000;
const arabicLetter = /(?=\p{L})\p{Script=Arabic}/gu;
const latinLetter = /(?=\p{L})\p{Script=Latin}/gu;

export function countScripts(text: string, into: ScriptCounts = { arabic: 0, latin: 0 }): ScriptCounts {
  const sample = text.length > sampleLimit ? text.slice(0, sampleLimit) : text;
  into.arabic += sample.match(arabicLetter)?.length ?? 0;
  into.latin += sample.match(latinLetter)?.length ?? 0;
  return into;
}

/** Below this many letters, the declaration decides rather than the text. */
export const minimumLetters = 24;

export function declaresArabic({ lang, direction }: DeclaredLanguage = {}) {
  return direction === 'rtl' || /^ar(?:-|$)/i.test(lang ?? '');
}

/**
 * - With fewer than {@link minimumLetters} letters, text mostly in Arabic script is `arabic`;
 *   otherwise an item declared right-to-left or `ar` is `arabic` and anything else `english`.
 * - Otherwise the Arabic share of letters decides: at least 75% (60% when Arabic is declared)
 *   is `arabic`, below 15% (5% when Arabic is declared) is `english`, and anything between is
 *   `bilingual`. Substantial text outweighs a declaration, so a right-to-left item written only
 *   in English is `english`.
 */
export function classifyLanguage({ arabic, latin }: ScriptCounts, declared: DeclaredLanguage = {}): Language {
  const arabicDeclared = declaresArabic(declared);
  const letters = arabic + latin;
  if (letters < minimumLetters) return (arabic > 0 && arabic >= latin) || (arabic === 0 && arabicDeclared) ? 'arabic' : 'english';
  const share = arabic / letters;
  if (share >= (arabicDeclared ? 0.6 : 0.75)) return 'arabic';
  if (share < (arabicDeclared ? 0.05 : 0.15)) return 'english';
  return 'bilingual';
}

/** A theme has no text of its own: its declared direction and language decide. */
export function declaredLanguage(declared: DeclaredLanguage): Language {
  if (!declaresArabic(declared)) return 'english';
  return declared.direction === 'auto' ? 'bilingual' : 'arabic';
}
