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

import { emptyLabels, emptyPreferences, parseLabels, parsePreferences } from './curation.js';
import type { Labels, Preferences } from './curation.js';
import { canonical } from './normalize.js';
import { emptyLexicon, parseLexicon } from './lexicon.js';
import { rank } from './rank.js';
import { loadRules } from './rules.js';
import { DEFAULT_BEAM, segment } from './segment.js';
import { strictTransliterate } from './strict.js';
import { tokenize } from './tokenize.js';
import { emptyUnigrams, parseUnigrams } from './unigrams.js';
import type {
  Candidate,
  DigitMode,
  EngineConfig,
  LearnStore,
  Lexicon,
  Result,
  Rules,
  StrictSchemeName,
  TransliterateOptions,
  Unigrams,
  WordResult,
} from './types.js';

/** Candidates returned per word when the caller does not ask for a specific number. */
export const DEFAULT_TOPK = 8;

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
  private readonly learnStore: LearnStore | undefined;
  private readonly preferences: Preferences;
  private readonly labels: Labels;
  private familySafeOn: boolean;
  private readonly digitMode: DigitMode;
  private readonly beam: number;
  private readonly topk: number;

  constructor(cfg: EngineOptions) {
    this.rules = cfg.rules;
    this.lexicon = cfg.lexicon;
    this.unigrams = cfg.unigrams;
    this.learnStore = cfg.learnStore;
    this.preferences = cfg.preferences ?? emptyPreferences();
    this.labels = cfg.labels ?? emptyLabels();
    this.familySafeOn = cfg.familySafe ?? true;
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

    for (const token of tokenize(input)) {
      switch (token.kind) {
        case 'word': {
          const candidates = this.transliterateWord(token.text, topk);
          words.push({ roman: token.text, candidates });
          text += candidates[0]?.text ?? token.text;
          break;
        }
        case 'digits': {
          const candidates = this.digitCandidates(token.text);
          words.push({ roman: token.text, candidates });
          text += candidates[0]?.text ?? token.text;
          break;
        }
        default:
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
   */
  transliterateWord(roman: string, topk?: number): Candidate[] {
    const key = roman.toLowerCase();
    const wanted = topk ?? this.topk;

    return rank({
      roman,
      // Ask the segmenter for at least as many spellings as we intend to
      // return, or a request for 25 candidates would be capped at the beam.
      ruleCandidates: segment(this.rules, key, {
        beam: this.beam,
        limit: Math.max(wanted, this.beam),
      }),
      lexiconEntries: this.lexicon.lookup(key),
      userCounts: this.learnStore?.get(key),
      prefWeights: this.preferences.get(key),
      isOffensive:
        this.familySafeOn && this.labels.size > 0 ? (word) => this.labels.isOffensive(word) : undefined,
      unigrams: this.unigrams,
      weights: this.rules.weights,
      topk: wanted,
    });
  }

  /**
   * Remember that the user chose `chosen` for `roman`.
   *
   * Canonicalising here as well as in the store is deliberate. This is the one
   * place where a string from outside the engine — whatever the host text
   * field handed back — enters long-lived storage.
   */
  learn(roman: string, chosen: string): void {
    this.learnStore?.record(roman, canonical(chosen));
  }

  /** Family-safe filter: on by default (owner decision D-0). See rank.ts. */
  get familySafe(): boolean {
    return this.familySafeOn;
  }

  setFamilySafe(on: boolean): void {
    this.familySafeOn = on;
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
  /** Contents of `data/preferences.tsv` (owner-curated). Absent means none. */
  preferencesTsv?: string;
  /** Contents of `data/labels.tsv` (owner-curated). Absent means none. */
  labelsTsv?: string;
  /** Family-safe filter. Default true. */
  familySafe?: boolean;
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
    preferences: opts.preferencesTsv === undefined ? undefined : parsePreferences(opts.preferencesTsv),
    labels: opts.labelsTsv === undefined ? undefined : parseLabels(opts.labelsTsv),
    familySafe: opts.familySafe,
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
export { parsePreferences, parseLabels, parseGlosses, LABELS, GLOSS_STATUS } from './curation.js';
export type { Preferences, Labels, Label, Glosses, GlossStatus } from './curation.js';
export type { PositionContext, PositionedOption } from './rules.js';
export { tokenize } from './tokenize.js';
export type { Token, TokenKind } from './tokenize.js';
export { segment, DEFAULT_BEAM } from './segment.js';
export type { RuleCandidate, SegmentOptions } from './segment.js';
export { emptyLexicon, parseLexicon } from './lexicon.js';
export { emptyUnigrams, parseUnigrams } from './unigrams.js';
export { rank } from './rank.js';
export type { RankInput } from './rank.js';
export { strictTransliterate } from './strict.js';
export {
  MemoryLearnStore,
  JsonFileLearnStore,
  LocalStorageLearnStore,
} from './learn.js';
export type { FileIO, LearnData } from './learn.js';
