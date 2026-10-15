/**
 * The PDF reader's typed-text path (V4.7): a PDF made from typed Odia (Word,
 * Google Docs, LibreOffice, a browser's print) carries its text. When that text
 * is real Unicode Odia, the reader uses it instead of OCR: exact and instant.
 *
 * pdf.js gives the text as runs (a string, its position, width and height);
 * this module turns runs into lines and words with boxes, in the same pixels as
 * the OCR path, so the reader handles both the same way. Pure functions,
 * unit-tested (lens/test/textlayer.test.ts).
 */

import type { Box, OcrLine, OcrWord } from './picture.js';

/** One pdf.js text run in page pixels: (x, y) is the left end of the baseline. */
export interface TextRun {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** pdf.js says a line ends after this run. */
  eol?: boolean;
}

const CONSONANT = '[\\u0b15-\\u0b39\\u0b5c\\u0b5d\\u0b5f\\u0b71]\\u0b3c?';
const CLUSTER = `${CONSONANT}(?:\\u0b4d${CONSONANT})*`;
/** A pre-base vowel sign (e, ai) written before the consonants it follows in speech. */
const VISUAL = new RegExp(`([\\u0b47\\u0b48])(${CLUSTER})`, 'g');

/**
 * Text taken from a shaped PDF is often in the order the letters are drawn: the
 * vowel signs e (U+0B47) and ai (U+0B48), drawn left of their consonant, come
 * before it. This puts every such sign after the consonant cluster that follows
 * it (canonical() then joins e + aa into o, and e + au-length mark into au).
 */
export function logicalOrder(word: string): string {
  return word.replace(VISUAL, '$2$1');
}

/**
 * The spoken (logical) order of a word from a PDF's text: reordered
 * (logicalOrder) when that form is more frequent in the word list (`count`, 0
 * for an unknown word), else as it is (the page gate then counts an unknown
 * word against the text layer). A sign at the very start of a word can only be
 * in drawn order, so it is always moved.
 */
export function fixOrder(word: string, count: (w: string) => number, canon: (w: string) => string = (w) => w): string {
  if (!/[\u0b47\u0b48]/.test(word)) return word;
  const moved = logicalOrder(word);
  if (/^[\u0b47\u0b48]/.test(word)) return moved;
  return count(canon(moved)) > count(canon(word)) ? moved : word;
}

/** How wide a character is drawn, roughly: letters 1, spacing vowel signs 0.6, marks above or below 0. */
function weight(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  if (c === 0x0b4d || c === 0x0b3c || c === 0x0b01 || c === 0x0b3f || c === 0x0b41 || c === 0x0b42 || c === 0x0b43 || c === 0x0b56 || c === 0x0b62 || c === 0x0b63) return 0;
  if (c >= 0x0b3e && c <= 0x0b57) return 0.6;
  if (c === 0x200c || c === 0x200d) return 0;
  return 1;
}

/** Lines of words from text runs (in reading order as pdf.js gives them), boxes in the runs' pixels. */
export function textLines(runs: readonly TextRun[]): OcrLine[] {
  // When the PDF stores spaces, they are the word breaks; a gap is a space only
  // when it is wide (glyph widths of conjuncts are often off). Without stored
  // spaces, a small gap is a space.
  const storesSpaces = runs.some((r) => /\s/.test(r.str));
  const gapForSpace = storesSpaces ? 1.0 : 0.2;
  interface Char {
    ch: string;
    x0: number;
    x1: number;
    top: number;
    bottom: number;
  }
  const lines: Char[][] = [];
  let line: Char[] = [];
  let lineY = Number.NaN;
  let lineH = 0;
  let endOfLine = false;
  for (const run of runs) {
    if (!run.str) {
      if (run.eol) endOfLine = true;
      continue;
    }
    const h = Math.max(1, run.height);
    const newLine = line.length > 0 && (endOfLine || Math.abs(run.y - lineY) > 0.5 * Math.max(h, lineH));
    if (newLine) {
      lines.push(line);
      line = [];
    }
    if (line.length === 0) {
      lineY = run.y;
      lineH = h;
    }
    endOfLine = !!run.eol;
    const top = run.y - h * 0.9;
    const bottom = run.y + h * 0.3;
    const last = line[line.length - 1];
    // A gap between runs is a space even when the PDF stores none.
    if (last && last.ch !== ' ' && !/^\s/.test(run.str) && run.x - last.x1 > gapForSpace * h) {
      line.push({ ch: ' ', x0: last.x1, x1: run.x, top, bottom });
    }
    const chars = Array.from(run.str);
    const total = chars.reduce((s, ch) => s + (/\s/.test(ch) ? 1 : weight(ch)), 0) || 1;
    let x = run.x;
    for (const ch of chars) {
      const w = (run.width * (/\s/.test(ch) ? 1 : weight(ch))) / total;
      line.push({ ch: /\s/.test(ch) ? ' ' : ch, x0: x, x1: x + w, top, bottom });
      x += w;
    }
  }
  if (line.length > 0) lines.push(line);

  const out: OcrLine[] = [];
  for (const chars of lines) {
    const words: OcrWord[] = [];
    let i = 0;
    while (i < chars.length) {
      if ((chars[i] as Char).ch === ' ') {
        i++;
        continue;
      }
      let j = i;
      while (j < chars.length && (chars[j] as Char).ch !== ' ') j++;
      const part = chars.slice(i, j);
      const box: Box = {
        x0: Math.min(...part.map((c) => c.x0)),
        y0: Math.min(...part.map((c) => c.top)),
        x1: Math.max(...part.map((c) => c.x1)),
        y1: Math.max(...part.map((c) => c.bottom)),
      };
      words.push({ text: part.map((c) => c.ch).join(''), conf: 100, box });
      i = j;
    }
    if (words.length === 0) continue;
    out.push({
      box: {
        x0: Math.min(...words.map((w) => w.box.x0)),
        y0: Math.min(...words.map((w) => w.box.y0)),
        x1: Math.max(...words.map((w) => w.box.x1)),
        y1: Math.max(...words.map((w) => w.box.y1)),
      },
      words,
    });
  }
  return out;
}

/** Use the text layer when it has at least this many Odia words … */
export const TEXT_MIN_WORDS = 20;
/**
 * … and at least this share of them are exact words of the word list (else: an
 * old non-Unicode font, a text layer with broken conjuncts, an OCR layer under
 * a scan). Strict on purpose: a page that fails is still read, by OCR.
 */
export const TEXT_MIN_KNOWN = 0.85;

/** Whether a page's text layer is real Odia: enough Odia words, enough of them known. */
export function trustText(lines: readonly OcrLine[], known: (word: string) => boolean): { use: boolean; odia: number; known: number } {
  // Every word with an Odia letter counts; one with a broken character inside
  // (a NUL or a replacement mark where a conjunct had no text) is not known.
  const odia = lines
    .flatMap((l) => l.words)
    .map((w) => w.text.replace(/^[\s.,;:!?'"()\u0964\u0965\u2018\u2019\u201c\u201d-]+|[\s.,;:!?'"()\u0964\u0965\u2018\u2019\u201c\u201d-]+$/g, ''))
    .filter((t) => /[\u0b05-\u0b39]/.test(t));
  const good = odia.filter((t) => /^[\u0b01-\u0b77\u200c\u200d]+$/.test(t) && known(t)).length;
  const share = odia.length ? good / odia.length : 0;
  return { use: odia.length >= TEXT_MIN_WORDS && share >= TEXT_MIN_KNOWN, odia: odia.length, known: share };
}

/**
 * A line's words from a PDF's text in spoken order. A word that starts with a
 * pre-base vowel sign may be the second half of a word that the PDF (or pdf.js's
 * spacing guess) split where the sign is drawn left of a conjunct ("pra | e-ba-sha-ku"
 * for prabeshaku): it is joined to the word before when the joined word is a
 * known word more frequent than the second part alone (the first part is no
 * guide: broken PDF text has made fragments such as "pra" common in the word
 * counts). Then each word gets its spoken order (fixOrder).
 */
export function spokenWords(words: readonly OcrWord[], count: (w: string) => number, canon: (w: string) => string = (w) => w): OcrWord[] {
  const out: OcrWord[] = [];
  for (const w of words) {
    const prev = out[out.length - 1];
    if (prev && /^[\u0b47\u0b48]/.test(w.text) && /[\u0b15-\u0b39\u0b3c\u0b5c\u0b5d\u0b5f\u0b71]$/.test(prev.text)) {
      const joined = canon(fixOrder(prev.text + w.text, count, canon));
      const alone = canon(fixOrder(w.text, count, canon));
      if (count(joined) > 0 && count(joined) > count(alone)) {
        out[out.length - 1] = {
          ...prev,
          text: prev.text + w.text,
          box: { x0: Math.min(prev.box.x0, w.box.x0), y0: Math.min(prev.box.y0, w.box.y0), x1: Math.max(prev.box.x1, w.box.x1), y1: Math.max(prev.box.y1, w.box.y1) },
        };
        continue;
      }
    }
    out.push({ ...w });
  }
  return out.map((w) => ({ ...w, text: canon(fixOrder(w.text, count, canon)) }));
}
