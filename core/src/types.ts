/**
 * The public type contract for the Odia transliteration engine.
 *
 * Every module in `core/` and every consumer (`cli/`, `web/`, and later the
 * Tauri app and the macOS input method) builds against exactly this file.
 * Nothing here is asynchronous: there is no network and no I/O in the engine,
 * so there is no reason for promises. The input method needs a synchronous
 * per-keystroke path.
 *
 * Every Odia string that appears in any of these types is assumed to be in
 * canonical form, i.e. `canonical(s) === s` (see `normalize.ts`). In
 * particular ଡ଼ is U+0B21 U+0B3C and ଢ଼ is U+0B22 U+0B3C, never the
 * precomposed U+0B5C / U+0B5D.
 */

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

/**
 * Where a candidate came from. This is not just diagnostics: `rank.ts` uses
 * it to merge duplicates, and the last candidate for any word is always the
 * untouched Latin token with source `'verbatim'`, so mixed English input
 * ("PCR", "Bayesian") never needs a language-detection heuristic.
 */
import type { Labels, Preferences } from './curation.js';

export type CandidateSource = 'user' | 'preference' | 'lexicon' | 'rule' | 'verbatim';

export interface Candidate {
  /** Canonical Odia text (or the verbatim Latin token). */
  text: string;
  /** Higher is better. Not normalised, not a probability. */
  score: number;
  source: CandidateSource;
}

export interface WordResult {
  /** The roman token exactly as it appeared in the input. */
  roman: string;
  /** Best first. Always non-empty; the final entry is the verbatim fallback. */
  candidates: Candidate[];
}

export interface Result {
  words: WordResult[];
  /** Top-1 candidates joined back together with the original whitespace and punctuation. */
  text: string;
}

/** Render digits as 0-9 or as ୦-୯. */
export type DigitMode = 'arabic' | 'odia';

export interface TransliterateOptions {
  /** Maximum candidates per word. Defaults to an engine-chosen small number. */
  topk?: number;
}

/* ------------------------------------------------------------------ *
 * Rules — the parsed contents of core/rules/*.toml
 * ------------------------------------------------------------------ */

/** A weighted Odia realisation of one roman key. */
export interface OdiaOption {
  /** Canonical Odia text. */
  text: string;
  /** Relative preference within this rule, typically 0-1. */
  weight: number;
}

/**
 * When a sign is allowed to fire. `'any'` is the default when the TOML omits
 * a context. Anusvara, for example, is only plausible before a consonant.
 */
export type SignContext = 'any' | 'before_consonant' | 'before_vowel' | 'word_final';

export interface SignOption extends OdiaOption {
  context: SignContext;
}

/**
 * A consonant maps to one or more Odia consonant letters. The segmenter
 * decides whether the letter is followed by a matra, a virama or nothing.
 */
export interface ConsonantRule {
  kind: 'consonant';
  roman: string;
  options: OdiaOption[];
}

/**
 * A vowel has two orthographic forms. `independent` is used word-initially or
 * after another vowel; `matra` is used after a consonant. The inherent vowel
 * "a" has an empty `matra`, which is how "no sign is emitted" is expressed.
 */
export interface VowelRule {
  kind: 'vowel';
  roman: string;
  /** Canonical Odia, e.g. "ଆ". */
  independent: string;
  /** Canonical Odia, e.g. "ା". Empty string for the inherent vowel. */
  matra: string;
  weight: number;
}

/** Anusvara, candrabindu, visarga and friends. */
export interface SignRule {
  kind: 'sign';
  roman: string;
  options: SignOption[];
}

/** A single entry from symbols.toml, discriminated by `kind`. */
export type RuleEntry = ConsonantRule | VowelRule | SignRule;

/** The ranking mix. Tunable from `[weights]` in symbols.toml, with no code change. */
export interface RankWeights {
  rule: number;
  freq: number;
  user: number;
  /** Owner preferences (data/preferences.tsv). Kept below one user pick. */
  pref: number;
}

/**
 * Structural preferences the segmenter applies on top of the per-letter
 * weights. Tunable from `[segment]` in symbols.toml, with no code change.
 */
export interface SegmentWeights {
  /**
   * Penalty for an independent vowel written directly after another vowel.
   *
   * Without it, "aa" scores exactly the same through the single `aa` -> ା rule
   * as through `a` + `a` -> inherent + ଅ, and the tie is broken by code point,
   * which puts ଅ (U+0B05) first. That is how "paani" came out as ପଅନି.
   *
   * It must stay close to 1: real vowel hiatus exists in Odia (ହୋଇ, ନାହିଁ), and
   * a hard penalty would push those below their diphthong readings.
   */
  hiatus: number;

  /**
   * Penalty for reading a consonant with a SHORTER roman key when a longer
   * consonant key also matched at the same position.
   *
   * "bh" is one letter, ଭ. Nothing stopped the lattice from also reading it as
   * b + h and joining them with a virama, which produced ବ୍ହ — not a word, and
   * it was surfacing at rank 2 for "bhagya", above the correct ଭାଗ୍ୟ. Same for
   * ଚ୍ହ from "chanda".
   *
   * Unlike hiatus this can be aggressive, because a genuine consonant + h
   * cluster is vanishingly rare in romanized Odia: the aspirate digraphs are
   * exactly what people mean when they type them.
   */
  digraphSplit: number;
}

/**
 * A deterministic, case-sensitive, one-to-one table for strict mode. No
 * candidates and no ambiguity: strict mode is a correctness oracle for the
 * fuzzy engine, not a competitor to it.
 */
export interface StrictScheme {
  name: StrictSchemeName;
  /** Roman key -> canonical Odia. Keys are matched longest-first. */
  map: ReadonlyMap<string, string>;
  /** Length of the longest key in `map`, so the matcher need not recompute it. */
  maxKeyLength: number;
}

export type StrictSchemeName = 'itrans';

/**
 * Parsed and validated rule files. `rules.ts` builds this and throws on load
 * if any Odia string is not already canonical, or if an entry type is unknown.
 */
export interface Rules {
  readonly consonants: readonly ConsonantRule[];
  readonly vowels: readonly VowelRule[];
  readonly signs: readonly SignRule[];

  /** Exactly ten canonical Odia digits, indexed by digit value. */
  readonly digits: readonly string[];

  readonly weights: RankWeights;

  readonly segmentWeights: SegmentWeights;

  /** The virama / halanta sign, U+0B4D. Held here so no module hard-codes it. */
  readonly virama: string;

  /** Length of the longest roman key across all entries. Currently 4 ("kshh"-class keys). */
  readonly maxKeyLength: number;

  /**
   * Every entry whose roman key is exactly `key`. A key may carry more than
   * one kind: "m" is both a consonant (ମ) and a sign (ଂ).
   */
  match(key: string): readonly RuleEntry[];

  /**
   * The segmenter's hot path. Returns every entry matching a prefix of
   * `roman` starting at index `at`, **longest key first**, so the caller can
   * expand the lattice in preference order without sorting.
   */
  matchAt(roman: string, at: number): readonly RuleEntry[];

  /** Strict-mode tables from itrans.toml. Absent until `strict.ts` is wired up. */
  readonly strictSchemes?: ReadonlyMap<StrictSchemeName, StrictScheme>;
}

/* ------------------------------------------------------------------ *
 * Lexicon and corpus frequencies
 * ------------------------------------------------------------------ */

export interface LexiconEntry {
  /** Canonical Odia word. */
  word: string;
  weight: number;
}

export interface LexiconPrefixEntry extends LexiconEntry {
  /** The roman key this word was found under, which may be longer than the query. */
  key: string;
}

/**
 * Two parallel sorted arrays plus binary search. Deliberately not an FST:
 * JavaScriptCore on iOS is interpreter-only, so plain lookups win.
 */
export interface Lexicon {
  /** Number of rows, including build-time fuzzy key aliases. */
  readonly size: number;

  /** Exact key match. Empty array when the key is unknown. */
  lookup(romanKey: string): readonly LexiconEntry[];

  /**
   * Prefix-range scan for as-you-type candidates. `limit` bounds the scan,
   * which matters because a short prefix can match thousands of rows.
   */
  prefix(romanKey: string, limit?: number): readonly LexiconPrefixEntry[];
}

/** Corpus unigram frequencies, used by `rank.ts` to prefer real words. */
export interface Unigrams {
  readonly size: number;
  /**
   * Log frequency of a canonical Odia word. Unseen words return a fixed
   * floor rather than -Infinity, so scores stay finite and comparable.
   */
  logfreq(odiaWord: string): number;
}

/* ------------------------------------------------------------------ *
 * User learning
 * ------------------------------------------------------------------ */

/**
 * Persistence for what the user actually picked. Synchronous by contract:
 * implementations are a JSON file on desktop and localStorage on the web.
 */
export interface LearnStore {
  /** Canonical Odia word -> times chosen, for this roman key. */
  get(roman: string): Record<string, number> | undefined;
  record(roman: string, chosen: string): void;
}

/* ------------------------------------------------------------------ *
 * Engine configuration
 * ------------------------------------------------------------------ */

export interface EngineConfig {
  rules: Rules;
  lexicon: Lexicon;
  unigrams: Unigrams;
  learnStore?: LearnStore;
  digits?: DigitMode;
  /** Owner-curated "put this word first" rows. See curation.ts. */
  preferences?: Preferences;
  /** Whole-word labels; `offensive` drives the family-safe filter. */
  labels?: Labels;
  /** Family-safe filter. Default true. Has no effect while `labels` is empty. */
  familySafe?: boolean;
}
