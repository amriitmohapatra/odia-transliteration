/**
 * Strict mode: deterministic ITRANS. One input, one output, no candidates.
 *
 * This is not a competitor to the fuzzy engine, it is its oracle. When the
 * beam search starts producing something odd, strict mode tells you whether
 * the mapping table or the segmenter is at fault.
 *
 * The loop is a plain longest-match replacement because `rules.ts` has already
 * generated the consonant x vowel product into the scheme's flat map: "ki" is
 * matched by a single key, so the bare consonant key — the one carrying the
 * virama — is only ever reached when a virama genuinely belongs there. Any
 * character the table does not know passes through untouched, which is what
 * keeps spaces, punctuation and digits intact.
 */

import { canonical } from './normalize.js';
import type { StrictScheme } from './types.js';

/** Transliterate `input` under `scheme`. Case-sensitive, total, and deterministic. */
export function strictTransliterate(scheme: StrictScheme, input: string): string {
  let out = '';
  let i = 0;

  while (i < input.length) {
    const longest = Math.min(scheme.maxKeyLength, input.length - i);
    let matched = 0;

    for (let length = longest; length >= 1; length -= 1) {
      const hit = scheme.map.get(input.slice(i, i + length));
      if (hit !== undefined) {
        out += hit;
        matched = length;
        break;
      }
    }

    if (matched === 0) {
      out += input[i];
      matched = 1;
    }
    i += matched;
  }

  return canonical(out);
}
