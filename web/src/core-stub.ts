/**
 * Stand-in for `@odia/core` while the engine does not exist yet.
 *
 * vite.config.ts aliases `@odia/core` to this file only when neither
 * `core/src/index.ts` nor `core/dist/index.js` is present. The moment the real
 * engine lands, the alias points at it instead and this file drops out of the
 * bundle. Nothing else in web/ imports it directly.
 *
 * It exports the smallest surface main.ts and engine.ts actually reach for.
 */

import { verbatimEngine, type EngineLike } from './verbatim';

export function createEngine(_options?: unknown): EngineLike {
  return verbatimEngine();
}

/** In-memory only. Nothing is learned when there is no engine to learn for. */
export class LocalStorageLearnStore {
  private readonly data: Record<string, Record<string, number>> = {};

  get(roman: string): Record<string, number> | undefined {
    return this.data[roman];
  }

  record(roman: string, chosen: string): void {
    const counts = (this.data[roman] ??= {});
    counts[chosen] = (counts[chosen] ?? 0) + 1;
  }
}
