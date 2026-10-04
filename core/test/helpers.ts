/**
 * Shared fixtures for the engine tests.
 *
 * Every Odia string here is written with \u escapes, for the same reason
 * normalize.test.ts does it: the canonical and precomposed spellings of RRA
 * are visually identical, so a test written with literals cannot be reviewed
 * and a stray paste would quietly assert the opposite of what is intended.
 *
 *   RRA canonical   U+0B21 U+0B3C      precomposed   U+0B5C
 *   RHA canonical   U+0B22 U+0B3C      precomposed   U+0B5D
 *
 * The rule files are read from disk because they are source. The data files
 * are NOT: `core/data/` is a build artifact that can be regenerated at any
 * time, and a test that depends on its contents fails for reasons unrelated to
 * the engine. Tests that need a lexicon build a small one inline.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadRules } from '../src/rules.js';
import type { Rules } from '../src/types.js';

const RULES_DIR = fileURLToPath(new URL('../rules/', import.meta.url));

export const SYMBOLS_TOML: string = readFileSync(RULES_DIR + 'symbols.toml', 'utf8');
export const ITRANS_TOML: string = readFileSync(RULES_DIR + 'itrans.toml', 'utf8');

let cached: Rules | undefined;

/** The real rule files, parsed once. */
export function testRules(): Rules {
  cached ??= loadRules(SYMBOLS_TOML, ITRANS_TOML);
  return cached;
}

/* ------------------------------------------------------------------ *
 * Signs
 * ------------------------------------------------------------------ */

/** U+0B4D ODIA SIGN VIRAMA (halanta). */
export const VIRAMA = '\u0B4D';
/** U+0B02 ODIA SIGN ANUSVARA. */
export const ANUSVARA = '\u0B02';

/** RRA and RHA, canonical. */
export const RRA = '\u0B21\u0B3C';
export const RHA = '\u0B22\u0B3C';
/** The spellings that must never appear in engine output. */
export const PRECOMPOSED_RRA = '\u0B5C';
export const PRECOMPOSED_RHA = '\u0B5D';

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

/** ଓଡ଼ିଶା */
export const ODISHA = '\u0B13' + RRA + '\u0B3F\u0B36\u0B3E';
/** ଓଡ଼ିଆ */
export const ODIA = '\u0B13' + RRA + '\u0B3F\u0B06';
/** ନମସ୍କାର — the conjunct ସ୍କ is the point of this fixture. */
export const NAMASKAARA = '\u0B28\u0B2E\u0B38' + VIRAMA + '\u0B15\u0B3E\u0B30';
/** କମଲ, and the same word with a visible halanta. */
export const KAMALA = '\u0B15\u0B2E\u0B32';
export const KAMAL_HALANTA = KAMALA + VIRAMA;
/** ରାମ */
export const RAAMA = '\u0B30\u0B3E\u0B2E';
/** ଗଡ଼ — the flap between vowels. */
export const GADA = '\u0B17' + RRA;
/** ଡ଼ାକ — the flap word-initially, which the weights should make unlikely. */
export const DAAKA = RRA + '\u0B3E\u0B15';
/** କେମିତି */
export const KEMITI = '\u0B15\u0B47\u0B2E\u0B3F\u0B24\u0B3F';
/** ଅଛ */
export const ACHHA = '\u0B05\u0B1B';
/** ୫, the Odia digit five. */
export const ODIA_FIVE = '\u0B6B';
