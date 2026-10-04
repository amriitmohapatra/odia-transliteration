/**
 * The lexicon: two parallel sorted arrays plus binary search.
 *
 * Deliberately not an FST. JavaScriptCore on iOS is interpreter-only for every
 * third-party process, so a clever data structure loses to a dumb one that
 * touches less memory and runs fewer bytecodes. Binary search over sorted
 * arrays gives exact match and prefix-range scan in about forty lines.
 *
 * `lexicon.tsv` rows are `romanKey \t odiaWord \t weight`, sorted by key, with
 * build-time fuzzy aliases (aa->a, ee->i, v<->w, ...) already expanded into
 * extra rows, so nothing here needs edit distance.
 *
 * The file is allowed to be absent. `emptyLexicon()` is a real lexicon that
 * matches nothing, so the engine works rule-only before the data pipeline has
 * ever run — which is the state the project is in today.
 */

import { canonical } from './normalize.js';
import type { Lexicon, LexiconEntry, LexiconPrefixEntry } from './types.js';

/** Rows returned by a prefix scan when the caller does not say. */
const DEFAULT_PREFIX_LIMIT = 50;

const NO_ENTRIES: readonly LexiconEntry[] = Object.freeze([]);
const NO_PREFIX_ENTRIES: readonly LexiconPrefixEntry[] = Object.freeze([]);

/** A lexicon with no rows. Every lookup misses; nothing throws. */
export function emptyLexicon(): Lexicon {
  return {
    size: 0,
    lookup: () => NO_ENTRIES,
    prefix: () => NO_PREFIX_ENTRIES,
  };
}

/**
 * Parse `lexicon.tsv`.
 *
 * Blank lines and `#` comments are skipped. A row needs at least a key and a
 * word; the weight defaults to 1. Keys are lowercased and words are put
 * through `canonical()` — this is a boundary, and the nukta discipline says
 * every boundary canonicalises. Malformed rows are dropped rather than thrown
 * on: this is bulk data, not a hand-written rule file.
 */
export function parseLexicon(tsv: string): Lexicon {
  const keys: string[] = [];
  const words: string[] = [];
  const weights: number[] = [];

  for (const line of tsv.split('\n')) {
    if (line.length === 0 || line.charCodeAt(0) === 35 /* # */) continue;

    const first = line.indexOf('\t');
    if (first <= 0) continue;
    const second = line.indexOf('\t', first + 1);

    const key = line.slice(0, first).toLowerCase();
    const word = second === -1 ? line.slice(first + 1) : line.slice(first + 1, second);
    if (word.length === 0) continue;

    let weight = 1;
    if (second !== -1) {
      const parsed = Number.parseFloat(line.slice(second + 1));
      if (Number.isFinite(parsed)) weight = parsed;
    }

    keys.push(key);
    words.push(canonical(word.trim()));
    weights.push(weight);
  }

  const order = sortOrderIfNeeded(keys);
  if (order === undefined) return new SortedLexicon(keys, words, weights);

  return new SortedLexicon(
    order.map((i) => keys[i] as string),
    order.map((i) => words[i] as string),
    order.map((i) => weights[i] as number),
  );
}

class SortedLexicon implements Lexicon {
  readonly size: number;

  constructor(
    private readonly keys: readonly string[],
    private readonly words: readonly string[],
    private readonly weights: readonly number[],
  ) {
    this.size = keys.length;
  }

  lookup(romanKey: string): readonly LexiconEntry[] {
    const key = romanKey.toLowerCase();
    let i = this.lowerBound(key);
    if (i >= this.size || this.keys[i] !== key) return NO_ENTRIES;

    const out: LexiconEntry[] = [];
    while (i < this.size && this.keys[i] === key) {
      out.push({ word: this.words[i] as string, weight: this.weights[i] as number });
      i += 1;
    }
    return out;
  }

  prefix(romanKey: string, limit = DEFAULT_PREFIX_LIMIT): readonly LexiconPrefixEntry[] {
    const key = romanKey.toLowerCase();
    if (key.length === 0 || limit <= 0) return NO_PREFIX_ENTRIES;

    const out: LexiconPrefixEntry[] = [];
    for (let i = this.lowerBound(key); i < this.size && out.length < limit; i += 1) {
      const candidate = this.keys[i] as string;
      // The array is sorted, so the first non-match ends the range.
      if (!candidate.startsWith(key)) break;
      out.push({
        key: candidate,
        word: this.words[i] as string,
        weight: this.weights[i] as number,
      });
    }
    return out;
  }

  /** First index whose key is >= `key`, by plain code-unit order. */
  private lowerBound(key: string): number {
    let low = 0;
    let high = this.size;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if ((this.keys[mid] as string) < key) low = mid + 1;
      else high = mid;
    }
    return low;
  }
}

/**
 * A permutation that sorts `keys`, or `undefined` when they are already sorted.
 *
 * The file is meant to arrive sorted, so check first and only pay for a sort
 * when it is not. Comparison is plain code-unit order, matching `lowerBound`;
 * `localeCompare` would order the array differently from the search and break
 * every lookup in a way that no small test would catch.
 */
function sortOrderIfNeeded(keys: readonly string[]): number[] | undefined {
  for (let i = 1; i < keys.length; i += 1) {
    if ((keys[i] as string) < (keys[i - 1] as string)) {
      const order = keys.map((_, index) => index);
      order.sort((a, b) => {
        const ka = keys[a] as string;
        const kb = keys[b] as string;
        return ka < kb ? -1 : ka > kb ? 1 : a - b;
      });
      return order;
    }
  }
  return undefined;
}
