/**
 * Beam search over one roman token, producing candidate Odia spellings.
 *
 * The lattice has one node per roman offset. An edge is one rule firing: a
 * consonant, a vowel or a sign. Because a roman key can be ambiguous ("d"
 * reaches ଦ, ଡ and ଡ଼) each key fans out into several edges, and a path score
 * is the product of its edge weights.
 *
 * Orthography is assembled during expansion rather than in a post-pass,
 * because the correct spelling of a vowel depends on what preceded it:
 *
 *   consonant + vowel          matra form            କ + ି  -> କି
 *   consonant + consonant      virama conjunct       ସ + ୍ + କ -> ସ୍କ
 *   vowel word-initially       independent form      ଇ, not ି
 *   vowel after a vowel        independent form      ହୋ + ଇ -> ହୋଇ
 *   consonant + "a"            inherent vowel        ର + a -> ର, no matra
 *   word-final bare consonant  BOTH readings         କମଲ and କମଲ୍
 *
 * ---------------------------------------------------------------------------
 * Why contexts are resolved against the roman string
 * ---------------------------------------------------------------------------
 * `context` predicates ("intervocalic", "word_final", ...) are evaluated
 * against the ROMAN input and the offset of the key match, never against the
 * half-built Odia output. Two reasons. First, the Odia side has not been
 * decided yet at the moment the predicate must fire — that is the whole point
 * of the lattice. Second, "intervocalic" means "the typist wrote a vowel on
 * either side", which is a fact about the input; the Odia side may render one
 * of those vowels as nothing at all (the inherent vowel), so asking the output
 * would give the wrong answer for exactly the common case, ଗଡ଼ from "gada".
 *
 * We have the whole roman token in hand from the start, so lookahead is free.
 */

import { canonical } from './normalize.js';
import { optionContext } from './rules.js';
import type { PositionContext } from './rules.js';
import type { ConsonantRule, Rules, SignContext, SignRule, VowelRule } from './types.js';

/** One rule-only spelling of a token, with its normalised path score. */
export interface RuleCandidate {
  /** Canonical Odia. */
  text: string;
  /** Relative to the best path, which always scores exactly 1. */
  score: number;
}

export interface SegmentOptions {
  /** States kept alive at each lattice node. */
  beam?: number;
  /** Candidates returned. Defaults to the beam width. */
  limit?: number;
}

/** Beam width. Wide enough for the ambiguity we actually have, narrow enough for JavaScriptCore. */
export const DEFAULT_BEAM = 12;

/**
 * What the last edge emitted, which is all the state orthography assembly
 * needs. `'consonant'` means the output ends in a consonant whose vowel has
 * not been decided yet — the only state that can still grow a matra, a virama
 * or a halanta.
 */
type Last = 'start' | 'consonant' | 'vowel' | 'sign' | 'halant';

interface State {
  out: string;
  score: number;
  last: Last;
}

/**
 * Weight of the two readings of a word-final bare consonant. Odia writes the
 * inherent vowel far more often than a visible halanta, but both are real
 * words ("kamal" is କମଲ or କମଲ୍), so both are emitted and the lexicon decides.
 */
const INHERENT_FINAL_WEIGHT = 1.0;
const HALANTA_FINAL_WEIGHT = 0.5;

/** Penalty for a roman character no rule matches. Keeps the search alive without inventing letters. */
const UNKNOWN_CHAR_WEIGHT = 0.05;

const ROMAN_VOWELS = 'aeiou';

/**
 * Segment `roman` into candidate Odia spellings, best first.
 *
 * `roman` must already be lowercase: natural mode folds case, and all keys in
 * symbols.toml are lowercase. Scores are normalised so the best path is 1,
 * which keeps them comparable across words of different lengths when `rank.ts`
 * mixes them with corpus frequency.
 */
export function segment(rules: Rules, roman: string, opts?: SegmentOptions): RuleCandidate[] {
  if (roman.length === 0) return [];

  const beam = opts?.beam ?? DEFAULT_BEAM;
  const limit = opts?.limit ?? beam;

  // One bucket per roman offset. An edge of length L moves from bucket p to p+L.
  const buckets: State[][] = [];
  for (let i = 0; i <= roman.length; i += 1) buckets.push([]);
  buckets[0] = [{ out: '', score: 1, last: 'start' }];

  for (let pos = 0; pos < roman.length; pos += 1) {
    const states = prune(buckets[pos] as State[], beam);
    buckets[pos] = states;
    if (states.length === 0) continue;

    // Explicit halant. Written by the user to force a conjunct the ordinary
    // spelling cannot reach, because the concatenation collides with a digraph:
    // "tha" is ଥ, so ଟ୍ହ has to be typed "t_ha".
    if (roman[pos] === '_') {
      const target = buckets[pos + 1] as State[];
      for (const state of states) {
        target.push({
          out: state.last === 'consonant' ? state.out + rules.virama : state.out,
          score: state.score,
          last: 'halant',
        });
      }
      continue;
    }

    const entries = rules.matchAt(roman, pos);
    let expanded = false;

    // Longest consonant key that matched here. Anything shorter is a split of
    // it ("bh" read as b + h) and gets penalised — see [segment] digraph_split.
    let longestConsonant = 0;
    for (const entry of entries) {
      if (entry.kind === 'consonant' && entry.roman.length > longestConsonant) {
        longestConsonant = entry.roman.length;
      }
    }

    for (const entry of entries) {
      const keyLength = entry.roman.length;
      const target = buckets[pos + keyLength] as State[];
      const splitPenalty =
        entry.kind === 'consonant' && keyLength < longestConsonant
          ? rules.segmentWeights.digraphSplit
          : 1;

      for (const state of states) {
        switch (entry.kind) {
          case 'consonant':
            expanded =
              expandConsonant(entry, state, roman, pos, rules.virama, splitPenalty, target) ||
              expanded;
            break;
          case 'vowel':
            expandVowel(entry, state, rules.segmentWeights.hiatus, target);
            expanded = true;
            break;
          case 'sign':
            expanded = expandSign(entry, state, roman, pos, target) || expanded;
            break;
        }
      }
    }

    // No rule fired at all — a stray character, or a context that excluded
    // every option. Skip one character rather than abandoning the token.
    if (!expanded) {
      const target = buckets[pos + 1] as State[];
      for (const state of states) {
        target.push({ out: state.out, score: state.score * UNKNOWN_CHAR_WEIGHT, last: state.last });
      }
    }
  }

  return finish(buckets[roman.length] as State[], beam, limit, rules.virama);
}

/* ------------------------------------------------------------------ *
 * Edge expansion
 * ------------------------------------------------------------------ */

function expandConsonant(
  rule: ConsonantRule,
  state: State,
  roman: string,
  pos: number,
  virama: string,
  splitPenalty: number,
  target: State[],
): boolean {
  // A consonant directly after another consonant joins it with a virama.
  const join = state.last === 'consonant' ? virama : '';
  let fired = false;

  for (const option of rule.options) {
    if (!positionHolds(optionContext(option), roman, pos, rule.roman.length)) continue;
    target.push({
      out: state.out + join + option.text,
      score: state.score * option.weight * splitPenalty,
      last: 'consonant',
    });
    fired = true;
  }

  return fired;
}

function expandVowel(rule: VowelRule, state: State, hiatus: number, target: State[]): void {
  // After a consonant a vowel is a matra (empty for the inherent vowel);
  // anywhere else it is the independent letter.
  const text = state.last === 'consonant' ? rule.matra : rule.independent;

  // An independent vowel written straight after another vowel is real Odia but
  // uncommon, and it is exactly the path that ties with the long-vowel key.
  // See [segment] hiatus in symbols.toml.
  const penalty = state.last === 'vowel' ? hiatus : 1;

  target.push({
    out: state.out + text,
    score: state.score * rule.weight * penalty,
    last: 'vowel',
  });
}

function expandSign(
  rule: SignRule,
  state: State,
  roman: string,
  pos: number,
  target: State[],
): boolean {
  // A sign hangs off the preceding letter, so it cannot open a token, and two
  // in a row is not a spelling we want to generate.
  if (state.last === 'start' || state.last === 'sign') return false;

  let fired = false;
  for (const option of rule.options) {
    if (!signContextHolds(option.context, roman, pos, rule.roman.length)) continue;
    target.push({
      out: state.out + option.text,
      score: state.score * option.weight,
      last: 'sign',
    });
    fired = true;
  }

  return fired;
}

/* ------------------------------------------------------------------ *
 * Context predicates — evaluated against the roman input, see the header
 * ------------------------------------------------------------------ */

function isRomanVowel(ch: string | undefined): boolean {
  return ch !== undefined && ROMAN_VOWELS.includes(ch);
}

function positionHolds(context: PositionContext, roman: string, at: number, length: number): boolean {
  switch (context) {
    case 'any':
      return true;
    case 'word_initial':
      return at === 0;
    case 'non_initial':
      return at > 0;
    case 'word_final':
      return at + length === roman.length;
    case 'intervocalic':
      return at > 0 && isRomanVowel(roman[at - 1]) && isRomanVowel(roman[at + length]);
  }
}

function signContextHolds(context: SignContext, roman: string, at: number, length: number): boolean {
  const next = roman[at + length];
  switch (context) {
    case 'any':
      return true;
    case 'word_final':
      return next === undefined;
    case 'before_consonant':
      return next !== undefined && !isRomanVowel(next);
    case 'before_vowel':
      return isRomanVowel(next);
  }
}

/* ------------------------------------------------------------------ *
 * Pruning and finishing
 * ------------------------------------------------------------------ */

/**
 * Collapse states that have produced the same output in the same orthographic
 * state, keeping the best score, then keep the top `beam`.
 *
 * `last` belongs in the key: "କ" awaiting a vowel and "କ" that already took
 * the inherent vowel are the same string but not the same state.
 */
function prune(states: State[], beam: number): State[] {
  if (states.length === 0) return states;

  const best = new Map<string, State>();
  for (const state of states) {
    const key = state.last + ' ' + state.out;
    const existing = best.get(key);
    if (existing === undefined || state.score > existing.score) best.set(key, state);
  }

  const merged = [...best.values()];
  merged.sort((a, b) => b.score - a.score);
  return merged.length > beam ? merged.slice(0, beam) : merged;
}

/**
 * Turn the final lattice node into candidates: resolve the pending vowel of a
 * word-final consonant both ways, canonicalise, dedupe and normalise scores.
 */
function finish(states: State[], beam: number, limit: number, virama: string): RuleCandidate[] {
  const finals: State[] = [];

  // The final node is pruned to whichever is larger, the beam or what the
  // caller asked for. Pruning it to the beam alone would silently cap the
  // candidate list at 12 however many the caller requested, and the entries
  // that fall off are exactly the low-frequency spellings — including ଓଡ଼ିଶା,
  // which only corpus frequency can rescue.
  for (const state of prune(states, Math.max(beam, limit))) {
    if (state.last === 'consonant') {
      finals.push({ ...state, score: state.score * INHERENT_FINAL_WEIGHT });
      finals.push({
        out: state.out + virama,
        score: state.score * HALANTA_FINAL_WEIGHT,
        last: 'consonant',
      });
    } else {
      finals.push(state);
    }
  }

  // Canonical form is the identity of a candidate: two paths that spell the
  // same word are one candidate with the better score.
  const best = new Map<string, number>();
  for (const state of finals) {
    if (state.out.length === 0) continue;
    const text = canonical(state.out);
    const existing = best.get(text);
    if (existing === undefined || state.score > existing) best.set(text, state.score);
  }

  const out: RuleCandidate[] = [...best].map(([text, score]) => ({ text, score }));
  out.sort((a, b) => b.score - a.score || (a.text < b.text ? -1 : 1));

  // Normalise against the best path so that a long word is not penalised for
  // being long once these scores meet corpus frequency in rank.ts.
  const top = out[0]?.score ?? 0;
  if (top > 0) {
    for (const candidate of out) candidate.score /= top;
  }

  return out.length > limit ? out.slice(0, limit) : out;
}
