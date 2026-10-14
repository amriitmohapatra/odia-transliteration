import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { defAt, findEntry, findModern, foldKey, modernLines, parsePayload, shortGlossOf } from '../src/dictionary/lookup.js';

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
