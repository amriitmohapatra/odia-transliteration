/**
 * Dictionary lookup, without any page: the payload format, the 1930s-spelling
 * fold, exact / stem / prefix lookup, the modern layer and the short English
 * gloss. Shared by the app's Meanings panel (overlay.ts) and the Odia Lens
 * browser extension (lens/), so both find the same entry and show the same
 * meaning for a word.
 *
 * Everything here is pure: entry finding works on a sorted key list, glosses
 * on a definition string. Where the definitions come from (one inflated
 * payload in the app, a fetched chunk in the extension) is the caller's
 * business. Every word goes through foldKey() = fold(canonical(word)) first:
 * page text can hold precomposed nukta letters and the dictionary keys do not.
 *
 * Odia characters appear ONLY as \u escapes (repo convention).
 */

import { canonical } from '@odia/core/normalize';

import { inflate } from './pako-inflate.js';
import { cleanDefinition } from './clean.js';

/** Field separator inside an inflated payload (U+0002). */
export const SEP = '\u0002';

/* U+0B5F -> U+0B2F, U+0B71 -> U+0B2C, U+0B35 -> U+0B2C : Praharaj-era spellings. */
export function fold(w: string): string {
  return w
    .split('\u0b5f').join('\u0b2f')
    .split('\u0b71').join('\u0b2c')
    .split('\u0b35').join('\u0b2c');
}

/* Inflectional suffixes tried (longest first) when the exact form is not a
 * headword. Kept in sync with the payload builder; folded forms. */
export const SUFFIXES: readonly string[] = [
  '\u0b2e\u0b3e\u0b28\u0b19\u0b4d\u0b15\u0b30', /* -maananjkara */
  '\u0b2e\u0b3e\u0b28\u0b19\u0b4d\u0b15\u0b41', /* -maananjku */
  '\u0b17\u0b41\u0b21\u0b3c\u0b3f\u0b15\u0b41', /* -gudiku */
  '\u0b17\u0b41\u0b21\u0b3c\u0b3f\u0b15\u0b30', /* -gudikara */
  '\u0b2e\u0b3e\u0b28\u0b19\u0b4d\u0b15', /* -maananjka */
  '\u0b17\u0b41\u0b21\u0b3c\u0b3f\u0b15', /* -gudika */
  '\u0b17\u0b41\u0b21\u0b3c\u0b3e\u0b0f', /* -gudaae */
  '\u0b2e\u0b3e\u0b28\u0b47', /* -maane */
  '\u0b19\u0b4d\u0b15\u0b30', /* -njkara */
  '\u0b19\u0b4d\u0b15\u0b41', /* -njku */
  '\u0b1f\u0b3f\u0b15\u0b41', /* -tiku */
  '\u0b1f\u0b3f\u0b30\u0b47', /* -tire */
  '\u0b19\u0b4d\u0b15', /* -njka */
  '\u0b1f\u0b3f\u0b30', /* -tira */
  '\u0b30\u0b47', /* -re */
  '\u0b30\u0b41', /* -ru */
  '\u0b15\u0b41', /* -ku */
  '\u0b1f\u0b3f', /* -ti */
  '\u0b1f\u0b3e', /* -taa */
  '\u0b30', /* -ra */
  '\u0b01', /* candrabindu */
  '\u0b02', /* anusvara */
  '\u0b03', /* visarga */
];

/* ------------------------------------------------------------ *
 * Data: gzip(payload), inflated lazily.
 * payload = N SEP keys(\n-joined, sorted) SEP lens(,-joined) SEP defs(concat)
 * ------------------------------------------------------------ */

export interface Dict {
  keys: string[];
  offsets: Float64Array;
  lens: Uint32Array;
  defs: string;
}

export type How = 'exact' | 'stem' | 'prefix';

export interface Entry {
  how: How;
  head: string;
  index: number;
}

export interface ModernLine {
  tag: string;
  gloss: string;
}

export interface ModernEntry {
  how: 'exact' | 'stem';
  lines: ModernLine[];
}

export function parsePayload(gz: Uint8Array): Dict {
  const inflated = inflate(gz);
  const text = new TextDecoder('utf-8').decode(inflated);
  const a = text.indexOf(SEP);
  const b = text.indexOf(SEP, a + 1);
  const c = text.indexOf(SEP, b + 1);
  const count = parseInt(text.slice(0, a), 10);
  const keys = text.slice(a + 1, b).split('\n');
  const lenParts = text.slice(b + 1, c).split(',');
  const lens = new Uint32Array(count);
  const offsets = new Float64Array(count);
  let off = 0;
  for (let i = 0; i < count; i++) {
    lens[i] = +(lenParts[i] as string);
    offsets[i] = off;
    off += lens[i] as number;
  }
  if (keys.length !== count) throw new Error('key count mismatch');
  return { keys, offsets, lens, defs: text.slice(c + 1) };
}


/** The dictionary key for a word: canonical form, then the 1930s-spelling fold. */
export function foldKey(word: string): string {
  return fold(canonical(word));
}

/** Index of `key` in a sorted key list, or -1. */
export function bsearch(keys: readonly string[], key: string): number {
  let lo = 0;
  let hi = keys.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const k = keys[mid] as string;
    if (k === key) return mid;
    if (k < key) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** The cleaned definition text of entry `i`. */
export function defAt(dict: Dict, i: number): string {
  const start = dict.offsets[i] as number;
  return cleanDefinition(dict.defs.slice(start, start + (dict.lens[i] as number)));
}

/*
 * Praharaj lookup with fallbacks, on a folded key (foldKey):
 *   exact / stem (one suffix removed) / prefix (longest headword the word
 *   begins with, for sandhi compounds) — each marked in the UI.
 */
export function findEntry(keys: readonly string[], q: string): Entry | null {
  if (q.length === 0) return null;
  const i = bsearch(keys, q);
  if (i >= 0) return { how: 'exact', head: keys[i] as string, index: i };
  for (let s = 0; s < SUFFIXES.length; s++) {
    const suf = SUFFIXES[s] as string;
    if (q.length - suf.length >= 2 && q.slice(-suf.length) === suf) {
      const j = bsearch(keys, q.slice(0, q.length - suf.length));
      if (j >= 0) return { how: 'stem', head: keys[j] as string, index: j };
    }
  }
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((keys[mid] as string) < q) lo = mid + 1;
    else hi = mid;
  }
  let best = -1;
  let bestLen = 2;
  for (let back = lo - 1; back >= 0 && back > lo - 400; back--) {
    const k = keys[back] as string;
    if (k.length > bestLen && q.length > k.length && q.lastIndexOf(k, 0) === 0) {
      best = back;
      bestLen = k.length;
    }
    if (k.charAt(0) !== q.charAt(0)) break;
  }
  return best >= 0 ? { how: 'prefix', head: keys[best] as string, index: best } : null;
}

/*
 * Modern-layer lookup (loanwords, community MT glosses, CLDR names), on a
 * folded key. Exact and stem only — a prefix fallback on this data would
 * invent loans.
 */
export function findModern(keys: readonly string[], q: string): { index: number; how: 'exact' | 'stem' } | null {
  if (q.length === 0) return null;
  let i = bsearch(keys, q);
  if (i >= 0) return { index: i, how: 'exact' };
  for (let s = 0; s < SUFFIXES.length && i < 0; s++) {
    const suf = SUFFIXES[s] as string;
    if (q.length - suf.length >= 2 && q.slice(-suf.length) === suf) {
      i = bsearch(keys, q.slice(0, q.length - suf.length));
    }
  }
  return i >= 0 ? { index: i, how: 'stem' } : null;
}

/** The lines of a modern-layer definition: "tag \t gloss" each. */
export function modernLines(definition: string): ModernLine[] {
  return definition.split('\n').map((line) => {
    const t = line.indexOf('\t');
    return { tag: line.slice(0, t), gloss: line.slice(t + 1) };
  });
}

export const MODERN_LABEL: Record<string, string> = {
  loan: 'English loan (auto-detected)',
  mt: 'modern usage — community translation data, approximate',
  cldr: 'standard modern name (CLDR)',
};


export function modernChip(mo: ModernEntry | null): string | null {
  if (!mo) return null;
  const line = mo.lines.find((l) => l.tag !== 'loan');
  return line ? tidyGloss(line.gloss, mo.how !== 'exact') : null;
}

export function tidyGloss(gloss: string, approximate: boolean): string | null {
  let g = (gloss.split(';')[0] as string).replace(/\s+/g, ' ').trim().replace(/[\s.,:]+$/, '');
  if (g.length < 2) return null;
  if (g.length > 56) g = g.slice(0, 56).replace(/\s+\S*$/, '') + '\u2026';
  return (approximate ? 'maybe: ' : '') + g;
}

/* Short English gloss for the inline chip, from a Praharaj definition.
 *
 * Entries open "<headword> \u2014 Translit \u2026", so the FIRST Latin run is the
 * romanisation, not the meaning. Skip that, then prefer the English text of
 * sense 1 ("1. Trouble; distress"), then any Latin run after a dash. */
export function shortGlossOf(definition: string): string | null {
  const def = definition.slice(0, 4000);
  /* drop "head — Translit" prefix (translit = Latin with diacritics) */
  const body = def.replace(/^[^\u2014\u2013\n]{0,50}[\u2014\u2013]\s*[A-Za-z\u0100-\u02af\u1e00-\u1eff']+[.,]?\s*/, '');
  let g: string | null = null;
  let m = body.match(/\b\d\.\s*([A-Za-z][^\u0964\u0965\n]{2,90})/);
  if (!m) m = body.match(/[\u2014\u2013]\s*(?:\d+\s*)?([A-Z][a-z][^\u0964\u0965\n]{2,90})/);
  if (!m) m = body.match(/\b([A-Z][a-z][^\u0964\u0965\n]{2,90})/);
  if (m) {
    g = m[1] as string;
    /* chip is English-only: stop at the first Odia character, the next
     * numbered sense, or an opening bracket of a commentary note */
    g = g.split(/[\u0b00-\u0b7f]/)[0] as string;
    g = g.split(/\s\d\.?\s|\s*[\u2014\u2013]\s*\d|\s*\[/)[0] as string;
    g = g.replace(/\s+/g, ' ').replace(/[\s;,([\u2014\u2013-]+$/, '').trim();
    if (g.length > 56) g = g.slice(0, 56).replace(/\s+\S*$/, '') + '\u2026';
    if (g.length < 2) g = null;
  }
  return g;
}
