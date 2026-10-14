import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { parseGlosses, parseMeanings } from '@odia/core';
import { canonical } from '@odia/core/normalize';
import { findEntry, foldKey, defAt, meaningFinder, parsePayload } from '../../Appv2/src/dictionary/lookup.js';
import { parseOrigin } from '../../Appv2/src/dictionary/origin.js';
import { parseLoans } from '../../Appv2/src/dictionary/loans.js';
import { describeWord, type LensData } from '../src/describe.js';
import { wordAt, wordBefore } from '../src/word.js';

/* Odia as \u escapes (repo convention). */
const DINA = '\u0B26\u0B3F\u0B28'; // day
const DINARE = DINA + '\u0B30\u0B47'; // in the day
const DANDA = '\u0964';
const ZWJ = '\u200D';
const VOWEL_SIGN_I = '\u0B3F';

const file = (p: string) => readFileSync(new URL(p, import.meta.url));
const P = parsePayload(new Uint8Array(file('../../Appv2/src/dictionary/praharaj.bin')));
const data: LensData = {
  modern: parsePayload(new Uint8Array(file('../../Appv2/src/dictionary/modern.bin'))),
  origin: parseOrigin(gunzipSync(file('../../Appv2/src/dictionary/origin.bin')).toString('utf8'), P.keys),
  owner: parseGlosses(file('../../core/data/glosses.tsv').toString('utf8')),
  loans: parseLoans(file('../../Appv2/src/dictionary/loans.tsv').toString('utf8')),
  ai: meaningFinder(parseMeanings(file('../../core/data/meanings.tsv').toString('utf8'))),
};
const card = (word: string, previous = '') => {
  const key = foldKey(word);
  const entry = findEntry(P.keys, key);
  return describeWord(word, key, entry, entry ? defAt(P, entry.index) : null, data, previous);
};

describe('wordAt: the Odia word at a caret position', () => {
  const text = `Hello ${DINA} ${DINARE}${DANDA} end`;
  const at = text.indexOf(DINA);

  it('finds the word around the position, and at its end', () => {
    expect(wordAt(text, at + 1)?.word).toBe(DINA);
    expect(wordAt(text, at + DINA.length)?.word).toBe(DINA);
  });

  it('stops at the danda and at Latin letters and spaces', () => {
    expect(wordAt(text, text.indexOf(DINARE) + 2)?.word).toBe(DINARE);
    expect(wordAt(text, 1)).toBeNull();
    expect(wordAt(text, text.length - 1)).toBeNull();
  });

  it('keeps a joiner inside a word, and ignores a lone vowel sign', () => {
    expect(wordAt(`${DINA}${ZWJ}${DINA}`, 1)?.word).toBe(`${DINA}${ZWJ}${DINA}`);
    expect(wordAt(` ${VOWEL_SIGN_I} `, 1)).toBeNull();
  });
});

describe('describeWord: the lens card', () => {
  it('gives the owner meaning first, the pronunciation and no approximation for a headword', () => {
    const c = card(DINA);
    expect(c.roman).toBe('dina');
    expect(c.meanings[0]?.text).toBe('day');
    expect(c.approximateHead).toBeNull();
  });

  it('marks a stem match as approximate and names the headword', () => {
    const c = card(DINARE);
    expect(c.approximateHead).toBe(DINA);
    expect(c.meanings.some((m) => m.text.startsWith('maybe: '))).toBe(true);
  });

  it('names an English loan word', () => {
    const [english, loans] = [...data.loans.byEnglish].find(([, l]) => l[0]?.language === 'en')!;
    expect(card(loans[0]!.odia).loan).toBe(`English loan word: ${english}`);
  });

  it('works on canonical text whatever the page sent', () => {
    expect(card(DINA).word).toBe(canonical(DINA));
  });
});

describe('the shipped manifest', () => {
  const manifest = JSON.parse(file('../static/manifest.json').toString('utf8'));

  it('asks for no host permissions: the lens reads only a tab the user turned it on for', () => {
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect([...manifest.permissions].sort()).toEqual(['activeTab', 'scripting']);
  });
});

describe('the owner\'s headline (odia.news18.com, 2026-10-14): every word has a meaning', () => {
  // \u0B28\u0B3F\u0B30\u0B4D\u0B2C\u0B3E\u0B1A\u0B28 \u0B2A\u0B42\u0B30\u0B4D\u0B2C\u0B30\u0B41 \u0B30\u0B23\u0B15\u0B4D\u0B37\u0B47\u0B24\u0B4D\u0B30 \u0B2A\u0B3E\u0B32\u0B1F\u0B3F\u0B32\u0B3E \u0B09\u0B24\u0B4D\u0B15\u0B33 \u0B2C\u0B3F\u0B36\u0B4D\u0B35\u0B2C\u0B3F\u0B26\u0B4D\u0B5F\u0B3E\u0B33\u0B5F, \u0B05\u0B23\u0B1B\u0B3E\u0B24\u0B4D\u0B30 \u0B2A\u0B4D\u0B30\u0B2C\u0B47\u0B36\u0B15\u0B41 \u0B28\u0B47\u0B07 ... \u0B13 ... \u0B2E\u0B41\u0B39\u0B3E\u0B01\u0B2E\u0B41\u0B39\u0B3F\u0B01
  const HEADLINE = '\u0B28\u0B3F\u0B30\u0B4D\u0B2C\u0B3E\u0B1A\u0B28 \u0B2A\u0B42\u0B30\u0B4D\u0B2C\u0B30\u0B41 \u0B30\u0B23\u0B15\u0B4D\u0B37\u0B47\u0B24\u0B4D\u0B30 \u0B2A\u0B3E\u0B32\u0B1F\u0B3F\u0B32\u0B3E \u0B09\u0B24\u0B4D\u0B15\u0B33 \u0B2C\u0B3F\u0B36\u0B4D\u0B35\u0B2C\u0B3F\u0B26\u0B4D\u0B5F\u0B3E\u0B33\u0B5F \u0B05\u0B23\u0B1B\u0B3E\u0B24\u0B4D\u0B30 \u0B2A\u0B4D\u0B30\u0B2C\u0B47\u0B36\u0B15\u0B41 \u0B28\u0B47\u0B07 \u0B13 \u0B2E\u0B41\u0B39\u0B3E\u0B01\u0B2E\u0B41\u0B39\u0B3F\u0B01';
  const words = HEADLINE.split(' ');

  it('gives each word a meaning for that exact word (none approximate)', () => {
    for (const w of words) {
      const c = card(w);
      expect(c.meanings.length, w).toBeGreaterThan(0);
      expect(c.approximateHead, w).toBeNull();
    }
  });

  it('reads the right senses: battlefield, turned into, Utkal, non-student, and', () => {
    expect(card(words[2]!).meanings[0]?.text).toBe('battlefield');
    expect(card(words[3]!).meanings[0]?.text).toContain('turned into');
    expect(card(words[4]!).meanings[0]?.text).toContain('Odisha');
    expect(card(words[6]!).meanings[0]?.text).toContain('non-student');
    expect(card(words[9]!).meanings[0]?.text).toBe('and');
  });

  it('reads nei after a word in -ku as "over; regarding", not the Hindi "no"', () => {
    const c = card(words[8]!, words[7]!);
    expect(c.meanings[0]?.text).toBe('over; regarding');
    expect(c.meanings[0]?.source).toContain('in this phrase');
    expect(c.meanings.some((m) => /^not$/i.test(m.text))).toBe(false);
  });

  it('finds the AI entry for a page spelling with another va letter (fold)', () => {
    expect(card(words[5]!).meanings[0]?.text).toBe('university');
  });

  it('wordBefore gives the previous word one space back, and nothing across a danda', () => {
    const text = `${words[7]} ${words[8]}`;
    expect(wordBefore(text, text.indexOf(words[8]!))).toBe(words[7]);
    expect(wordBefore(`${words[7]}\u0964 ${words[8]}`, words[7]!.length + 2)).toBe('');
  });
});
