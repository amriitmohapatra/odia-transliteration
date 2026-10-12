/**
 * The phrase table (core/data/phrases.tsv) for the Meanings panel: search by
 * English meaning, by a typed roman spelling, by Odia text, or by group name.
 * It never feeds the phonetic ranker.
 */
import { PHRASE_CATEGORIES, parsePhrases, type Phrase, type PhraseCategory } from '@odia/core';
import { canonical } from '../../../core/src/normalize.js';

export { parsePhrases, PHRASE_CATEGORIES };
export type { Phrase, PhraseCategory };

/** Group headings, in the order the panel lists them. */
export const CATEGORY_LABEL: Readonly<Record<PhraseCategory, string>> = {
  greeting: 'Greetings',
  wish: 'Wishes',
  festival: 'Festival wishes',
  you: 'The three words for "you"',
  family: 'Family',
  everyday: 'Everyday',
};

/** Words that name a group: "festival", "festivals", "greetings", "you"... */
const CATEGORY_WORDS: Readonly<Record<string, PhraseCategory>> = {
  greeting: 'greeting', greetings: 'greeting', hello: 'greeting',
  wish: 'wish', wishes: 'wish',
  festival: 'festival', festivals: 'festival',
  you: 'you',
  family: 'family', relatives: 'family',
  everyday: 'everyday',
};

const ODIA = /[\u0B00-\u0B7F]/;

export function normalizeQuery(query: string): string {
  return query.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface PhraseHit {
  phrase: Phrase;
  /** True for an exact key, an exact meaning word or a whole group. */
  exact: boolean;
}

/**
 * An empty query lists every phrase, group by group. A phrase is dropped
 * when any of its Odia words is hidden (the kids edition passes `hide`).
 */
export function searchPhrases(
  phrases: readonly Phrase[],
  query: string,
  hide: (word: string) => boolean = () => false,
): PhraseHit[] {
  const visible = phrases.filter((p) => !canonical(p.odia).split(/[ ,?!\u0964\u0965]+/).some((w) => w && hide(w)));
  const order = (p: Phrase) => PHRASE_CATEGORIES.indexOf(p.category);
  const q = normalizeQuery(query);
  if (!q) return [...visible].sort((a, b) => order(a) - order(b)).map((phrase) => ({ phrase, exact: true }));

  if (ODIA.test(q)) {
    const odia = canonical(q);
    return visible.filter((p) => p.odia.includes(odia)).map((phrase) => ({ phrase, exact: phrase.odia === odia }));
  }

  const group = CATEGORY_WORDS[q];
  const hits: PhraseHit[] = [];
  for (const phrase of visible) {
    const words = phrase.meaning.toLowerCase().split(/[^a-z']+/).filter(Boolean);
    const meaning = phrase.meaning.toLowerCase();
    const exact = phrase.category === group || phrase.keys.includes(q) || words.includes(q) ||
      (q.includes(' ') && meaning.includes(q));
    const near = !exact && q.length >= 2 &&
      (phrase.keys.some((k) => k.startsWith(q)) || (q.length >= 3 && words.some((w) => w.startsWith(q))));
    if (exact || near) hits.push({ phrase, exact });
  }
  return hits.sort((a, b) => Number(b.exact) - Number(a.exact) || order(a.phrase) - order(b.phrase));
}
