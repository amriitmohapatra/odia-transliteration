import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseMeanings, parseVerbEndings } from '@odia/core';

import {
  defAt,
  explainVerb,
  findEntry,
  findModern,
  foldKey,
  meaningFinder,
  modernLines,
  parsePayload,
  readNumber,
  shortGlossOf,
  verbOf,
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

describe('explainVerb: verb forms by their ending', () => {
  const VERBS = parseVerbEndings(readFileSync(new URL('../../core/data/verb-endings.tsv', import.meta.url), 'utf8'));
  const KARIBAA = 'କରିବା'; // to do
  const PAAIBAA = 'ପାଇବା'; // to get
  const YIBAA = 'ଯିବା'; // to go
  const DEKHIBAA = 'ଦେଖିବା'; // to see
  const known = new Map([
    [KARIBAA, 'to do; doing'],
    [PAAIBAA, 'to get; getting'],
    [YIBAA, 'to go; going'],
    [DEKHIBAA, 'to see; seeing'],
  ]);
  const read = (w: string) => explainVerb(w, null, VERBS, (x) => known.get(x) ?? null)?.text ?? null;

  it('reads a consonant root, a vowel root and an irregular root', () => {
    expect(read('କରିଛନ୍ତି')).toBe('do + have …-ed (they, or respectful)'); // karichhanti
    expect(read('ପାଇଛନ୍ତି')).toBe('get + have …-ed (they, or respectful)'); // paaichhanti
    expect(read('ଯାଇଛି')).toBe('go + has …-ed (he/she/it)'); // yaaichhi
    expect(read('କରାଯାଇଛି')).toBe('do + has been …-ed'); // karaayaaichhi
    expect(explainVerb('କରିବେ', null, VERBS, (x) => known.get(x) ?? null)?.formation).toBe(
      'କର (do) + ିବେ (will … (they, or respectful))',
    );
  });

  it('does not take a causative, a noun or an exact headword for a verb form', () => {
    expect(read('ଦେଖାଇଛନ୍ତି')).toBeNull(); // dekhaaichhanti: "have shown", not "see"
    expect(read('ଘରେ')).toBeNull(); // ghare: in the house
    expect(explainVerb('କରିଛି', { how: 'exact', head: 'x', index: 0 }, VERBS, () => 'to do')).toBeNull();
    // Only a meaning that starts "to ..." is a verb.
    expect(explainVerb('କରିଛି', null, VERBS, () => 'doing')).toBeNull();
  });

  it('takes the verb from a verbal-noun meaning', () => {
    expect(verbOf('to throw, drop; throwing')).toBe('throw, drop');
    expect(verbOf('to be, to become; becoming')).toBe('be, become');
    expect(verbOf('doing')).toBeNull();
  });
});


describe('modern layer: no calendar abbreviations (owner report, 2026-10-15)', () => {
  const lines = (i: number): string[] => M.defs.slice(M.offsets[i], (M.offsets[i] as number) + (M.lens[i] as number)).split('\n');
  it('CLDR month and weekday names only on the full Gregorian names', () => {
    for (let i = 0; i < M.keys.length; i++) {
      for (const line of lines(i)) {
        if (/^cldr\t.*\((month|weekday)\)$/.test(line)) expect((M.keys[i] as string).length, `${M.keys[i]}: ${line}`).toBeGreaterThan(1);
        if (/^cldr\t.*\(weekday\)$/.test(line)) expect(M.keys[i]).toMatch(/\u0b2c\u0b3e\u0b30$/);
      }
    }
  });
  it('the possessive particle RA is not "Sunday", the negation NA not "November"', () => {
    for (const key of ['\u0b30', '\u0b28', '\u0b2e', '\u0b05', '\u0b17\u0b41\u0b30\u0b41', '\u0b1a\u0b48\u0b24\u0b4d\u0b30']) {
      const i = M.keys.indexOf(key);
      if (i >= 0) expect(lines(i).some((l) => l.startsWith('cldr\t'))).toBe(false);
    }
  });
});
