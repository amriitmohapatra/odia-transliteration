/**
 * Compose several lexicons into one, at runtime.
 *
 * `createEngine()` accepts exactly one `lexiconTsv` string, which suggests
 * three bad options: merge the TSVs at build time (a second artefact to keep in
 * sync), concatenate the strings at load (breaks the sorted-order invariant
 * that lets `parseLexicon` skip its sort, so ~700k rows get re-sorted on every
 * cold start), or pick one lexicon and lose the other.
 *
 * None of that is necessary. `core/src/types.ts` declares `EngineConfig.lexicon`
 * as a structural interface with three members — `size`, `lookup`, `prefix` —
 * and `Engine` is exported. So Appv2 constructs the engine directly and hands
 * it an object that merges N sources on demand:
 *
 *     new Engine({ rules, lexicon: mergeLexicons([...]), unigrams: ..., ... })
 *
 * Each TSV stays its own file, parsed once, in its own lazily-loaded Vite
 * chunk — so the Sanskrit lexicon is fetched only when a profile that uses it
 * is selected.
 */

import type {
  Lexicon,
  LexiconEntry,
  LexiconPrefixEntry,
  Unigrams,
} from '@odia/core/types';

export interface LexiconSource {
  lexicon: Lexicon;
  /**
   * Relative standing of this source against the others.
   *
   * MULTIPLICATIVE, and it must stay that way. `core/src/rank.ts` normalises
   * lexicon weights against the best hit FOR THAT KEY before folding them into
   * the score, so a uniform additive offset is subtracted straight back out and
   * has literally no effect. Only the ratio between sources survives
   * normalisation. Anyone "simplifying" this to `weight + priority` will find
   * the setting silently stops doing anything.
   *
   * 1.0 = no adjustment.
   */
  priority: number;
}

/**
 * A read-through view over several lexicons.
 *
 * Deliberately not a merged copy: building one would mean allocating and
 * sorting the union at startup, which is exactly the cost this avoids. The
 * per-call merge is over a handful of entries, because `lookup` is an exact key
 * hit and `prefix` is already bounded by `limit`.
 */
export function mergeLexicons(sources: readonly LexiconSource[]): Lexicon {
  const active = sources.filter((s) => s.lexicon.size > 0);

  // One source and no rescaling: hand the original back untouched.
  if (active.length === 1 && active[0].priority === 1) return active[0].lexicon;

  const size = active.reduce((total, s) => total + s.lexicon.size, 0);

  return {
    get size() {
      return size;
    },

    lookup(romanKey: string): readonly LexiconEntry[] {
      const out: LexiconEntry[] = [];
      for (const source of active) {
        for (const entry of source.lexicon.lookup(romanKey)) {
          out.push({ word: entry.word, weight: entry.weight * source.priority });
        }
      }
      // The same word can legitimately appear in both lexicons — ଧ୍ୟାନ is
      // ordinary Odia AND Sanskrit. Keep the better weight rather than letting
      // rank.ts see it twice, which would double-count it against its rivals.
      return dedupe(out);
    },

    prefix(romanKey: string, limit?: number): readonly LexiconPrefixEntry[] {
      const out: LexiconPrefixEntry[] = [];
      for (const source of active) {
        for (const entry of source.lexicon.prefix(romanKey, limit)) {
          out.push({
            key: entry.key,
            word: entry.word,
            weight: entry.weight * source.priority,
          });
        }
      }
      out.sort((a, b) => (a.key === b.key ? b.weight - a.weight : a.key < b.key ? -1 : 1));
      // Each source honoured `limit` on its own, so the union can be up to
      // sources x limit. Re-truncate, or a two-source setup would quietly
      // deliver twice the as-you-type candidates the caller asked for.
      return limit === undefined ? out : out.slice(0, limit);
    },
  };
}

function dedupe(entries: LexiconEntry[]): LexiconEntry[] {
  if (entries.length < 2) return entries;
  const best = new Map<string, number>();
  for (const entry of entries) {
    const prior = best.get(entry.word);
    if (prior === undefined || entry.weight > prior) best.set(entry.word, entry.weight);
  }
  return [...best].map(([word, weight]) => ({ word, weight }));
}

/**
 * Combine unigram tables by MAX, never by sum.
 *
 * Same discipline as `tools/build-data/merge_webfreq.py`: these are log
 * frequencies on a fixed 0..2.303 scale that `rank.ts` was tuned against, so
 * adding two of them would push a word that appears in both tables outside the
 * range and let it swamp every other term in the score.
 */
export function mergeUnigrams(sources: readonly Unigrams[]): Unigrams {
  const active = sources.filter((s) => s.size > 0);
  if (active.length === 1) return active[0];

  const size = active.reduce((total, s) => total + s.size, 0);

  return {
    get size() {
      return size;
    },
    logfreq(odiaWord: string): number {
      let best = 0;
      for (const source of active) {
        const value = source.logfreq(odiaWord);
        if (value > best) best = value;
      }
      return best;
    },
  };
}
