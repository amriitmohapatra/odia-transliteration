/**
 * The engine, assembled.
 *
 * Everything here is synchronous. There is no network and no I/O, so there is
 * nothing to await, and the macOS input method needs a per-keystroke path that
 * returns before the next keystroke arrives.
 *
 * This module does no file access on purpose: it has to run unchanged under
 * node, in a browser and inside JavaScriptCore. `createEngine()` therefore
 * takes file *contents*. `node.ts` wraps it with `createEngineFromDisk()`,
 * which reads the shipped `rules/` and `data/` files.
 */

import { emptyBigrams, parseBigrams } from './bigrams.js';
import { emptyLabels, emptyPreferences, parseLabels, parsePreferences } from './curation.js';
import type { FilterLevel, Labels, Preferences } from './curation.js';
import { canonical } from './normalize.js';
import { parseConverter } from './converter.js';
import { parseNextWords } from './nextword.js';
import { emptyLexicon, parseLexicon } from './lexicon.js';
import { rank } from './rank.js';
import { loadRules } from './rules.js';
import { DEFAULT_BEAM, segment } from './segment.js';
import { strictTransliterate } from './strict.js';
import { tokenize } from './tokenize.js';
import { emptyUnigrams, parseUnigrams } from './unigrams.js';
import type {
  Bigrams,
  Candidate,
  DigitMode,
  EngineConfig,
  LearnStore,
  Lexicon,
  Result,
  NextWords,
  Rules,
  SpellingConverter,
  StrictSchemeName,
  TransliterateOptions,
  Unigrams,
  WordContext,
  WordResult,
} from './types.js';

/** Candidates returned per word when the caller does not ask for a specific number. */
export const DEFAULT_TOPK = 8;

/** Word completion: the shortest key that is completed, rows scanned, and the least use. */
const COMPLETE_MIN_KEY = 3;
const COMPLETE_SCAN = 5000;
const COMPLETE_MIN_COUNT = 100;
const COMPLETE_MIN_SHARE = 0.02;
/** Extra predictions read, so filtered words do not leave the list short. */
const PREDICT_SPARE = 3;
/** Spellings asked of the converter per key. */
const CONVERT_NBEST = 5;

/**
 * `EngineConfig` plus the two search knobs. Kept out of `types.ts` because
 * they are tuning, not contract: nothing outside this class should have to
 * know that there is a beam.
 */
export interface EngineOptions extends EngineConfig {
  /** Beam width for the segmenter. Default 12. */
  beam?: number;
  /** Default candidates per word. Default 8. */
  topk?: number;
}

export class Engine {
  private readonly rules: Rules;
  private readonly lexicon: Lexicon;
  private readonly unigrams: Unigrams;
  private readonly bigrams: Bigrams;
  private readonly typed: Lexicon | undefined;
  private readonly converter: SpellingConverter | undefined;
  private readonly nextWords: NextWords | undefined;
  private readonly learnStore: LearnStore | undefined;
  private readonly preferences: Preferences;
  private readonly labels: Labels;
  private filterLevel: FilterLevel;
  private readonly digitMode: DigitMode;
  private readonly beam: number;
  private readonly topk: number;

  constructor(cfg: EngineOptions) {
    this.rules = cfg.rules;
    this.lexicon = cfg.lexicon;
    this.unigrams = cfg.unigrams;
    this.bigrams = cfg.bigrams ?? emptyBigrams();
    this.typed = cfg.typed;
    this.converter = cfg.converter;
    this.nextWords = cfg.nextWords;
    this.learnStore = cfg.learnStore;
    this.preferences = cfg.preferences ?? emptyPreferences();
    this.labels = cfg.labels ?? emptyLabels();
    this.filterLevel = cfg.filter ?? (cfg.familySafe === false ? 'off' : 'family');
    this.digitMode = cfg.digits ?? 'arabic';
    this.beam = cfg.beam ?? DEFAULT_BEAM;
    this.topk = cfg.topk ?? DEFAULT_TOPK;
  }

  /**
   * Transliterate a whole string.
   *
   * `words` carries one entry per convertible token — roman words and digit
   * runs. Punctuation and whitespace are not candidates for anything, so they
   * appear only in `text`, which is the top-1 spelling of every token
   * reassembled with the original spacing.
   */
  transliterate(input: string, opts?: TransliterateOptions): Result {
    const topk = opts?.topk ?? this.topk;
    const words: WordResult[] = [];
    let text = '';
    // The previous word's top-1 Odia spelling, passed as context to the next
    // word. It carries across spaces and tabs only, the same adjacency the
    // bigram counts use (tools/build-data/build_bigrams.py): punctuation,
    // digits, a line break or a Latin top-1 (English kept verbatim) end it.
    let prev: string | undefined;

    for (const token of tokenize(input)) {
      switch (token.kind) {
        case 'word': {
          const candidates = this.transliterateWord(token.text, topk, prev === undefined ? undefined : { prev });
          words.push({ roman: token.text, candidates });
          const top = candidates[0];
          text += top?.text ?? token.text;
          prev = top !== undefined && top.source !== 'verbatim' && top.text !== token.text ? top.text : undefined;
          break;
        }
        case 'digits': {
          const candidates = this.digitCandidates(token.text);
          words.push({ roman: token.text, candidates });
          text += candidates[0]?.text ?? token.text;
          prev = undefined;
          break;
        }
        case 'space':
          if (/[\n\r\f\v]/.test(token.text)) prev = undefined;
          text += token.text;
          break;
        default:
          prev = undefined;
          text += token.text;
      }
    }

    return { words, text };
  }

  /**
   * The per-keystroke path: one roman token in, ranked candidates out.
   *
   * Case is folded before matching — natural mode has no case distinction —
   * but the verbatim candidate keeps the original spelling, so "PCR" comes
   * back as "PCR" and not "pcr".
   *
   * `context.prev` is the previous word of the sentence in Odia, when the
   * caller knows it. With bigram data loaded it adds the context term of
   * rank.ts; without it, or without bigram data, the result is exactly the
   * context-free one.
   */
  transliterateWord(roman: string, topk?: number, context?: WordContext): Candidate[] {
    const key = roman.toLowerCase();
    const wanted = topk ?? this.topk;
    const lexiconEntries = this.lexicon.lookup(key);
    const typedEntries = this.typed?.lookup(key);
    // The converter for a key the word lists do not know, and (at its own
    // weight) for one they do. Decoded only when its weight is not 0.
    const known = lexiconEntries.length > 0 || (typedEntries?.length ?? 0) > 0;
    const convertWeight = known ? (this.rules.weights.convertKnown ?? 0) : (this.rules.weights.convert ?? 0);
    const converterEntries =
      this.converter !== undefined && convertWeight > 0 ? this.converter.decode(key, CONVERT_NBEST) : undefined;

    return rank({
      roman,
      // Ask the segmenter for at least as many spellings as we intend to
      // return, or a request for 25 candidates would be capped at the beam.
      ruleCandidates: segment(this.rules, key, {
        beam: this.beam,
        limit: Math.max(wanted, this.beam),
      }),
      lexiconEntries,
      typedEntries,
      converterEntries,
      convertWeight,
      userCounts: this.learnStore?.get(key),
      prefWeights: this.preferences.get(key),
      isBlocked: this.blockerFor(key),
      unigrams: this.unigrams,
      bigram: this.contextFor(context),
      weights: this.rules.weights,
      topk: wanted,
    });
  }

  /**
   * Whole words for a roman key that is still being typed: typed-spelling
   * pairs whose key starts with `roman` and is longer ("bhub" -> the city).
   * Ranked by how often users chose the word under any such key. Needs at
   * least COMPLETE_MIN_KEY letters (a shorter prefix matches too much to
   * guess), goes through the content filter, and never returns a word that
   * is already a candidate for the exact key. Empty without typed data.
   */
  complete(roman: string, k = 2, exclude: readonly string[] = []): Candidate[] {
    const key = roman.toLowerCase();
    // Off where the typed term is off (the sloka profile sets typed = 0).
    if (this.typed === undefined || (this.rules.weights.typed ?? 0) <= 0) return [];
    if (key.length < COMPLETE_MIN_KEY || k <= 0) return [];
    const totals = new Map<string, number>();
    for (const row of this.typed.prefix(key, COMPLETE_SCAN)) {
      if (row.key.length <= key.length) continue;
      totals.set(row.word, (totals.get(row.word) ?? 0) + row.weight);
    }
    const skip = new Set(exclude.map((w) => canonical(w)));
    const blocked = this.blockerFor(key);
    const out: Candidate[] = [];
    const ranked = [...totals].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    // Relative floor as well: a misspelling typed a hundred times next to the
    // right word typed thousands of times is noise, not a completion.
    const floor = Math.max(COMPLETE_MIN_COUNT, COMPLETE_MIN_SHARE * (ranked[0]?.[1] ?? 0));
    for (const [word, count] of ranked) {
      if (out.length >= k) break;
      if (count < floor || skip.has(word)) continue;
      if (blocked?.(word, { user: false, pref: false }) === true) continue;
      out.push({ text: word, score: count, source: 'completion' });
    }
    return out;
  }

  /**
   * The likeliest words to type next, after `previous` (the Odia words before
   * the caret, oldest first; the last one or two are used). Through the
   * content filter: in family mode an offensive word is never predicted (no
   * key vouches for it), in kids mode neither is a coarse one. Empty without
   * next-word data.
   */
  predictNext(previous: readonly string[], k = 5): Candidate[] {
    if (this.nextWords === undefined || k <= 0) return [];
    const blocked = this.blockerFor('');
    const out: Candidate[] = [];
    for (const row of this.nextWords.predict(previous, k + PREDICT_SPARE)) {
      if (out.length >= k) break;
      if (blocked?.(row.word, { user: false, pref: false }) === true) continue;
      out.push({ text: row.word, score: row.score, source: 'prediction' });
    }
    return out;
  }

  /** How common an Odia word is: its log frequency, 0 for a word the counts never saw. */
  wordFrequency(word: string): number {
    return this.unigrams.logfreq(canonical(word));
  }

  /** The bigram term for one previous word, or undefined when it cannot apply. */
  private contextFor(context: WordContext | undefined): ((word: string) => number) | undefined {
    if (this.bigrams.size === 0 || context?.prev === undefined) return undefined;
    // A boundary: the previous word may come straight from a host text field.
    const prev = canonical(context.prev);
    if (prev.length === 0) return undefined;
    const bigrams = this.bigrams;
    return (word) => bigrams.score(prev, word);
  }

  /**
   * Remember that the user chose `chosen` for `roman`.
   *
   * Canonicalising here as well as in the store is deliberate. This is the one
   * place where a string from outside the engine — whatever the host text
   * field handed back — enters long-lived storage.
   */
  learn(roman: string, chosen: string): void {
    const word = canonical(chosen);
    // The kids edition never remembers a labelled word, so it can never come back.
    if (this.filterLevel === 'kids' && (this.labels.isOffensive(word) || this.labels.isCoarse(word))) return;
    this.learnStore?.record(roman, word);
  }

  /** Family-safe filter: on by default (owner decision D-0). See rank.ts. */
  get familySafe(): boolean {
    return this.filterLevel !== 'off';
  }

  /** The "Hide rude words" switch. Ignored in the kids edition, which stays on. */
  setFamilySafe(on: boolean): void {
    if (this.filterLevel === 'kids') return;
    this.filterLevel = on ? 'family' : 'off';
  }

  get filter(): FilterLevel {
    return this.filterLevel;
  }

  /**
   * The content filter for one roman key, or undefined when nothing is
   * filtered. Family: an offensive word stays only under one of its own
   * listed keys, or when the user taught it or the owner prefers it. Kids:
   * offensive and coarse words never appear.
   */
  private blockerFor(key: string): ((word: string, vouched: { user: boolean; pref: boolean }) => boolean) | undefined {
    if (this.filterLevel === 'off' || this.labels.size === 0) return undefined;
    const labels = this.labels;
    if (this.filterLevel === 'kids') return (word) => labels.isOffensive(word) || labels.isCoarse(word);
    return (word, vouched) =>
      labels.isOffensive(word) && !vouched.user && !vouched.pref && !(labels.keysFor(word)?.has(key) ?? false);
  }

  /** Labels for a canonical Odia word, for display (e.g. an "offensive" badge). */
  labelsOf(word: string): ReadonlySet<string> | undefined {
    return this.labels.get(canonical(word));
  }

  /** Deterministic ITRANS. Case-sensitive, one answer, no candidates. */
  strict(input: string, scheme: StrictSchemeName = 'itrans'): string {
    const table = this.rules.strictSchemes?.get(scheme);
    if (table === undefined) {
      throw new Error(
        `strict mode is unavailable: no '${scheme}' table was loaded ` +
          `(pass itransToml to createEngine, or use createEngineFromDisk)`,
      );
    }
    const out = strictTransliterate(table, input);

    // Strict mode still honours the digit setting. It previously did not, so
    // switching to strict mid-sentence silently reverted ୨୦୨୫ to 2025 — the two
    // toggles are independent choices and must not clobber each other.
    if (this.digitMode !== 'odia') return out;
    return out.replace(/[0-9]/g, (ch) => this.rules.digits[ch.charCodeAt(0) - 48] ?? ch);
  }

  /** Number of lexicon rows in use. Zero when no lexicon has been loaded. */
  get lexiconSize(): number {
    return this.lexicon.size;
  }

  /**
   * Digits are not segmented. In `'odia'` mode the run is rewritten with Odia
   * numerals; in `'arabic'` mode the verbatim token is the only candidate, and
   * `rank`'s dedupe rule keeps it from appearing twice.
   */
  private digitCandidates(run: string): Candidate[] {
    if (this.digitMode !== 'odia') {
      return [{ text: run, score: 0, source: 'verbatim' }];
    }

    let converted = '';
    for (const ch of run) {
      const value = ch.charCodeAt(0) - 48; // '0'
      converted += value >= 0 && value <= 9 ? (this.rules.digits[value] as string) : ch;
    }

    return [
      { text: converted, score: 1, source: 'rule' },
      { text: run, score: 0, source: 'verbatim' },
    ];
  }
}

/* ------------------------------------------------------------------ *
 * Convenience loader
 * ------------------------------------------------------------------ */

export interface CreateEngineOptions {
  /** Contents of `rules/symbols.toml`. Required: there is no engine without rules. */
  rulesToml: string;
  /** Contents of `rules/itrans.toml`. Without it, `strict()` throws. */
  itransToml?: string;
  /** Contents of `data/lexicon.tsv`. Absent means rule-only transliteration. */
  lexiconTsv?: string;
  /** Contents of `data/unigrams.tsv`. Absent means the frequency term is 0 everywhere. */
  unigramsTsv?: string;
  /** Contents of `data/bigrams.tsv` (or `-web`). Absent means no context term. */
  bigramsTsv?: string;
  /** Contents of `data/typed.tsv` (typed-spelling pairs). Absent means no typed term. */
  typedTsv?: string;
  /** Contents of `data/nextword.tsv` (next-word predictions). Absent means none. */
  nextwordTsv?: string;
  /** Bytes of `data/converter.bin` (the spelling converter). Absent means no converter term. */
  converterBin?: Uint8Array;
  /** Contents of `data/preferences.tsv` (owner-curated). Absent means none. */
  preferencesTsv?: string;
  /** Contents of `data/labels.tsv` (owner-curated). Absent means none. */
  labelsTsv?: string;
  /** Family-safe filter. Default true. */
  familySafe?: boolean;
  /** Content filter level: 'off' | 'family' | 'kids'. Overrides `familySafe`. */
  filter?: FilterLevel;
  learnStore?: LearnStore;
  digits?: DigitMode;
  beam?: number;
  topk?: number;
}

/**
 * Build an engine from rule and data file contents.
 *
 * The data files are optional by design. The lexicon is a build artifact of a
 * pipeline that may not have run yet, and an engine that refuses to start
 * without it would be unusable during exactly the work that produces it.
 */
export function createEngine(opts: CreateEngineOptions): Engine {
  return new Engine({
    rules: loadRules(opts.rulesToml, opts.itransToml),
    lexicon: opts.lexiconTsv === undefined ? emptyLexicon() : parseLexicon(opts.lexiconTsv),
    unigrams: opts.unigramsTsv === undefined ? emptyUnigrams() : parseUnigrams(opts.unigramsTsv),
    bigrams: opts.bigramsTsv === undefined ? undefined : parseBigrams(opts.bigramsTsv),
    typed: opts.typedTsv === undefined ? undefined : parseLexicon(opts.typedTsv),
    converter: opts.converterBin === undefined ? undefined : parseConverter(opts.converterBin),
    nextWords: opts.nextwordTsv === undefined ? undefined : parseNextWords(opts.nextwordTsv),
    preferences: opts.preferencesTsv === undefined ? undefined : parsePreferences(opts.preferencesTsv),
    labels: opts.labelsTsv === undefined ? undefined : parseLabels(opts.labelsTsv),
    familySafe: opts.familySafe,
    filter: opts.filter,
    learnStore: opts.learnStore,
    digits: opts.digits,
    beam: opts.beam,
    topk: opts.topk,
  });
}

/* ------------------------------------------------------------------ *
 * Re-exports: the whole engine surface, from one module
 * ------------------------------------------------------------------ */

export * from './types.js';
export {
  canonical,
  isCanonical,
  assertCanonical,
  codepoints,
  splitClusters,
  NUKTA,
  VIRAMA,
  DDA_NUKTA,
  DDHA_NUKTA,
} from './normalize.js';
export { loadRules, loadStrictScheme, optionContext } from './rules.js';
export { parsePreferences, parseLabels, parseGlosses, parsePhrases, LABELS, GLOSS_STATUS, FILTER_LEVELS, PHRASE_CATEGORIES } from './curation.js';
export type { Preferences, Labels, Label, Glosses, GlossStatus, FilterLevel, Phrase, PhraseCategory } from './curation.js';
export type { PositionContext, PositionedOption } from './rules.js';
export { tokenize } from './tokenize.js';
export type { Token, TokenKind } from './tokenize.js';
export { segment, DEFAULT_BEAM } from './segment.js';
export type { RuleCandidate, SegmentOptions } from './segment.js';
export { emptyLexicon, parseLexicon } from './lexicon.js';
export { emptyUnigrams, parseUnigrams } from './unigrams.js';
export { emptyBigrams, parseBigrams } from './bigrams.js';
export { parseConverter } from './converter.js';
export { emptyNextWords, parseNextWords } from './nextword.js';
export type { Converter, ConverterCandidate, ConverterOptions } from './converter.js';
export { rank } from './rank.js';
export type { RankInput } from './rank.js';
export { strictTransliterate } from './strict.js';
export {
  MemoryLearnStore,
  JsonFileLearnStore,
  LocalStorageLearnStore,
} from './learn.js';
export type { FileIO, LearnData } from './learn.js';
