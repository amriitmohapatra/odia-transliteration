/**
 * Merge the three sources of evidence into one ordered candidate list.
 *
 *   score = weights.rule * (ruleScore + lexScore)
 *         + weights.freq * logfreq(word)
 *         + weights.user * log(1 + userCount)
 *         + weights.pref * prefWeight          (owner preference, data/preferences.tsv)
 *         + weights.bigram * bigram(prev, word) (context, data/bigrams.tsv)
 *         + weights.typed * typed(key, word)    (typed spellings, data/typed.tsv)
 *         + convertWeight * share(word)         (spelling converter, data/converter.bin)
 *
 * The typed term is what keyboard users chose when they typed this exact key:
 *
 *   typed(key, word) = count(key, word) / (total(key) + typedPrior)
 *
 * 0..1. The prior keeps a key typed a handful of times from counting as much
 * as one typed a hundred thousand times. A typed pair is also a candidate on its
 * own, like a lexicon word. Its weight stays below one user pick (house rule).
 *
 * The context term, when the previous word `prev` of the sentence is known:
 *
 *   bigram(prev, word) = ln(1 + count(prev, word)) / ln(1 + total(prev))
 *
 * `count(prev, word)` is how often `word` directly followed `prev` in the
 * corpus; `total(prev)` is how many pair tokens start with `prev` at all, i.e.
 * how often anything followed it. The ratio is a log-scaled conditional: 1
 * when every occurrence of `prev` was followed by `word`, near 0 when `word`
 * followed it once among thousands, and 0 for a pair never seen. It never
 * adds a candidate, only re-scores the ones rules and lexicon produced, so the
 * content filter and the reachability floor work as before.
 *
 * With no previous word, no bigram data, or `[weights] bigram` absent or 0,
 * the term is skipped entirely (not added as 0), so the scores are bit for bit
 * the scores of the engine without context. core/test/bigrams.test.ts checks
 * that.
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
  /** Typed-spelling pairs for this key; `weight` is the pair count. */
  typedEntries?: readonly LexiconEntry[];
  /** The spelling converter's n-best for this key, with costs (lower is better). */
  converterEntries?: readonly { text: string; cost: number }[];
  /**
   * The converter weight for this key (the engine picks `convert` or
   * `convertKnown`). 0 or absent: no converter term.
   */
  convertWeight?: number;
  /** Canonical Odia word -> times the user chose it for this key. */
  userCounts?: Record<string, number>;
  /** Canonical Odia word -> owner preference weight for this key. */
  prefWeights?: Readonly<Record<string, number>>;
  /**
   * The content filter, present only when it is on (see Engine and
   * curation.ts). Returns true to drop a candidate. It is told whether the user
   * taught the word or the owner prefers it for this key, because those
   * exemptions depend on the filter level.
   */
  isBlocked?: (word: string, vouched: { user: boolean; pref: boolean }) => boolean;
  unigrams: Unigrams;
  /**
   * The context term for a canonical candidate, 0..1 (see the header), present
   * only when the previous word is known and bigram data is loaded.
   */
  bigram?: (word: string) => number;
  weights: RankWeights;
  /** Maximum ranked candidates before the verbatim token is appended. */
  topk: number;
}

interface Evidence {
  rule: number;
  lex: number;
  typed: number;
  conv: number;
  user: number;
  pref: number;
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
      const fresh: Evidence = { rule: 0, lex: 0, typed: 0, conv: 0, user: 0, pref: 0 };
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

  const typedWeight = input.weights.typed ?? 0;
  if (typedWeight > 0 && input.typedEntries !== undefined && input.typedEntries.length > 0) {
    let total = input.weights.typedPrior ?? 0;
    for (const entry of input.typedEntries) total += entry.weight;
    for (const entry of input.typedEntries) bump(entry.word, 'typed', entry.weight / total);
  }

  // The converter's n-best as shares of one: a softmax of the costs, so the
  // best spelling gets most of the weight when it is far ahead.
  const convertWeight = input.convertWeight ?? 0;
  if (convertWeight > 0 && input.converterEntries !== undefined && input.converterEntries.length > 0) {
    const temperature = input.weights.convertTemperature ?? 1;
    let best = Infinity;
    for (const entry of input.converterEntries) if (entry.cost < best) best = entry.cost;
    let sum = 0;
    const shares = input.converterEntries.map((entry) => {
      const share = Math.exp(-(entry.cost - best) / (temperature > 0 ? temperature : 1));
      sum += share;
      return share;
    });
    input.converterEntries.forEach((entry, i) => bump(entry.text, 'conv', (shares[i] as number) / sum));
  }

  // A word the user has chosen before is a candidate even if neither the rules
  // nor the lexicon would ever have produced it.
  if (input.userCounts !== undefined) {
    for (const [word, count] of Object.entries(input.userCounts)) bump(word, 'user', count);
  }

  if (input.prefWeights !== undefined) {
    for (const [word, weight] of Object.entries(input.prefWeights)) bump(word, 'pref', weight);
  }

  const bigramWeight = input.weights.bigram ?? 0;
  const bigram = bigramWeight > 0 ? input.bigram : undefined;

  const scored: (Candidate & { fromRules: boolean })[] = [];
  for (const [text, sources] of evidence) {
    // Before the slice, so a dropped word frees its slot for the next one.
    if (input.isBlocked !== undefined && input.isBlocked(text, { user: sources.user > 0, pref: sources.pref > 0 })) {
      continue;
    }
    let score =
      input.weights.rule * (sources.rule + sources.lex) +
      input.weights.freq * input.unigrams.logfreq(text) +
      input.weights.user * Math.log(1 + sources.user) +
      // Guarded so callers built before `pref` existed still score as before.
      (sources.pref > 0 ? input.weights.pref * sources.pref : 0) +
      // Same guard: without typed data the scores are bit for bit as before.
      (sources.typed > 0 ? typedWeight * sources.typed : 0) +
      (sources.conv > 0 ? convertWeight * sources.conv : 0);
    // Added only when non-zero, so a list without context is bit-identical.
    if (bigram !== undefined) {
      const context = bigram(text);
      if (context > 0) score += bigramWeight * context;
    }
    scored.push({
      text,
      score,
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

  // The house rule, made structural: the word the user picked most often for
  // this key goes first, whatever the other evidence says. An additive user
  // term alone could not promise that once the typed pairs and the converter
  // gave other words strong evidence (a word kept in English has none of its
  // own). Ties between picks go to the better-scored word. After the floor,
  // whose re-sort by score would undo it.
  if (input.userCounts !== undefined && limit > 0) {
    let most = 0;
    for (const count of Object.values(input.userCounts)) if (count > most) most = count;
    const entry = most > 0 ? scored.find((c) => c.source === 'user' && input.userCounts?.[c.text] === most) : undefined;
    if (entry !== undefined) out = [entry, ...out.filter((c) => c !== entry)].slice(0, limit);
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
 * claim, then the owner's preference, then the lexicon, then typed pairs, then the rules — the order in which a UI should
 * explain where a suggestion came from.
 */
function sourceOf(sources: Evidence): CandidateSource {
  if (sources.user > 0) return 'user';
  if (sources.pref > 0) return 'preference';
  if (sources.lex > 0) return 'lexicon';
  if (sources.typed > 0) return 'typed';
  if (sources.rule > 0) return 'rule';
  if (sources.conv > 0) return 'converter';
  return 'rule';
}
