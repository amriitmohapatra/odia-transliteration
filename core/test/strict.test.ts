import { describe, it, expect } from 'vitest';

import { codepoints, isCanonical } from '../src/normalize.js';
import { loadRules } from '../src/rules.js';
import { strictTransliterate } from '../src/strict.js';
import type { StrictScheme } from '../src/types.js';
import { testRules, NAMASKAARA, PRECOMPOSED_RRA, RHA, RRA, SYMBOLS_TOML, VIRAMA } from './helpers.js';

const scheme = testRules().strictSchemes?.get('itrans') as StrictScheme;

const strict = (input: string): string => strictTransliterate(scheme, input);

describe('strict: the table loads', () => {
  it('is registered under the name itrans', () => {
    expect(scheme).toBeDefined();
    expect(scheme.name).toBe('itrans');
  });

  it('generated the consonant x vowel product, not just the bare letters', () => {
    // A table with only the ~50 declared letters could not spell "ki" in one
    // key, which is the property the whole longest-match loop rests on.
    expect(scheme.map.size).toBeGreaterThan(500);
    expect(scheme.maxKeyLength).toBeGreaterThanOrEqual(4);
  });

  it('is absent when itrans.toml was not supplied', () => {
    expect(loadRules(SYMBOLS_TOML).strictSchemes).toBeUndefined();
  });
});

describe('strict: determinism and case', () => {
  it('gives the same answer every time', () => {
    expect(strict('namaskAra')).toBe(strict('namaskAra'));
  });

  it('distinguishes retroflex from dental by case, unlike natural mode', () => {
    expect(strict('Ta')).toBe('\u0B1F');
    expect(strict('ta')).toBe('\u0B24');
    expect(strict('Da')).toBe('\u0B21');
    expect(strict('da')).toBe('\u0B26');
    expect(strict('Na')).toBe('\u0B23');
    expect(strict('na')).toBe('\u0B28');
  });

  it('distinguishes the long vowels by case', () => {
    expect(strict('ki')).toBe('\u0B15\u0B3F');
    expect(strict('kI')).toBe('\u0B15\u0B40');
    expect(strict('ku')).toBe('\u0B15\u0B41');
    expect(strict('kU')).toBe('\u0B15\u0B42');
  });
});

describe('strict: orthography', () => {
  it('gives a bare consonant its virama', () => {
    expect(strict('k')).toBe('\u0B15' + VIRAMA);
  });

  it('gives a consonant plus vowel the matra, with no virama', () => {
    expect(strict('ki')).toBe('\u0B15\u0B3F');
    expect(strict('ki')).not.toContain(VIRAMA);
  });

  it('gives a vowel on its own the independent form', () => {
    expect(strict('i')).toBe('\u0B07');
    expect(strict('A')).toBe('\u0B06');
  });

  it('writes the inherent vowel as nothing at all', () => {
    expect(strict('ka')).toBe('\u0B15');
  });

  it('builds conjuncts, so "namaskAra" is NAMASKAARA with a ss-ka conjunct', () => {
    expect(strict('namaskAra')).toBe(NAMASKAARA);
  });

  it('treats kSh as one letter', () => {
    expect(strict('kSh')).toBe('\u0B15\u0B4D\u0B37' + VIRAMA);
    expect(strict('kShi')).toBe('\u0B15\u0B4D\u0B37\u0B3F');
  });

  it('places anusvara after the syllable it belongs to', () => {
    // saMkhyA -> ସଂଖ୍ଯା
    expect(strict('saMkhyA')).toBe('\u0B38\u0B02\u0B16' + VIRAMA + '\u0B2F\u0B3E');
  });
});

describe('strict: the nukta invariant', () => {
  it('spells .D decomposed', () => {
    expect(codepoints(strict('.Da'))).toBe('U+0B21 U+0B3C');
    expect(strict('.Di')).toBe(RRA + '\u0B3F');
  });

  it('spells .Dh decomposed', () => {
    expect(codepoints(strict('.Dha'))).toBe('U+0B22 U+0B3C');
    expect(strict('.Dh')).toBe(RHA + VIRAMA);
  });

  it('never emits a precomposed nukta character', () => {
    for (const input of ['.Da', '.Dha', '.Di', 'o.DishA', 'ba.Da']) {
      expect(strict(input)).not.toContain(PRECOMPOSED_RRA);
      expect(strict(input)).not.toContain('\u0B5D');
    }
  });

  it('leaves the atomic YYA alone', () => {
    expect(strict('Ya')).toBe('\u0B5F');
  });
});

describe('strict: passthrough', () => {
  it('leaves whitespace, punctuation and digits untouched', () => {
    expect(strict('ka, 42!')).toBe('\u0B15, 42!');
    expect(strict('  ')).toBe('  ');
  });

  it('leaves characters the table does not know', () => {
    // "P" and "R" are not ITRANS keys, so they survive as themselves rather
    // than being silently dropped.
    expect(strict('PR')).toBe('PR');
  });

  it('returns empty for empty input', () => {
    expect(strict('')).toBe('');
  });

  it('emits canonical output for every fixture', () => {
    for (const input of ['namaskAra', 'o.DishA', 'saMkhyA', 'kemiti achha', 'ka, 42!', 'ke', 'keA']) {
      expect(isCanonical(strict(input)), `non-canonical for ${input}`).toBe(true);
    }
  });
});
