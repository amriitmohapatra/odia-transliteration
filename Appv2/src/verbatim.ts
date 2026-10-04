/**
 * The degraded engine.
 *
 * Stage A is still in progress, so the PWA has to survive two situations that
 * are normal during development and must never be a blank page:
 *
 *   1. `core/src/index.ts` does not exist yet (see the alias in vite.config.ts).
 *   2. It exists but `createEngine()` throws, e.g. a rule file fails validation.
 *
 * In both cases the app falls back to this: every roman token is returned as
 * its own verbatim candidate and the text passes through untouched. Deliberately
 * contains no linguistic mappings — all of those live in `core/rules/*.toml`,
 * never in TypeScript. Its only job is to keep the interface honest while the
 * UI shows the user that the engine is unavailable.
 */

import type { Candidate, Result, WordResult } from '@odia/core/types';

/**
 * The slice of the `Engine` class the web app actually uses.
 *
 * Declared structurally rather than imported, so a missing or half-built
 * `@odia/core` cannot stop this file from compiling.
 */
export interface EngineLike {
  transliterate(input: string, opts?: { topk?: number }): Result;
  transliterateWord(roman: string, topk?: number): Candidate[];
  learn(roman: string, chosen: string): void;
  strict(input: string, scheme?: 'itrans'): string;
  /** Family-safe filter (Settings, "Hide rude words"). Absent on the degraded engine. */
  setFamilySafe?(on: boolean): void;
  /** Owner-curated labels of a word, for badges (badges.ts). Absent on the degraded engine. */
  labelsOf?(word: string): ReadonlySet<string> | undefined;
}

/** Runs of Latin letters, which is all a verbatim engine can recognise as a word. */
const WORD = /[A-Za-z][A-Za-z0-9'’]*/g;

export function verbatimEngine(): EngineLike {
  return {
    transliterate(input: string): Result {
      const words: WordResult[] = [];
      for (const match of input.matchAll(WORD)) {
        words.push({
          roman: match[0],
          candidates: [{ text: match[0], score: 0, source: 'verbatim' }],
        });
      }
      return { words, text: input };
    },

    transliterateWord(roman: string): Candidate[] {
      return [{ text: roman, score: 0, source: 'verbatim' }];
    },

    learn(): void {
      /* nothing to learn from a passthrough */
    },

    strict(input: string): string {
      return input;
    },
  };
}
