/**
 * Merge the three sources of evidence into one ordered candidate list.
 *
 *   score = weights.rule * (ruleScore + lexScore)
 *         + weights.freq * logfreq(word)
 *         + weights.user * log(1 + userCount)
 *
 * `ruleScore` and `lexScore` are each 0-1 and are ADDED rather than maxed.
 * That is the whole point: a spelling the segmenter produced *and* the lexicon
 * knows should outrank one that only a single source vouches for. A word only
 * the lexicon knows still scores, and so does one only the rules found.
 *
 * The list always ends with the verbatim Latin token. That is how mixed
 * English works — you pick the last candidate for "PCR" or "Bayesian", and
 * `learn()` remembers it — with no language-detection heuristic anywhere.
 */

import { canonical } from './normalize.js';
import type { RuleCandidate } from './segment.js';
import type { Candidate, CandidateSource, LexiconEntry, RankWeights, Unigrams } from './types.js';

export interface RankInput {
  /** The roman token exactly as typed. Becomes the verbatim candidate. */
  roman: string;
  /** Rule-only spellings from `segment()`, already normalised to a best of 1. */
  ruleCandidates: readonly RuleCandidate[];
  /** Exact lexicon hits for this key. */
  lexiconEntries: readonly LexiconEntry[];
  /** Canonical Odia word -> times the user chose it for this key. */
  userCounts?: Record<string, number>;
  unigrams: Unigrams;
  weights: RankWeights;
  /** Maximum ranked candidates before the verbatim token is appended. */
  topk: number;
}

interface Evidence {
  rule: number;
  lex: number;
  user: number;
}

/**
 * How many rule-derived spellings are guaranteed a place in the candidate list,
 * however many lexicon words outrank them. See the reachability floor in
 * `rank` — without this, common short keys lose their bare letters entirely.
 */
const RULE_FLOOR = 3;

/** Merge, score, dedupe on canonical form, and append the verbatim token. */
export function rank(input: RankInput): Candidate[] {
  const evidence = new Map<string, Evidence>();

  const bump = (text: string, field: keyof Evidence, value: number): void => {
    if (value <= 0) return;
    const key = canonical(text);
    const existing = evidence.get(key);
    if (existing === undefined) {
      const fresh: Evidence = { rule: 0, lex: 0, user: 0 };
      fresh[field] = value;
      evidence.set(key, fresh);
    } else if (value > existing[field]) {
      existing[field] = value;
    }
  };

  for (const candidate of input.ruleCandidates) bump(candidate.text, 'rule', candidate.score);

  // Lexicon weights are arbitrary corpus counts, so normalise them against the
  // best hit for this key. Otherwise the lexicon term would drown out the rule
  // term for common words and vanish for rare ones.
  let topLexWeight = 0;
  for (const entry of input.lexiconEntries) {
    if (entry.weight > topLexWeight) topLexWeight = entry.weight;
  }
  if (topLexWeight > 0) {
    for (const entry of input.lexiconEntries) bump(entry.word, 'lex', entry.weight / topLexWeight);
  }

  // A word the user has chosen before is a candidate even if neither the rules
  // nor the lexicon would ever have produced it.
  if (input.userCounts !== undefined) {
    for (const [word, count] of Object.entries(input.userCounts)) bump(word, 'user', count);
  }

  const scored: (Candidate & { fromRules: boolean })[] = [];
  for (const [text, sources] of evidence) {
    scored.push({
      text,
      score:
        input.weights.rule * (sources.rule + sources.lex) +
        input.weights.freq * input.unigrams.logfreq(text) +
        input.weights.user * Math.log(1 + sources.user),
      source: sourceOf(sources),
      fromRules: sources.rule > 0,
    });
  }

  scored.sort((a, b) => b.score - a.score || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));

  const limit = Math.max(0, input.topk);
  let out = scored.length > limit ? scored.slice(0, limit) : scored;

  /*
   * Reachability floor.
   *
   * The lexicon can legitimately offer many high-frequency words for a short
   * key, and with enough of them every rule-derived spelling falls off the end
   * of the list. That is how "ka" stopped offering କ at all: real words
   * beginning ka- filled all nine slots and the bare letter vanished.
   *
   * For a transliteration tool that is a hole rather than a ranking preference.
   * If the rules can spell something, the user has to be able to reach it — so
   * the best few rule spellings are promoted back in, displacing the weakest
   * candidates that the rules did not produce. Ordering is otherwise untouched.
   */
  // Scaled to the list, because a rescued spelling costs a lexicon hit its place
  // and on a short list that is a bad trade: reserving three of five slots
  // dropped everyday casual top-3 from 96% to 78%. The first five places are
  // always left to whatever scored best, so a top-5 list is untouched and a
  // top-9 list still gets the full floor. Measured — 4 was too greedy, 6 bought
  // nothing over 5.
  const floor = Math.min(RULE_FLOOR, Math.max(0, limit - 5));

  if (out.length === limit && floor > 0) {
    const present = new Set(out.map((c) => c.text));
    const rescued = scored.filter((c) => c.fromRules && !present.has(c.text)).slice(0, floor);

    if (rescued.length > 0) {
      // Drop the LOWEST-SCORING entries to make room — never a whole class of
      // them. An earlier version kept every rule-bearing candidate and evicted
      // the lexicon-only ones, which at topk=6 threw away the correct answer:
      // "jagannatha" lost ଜଗନ୍ନାଥ entirely and led with ଜଗଣଥ. `out` is already
      // sorted, so the tail is exactly what should go.
      const head = out.slice(0, Math.max(0, limit - rescued.length));
      out = [...head, ...rescued].sort(
        (a, b) => b.score - a.score || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0),
      );
    }
  }

  // The verbatim token goes last and exactly once. A ranked candidate that is
  // character-for-character the input (an all-digit token in arabic mode, say)
  // would otherwise appear twice.
  //
  // One exception: the user already taught this exact token — picked "bus" for
  // "bus" before. Then it keeps the rank it earned, with source 'user', and no
  // verbatim copy is appended. Dropping it here (the earlier rule) put a taught
  // English word back at the end every time, so learning it did nothing, and
  // the dropped entry also cost the list one slot. Exact comparison, no case
  // folding: a taught "PCR" and a typed "pcr" are different strings.
  const taught = out.find((c) => c.text === input.roman && c.source === 'user');
  if (taught !== undefined) return out;
  return [...out.filter((c) => c.text !== input.roman), { text: input.roman, score: 0, source: 'verbatim' }];
}

/**
 * Which source to report when several agree. User choice is the strongest
 * claim, then the lexicon, then the rules — the order in which a UI should
 * explain where a suggestion came from.
 */
function sourceOf(sources: Evidence): CandidateSource {
  if (sources.user > 0) return 'user';
  if (sources.lex > 0) return 'lexicon';
  return 'rule';
}
