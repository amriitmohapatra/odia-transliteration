/**
 * Corpus unigram frequencies.
 *
 * `unigrams.tsv` rows are `odiaWord \t logfreq`. The ranker adds this term to
 * prefer spellings that are real Odia words over spellings that merely follow
 * the rules, which is what separates ଓଡ଼ିଶା from ଓଦିଶ.
 *
 * Like the lexicon, the file is allowed to be absent: `emptyUnigrams()` scores
 * everything 0, so the frequency term simply drops out of the sum and the
 * engine falls back to rule scores alone.
 */

import { canonical } from './normalize.js';
import type { Unigrams } from './types.js';

/**
 * Score for a word the corpus never saw. Zero rather than -Infinity so that
 * scores stay finite and an unseen word can still win on rule and user terms.
 */
const UNSEEN = 0;

/** Frequencies for nothing at all. */
export function emptyUnigrams(): Unigrams {
  return { size: 0, logfreq: () => UNSEEN };
}

/** Parse `unigrams.tsv`. Blank lines, `#` comments and unparseable rows are skipped. */
export function parseUnigrams(tsv: string): Unigrams {
  const table = new Map<string, number>();

  for (const line of tsv.split('\n')) {
    if (line.length === 0 || line.charCodeAt(0) === 35 /* # */) continue;

    const tab = line.indexOf('\t');
    if (tab <= 0) continue;

    const value = Number.parseFloat(line.slice(tab + 1));
    if (!Number.isFinite(value)) continue;

    // Canonicalise: the keys have to match engine output exactly, and this is
    // a boundary.
    table.set(canonical(line.slice(0, tab).trim()), value);
  }

  return {
    size: table.size,
    logfreq: (odiaWord: string): number => table.get(odiaWord) ?? UNSEEN,
  };
}
