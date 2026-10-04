/**
 * Canonical Unicode form for Odia text. This is the invariant module: every
 * other module calls into it, and every string crossing a boundary — rule
 * file load, lexicon key, engine output, learn() input, data build output —
 * must pass through `canonical()`.
 *
 * The trap, stated once:
 *
 *     RRA  =  U+0B21 + U+0B3C (nukta)      never U+0B5C
 *     RHA  =  U+0B22 + U+0B3C (nukta)      never U+0B5D
 *
 * U+0B5C and U+0B5D carry a canonical decomposition and sit on the Unicode
 * composition-exclusion list, so NFC pulls them apart and never puts them
 * back. Vowel signs go the other way: NFC composes U+0B47 U+0B3E into U+0B4B.
 * U+0B5F has no decomposition and is left alone.
 *
 * A lexicon keyed on precomposed nukta forms silently stops matching after
 * any NFC pass. Odia's own name contains one, so this breaks common words,
 * not edge cases. Verify by code point, never by eye: the two spellings are
 * visually identical, which is why this file uses escapes and not literals.
 */

/* ------------------------------------------------------------------ *
 * Code points the rest of the engine should refer to by name
 * ------------------------------------------------------------------ */

/** U+0B3C ODIA SIGN NUKTA. */
export const NUKTA = '\u0B3C';

/** U+0B4D ODIA SIGN VIRAMA (halanta). */
export const VIRAMA = '\u0B4D';

/** RRA in canonical (decomposed) form: U+0B21 U+0B3C. */
export const DDA_NUKTA = '\u0B21\u0B3C';

/** RHA in canonical (decomposed) form: U+0B22 U+0B3C. */
export const DDHA_NUKTA = '\u0B22\u0B3C';

/** U+0B5C, the forbidden precomposed RRA. */
const PRECOMPOSED_DDA_NUKTA = '\u0B5C';

/** U+0B5D, the forbidden precomposed RHA. */
const PRECOMPOSED_DDHA_NUKTA = '\u0B5D';

/* ------------------------------------------------------------------ *
 * canonical / isCanonical
 * ------------------------------------------------------------------ */

/**
 * Put a string into the project's canonical form: NFC, then an explicit
 * rewrite of any surviving precomposed nukta character.
 *
 * The rewrite is belt and braces. NFC alone should already have decomposed
 * U+0B5C and U+0B5D, but "should already" is exactly the assumption that
 * produces a lexicon which stops matching six months later.
 */
export function canonical(s: string): string {
  if (s.length === 0) return s;

  let out = s.normalize('NFC');

  // Cheap guard: the vast majority of strings contain neither character.
  if (out.indexOf(PRECOMPOSED_DDA_NUKTA) !== -1) {
    out = out.replaceAll(PRECOMPOSED_DDA_NUKTA, DDA_NUKTA);
  }
  if (out.indexOf(PRECOMPOSED_DDHA_NUKTA) !== -1) {
    out = out.replaceAll(PRECOMPOSED_DDHA_NUKTA, DDHA_NUKTA);
  }

  return out;
}

/**
 * True when `s` is already in canonical form, i.e. `canonical(s) === s`.
 *
 * Implemented independently of `canonical()` rather than by calling it, so
 * that the two can be cross-checked against each other in the tests.
 */
export function isCanonical(s: string): boolean {
  if (s.indexOf(PRECOMPOSED_DDA_NUKTA) !== -1) return false;
  if (s.indexOf(PRECOMPOSED_DDHA_NUKTA) !== -1) return false;
  return s.normalize('NFC') === s;
}

/**
 * Throw loudly if `s` is not canonical. Rule loading and data building use
 * this: a non-canonical Odia string must fail at startup, not degrade
 * transliteration quality quietly.
 *
 * @param where  A short label naming the offending source, e.g.
 *               "symbols.toml consonant 'rh'". It ends up in the message.
 */
export function assertCanonical(s: string, where: string): void {
  if (!isCanonical(s)) {
    throw new Error(
      `Non-canonical Odia string in ${where}: ${codepoints(s)} ` +
        `(expected ${codepoints(canonical(s))})`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Inspection
 * ------------------------------------------------------------------ */

/**
 * Render a string as space-separated code points, e.g. "U+0B21 U+0B3C".
 * This is what the CLI's `--codepoints` flag prints, and the only honest way
 * to check nukta encoding, since the two spellings look identical.
 */
export function codepoints(s: string): string {
  const parts: string[] = [];
  // Iterating the string (not indexing it) keeps surrogate pairs intact.
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    parts.push('U+' + cp.toString(16).toUpperCase().padStart(4, '0'));
  }
  return parts.join(' ');
}

/* ------------------------------------------------------------------ *
 * Cluster splitting
 * ------------------------------------------------------------------ */

const CP_NUKTA = 0x0b3c;
const CP_VIRAMA = 0x0b4d;

/** Marks that attach to the preceding base: candrabindu, anusvara, visarga, nukta, matras. */
function isOdiaCombining(cp: number): boolean {
  if (cp >= 0x0b01 && cp <= 0x0b03) return true; // candrabindu, anusvara, visarga
  if (cp === CP_NUKTA) return true;
  if (cp >= 0x0b3e && cp <= 0x0b44) return true; // matras aa .. vocalic rr
  if (cp === 0x0b47 || cp === 0x0b48) return true; // e, ai
  if (cp === 0x0b4b || cp === 0x0b4c) return true; // o, au
  if (cp >= 0x0b55 && cp <= 0x0b57) return true; // overline, ai/au length marks
  if (cp === 0x0b62 || cp === 0x0b63) return true; // vocalic l, ll matras
  return false;
}

/** Independent vowels, consonants, and the atomic letters U+0B5F and U+0B71. */
function isOdiaLetter(cp: number): boolean {
  if (cp >= 0x0b05 && cp <= 0x0b0c) return true; // a .. vocalic l
  if (cp === 0x0b0f || cp === 0x0b10) return true; // e, ai
  if (cp === 0x0b13 || cp === 0x0b14) return true; // o, au
  if (cp >= 0x0b15 && cp <= 0x0b39) return true; // ka .. ha
  if (cp === 0x0b5c || cp === 0x0b5d) return true; // precomposed forms, tolerated for robustness
  if (cp === 0x0b5f) return true;
  if (cp === 0x0b71) return true;
  return false;
}

/**
 * Split a string into cursor-safe clusters: a base character together with
 * everything that visually hangs off it, including virama-joined conjuncts.
 * A ka+virama+ssa conjunct is one cluster, a consonant plus nukta plus matra
 * is one cluster, and a trailing halanta stays attached to its consonant.
 *
 * Deliberately hand-rolled rather than delegating to `Intl.Segmenter`. This
 * primitive decides where a delete key lands inside an input method, and it
 * must behave identically on node, in Safari and in JavaScriptCore, none of
 * which are guaranteed to carry the same ICU version.
 *
 * Non-Odia characters become one cluster each, so Latin, digits and
 * punctuation pass through unharmed.
 */
export function splitClusters(s: string): string[] {
  const chars = Array.from(s); // code points, so astral characters survive
  const clusters: string[] = [];
  let i = 0;

  while (i < chars.length) {
    const start = i;
    i += 1; // the base character, whatever it is

    // Absorb marks, then optionally a virama plus the consonant it joins to,
    // and repeat: ka + virama + ssa + matra is a single cluster.
    for (;;) {
      while (i < chars.length && isOdiaCombining(cpAt(chars, i))) i += 1;

      if (i < chars.length && cpAt(chars, i) === CP_VIRAMA) {
        i += 1; // the virama itself always belongs to this cluster
        if (i < chars.length && isOdiaLetter(cpAt(chars, i))) {
          i += 1; // the joined consonant; loop again for its own marks
          continue;
        }
      }
      break;
    }

    clusters.push(chars.slice(start, i).join(''));
  }

  return clusters;
}

function cpAt(chars: string[], i: number): number {
  return (chars[i] as string).codePointAt(0) as number;
}
