import { describe, it, expect } from 'vitest';

import {
  canonical,
  isCanonical,
  assertCanonical,
  codepoints,
  splitClusters,
  DDA_NUKTA,
  DDHA_NUKTA,
  NUKTA,
  VIRAMA,
} from '../src/normalize.js';

/*
 * Everything in this file is written with \u escapes rather than Odia
 * literals. The whole point of these tests is that the canonical and
 * precomposed spellings of RRA/RHA are visually indistinguishable, so a test
 * written with literals could not be reviewed, and a stray copy-paste would
 * quietly assert the opposite of what is intended.
 *
 *   RRA canonical      U+0B21 U+0B3C        precomposed  U+0B5C
 *   RHA canonical      U+0B22 U+0B3C        precomposed  U+0B5D
 */

const PRECOMPOSED_RRA = '\u0B5C';
const PRECOMPOSED_RHA = '\u0B5D';
const CANONICAL_RRA = '\u0B21\u0B3C';
const CANONICAL_RHA = '\u0B22\u0B3C';

/** U+0B5F ODIA LETTER YYA. Atomic, no decomposition, must survive untouched. */
const YYA = '\u0B5F';

/** "Odisha" spelled with the precomposed RRA, i.e. the wrong way. */
const ODISHA_PRECOMPOSED = '\u0B13' + PRECOMPOSED_RRA + '\u0B3F\u0B36\u0B3E';
/** The same word spelled correctly. */
const ODISHA_CANONICAL = '\u0B13' + CANONICAL_RRA + '\u0B3F\u0B36\u0B3E';

/** "Odia", the language name, also containing RRA. */
const ODIA_PRECOMPOSED = '\u0B13' + PRECOMPOSED_RRA + '\u0B3F\u0B06';
const ODIA_CANONICAL = '\u0B13' + CANONICAL_RRA + '\u0B3F\u0B06';

/**
 * Fixtures spanning every behaviour canonical() has to get right: already
 * canonical text, precomposed nukta text, decomposed matras, conjuncts,
 * empty and pure-Latin strings, and mixed script.
 */
const FIXTURES: readonly string[] = [
  '',
  ' ',
  'odisha',
  'PCR',
  PRECOMPOSED_RRA,
  PRECOMPOSED_RHA,
  CANONICAL_RRA,
  CANONICAL_RHA,
  YYA,
  ODISHA_PRECOMPOSED,
  ODISHA_CANONICAL,
  ODIA_PRECOMPOSED,
  ODIA_CANONICAL,
  '\u0B15\u0B47\u0B2E\u0B3F\u0B24\u0B3F', // kemiti
  '\u0B05\u0B1B', // achha
  '\u0B15\u0B4D\u0B37', // ka + virama + ssa, a conjunct
  '\u0B38\u0B02\u0B16\u0B4D' + YYA + '\u0B3E', // sankhya, uses YYA and anusvara
  '\u0B15\u0B47\u0B3E', // ka + decomposed O matra
  '\u0B15\u0B4B', // ka + composed O matra
  '\u0B15\u0B47\u0B56', // ka + decomposed AI matra
  '\u0B15\u0B47\u0B57', // ka + decomposed AU matra
  '\u0B15\u0B2E\u0B32\u0B4D', // kamal with a trailing halanta
  'PCR ' + ODIA_CANONICAL + ' Bayesian 42',
  '\u{1F600}', // astral, to prove nothing indexes by UTF-16 unit
];

describe('canonical: the nukta invariant', () => {
  it('rewrites the precomposed RRA to base + nukta', () => {
    expect(canonical(PRECOMPOSED_RRA)).toBe('\u0B21\u0B3C');
  });

  it('rewrites the precomposed RHA to base + nukta', () => {
    expect(canonical(PRECOMPOSED_RHA)).toBe('\u0B22\u0B3C');
  });

  it('exports constants that match the canonical spellings', () => {
    expect(DDA_NUKTA).toBe('\u0B21\u0B3C');
    expect(DDHA_NUKTA).toBe('\u0B22\u0B3C');
    expect(NUKTA).toBe('\u0B3C');
    expect(VIRAMA).toBe('\u0B4D');
  });

  it('does not recompose an already-decomposed nukta form', () => {
    // If NFC ever put U+0B5C back together, every lexicon key would rot.
    expect(canonical(CANONICAL_RRA)).toBe(CANONICAL_RRA);
    expect(canonical(CANONICAL_RHA)).toBe(CANONICAL_RHA);
  });

  it('fixes the word Odisha, which is the case that actually bites', () => {
    const out = canonical(ODISHA_PRECOMPOSED);
    expect(out).toBe(ODISHA_CANONICAL);
    expect(out).toContain('\u0B3C');
    expect(out).not.toContain('\u0B5C');
  });

  it('fixes the language name Odia too', () => {
    expect(canonical(ODIA_PRECOMPOSED)).toBe(ODIA_CANONICAL);
  });

  it('leaves YYA (U+0B5F) untouched', () => {
    expect(canonical(YYA)).toBe(YYA);
    expect(canonical('\u0B16\u0B4D' + YYA + '\u0B3E')).toBe('\u0B16\u0B4D' + YYA + '\u0B3E');
  });

  it('never emits a precomposed nukta character for any fixture', () => {
    for (const fixture of FIXTURES) {
      const out = canonical(fixture);
      expect(out.includes('\u0B5C'), `U+0B5C survived in ${codepoints(fixture)}`).toBe(false);
      expect(out.includes('\u0B5D'), `U+0B5D survived in ${codepoints(fixture)}`).toBe(false);
    }
  });

  it('leaves ASCII and empty input alone', () => {
    expect(canonical('')).toBe('');
    expect(canonical('kemiti achha')).toBe('kemiti achha');
  });
});

describe('canonical: vowel-sign composition', () => {
  // NFC composes matras, the opposite direction to the nukta characters.
  it('composes the O matra', () => {
    expect(canonical('\u0B47\u0B3E')).toBe('\u0B4B');
  });

  it('composes the AI matra', () => {
    expect(canonical('\u0B47\u0B56')).toBe('\u0B48');
  });

  it('composes the AU matra', () => {
    expect(canonical('\u0B47\u0B57')).toBe('\u0B4C');
  });

  it('composes matras attached to a consonant', () => {
    expect(canonical('\u0B15\u0B47\u0B3E')).toBe('\u0B15\u0B4B');
  });

  it('leaves no decomposed matra sequence in any fixture', () => {
    const decomposed = ['\u0B47\u0B3E', '\u0B47\u0B56', '\u0B47\u0B57'];
    for (const fixture of FIXTURES) {
      const out = canonical(fixture);
      for (const seq of decomposed) {
        expect(out.includes(seq), `${codepoints(seq)} survived in ${codepoints(fixture)}`).toBe(
          false,
        );
      }
    }
  });
});

describe('canonical: idempotence', () => {
  it('is idempotent over every fixture', () => {
    for (const fixture of FIXTURES) {
      const once = canonical(fixture);
      expect(canonical(once), `not idempotent for ${codepoints(fixture)}`).toBe(once);
    }
  });

  it('is idempotent under a further NFC pass', () => {
    // Something downstream (a text field, a clipboard, a file system) will
    // apply NFC to our output sooner or later. It must be a no-op.
    for (const fixture of FIXTURES) {
      const once = canonical(fixture);
      expect(once.normalize('NFC'), `NFC changed output for ${codepoints(fixture)}`).toBe(once);
    }
  });
});

describe('isCanonical', () => {
  it('agrees with canonical on every fixture', () => {
    for (const fixture of FIXTURES) {
      expect(isCanonical(fixture), `disagreement on ${codepoints(fixture)}`).toBe(
        canonical(fixture) === fixture,
      );
    }
  });

  it('accepts everything canonical() produces', () => {
    for (const fixture of FIXTURES) {
      expect(isCanonical(canonical(fixture))).toBe(true);
    }
  });

  it('rejects precomposed nukta characters', () => {
    expect(isCanonical(PRECOMPOSED_RRA)).toBe(false);
    expect(isCanonical(PRECOMPOSED_RHA)).toBe(false);
    expect(isCanonical(ODISHA_PRECOMPOSED)).toBe(false);
  });

  it('rejects decomposed matras', () => {
    expect(isCanonical('\u0B15\u0B47\u0B3E')).toBe(false);
  });

  it('accepts the canonical spellings', () => {
    expect(isCanonical(CANONICAL_RRA)).toBe(true);
    expect(isCanonical(ODISHA_CANONICAL)).toBe(true);
    expect(isCanonical(YYA)).toBe(true);
  });
});

describe('assertCanonical', () => {
  it('passes canonical strings through silently', () => {
    expect(() => assertCanonical(ODISHA_CANONICAL, 'test')).not.toThrow();
  });

  it('throws, naming the source and both code point sequences', () => {
    expect(() => assertCanonical(PRECOMPOSED_RRA, "symbols.toml consonant 'rh'")).toThrow(
      /symbols\.toml consonant 'rh'/,
    );
    expect(() => assertCanonical(PRECOMPOSED_RRA, 'test')).toThrow(/U\+0B5C/);
    expect(() => assertCanonical(PRECOMPOSED_RRA, 'test')).toThrow(/U\+0B21 U\+0B3C/);
  });
});

describe('codepoints', () => {
  it('renders the canonical nukta form the way the CLI must show it', () => {
    expect(codepoints(CANONICAL_RRA)).toBe('U+0B21 U+0B3C');
    expect(codepoints(canonical(PRECOMPOSED_RRA))).toBe('U+0B21 U+0B3C');
  });

  it('renders the precomposed form distinguishably', () => {
    expect(codepoints(PRECOMPOSED_RRA)).toBe('U+0B5C');
  });

  it('pads to at least four hex digits and handles astral characters', () => {
    expect(codepoints('A')).toBe('U+0041');
    expect(codepoints('\u{1F600}')).toBe('U+1F600');
  });

  it('returns an empty string for empty input', () => {
    expect(codepoints('')).toBe('');
  });
});

describe('splitClusters', () => {
  it('keeps a nukta and its matra with the base consonant', () => {
    expect(splitClusters(ODISHA_CANONICAL)).toEqual([
      '\u0B13',
      '\u0B21\u0B3C\u0B3F',
      '\u0B36\u0B3E',
    ]);
  });

  it('keeps a virama conjunct together', () => {
    expect(splitClusters('\u0B15\u0B4D\u0B37')).toEqual(['\u0B15\u0B4D\u0B37']);
  });

  it('keeps a trailing halanta attached to its consonant', () => {
    expect(splitClusters('\u0B15\u0B2E\u0B32\u0B4D')).toEqual([
      '\u0B15',
      '\u0B2E',
      '\u0B32\u0B4D',
    ]);
  });

  it('keeps anusvara with its base and a three-part conjunct together', () => {
    // sankhya: sa | anusvara on sa | kha + virama + yya + aa matra
    expect(splitClusters('\u0B38\u0B02\u0B16\u0B4D' + YYA + '\u0B3E')).toEqual([
      '\u0B38\u0B02',
      '\u0B16\u0B4D' + YYA + '\u0B3E',
    ]);
  });

  it('treats non-Odia characters as one cluster each', () => {
    expect(splitClusters('abc 1')).toEqual(['a', 'b', 'c', ' ', '1']);
    expect(splitClusters('\u{1F600}')).toEqual(['\u{1F600}']);
  });

  it('round-trips: joining the clusters reproduces the input', () => {
    for (const fixture of FIXTURES) {
      expect(splitClusters(fixture).join(''), `round-trip failed for ${codepoints(fixture)}`).toBe(
        fixture,
      );
    }
  });
});
