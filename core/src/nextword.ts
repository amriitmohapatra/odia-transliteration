/**
 * Next-word predictions: after a word, the words that most often follow it.
 *
 * `nextword.tsv` rows are `context \t next \t score`: the context is one word,
 * or two words joined by one space; the score is log10 P(next | context). Built
 * by `tools/build-data/build_nextword.py` (pruned to the best few per context).
 *
 * Reading rule (stupid back-off, as the file header says): for two previous
 * words "a b", take the rows of "a b", then the rows of "b" not already listed
 * at score - 0.40; sort. With no "a b" rows, the rows of "b" alone.
 *
 * Chat typing seldom writes a word-final virama (ଠିକ for ଠିକ୍), so a previous
 * word that ends in one and has no rows is tried again without it.
 *
 * Bulk data, so malformed rows are skipped rather than thrown on, as in
 * lexicon.ts. Odia goes through canonical() on load: this is a boundary. The
 * file is optional: emptyNextWords() predicts nothing.
 */

import { canonical, VIRAMA } from './normalize.js';
import type { NextWords } from './types.js';

/** Stupid back-off weight, in log10: 0.4 = 10^-0.398. */
const BACKOFF = 0.4;

export function emptyNextWords(): NextWords {
  return { size: 0, predict: () => [] };
}

export function parseNextWords(tsv: string): NextWords {
  // Contexts are canonicalised on load (they are the keys); a context's rows
  // are kept as raw lines and read, canonical words and all, on first use.
  // Parsing every row up front cost ~100 ms at start-up, for rows that are
  // mostly never asked for.
  const raw = new Map<string, string[]>();
  let size = 0;
  let lastRawContext = '';
  let lastContext = '';
  for (const line of tsv.split('\n')) {
    if (line.length === 0 || line.charCodeAt(0) === 35 /* # */) continue;
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    const rawContext = line.slice(0, tab);
    // Rows come grouped by context, so this canonicalises each context once.
    if (rawContext !== lastRawContext) {
      lastRawContext = rawContext;
      lastContext = rawContext.split(' ').map((w) => canonical(w)).join(' ');
    }
    let rows = raw.get(lastContext);
    if (rows === undefined) {
      rows = [];
      raw.set(lastContext, rows);
    }
    rows.push(line.slice(tab + 1));
    size += 1;
  }

  const table = new Map<string, { word: string; score: number }[]>();
  const rowsAt = (context: string): readonly { word: string; score: number }[] | undefined => {
    let rows = table.get(context);
    if (rows !== undefined) return rows;
    const lines = raw.get(context);
    if (lines === undefined) return undefined;
    rows = [];
    for (const rest of lines) {
      const cells = rest.replace(/\r$/, '').split('\t');
      if (cells.length !== 2) continue;
      const score = Number.parseFloat(cells[1] as string);
      const word = canonical(cells[0] as string);
      if (Number.isFinite(score) && word.length > 0) rows.push({ word, score });
    }
    table.set(context, rows);
    return rows;
  };

  const rowsOf = (word: string): readonly { word: string; score: number }[] | undefined => {
    const rows = rowsAt(word);
    if (rows !== undefined || !word.endsWith(VIRAMA)) return rows;
    return rowsAt(word.slice(0, -VIRAMA.length));
  };

  return {
    size,
    predict(previous: readonly string[], k: number): { word: string; score: number }[] {
      const last = previous.length > 0 ? canonical(previous[previous.length - 1] as string) : '';
      if (last.length === 0 || k <= 0) return [];
      const before = previous.length > 1 ? canonical(previous[previous.length - 2] as string) : '';
      const best = new Map<string, number>();
      const pair = before.length > 0 ? rowsAt(`${before} ${last}`) : undefined;
      for (const row of pair ?? []) best.set(row.word, row.score);
      for (const row of rowsOf(last) ?? []) {
        const score = pair === undefined ? row.score : row.score - BACKOFF;
        if (!best.has(row.word)) best.set(row.word, score);
      }
      return [...best]
        .map(([word, score]) => ({ word, score }))
        .sort((a, b) => b.score - a.score || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0))
        .slice(0, k);
    },
  };
}
