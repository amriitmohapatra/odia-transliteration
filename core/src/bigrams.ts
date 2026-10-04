/**
 * Word-pair (bigram) counts: how often word B follows word A in the corpus.
 *
 * The ranker uses them for context. When the previous word of a sentence is
 * known, a candidate that often follows it gets a small extra term (see the
 * formula in rank.ts). Built by `tools/build-data/build_bigrams.py` from the
 * same web corpus, with the same tokens, as the unigram counts.
 *
 * `bigrams.tsv` rows, tab-separated, `#` comments and blank lines skipped:
 *
 *     prev  next  count     a pair: `next` followed `prev` `count` times
 *     prev  *     total     every pair token that starts with `prev`
 *
 * The `*` row is the denominator of the conditional and is counted before any
 * pruning, so a pruned file (bigrams-web.tsv) still scores a pair exactly as
 * the full file does.
 *
 * The parser is strict, like `curation.ts`: a malformed row, a duplicate, a pair
 * without its `*` row, a `*` row without pairs, or a count above its total
 * throws with the line number. Unlike the lexicon this file is small enough to
 * check, and a silently half-loaded table would bias ranking with no visible
 * symptom. Odia goes through `canonical()` on load: this is a boundary.
 *
 * Like the lexicon, the file is optional: `emptyBigrams()` scores every pair 0,
 * and the ranker then adds nothing at all.
 */

import { canonical } from './normalize.js';
import type { Bigrams } from './types.js';

/** The marker in the `next` column of a total row. */
const TOTAL = '*';

const COUNT = /^[1-9][0-9]*$/;

/** Pairs for nothing at all. Every score is 0. */
export function emptyBigrams(): Bigrams {
  return { size: 0, score: () => 0 };
}

/** Parse `bigrams.tsv` (or `bigrams-web.tsv`). Throws on any malformed row. */
export function parseBigrams(tsv: string, file = 'bigrams.tsv'): Bigrams {
  const pairs = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  const totalLine = new Map<string, number>();

  const lines = tsv.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] as string).replace(/\r$/, '');
    if (line.length === 0 || line.charCodeAt(0) === 35 /* # */) continue;
    const where = `${file}:${i + 1}`;

    const cells = line.split('\t');
    if (cells.length !== 3) throw new Error(`${where}: expected "prev<TAB>next<TAB>count", found ${cells.length} cells`);
    const [rawPrev, rawNext, rawCount] = cells as [string, string, string];
    if (rawPrev.length === 0 || rawNext.length === 0) throw new Error(`${where}: empty word`);
    if (!COUNT.test(rawCount)) throw new Error(`${where}: count "${rawCount}" must be a positive integer`);
    const count = Number(rawCount);
    const prev = canonical(rawPrev);

    if (rawNext === TOTAL) {
      if (totals.has(prev)) throw new Error(`${where}: second total row for this word`);
      totals.set(prev, count);
      totalLine.set(prev, i + 1);
      continue;
    }

    const next = canonical(rawNext);
    let row = pairs.get(prev);
    if (row === undefined) {
      row = new Map();
      pairs.set(prev, row);
    }
    if (row.has(next)) throw new Error(`${where}: duplicate pair`);
    row.set(next, count);
  }

  let size = 0;
  for (const [prev, row] of pairs) {
    const total = totals.get(prev);
    if (total === undefined) throw new Error(`${file}: a pair starts with a word that has no "*" total row`);
    for (const count of row.values()) {
      if (count > total) throw new Error(`${file}:${totalLine.get(prev)}: a pair count exceeds the total`);
    }
    size += row.size;
  }
  for (const [prev, line] of totalLine) {
    if (!pairs.has(prev)) throw new Error(`${file}:${line}: total row with no pairs`);
  }

  // ln(1 + total) once per word, not per lookup.
  const logTotals = new Map<string, number>();
  for (const [prev, total] of totals) logTotals.set(prev, Math.log1p(total));

  return {
    size,
    score(prevWord: string, nextWord: string): number {
      const count = pairs.get(prevWord)?.get(nextWord);
      if (count === undefined) return 0;
      // 1 <= count <= total (checked above), so the score is in (0, 1].
      return Math.log1p(count) / (logTotals.get(prevWord) as number);
    },
  };
}
