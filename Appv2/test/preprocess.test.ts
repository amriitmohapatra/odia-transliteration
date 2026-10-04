import { describe, expect, it } from 'vitest';

import {
  AVAGRAHA,
  DANDA,
  DOUBLE_DANDA,
  preprocess,
  PREPROCESS_ALL,
  PREPROCESS_DANDA_ONLY,
  VISARGA,
} from '../src/preprocess.js';

describe('danda', () => {
  it('maps | and ||', () => {
    expect(preprocess('balam |', PREPROCESS_ALL)).toBe(`balam ${DANDA}`);
    expect(preprocess('balam ||', PREPROCESS_ALL)).toBe(`balam ${DOUBLE_DANDA}`);
  });

  it('tries the double form first', () => {
    // A naive left-to-right single-character rule would emit "।।", which is a
    // different sequence from "॥" and would not round-trip.
    expect(preprocess('||', PREPROCESS_ALL)).toBe(DOUBLE_DANDA);
    expect(preprocess('||', PREPROCESS_ALL)).not.toBe(DANDA + DANDA);
  });

  it('handles an odd run', () => {
    expect(preprocess('|||', PREPROCESS_ALL)).toBe(DOUBLE_DANDA + DANDA);
  });
});

describe('avagraha', () => {
  it('fires after o and e', () => {
    expect(preprocess("so'ham", PREPROCESS_ALL)).toBe(`so${AVAGRAHA}ham`);
    expect(preprocess("te'pi", PREPROCESS_ALL)).toBe(`te${AVAGRAHA}pi`);
  });

  it('fires after an already-committed Odia o or e', () => {
    // InlineCandidates.commit writes chosen Odia back into the same textarea,
    // so by the time preprocess runs the left flank is often Odia, not Latin.
    // Without this the avagraha would work before committing a word and stop
    // working after — a bug that looks intermittent.
    expect(preprocess("ସୋ'ham", PREPROCESS_ALL)).toBe(`ସୋ${AVAGRAHA}ham`);
  });

  it('leaves English contractions alone', () => {
    // The reason the guard is {o, e} and not "any letter": 98% of avagraha in
    // core/data/webfreq.tsv follows ୋ or େ, which is what Sanskrit sandhi
    // predicts, and a letters-both-sides guard mangles every contraction.
    expect(preprocess("don't", PREPROCESS_ALL)).toBe("don't");
    expect(preprocess("Krishna's", PREPROCESS_ALL)).toBe("Krishna's");
    expect(preprocess("isn't", PREPROCESS_ALL)).toBe("isn't");
  });

  it('accepts the curly apostrophe iOS substitutes', () => {
    expect(preprocess('so’ham', PREPROCESS_ALL)).toBe(`so${AVAGRAHA}ham`);
  });

  it('needs a letter on the right', () => {
    expect(preprocess("so' ham", PREPROCESS_ALL)).toBe("so' ham");
    expect(preprocess("so'", PREPROCESS_ALL)).toBe("so'");
  });
});

describe('visarga', () => {
  it('maps to the ASCII letter h, not to the visarga character', () => {
    // Deliberate. tokenize() classifies non-ASCII as punct, so emitting ଃ here
    // would SPLIT the roman token and each half would be transliterated blind:
    // "du:kha" became ଦୁ + ଃ + ଖା even though ଦୁଃଖ is in the lexicon under the
    // key "duhkha". Mapping to "h" keeps the word whole.
    expect(preprocess('du:kha', PREPROCESS_ALL)).toBe('duhkha');
    expect(preprocess('du:kha', PREPROCESS_ALL)).not.toContain(VISARGA);
  });

  it('leaves times and labels alone', () => {
    expect(preprocess('12:30', PREPROCESS_ALL)).toBe('12:30');
    expect(preprocess('note: this', PREPROCESS_ALL)).toBe('note: this');
    expect(preprocess('http://x', PREPROCESS_ALL)).toBe('http://x');
  });
});

describe('options', () => {
  it('honours the per-profile flags', () => {
    expect(preprocess("so'ham | du:kha", PREPROCESS_DANDA_ONLY)).toBe(
      `so'ham ${DANDA} du:kha`,
    );
  });

  it('is the identity when everything is off', () => {
    const off = { danda: false, avagraha: false, visarga: false };
    const input = "so'ham | du:kha ||";
    expect(preprocess(input, off)).toBe(input);
  });
});

describe('the offset invariant', () => {
  /*
   * main.ts computes ONE preprocessed string and passes it to BOTH
   * engine.transliterate() and buildOutput(). It has to, because preprocess is
   * not length-preserving: "||" -> "॥" shrinks the text by one character. If
   * the raw string went to one and the preprocessed string to the other,
   * locate()'s indexOf offsets would drift and the output would silently
   * duplicate or drop text.
   *
   * These tests pin the property that makes that a real hazard rather than a
   * theoretical one, so nobody "simplifies" render() by re-reading the textarea.
   */
  it('is not length-preserving', () => {
    expect(preprocess('a || b', PREPROCESS_ALL).length).toBe('a || b'.length - 1);
  });

  it('is length-preserving for the single-character marks', () => {
    for (const input of ['a | b', "so'ham", 'du:kha']) {
      expect(preprocess(input, PREPROCESS_ALL).length).toBe(input.length);
    }
  });

  it('is idempotent on its own output', () => {
    // The output contains ।, ॥ and ଽ, none of which are triggers, so a second
    // pass must be a no-op. render() runs on every keystroke over a buffer that
    // already holds committed Odia.
    const once = preprocess("so'ham balam || du:kha", PREPROCESS_ALL);
    expect(preprocess(once, PREPROCESS_ALL)).toBe(once);
  });
});
