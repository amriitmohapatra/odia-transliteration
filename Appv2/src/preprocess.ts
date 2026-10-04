/**
 * Input-layer substitutions for the characters no rule can reach.
 *
 * Four marks that Sanskritized Odia needs constantly are unreachable through
 * the rule engine, and each is blocked TWICE over:
 *
 *   1. core/src/rules.ts readRomanKey requires /^[a-z]+$/, so "|" and "'" and
 *      ":" can never be TOML keys in the first place.
 *   2. core/src/segment.ts expandSign returns false when state.last === 'start',
 *      so a mark that opens a token is unreachable whatever key it carries.
 *
 * The way through is not to fight either constraint but to sidestep both:
 * core/src/tokenize.ts classifies every non-ASCII character as `punct`, and
 * Engine.transliterate copies punct tokens into the output verbatim. So if the
 * substitution happens BEFORE the engine sees the string, the character simply
 * flows through untouched. No core edit, no illegal key.
 *
 *     "dhyaana balaatitam naanyam balam |"
 *   -> preprocess ->
 *     "dhyaana balaatitam naanyam balam ।"
 *   -> engine ->
 *     "ଧ୍ୟାନ ବଳାତିତଂ ନାନ୍ୟଂ ବଳଂ ।"
 *
 * ---------------------------------------------------------------------------
 * Two constraints on the implementation, both load-bearing
 *
 * NO LOOKBEHIND. The flanking tests below are a manual character scan, not
 * /(?<=[A-Za-z])'/g. Appv2/vite.config.ts targets safari13, and a build target
 * downlevels SYNTAX only — a runtime RegExp feature like lookbehind (Safari
 * 16.4+) sails through the build and dies on the user's older Mac. This is the
 * exact failure mode web/vite.config.ts documents for Object.hasOwn.
 *
 * "LETTER" INCLUDES ODIA. The web composer commits chosen candidates back into
 * the same textarea, so by the time preprocess sees `ସୋ'ham` the left flank is
 * already Odia, not Latin. Testing only [A-Za-z] would make avagraha work
 * before you committed a word and stop working after — the worst kind of bug,
 * because it looks intermittent.
 */

/** Which substitutions are active. Set per profile in `profiles.ts`. */
export interface PreprocessOptions {
  /** `|` -> ।  and  `||` -> ॥ */
  danda: boolean;
  /** `'` -> ଽ, between letters only. */
  avagraha: boolean;
  /** `:` -> ଃ, between letters only. */
  visarga: boolean;
}

export const DANDA = '।'; // ।  DEVANAGARI DANDA — shared by Odia, per Unicode
export const DOUBLE_DANDA = '॥'; // ॥
export const AVAGRAHA = 'ଽ'; // ଽ  ORIYA SIGN AVAGRAHA
export const VISARGA = 'ଃ'; // ଃ  ORIYA SIGN VISARGA

export const PREPROCESS_ALL: PreprocessOptions = {
  danda: true,
  avagraha: true,
  visarga: true,
};

export const PREPROCESS_DANDA_ONLY: PreprocessOptions = {
  danda: true,
  avagraha: false,
  visarga: false,
};

/**
 * True for a character that can flank an in-word mark.
 *
 * Latin letters, because that is what you are typing; Odia, because committed
 * candidates land back in the buffer; and digits are deliberately EXCLUDED so
 * that "12:30" keeps its colon.
 */
function isLetter(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  const cp = ch.charCodeAt(0);
  if (cp >= 0x41 && cp <= 0x5a) return true; // A-Z
  if (cp >= 0x61 && cp <= 0x7a) return true; // a-z
  if (cp >= 0x0b00 && cp <= 0x0b7f) return true; // Odia block
  return false;
}

/**
 * What may sit immediately before an avagraha.
 *
 * A letters-on-both-sides guard is NOT enough: it turns `don't` into `donଽt`
 * and `Krishna's` into `Krishnaଽs`, which is unusable in a bilingual buffer.
 *
 * Sanskrit says exactly where avagraha can occur — it marks an elided initial
 * `a` after the sandhi outcomes `-aḥ + a-` → `-o 'a-` and `-e + a-` → `-e 'a-`,
 * so the preceding vowel is always o or e. core/data/webfreq.tsv agrees, over
 * all 332 types containing ଽ, weighted by corpus count:
 *
 *     ୋ  89.4%      ା  1.4%      ଂ ପ ି  0.1% each (noise)
 *     େ   8.6%      ଥ  0.2%
 *
 * 98% on {o, e}. Restricting to those two is therefore both the linguistically
 * correct rule and the empirically right one, and it leaves every English
 * contraction alone. The one collateral loss is `o'clock`, which becomes
 * `oଽclock` — acceptable in an Odia composer, and typing the apostrophe
 * anywhere else in the word still works.
 */
const AVAGRAHA_LEFT = new Set([
  'o',
  'O',
  'e',
  'E',
  'ୋ', // U+0B4B  vowel sign o
  'େ', // U+0B47  vowel sign e
  'ଓ', // U+0B13  letter o
  'ଏ', // U+0B0F  letter e
]);

/**
 * Rewrite typing conventions into the marks the engine cannot produce.
 *
 * Total and pure. Call it ONCE per render, and pass the SAME returned string to
 * both `engine.transliterate()` and whatever recovers the original spacing
 * (`buildOutput`/`locate` in main.ts). Passing the raw string to one and the
 * preprocessed string to the other desynchronises their offsets, because
 * `||` -> `॥` shrinks the text by one character. Appv2/test/preprocess.test.ts
 * pins that invariant.
 */
export function preprocess(input: string, opts: PreprocessOptions): string {
  // Nothing enabled: skip the scan entirely rather than rebuild the string.
  if (!opts.danda && !opts.avagraha && !opts.visarga) return input;

  let out = '';

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (opts.danda && ch === '|') {
      // Double first: a single-char rule applied left to right would turn
      // "||" into "।।", which is a different character sequence from "॥".
      if (input[i + 1] === '|') {
        out += DOUBLE_DANDA;
        i += 1;
      } else {
        out += DANDA;
      }
      continue;
    }

    // Left flank must be o or e (see AVAGRAHA_LEFT), right flank any letter.
    // U+2019 is included because iOS and macOS substitute a curly apostrophe
    // for a typed one, and the user should not have to notice.
    if (opts.avagraha && (ch === "'" || ch === '’')) {
      const left = input[i - 1];
      if (left !== undefined && AVAGRAHA_LEFT.has(left) && isLetter(input[i + 1])) {
        out += AVAGRAHA;
        continue;
      }
    }

    // NOTE the asymmetry with avagraha above: ":" becomes the ASCII letter "h",
    // NOT the visarga character. It is deliberate and it matters.
    //
    // core/src/tokenize.ts classifies every non-ASCII character as `punct`, so
    // substituting ଃ directly SPLITS the roman token in two and each half is
    // then transliterated blind. "du:kha" came out ଦୁ + ଃ + ଖା — ଖା because
    // that is a frequent Odia word in its own right — even though ଦୁଃଖ (7,364
    // in the web corpus) sits in the lexicon under exactly the key "duhkha".
    //
    // Mapping to "h" keeps the word whole, so BOTH routes work: the lexicon
    // matches the full key, and for an out-of-vocabulary word the S3 rule
    // (ଃ before a consonant) still produces the visarga.
    //
    // Avagraha does not have this problem, because it only ever occurs at a
    // sandhi seam BETWEEN two words — ସୋ + ଽ + ହଂ, ଦ୍ୱିତୀୟୋ + ଽ + ଧ୍ୟାୟଃ. There
    // the split is not damage, it is the correct analysis. A visarga is
    // word-internal, so splitting on it is simply wrong.
    if (opts.visarga && ch === ':') {
      if (isLetter(input[i - 1]) && isLetter(input[i + 1])) {
        out += 'h';
        continue;
      }
    }

    out += ch;
  }

  return out;
}

/**
 * A short cheat sheet for the UI, so the conventions are discoverable without
 * reading this file. Kept next to the implementation on purpose: a hint that
 * drifts from the behaviour is worse than no hint.
 */
export const PREPROCESS_HINTS: readonly { typed: string; gives: string; example: string }[] = [
  { typed: '|', gives: DANDA, example: 'balam | → ବଳଂ ।' },
  { typed: '||', gives: DOUBLE_DANDA, example: 'balam || → ବଳଂ ॥' },
  { typed: "'", gives: AVAGRAHA, example: "so'ham → ସୋଽହଂ" },
  { typed: ':', gives: VISARGA, example: 'du:kha → ଦୁଃଖ' },
];
