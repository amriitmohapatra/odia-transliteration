import { describe, it, expect } from 'vitest';

import { isCanonical, codepoints } from '../src/normalize.js';
import { segment } from '../src/segment.js';
import type { RuleCandidate } from '../src/segment.js';
import {
  testRules,
  ACHHA,
  ANUSVARA,
  DAAKA,
  GADA,
  KAMALA,
  KAMAL_HALANTA,
  NAMASKAARA,
  ODIA,
  PRECOMPOSED_RRA,
  RAAMA,
  RRA,
  VIRAMA,
} from './helpers.js';

const rules = testRules();

/** Segment with a wide enough window that these tests describe the lattice, not the cut-off. */
function spellings(roman: string, limit = 40): RuleCandidate[] {
  return segment(rules, roman, { limit });
}

function texts(roman: string, limit = 40): string[] {
  return spellings(roman, limit).map((c) => c.text);
}

function scoreOf(roman: string, text: string): number {
  const hit = spellings(roman).find((c) => c.text === text);
  if (hit === undefined) {
    throw new Error(`${roman} never produced ${codepoints(text)}; got ${texts(roman).join(' ')}`);
  }
  return hit.score;
}

describe('segment: the nukta invariant', () => {
  it('reaches the canonical RRA from a plain intervocalic "d" in "odisha"', () => {
    const candidates = texts('odisha');
    expect(
      candidates.some((t) => t.includes(RRA)),
      `no candidate contained U+0B21 U+0B3C: ${candidates.join(' ')}`,
    ).toBe(true);
  });

  it('never emits the precomposed RRA for "odisha"', () => {
    // The whole project's failure mode in one assertion. U+0B5C is visually
    // identical to the canonical spelling and stops matching after any NFC pass.
    for (const text of texts('odisha')) {
      expect(text.includes(PRECOMPOSED_RRA), `U+0B5C in ${codepoints(text)}`).toBe(false);
    }
  });

  it('spells the language name from "odia"', () => {
    expect(texts('odia')).toContain(ODIA);
  });

  it('emits only canonical strings, for every word it is given', () => {
    for (const roman of ['odisha', 'odia', 'padhiba', 'namaskaara', 'sankhya', 'gada', 'rh']) {
      for (const candidate of spellings(roman)) {
        expect(
          isCanonical(candidate.text),
          `${roman} produced non-canonical ${codepoints(candidate.text)}`,
        ).toBe(true);
      }
    }
  });
});

describe('segment: positional context', () => {
  /*
   * The hypothesis encoded in symbols.toml: the flap ଡ଼ is common between
   * vowels and rare word-initially, so a plain "d" should land on the right
   * letter without the user marking anything. Contexts are resolved against
   * the ROMAN string, which is what makes "gada" intervocalic even though the
   * Odia spelling ଗଡ଼ shows no vowel after the flap at all.
   */

  it('scores the flap highly between vowels', () => {
    expect(scoreOf('gada', GADA)).toBeGreaterThan(0.5);
  });

  it('scores the flap very low word-initially', () => {
    expect(scoreOf('daaka', DAAKA)).toBeLessThan(0.2);
  });

  it('prefers the plain letters word-initially', () => {
    const ordered = texts('daaka');
    expect(ordered.indexOf(DAAKA)).toBeGreaterThan(2);
  });

  it('offers the flap word-finally too', () => {
    expect(texts('gad').some((t) => t.includes(RRA))).toBe(true);
  });
});

describe('segment: orthography assembly', () => {
  it('joins consonant to consonant with a virama, giving NAMASKAARA', () => {
    expect(texts('namaskaara')).toContain(NAMASKAARA);
  });

  it('uses the matra form after a consonant and the independent form otherwise', () => {
    expect(texts('ki')).toContain('\u0B15\u0B3F'); // matra
    expect(texts('i')).toContain('\u0B07'); // independent
  });

  it('treats a vowel after another vowel as independent', () => {
    // ଓଡ଼ିଆ ends in the independent ଆ, not a second matra on ି.
    expect(ODIA.endsWith('\u0B06')).toBe(true);
    expect(texts('odia')).toContain(ODIA);
  });

  it('writes a trailing "a" after a consonant as the inherent vowel, with no matra', () => {
    const kamala = spellings('kamal').find((c) => c.text === KAMALA);
    expect(kamala).toBeDefined();
    expect(KAMALA.includes(VIRAMA)).toBe(false);
    expect(texts('rama')).toContain(RAAMA);
  });

  it('emits BOTH readings of a word-final bare consonant', () => {
    // "kamal" is କମଲ or କମଲ୍ and the rules cannot tell; the lexicon can.
    const candidates = texts('kamal');
    expect(candidates).toContain(KAMALA);
    expect(candidates).toContain(KAMAL_HALANTA);
    expect(scoreOf('kamal', KAMALA)).toBeGreaterThan(scoreOf('kamal', KAMAL_HALANTA));
  });

  it('adds an anusvara edge for a nasal before a consonant', () => {
    const candidates = texts('sankhya');
    expect(
      candidates.some((t) => t.includes(ANUSVARA)),
      `no anusvara candidate: ${candidates.join(' ')}`,
    ).toBe(true);
  });

  it('does not put a sign at the start of a word', () => {
    // A sign hangs off the preceding letter; nothing precedes position 0.
    for (const text of texts('nka')) {
      expect(text.startsWith(ANUSVARA)).toBe(false);
    }
  });

  it('matches multi-character keys longest-first, so "chha" reaches CHHA', () => {
    expect(texts('achha')[0]).toBe(ACHHA);
  });
});

describe('segment: scoring and the beam', () => {
  it('returns candidates sorted best first, with the best normalised to 1', () => {
    const candidates = spellings('namaskaara');
    expect(candidates[0]?.score).toBe(1);
    for (let i = 1; i < candidates.length; i += 1) {
      expect(candidates[i]?.score).toBeLessThanOrEqual(candidates[i - 1]?.score as number);
    }
  });

  it('normalises independently of word length, so long words are not penalised', () => {
    expect(spellings('kemiti')[0]?.score).toBe(1);
    expect(spellings('k')[0]?.score).toBe(1);
    expect(spellings('sarbasaadhaarana')[0]?.score).toBe(1);
  });

  it('never returns the same spelling twice', () => {
    const candidates = texts('daaka');
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it('honours the beam width', () => {
    const narrow = segment(rules, 'namaskaara', { beam: 1, limit: 50 });
    const wide = segment(rules, 'namaskaara', { beam: 12, limit: 50 });
    expect(narrow.length).toBeLessThan(wide.length);
    // Even at beam 1 the search must still find the obvious reading.
    expect(narrow[0]?.text).toBe(NAMASKAARA);
  });

  it('honours the candidate limit', () => {
    expect(segment(rules, 'namaskaara', { limit: 3 })).toHaveLength(3);
  });

  it('returns nothing for an empty token', () => {
    expect(segment(rules, '')).toEqual([]);
  });
});
