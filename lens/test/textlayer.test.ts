// The PDF reader's typed-text path (V4.7): runs → lines and words, the visual
// vowel order, and the per-page trust gate. Odia as \u escapes.
import { describe, expect, it } from 'vitest';
import { canonical } from '@odia/core/normalize';
import { TEXT_MIN_WORDS, fixOrder, logicalOrder, spokenWords, textLines, trustText } from '../src/textlayer.js';

const KA = '\u0b15';
const E = '\u0b47';
const AA = '\u0b3e';
const AU_MARK = '\u0b57';
const VIRAMA = '\u0b4d';
const PA = '\u0b2a';
const RA = '\u0b30';
const MA = '\u0b2e';
const BA = '\u0b2c';
const LA = '\u0b32';
const I = '\u0b3f';

describe('logicalOrder: vowel signs drawn before their consonant', () => {
  it('moves e after the consonant when the word starts with it', () => {
    expect(logicalOrder(E + KA + E + KA)).toBe(KA + E + KA + E);
  });
  it('moves e after a whole conjunct (pa + virama + ra)', () => {
    expect(logicalOrder(E + PA + VIRAMA + RA + MA)).toBe(PA + VIRAMA + RA + E + MA);
  });
  it('e ... aa becomes o, e ... au mark becomes au, after canonical()', () => {
    expect(canonical(logicalOrder(E + BA + AA + LA + I))).toBe(BA + '\u0b4b' + LA + I);
    expect(canonical(logicalOrder(E + KA + AU_MARK))).toBe(KA + '\u0b4c');
  });
  it('leaves a word without e or ai alone', () => {
    expect(logicalOrder('\u0b13\u0b21\u0b3c\u0b3f\u0b36\u0b3e')).toBe('\u0b13\u0b21\u0b3c\u0b3f\u0b36\u0b3e');
  });
});

describe('fixOrder: the order that makes a known word', () => {
  const DINA = '\u0b26\u0b3f\u0b28';
  const dinare = DINA + RA + E; // in the day
  const drawn = DINA + E + RA; // as a PDF often stores it
  const counts = new Map([[dinare, 5000], [drawn, 3], [KA + E + KA, 900]]);
  const count = (w: string) => counts.get(w) ?? 0;
  it('a sign in the middle is moved only when that makes a more frequent word', () => {
    expect(fixOrder(drawn, count)).toBe(dinare);
    expect(fixOrder(KA + E + KA, count)).toBe(KA + E + KA);
  });
  it('a sign at the start is always moved', () => {
    expect(fixOrder(E + KA + KA, () => 0)).toBe(KA + E + KA);
  });
  it('neither order known: left as it is', () => {
    expect(fixOrder(KA + E + MA, () => 0)).toBe(KA + E + MA);
  });
});

describe('textLines: stored spaces are the word breaks', () => {
  it('a small gap inside a word is not a space when the PDF stores spaces', () => {
    const lines = textLines([
      { str: `${PA}${VIRAMA}${RA}`, x: 0, y: 20, width: 20, height: 20 },
      { str: `${BA}${E} ${KA}`, x: 25, y: 20, width: 40, height: 20 },
    ]);
    expect(lines[0]!.words.map((w) => w.text)).toEqual([`${PA}${VIRAMA}${RA}${BA}${E}`, KA]);
  });
});

describe('textLines: runs → lines and words with boxes', () => {
  it('splits words at spaces and at gaps between runs, and lines at a new baseline', () => {
    const lines = textLines([
      { str: `${KA}${AA} ${BA}${LA}`, x: 10, y: 50, width: 100, height: 20 },
      { str: `${MA}${AA}`, x: 140, y: 50, width: 30, height: 20, eol: true },
      { str: `${PA}${AA}`, x: 10, y: 80, width: 30, height: 20 },
    ]);
    expect(lines.map((l) => l.words.map((w) => w.text))).toEqual([[`${KA}${AA}`, `${BA}${LA}`, `${MA}${AA}`], [`${PA}${AA}`]]);
    const [first, second] = lines[0]!.words;
    expect(first!.box.x0).toBe(10);
    expect(first!.box.x1).toBeLessThan(second!.box.x0);
    expect(lines[0]!.words[2]!.box.x0).toBe(140);
    expect(lines[1]!.box.y0).toBeGreaterThan(lines[0]!.box.y1 - 10);
    expect(lines[0]!.words.every((w) => w.conf === 100)).toBe(true);
  });
  it('a run with no space before it, but a visible gap, still starts a new word', () => {
    const lines = textLines([
      { str: `${KA}${AA}`, x: 0, y: 20, width: 20, height: 20 },
      { str: `${BA}${AA}`, x: 30, y: 20, width: 20, height: 20 },
    ]);
    expect(lines[0]!.words).toHaveLength(2);
  });
});

describe('trustText: only real Odia text is used', () => {
  const line = (words: string[]) => ({ box: { x0: 0, y0: 0, x1: 1, y1: 1 }, words: words.map((text) => ({ text, conf: 100, box: { x0: 0, y0: 0, x1: 1, y1: 1 } })) });
  const known = (w: string) => w.startsWith(KA);
  it('enough Odia words, most known: use it', () => {
    const words = Array.from({ length: TEXT_MIN_WORDS }, (_, i) => (i < 18 ? KA + AA : BA + LA));
    expect(trustText([line(words)], known).use).toBe(true);
  });
  it('an old non-Unicode font (Latin letters): do not use it', () => {
    expect(trustText([line(Array.from({ length: 40 }, () => 'D\u00d2b\u00feB'))], known).use).toBe(false);
  });
  it('words with a broken character (a conjunct with no text) count as unknown', () => {
    const words = Array.from({ length: 25 }, (_, i) => (i < 20 ? KA + AA : KA + '\u0000' + AA));
    expect(trustText([line(words)], known).use).toBe(false);
  });
  it('Odia letters but mostly unknown words (broken text or an OCR layer): do not use it', () => {
    expect(trustText([line(Array.from({ length: 40 }, () => BA + LA))], known).use).toBe(false);
  });
});

describe('spokenWords: a word split where its vowel sign is drawn', () => {
  const box = { x0: 0, y0: 0, x1: 10, y1: 10 };
  const SHA = '\u0b36';
  const prabesha = PA + VIRAMA + RA + BA + E + SHA; // prabesha (entry)
  // The fragment "pra" is common in real word counts (broken PDF text): no guide.
  const counts = new Map([[prabesha, 4000], [PA + VIRAMA + RA, 9000], [KA + E + KA, 50], [MA + E, 300]]);
  const count = (w: string) => counts.get(w) ?? 0;
  it('joins "pra | e ba sha" into prabesha and puts e after ba', () => {
    const out = spokenWords([{ text: PA + VIRAMA + RA, conf: 100, box }, { text: E + BA + SHA, conf: 100, box: { x0: 12, y0: 0, x1: 30, y1: 10 } }], count);
    expect(out.map((w) => w.text)).toEqual([prabesha]);
    expect(out[0]!.box).toEqual({ x0: 0, y0: 0, x1: 30, y1: 10 });
  });
  it('keeps two words apart when joining does not make a more frequent word', () => {
    const out = spokenWords([{ text: KA + E + KA, conf: 100, box }, { text: E + MA, conf: 100, box }], count);
    expect(out.map((w) => w.text)).toEqual([KA + E + KA, MA + E]);
  });
});
