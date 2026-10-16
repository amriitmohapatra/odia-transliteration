import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { parseGlosses, parseMeanings, parseVerbEndings } from '@odia/core';
import { canonical } from '@odia/core/normalize';
import { findEntry, foldKey, defAt, meaningFinder, parsePayload } from '../../Appv2/src/dictionary/lookup.js';
import { parseOrigin } from '../../Appv2/src/dictionary/origin.js';
import { parseLoans } from '../../Appv2/src/dictionary/loans.js';
import { chooseSplits, describeWord, partGloss, splitPoints, type LensData } from '../src/describe.js';
import { wordAt, wordBefore } from '../src/word.js';
import { ASSIST_ORIGIN, ASSIST_PERMISSION } from '../src/assist.js';

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
  verbs: parseVerbEndings(file('../../core/data/verb-endings.tsv').toString('utf8')),
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

  it('finds a number in Odia digits (53), alone or with an ending', () => {
    const n53 = '\u0B6B\u0B69';
    expect(wordAt(`a ${n53} b`, 3)?.word).toBe(n53);
    expect(wordAt(`a ${n53}\u0B30\u0B47 b`, 2)?.word).toBe(`${n53}\u0B30\u0B47`);
  });
});

describe('describeWord: the lens card', () => {
  it('gives the owner meaning first, the pronunciation and no approximation for a headword', () => {
    const c = card(DINA);
    expect(c.roman).toBe('dina');
    expect(c.meanings[0]?.text).toBe('day');
    expect(c.approximateHead).toBeNull();
  });

  it('explains a stem match with the owner meaning of its stem: "day + in, at, on"', () => {
    const c = card(DINARE);
    expect(c.meanings[0]?.text).toBe('day + in, at, on');
    expect(c.approximateHead).toBeNull();
  });

  it('explains a verb form by its verb and ending, with no approximate note', () => {
    const c = card('\u0B16\u0B4B\u0B32\u0B3F\u0B1B\u0B3F'); // kholichhi: has opened
    expect(c.meanings[0]).toEqual({ text: 'open + has …-ed (he/she/it)', source: 'explained from its ending' });
    expect(c.meanings).toHaveLength(1);
    expect(c.approximateHead).toBeNull();
  });

  it('reads a number in Odia digits, with no approximate note', () => {
    const c = card('\u0B68\u0B66\u0B67\u0B6F\u0B30\u0B47'); // 2019 + re
    expect(c.meanings[0]).toEqual({ text: '2019 + in, at, on', source: 'number in Odia digits' });
    expect(c.meanings).toHaveLength(1);
    expect(c.approximateHead).toBeNull();
    expect(card('\u0B68\u0B6A').meanings[0]?.text).toBe('24');
  });

  it('marks a stem match as approximate when the stem has no modern meaning', () => {
    // kansaai (Praharaj: "Butcher") + re: Praharaj only (kumbhira, the earlier example,
    // got an AI meaning in batch 11).
    const KANSAAI_RE = '\u0B15\u0B02\u0B38\u0B3E\u0B07\u0B30\u0B47';
    const c = card(KANSAAI_RE);
    expect(c.approximateHead).not.toBeNull();
    expect(c.meanings.some((m) => m.text.startsWith('maybe: '))).toBe(true);
  });

  it('gives no guessed meaning for a word that only begins like a headword', () => {
    // Paporakis (a surname in the news): only its start paapa ("sin") is a headword.
    // Judged in context, such guesses were mostly wrong: no meaning instead.
    const c = card('\u0B2A\u0B3E\u0B2A\u0B4B\u0B30\u0B3E\u0B15\u0B3F\u0B38\u0B4D');
    expect(c.meanings).toEqual([]);
    expect(c.approximateHead).toBeNull();
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
    // V4.5: one optional host, the Odia app's own site, granted only when the reader
    // turns translation on in the settings page (lens/src/options.ts).
    expect(manifest.optional_host_permissions).toEqual([`${ASSIST_ORIGIN}/*`]);
    expect(ASSIST_PERMISSION.origins).toEqual(manifest.optional_host_permissions);
    expect(manifest.content_scripts).toBeUndefined();
    // offscreen: the OCR page of picture mode (V4.2); not a host permission.
    expect([...manifest.permissions].sort()).toEqual(['activeTab', 'offscreen', 'scripting']);
  });

  it('allows WebAssembly for the OCR engine, and no script from outside the extension', () => {
    expect(manifest.content_security_policy.extension_pages).toBe("script-src 'self' 'wasm-unsafe-eval'; object-src 'self'");
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

describe('a known word plus a known ending', () => {
  it('explains a stem match from the AI layer: "entry + in, at, on" (prabesha + re)', () => {
    const c = card('\u0B2A\u0B4D\u0B30\u0B2C\u0B47\u0B36\u0B30\u0B47');
    expect(c.meanings[0]).toEqual({ text: 'entry + in, at, on', source: 'explained from its ending' });
    expect(c.formation).toContain('\u0B30\u0B47');
    expect(c.approximateHead).toBeNull();
  });
});

describe('a word explained from its parts', () => {
  const JIBANA = '\u0B1C\u0B40\u0B2C\u0B28'; // life
  const SHAILI = '\u0B36\u0B48\u0B33\u0B40'; // style
  const word = JIBANA + SHAILI;

  it('cuts only between letter clusters, into parts of two letters or more', () => {
    const cuts = splitPoints(word).map(([a, b]) => `${a}|${b}`);
    expect(cuts).toContain(`${JIBANA}|${SHAILI}`);
    // Never before a vowel sign, never after a virama.
    expect(splitPoints(word).every(([, b]) => !/^[\u0B3E-\u0B57]/.test(b))).toBe(true);
    const PRAKASHA = '\u0B2A\u0B4D\u0B30\u0B15\u0B3E\u0B36'; // pra-kaa-sha
    expect(splitPoints(PRAKASHA).every(([a]) => !a.endsWith('\u0B4D'))).toBe(true);
    // A one-letter tail (re, "in") is an ending, not a word.
    expect(splitPoints(JIBANA + '\u0B30\u0B47').map(([a]) => a)).not.toContain(JIBANA);
  });

  it('never takes a case form as the second part', () => {
    const JOURNALIST = '\u0B38\u0B3E\u0B2E\u0B4D\u0B2C\u0B3E\u0B26\u0B3F\u0B15';
    const TAAKU = '\u0B24\u0B3E\u0B15\u0B41'; // taa + ku, "him"
    const known = (w: string) => w === JOURNALIST || w === TAAKU;
    expect(chooseSplits(JOURNALIST + TAAKU, known)).toEqual([[JOURNALIST, TAAKU]]);
    expect(chooseSplits(JOURNALIST + TAAKU, known, (w) => w === TAAKU)).toEqual([]);
  });

  it('needs both parts known, and prefers an even cut', () => {
    const known = (w: string) => [JIBANA, SHAILI, '\u0B1C\u0B40', '\u0B2C\u0B28\u0B36\u0B48\u0B33\u0B40'].includes(w);
    expect(chooseSplits(word, known)[0]).toEqual([JIBANA, SHAILI]);
    expect(chooseSplits(word, () => false)).toEqual([]);
  });

  it('keeps a part meaning short and in lower case', () => {
    expect(partGloss('Life; lifetime')).toBe('life');
    expect(partGloss('maybe: Style, manner')).toBe('style');
    expect(partGloss('AI')).toBe('AI');
    expect(partGloss('an inflection for the dative case')).toBeNull();
  });

  it('shows the parts on the card, with how the word is made', () => {
    const key = foldKey(word);
    const entry = findEntry(P.keys, key);
    // Without the AI layer, which now has this word itself (batch 10).
    const c = describeWord(word, key, entry, entry ? defAt(P, entry.index) : null, { ...data, ai: null }, '', [
      { word: JIBANA, gloss: 'life' },
      { word: SHAILI, gloss: 'style' },
    ]);
    expect(c.meanings[0]).toEqual({ text: 'life + style', source: 'guessed from its parts' });
    expect(c.formation).toBe(`${JIBANA} (life) + ${SHAILI} (style)`);
    expect(c.approximateHead).toBeNull();
  });
});
