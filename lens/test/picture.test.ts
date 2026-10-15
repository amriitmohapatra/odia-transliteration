import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { boundedDistance, parseWordList, separate } from '../src/correct.js';
import { cleanRead, findLine, lineScale, mapBox, pickLine, pickWord, regionAround, type OcrWord } from '../src/picture.js';

/* Picture mode (V4.2): the pure parts. Odia as \u escapes. */

const SARAKARA = '\u0b38\u0b30\u0b15\u0b3e\u0b30'; // government
const PARIBARA = '\u0b2a\u0b30\u0b3f\u0b2c\u0b3e\u0b30'; // family
const PARABARA = '\u0b2a\u0b30\u0b2c\u0b3e\u0b30'; // as OCR reads it: the i-matra lost
const RAJYA = '\u0b30\u0b3e\u0b1c\u0b4d\u0b5f'; // state, with yya
const RAJYA_YA = '\u0b30\u0b3e\u0b1c\u0b4d\u0b2f'; // the same with ya, as OCR may write it
const FIVE = '\u0b6b';

const list = parseWordList(readFileSync(new URL('../../core/data/indiccorp-words.tsv', import.meta.url), 'utf8'));
const word = (text: string, x0: number, x1: number, conf = 90): OcrWord => ({ text, conf, box: { x0, y0: 10, x1, y1: 30 } });

describe('correcting OCR words with the IndicCorp word list', () => {
  it('has the 100,000 words (fewer once ya / yya spellings fold together) and keeps a known word', () => {
    expect(list.size).toBeGreaterThan(95000);
    expect(list.correct(SARAKARA)).toEqual({ word: SARAKARA, distance: 0 });
  });

  it('gives a known word the list spelling (ya and yya are one letter for the lookup)', () => {
    expect(list.correct(RAJYA_YA)).toEqual({ word: RAJYA, distance: 0 });
  });

  it('puts back a lost i-matra: the misprint is in the list, but 300 times rarer', () => {
    expect(list.correct(PARABARA)).toEqual({ word: PARIBARA, distance: 1 });
  });

  it('keeps two real words apart (samaana "equal" is not a misprint of sammaana "honour")', () => {
    const SAMAANA = '\u0B38\u0B2E\u0B3E\u0B28';
    expect(list.correct(SAMAANA)).toEqual({ word: SAMAANA, distance: 0 });
  });

  it('leaves a word alone when nothing is close', () => {
    const junk = '\u0b19\u0b19\u0b19\u0b19\u0b19\u0b19';
    expect(list.correct(junk)).toEqual({ word: junk, distance: null });
  });

  it('measures edits with a limit', () => {
    expect(boundedDistance('abcd', 'abdc', 2)).toBe(1); // a swap is one edit
    expect(boundedDistance('abcdef', 'uvwxyz', 2)).toBe(3); // over the limit: limit + 1
  });

  it('splits a run-together word and a number stuck to a word', () => {
    expect(list.split(SARAKARA + PARIBARA)).toEqual([SARAKARA, PARIBARA]);
    const parts = separate([word(FIVE + SARAKARA, 0, 60)], list, (t) => t);
    expect(parts.map((p) => p.text)).toEqual([FIVE, SARAKARA]);
    expect(parts[0]?.box.x1).toBeCloseTo(10); // one letter of six
    const marked = separate([word(`${SARAKARA}'${RAJYA}`, 0, 110)], list, (t) => t);
    expect(marked.map((p) => p.text)).toEqual([SARAKARA, RAJYA]);
    expect(marked[1]?.whole).toBe(`${SARAKARA}'${RAJYA}`); // the card can say what the piece came from
  });

  it('does not split a run-together word that the dictionaries explain as a whole', () => {
    const joined = SARAKARA + PARIBARA;
    const whole = separate([word(joined, 0, 120)], list, (t) => t, (t) => t === joined);
    expect(whole.map((p) => p.text)).toEqual([joined]);
    expect(whole[0]?.whole).toBeUndefined();
  });
});

describe('finding the word under the pointer', () => {
  const line = [word(SARAKARA, 0, 50), word('--', 55, 60), word(RAJYA, 70, 120)];

  it('picks the Odia word whose box holds the point, or the nearest within a few pixels', () => {
    expect(pickWord(line, 25, 20)).toBe(0);
    expect(pickWord(line, 66, 20)).toBe(2); // in the gap, 4 px from the word
    expect(pickWord(line, 57, 20)).toBe(-1); // over the dash: not Odia, words too far
  });

  it('picks the line under the point, or the nearest within half a line height', () => {
    const lines = [
      { box: { x0: 0, y0: 10, x1: 120, y1: 30 }, words: line },
      { box: { x0: 0, y0: 40, x1: 120, y1: 60 }, words: [word(PARIBARA, 0, 60)] },
    ];
    expect(pickLine(lines, 10, 20)?.words[0]?.text).toBe(SARAKARA);
    expect(pickLine(lines, 10, 36)?.words[0]?.text).toBe(PARIBARA); // the gap: nearer the second
    expect(pickLine(lines, 10, 90)).toBeNull();
  });

  it('enlarges small print more than large print, within 1× to 4×', () => {
    expect(lineScale(8)).toBe(4);
    expect(lineScale(32)).toBe(2);
    expect(lineScale(200)).toBe(1);
  });

  it('maps boxes between screenshot pixels and page pixels, and keeps the region on the screen', () => {
    expect(mapBox({ x0: 10, y0: 10, x1: 20, y1: 30 }, 0.5, 100, 0)).toEqual({ x0: 55, y0: 5, x1: 60, y1: 15 });
    expect(regionAround(10, 10, 2, 1000, 800)).toEqual({ x0: 0, y0: 0, x1: 660, y1: 160 });
  });

  it('cleans punctuation and joiners off a read word', () => {
    expect(cleanRead(`\u201c${SARAKARA},`)).toBe(SARAKARA);
    expect(cleanRead(`${RAJYA}\u200c`)).toBe(RAJYA);
  });
});

describe('findLine: the text line under a point, from the pixels', () => {
  // A white image with two dark text lines (rows 10–19 and 30–39), each with two
  // "words" (blocks) and a word space; a column gutter, then a third block far right.
  const W = 300;
  const H = 50;
  const img = new Uint8Array(W * H).fill(255);
  const ink = (x0: number, x1: number, y0: number, y1: number): void => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img[y * W + x] = 20;
  };
  ink(10, 60, 10, 20);
  ink(66, 120, 10, 20); // word space of 6 px
  ink(10, 80, 30, 40);
  ink(200, 260, 10, 20); // 80 px away: a different column

  it('finds the line and follows it across word spaces but not across a gutter', () => {
    expect(findLine(img, W, H, 30, 15)).toEqual({ x0: 10, y0: 10, x1: 120, y1: 20 });
  });

  it('finds the line when the pointer is in the gap just below it, and nothing far from ink', () => {
    expect(findLine(img, W, H, 30, 23)?.y0).toBe(10);
    const blank = new Uint8Array(W * H).fill(255);
    expect(findLine(blank, W, H, 30, 15)).toBeNull();
  });

  it('reads light print on a dark bar the same way', () => {
    const inverted = img.map((v) => 255 - v);
    expect(findLine(inverted, W, H, 30, 15)).toEqual({ x0: 10, y0: 10, x1: 120, y1: 20 });
  });
});
