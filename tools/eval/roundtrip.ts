/**
 * Odia -> roman, i.e. what a person would plausibly type. Shared by the
 * round-trip harnesses (everyday.ts, context.ts); moved here verbatim from
 * everyday.ts so the two derive exactly the same roman.
 *
 * Two registers:
 *   careful  long vowels written out   bhaagya    romanize()
 *   casual   long vowels collapsed     bhagya     casual(romanize())
 *
 * Odia appears only as \u escapes (ARCHITECTURE.md I-7).
 */

const NUKTA = '\u0B3C';
const VIRAMA = '\u0B4D';

/* Longest-first so multi-codepoint clusters win. */
const CONSONANT: Record<string, string> = {
  ['\u0B15']: 'k', ['\u0B16']: 'kh', ['\u0B17']: 'g', ['\u0B18']: 'gh', ['\u0B19']: 'ng',
  ['\u0B1A']: 'ch', ['\u0B1B']: 'chh', ['\u0B1C']: 'j', ['\u0B1D']: 'jh', ['\u0B1E']: 'ny',
  ['\u0B1F']: 't', ['\u0B20']: 'th', ['\u0B21']: 'd', ['\u0B22']: 'dh', ['\u0B23']: 'n',
  ['\u0B24']: 't', ['\u0B25']: 'th', ['\u0B26']: 'd', ['\u0B27']: 'dh', ['\u0B28']: 'n',
  ['\u0B2A']: 'p', ['\u0B2B']: 'ph', ['\u0B2C']: 'b', ['\u0B2D']: 'bh', ['\u0B2E']: 'm',
  ['\u0B2F']: 'y', ['\u0B30']: 'r', ['\u0B32']: 'l', ['\u0B33']: 'l', ['\u0B71']: 'w',
  ['\u0B35']: 'w', ['\u0B36']: 'sh', ['\u0B37']: 'sh', ['\u0B38']: 's', ['\u0B39']: 'h',
  ['\u0B5F']: 'y',
};

/** Nukta clusters must be tried before their base consonant. */
const CLUSTER: Record<string, string> = {
  [`\u0B21${NUKTA}`]: 'd',
  [`\u0B22${NUKTA}`]: 'dh',
};

const INDEPENDENT: Record<string, string> = {
  ['\u0B05']: 'a', ['\u0B06']: 'aa', ['\u0B07']: 'i', ['\u0B08']: 'ii',
  ['\u0B09']: 'u', ['\u0B0A']: 'uu', ['\u0B0B']: 'ru', ['\u0B0F']: 'e',
  ['\u0B10']: 'ai', ['\u0B13']: 'o', ['\u0B14']: 'au',
};

const MATRA: Record<string, string> = {
  ['\u0B3E']: 'aa', ['\u0B3F']: 'i', ['\u0B40']: 'ii', ['\u0B41']: 'u',
  ['\u0B42']: 'uu', ['\u0B43']: 'ru', ['\u0B47']: 'e', ['\u0B48']: 'ai',
  ['\u0B4B']: 'o', ['\u0B4C']: 'au',
};

const SIGN: Record<string, string> = {
  ['\u0B02']: 'm', ['\u0B01']: 'n', ['\u0B03']: 'h',
};

/** Careful romanization of one canonical Odia word. */
export function romanize(word: string): string {
  let out = '';
  let i = 0;
  let pendingInherent = false;

  const flushInherent = () => {
    if (pendingInherent) { out += 'a'; pendingInherent = false; }
  };

  while (i < word.length) {
    const two = word.slice(i, i + 2);

    if (CLUSTER[two] !== undefined) {
      flushInherent();
      out += CLUSTER[two];
      pendingInherent = true;
      i += 2;
      continue;
    }

    const ch = word[i] as string;

    if (ch === VIRAMA) {
      // Explicit halant: the inherent vowel is suppressed.
      pendingInherent = false;
      i += 1;
      continue;
    }
    if (CONSONANT[ch] !== undefined) {
      flushInherent();
      out += CONSONANT[ch];
      pendingInherent = true;
      i += 1;
      continue;
    }
    if (MATRA[ch] !== undefined) {
      pendingInherent = false;      // the matra replaces the inherent vowel
      out += MATRA[ch];
      i += 1;
      continue;
    }
    if (INDEPENDENT[ch] !== undefined) {
      flushInherent();
      out += INDEPENDENT[ch];
      i += 1;
      continue;
    }
    if (SIGN[ch] !== undefined) {
      flushInherent();
      out += SIGN[ch];
      i += 1;
      continue;
    }
    if (ch === NUKTA) { i += 1; continue; }   // stray nukta

    i += 1;                                    // anything else: drop
  }
  flushInherent();
  return out;
}

/** How most people actually type: long vowels collapse to short. */
export function casual(roman: string): string {
  return roman
    .replace(/aa/g, 'a')
    .replace(/ii/g, 'i')
    .replace(/uu/g, 'u');
}
