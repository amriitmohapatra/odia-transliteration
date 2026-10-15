/**
 * Correct a word that OCR read from a picture (V4.2), with the IndicCorp word
 * list (core/data/indiccorp-words.tsv, CC0).
 *
 * A word the list knows stays as it is, unless it is a rare misprint of a far
 * more common word one edit away (the list is real text, so it holds misprints:
 * parabaara 63 times, paribaara, "family", 99,326 times). Any other word
 * becomes the most frequent known word within a small edit distance (letters
 * and signs as written: a lost i-matra or a dropped conjunct part is one or two
 * edits), or stays as read when nothing is that close. Comparison uses the same 1930s-spelling fold as the
 * dictionary lookup, so ya / yya and the va letters never count as errors.
 *
 * The list has 100,000 words; a correction scans only the words of a similar
 * length, with a distance check that stops as soon as a row passes the limit:
 * a few milliseconds per word, no index in memory.
 */

import { foldKey } from '../../Appv2/src/dictionary/lookup.js';

export interface Correction {
  /** The word to look up: the known word, or the word as read. */
  word: string;
  /** 0 for a known word; the edit distance of a correction; null when nothing was close. */
  distance: number | null;
}

export interface WordList {
  readonly size: number;
  has(word: string): boolean;
  correct(word: string): Correction;
  /**
   * Split a run-together word (large type often loses the spaces) into two to
   * four known words, the likeliest split by word frequency; null if none.
   */
  split(word: string): string[] | null;
}

interface Known {
  word: string;
  count: number;
}

/** Damerau–Levenshtein distance, or `limit + 1` as soon as it must exceed `limit`. */
export function boundedDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min((prev[j] as number) + 1, (row[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, (prev2[j - 2] as number) + 1);
      row.push(d);
      if (d < best) best = d;
    }
    if (best > limit) return limit + 1;
    prev2 = prev;
    prev = row;
  }
  return Math.min(prev[b.length] as number, limit + 1);
}

/** The largest distance a correction may have: one edit for short words, two otherwise. */
export const limitFor = (length: number): number => (length <= 4 ? 1 : 2);

/** A known word gives way to a word one edit away that is this many times more frequent. */
export const MISPRINT_RATIO = 300;

export function parseWordList(tsv: string): WordList {
  const known = new Map<string, Known>();
  /** Folded keys by length, most frequent first (the file's order). */
  const byLength = new Map<number, string[]>();
  for (const line of tsv.split('\n')) {
    if (line.length === 0 || line.startsWith('#')) continue;
    const [word = '', count = '0'] = line.split('\t');
    const key = foldKey(word);
    if (key.length === 0 || known.has(key)) continue;
    known.set(key, { word, count: Number(count) });
    const list = byLength.get(key.length) ?? [];
    list.push(key);
    byLength.set(key.length, list);
  }
  return {
    size: known.size,
    has: (word) => known.has(foldKey(word)),
    correct(word) {
      const key = foldKey(word);
      const exact = known.get(key);
      const nearest = (limit: number): { key: string; distance: number; count: number } | null => {
        let best: { key: string; distance: number; count: number } | null = null;
        for (let length = key.length - limit; length <= key.length + limit; length++) {
          for (const candidate of byLength.get(length) ?? []) {
            if (candidate === key) continue;
            const max = best ? Math.min(limit, best.distance) : limit;
            const d = boundedDistance(key, candidate, max);
            if (d > max) continue;
            const count = (known.get(candidate) as Known).count;
            if (!best || d < best.distance || (d === best.distance && count > best.count)) best = { key: candidate, distance: d, count };
          }
        }
        return best;
      };
      if (exact) {
        if (key.length >= 4 && exact.count * MISPRINT_RATIO < 1_000_000) {
          const other = nearest(1);
          if (other && other.count >= exact.count * MISPRINT_RATIO) return { word: (known.get(other.key) as Known).word, distance: 1 };
        }
        return { word: exact.word, distance: 0 };
      }
      const limit = limitFor(key.length);
      const best = nearest(limit);
      return best ? { word: (known.get(best.key) as Known).word, distance: best.distance } : { word, distance: null };
    },
    split(word) {
      const key = foldKey(word);
      if (key.length < 4) return null;
      // cost[i]: the cheapest split of key[i..]; a piece costs -log(frequency) plus a
      // fixed price, so fewer, common pieces win.
      const PIECE = 12;
      const cost = new Array<number>(key.length + 1).fill(Infinity);
      const next = new Array<number>(key.length + 1).fill(-1);
      cost[key.length] = 0;
      for (let i = key.length - 1; i >= 0; i--) {
        for (let j = i + 2; j <= Math.min(key.length, i + 24); j++) {
          const piece = known.get(key.slice(i, j));
          if (!piece || cost[j] === Infinity) continue;
          const c = -Math.log(piece.count) + PIECE + (cost[j] as number);
          if (c < (cost[i] as number)) {
            cost[i] = c;
            next[i] = j;
          }
        }
      }
      if (cost[0] === Infinity) return null;
      const parts: string[] = [];
      for (let i = 0; i < key.length; i = next[i] as number) parts.push((known.get(key.slice(i, next[i] as number)) as Known).word);
      return parts.length >= 2 && parts.length <= 4 ? parts : null;
    },
  };
}

/**
 * OCR words made ready for lookup: a run of digits stuck to a word becomes its
 * own word (\u0b6b\u0b2c\u0b3e\u0b07\u0b15\u0b4d\u200c\u0b15\u0b41: 5 + bike-ku), and a run-together word the list can split
 * becomes its words. Each new word gets a share of the box by its length.
 */
export function separate<T extends { text: string; box: { x0: number; y0: number; x1: number; y1: number } }>(
  words: readonly T[],
  list: WordList,
  clean: (text: string) => string,
): T[] {
  const out: T[] = [];
  const share = (w: T, parts: string[]): void => {
    const total = parts.reduce((n, p) => n + p.length, 0);
    let x = w.box.x0;
    for (const part of parts) {
      const width = ((w.box.x1 - w.box.x0) * part.length) / total;
      out.push({ ...w, text: part, box: { ...w.box, x0: x, x1: x + width } });
      x += width;
    }
  };
  const pieces: T[] = [];
  for (const w of words) {
    // Stray marks inside a word (an apostrophe, a comma) split it.
    const parts = w.text.split(/[^\u0b01-\u0b77\u200c\u200d0-9]+/).filter((p) => p.length > 0);
    if (parts.length > 1) {
      const before = out.length;
      share(w, parts);
      pieces.push(...out.splice(before));
    } else pieces.push(w);
  }
  for (const w of pieces) {
    const text = clean(w.text);
    const digits = /^([\u0b66-\u0b6f0-9]+)([\u0b01-\u0b63\u0b70-\u0b77]+)$/.exec(text);
    if (digits) {
      share(w, [digits[1] as string, digits[2] as string]);
      continue;
    }
    const known = list.correct(text);
    const parts = known.distance === 0 || (known.distance ?? 9) <= 1 ? null : list.split(text);
    if (parts) share(w, parts);
    else out.push(w);
  }
  return out;
}
