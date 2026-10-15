/** Finding the Odia word at a position in a text node (content script). Kept apart from describe.ts so the content script stays small. */

/** Odia letters (the block, plus the joiners) — a run of these is one word. */
export const ODIA_LETTER = /[\u0B00-\u0B7F\u200C\u200D]/;

/**
 * The Odia word around position `offset` in `text`, or null. The danda
 * (U+0964, U+0965) is outside the Odia block, so it ends a word.
 */
export function wordAt(text: string, offset: number): { start: number; end: number; word: string } | null {
  const at = (i: number): boolean => i >= 0 && i < text.length && ODIA_LETTER.test(text.charAt(i));
  let start = offset;
  // The caret can sit just after the last letter of the word under the pointer.
  if (!at(start) && at(start - 1)) start -= 1;
  if (!at(start)) return null;
  let end = start;
  while (at(start - 1)) start -= 1;
  while (at(end)) end += 1;
  const word = text.slice(start, end);
  // A lone sign (a vowel sign or virama with no letter) is not a word; a run of
  // Odia digits is (the card reads it as a number).
  return /[\u0B05-\u0B39\u0B5C-\u0B61\u0B71\u0B66-\u0B6F]/.test(word) ? { start, end, word } : null;
}

/**
 * The Odia word just before position `start`, separated from it by one space
 * (or a non-breaking space) only; '' otherwise. A danda, a comma or a line
 * break between them means a new phrase, so no word is returned.
 */
export function wordBefore(text: string, start: number): string {
  const gap = text.charAt(start - 1);
  if (gap !== ' ' && gap !== '\u00A0') return '';
  const found = wordAt(text, start - 2);
  return found !== null && found.end === start - 1 ? found.word : '';
}
