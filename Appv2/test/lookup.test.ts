import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseMeanings } from '@odia/core';

import {
  defAt,
  findEntry,
  findModern,
  foldKey,
  meaningFinder,
  modernLines,
  parsePayload,
  readNumber,
  shortGlossOf,
} from '../src/dictionary/lookup.js';

/*
 * The shared lookup (app Meanings panel and the Odia Lens extension), on the
 * shipped payloads. Odia as \u escapes.
 */

const DINA = '\u0B26\u0B3F\u0B28'; // day
const DINARE = DINA + '\u0B30\u0B47'; // in the day: stem match
const ODISHA_CANONICAL = '\u0B13\u0B21\u0B3C\u0B3F\u0B36\u0B3E';
const ODISHA_PRECOMPOSED = '\u0B13\u0B5C\u0B3F\u0B36\u0B3E';

const P = parsePayload(new Uint8Array(readFileSync(new URL('../src/dictionary/praharaj.bin', import.meta.url))));
const M = parsePayload(new Uint8Array(readFileSync(new URL('../src/dictionary/modern.bin', import.meta.url))));

describe('shared dictionary lookup', () => {
  it('finds an exact headword and its short English gloss', () => {
    const entry = findEntry(P.keys, foldKey(DINA));
    expect(entry).toMatchObject({ how: 'exact', head: DINA });
    // "day" in the app comes from the owner's glosses.tsv; Praharaj's own text is "Day.".
    expect(shortGlossOf(defAt(P, entry!.index))).toBe('Day.');
  });

  it('finds an inflected form by its stem, marked as a stem match', () => {
    expect(findEntry(P.keys, foldKey(DINARE))).toMatchObject({ how: 'stem', head: DINA });
  });

  it('folds a precomposed nukta letter from a web page to the canonical key', () => {
    expect(foldKey(ODISHA_PRECOMPOSED)).toBe(foldKey(ODISHA_CANONICAL));
    expect(findEntry(P.keys, foldKey(ODISHA_PRECOMPOSED))).toEqual(findEntry(P.keys, foldKey(ODISHA_CANONICAL)));
  });

  it('returns nothing for an empty key, and modern lines as tag and gloss', () => {
    expect(findEntry(P.keys, '')).toBeNull();
    expect(findModern(M.keys, '')).toBeNull();
    expect(modernLines('mt\tgood\ncldr\tOdia')).toEqual([
      { tag: 'mt', gloss: 'good' },
      { tag: 'cldr', gloss: 'Odia' },
    ]);
  });
});

describe('readNumber: numbers in Odia digits', () => {
  const AI = meaningFinder(
    parseMeanings(readFileSync(new URL('../../core/data/meanings.tsv', import.meta.url), 'utf8'), 'meanings.tsv'),
  );
  const read = (w: string) => readNumber(w, AI)?.text ?? null;

  it('reads a bare number, a counting word and a case ending', () => {
    expect(read('୨୪')).toBe('24');
    expect(read('୬ଟି')).toBe('6 (things)');
    expect(read('୨ଜଣ')).toBe('2 (persons)');
    expect(read('୨୦୧୯ରେ')).toBe('2019 + in, at, on');
    expect(readNumber('୨୦୧୯ରେ', AI)?.formation).toBe(
      '୨୦୧୯ (2019) + ରେ (in, at, on)',
    );
  });

  it('reads ordinals, including 11th to 13th', () => {
    expect(read('୨ୟ')).toBe('2nd');
    expect(read('୪ର୍ଥ')).toBe('4th');
    expect(read('୧୧ମ')).toBe('11th');
    expect(read('୨୧ମ')).toBe('21st');
  });

  it('gives nothing for a word, or a number with an unknown rest', () => {
    expect(read('ଦିନ')).toBeNull();
    expect(read('୨କୋଟି')).toBeNull(); // 2 + koti (crore): not a known ending
  });
});
