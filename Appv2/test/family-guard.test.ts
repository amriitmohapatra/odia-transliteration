import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { createEngine, parseLabels } from '../../core/src/index.js';

/*
 * The guard test for the content filter, on the REAL data: core/data/labels.tsv
 * (owner-curated) and the full lexicon. No labelled word is written here: the
 * words come from the labels file. The innocent keys are everyday spellings
 * that the lexicon also files labelled words under (measured 2026-10-04).
 */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const BASE = {
  rulesToml: read('../../core/rules/symbols.toml'),
  lexiconTsv: read('../../core/data/lexicon.tsv'),
  unigramsTsv: read('../../core/data/unigrams.tsv'),
};
const LABELS_TSV = read('../../core/data/labels.tsv');
const labels = parseLabels(LABELS_TSV, 'core/data/labels.tsv');
const INNOCENT = ['band', 'banda', 'bandi', 'bandha', 'bia', 'pela', 'pel', 'randi', 'randhi', 'gandi', 'gandhi', 'handi', 'beda', 'chhori', 'chhadi', 'chhaadi', 'dahi', 'dadhi', 'bala', 'baala'];

// The labelled words and their listed keys, read back from the file.
const listed: { word: string; keys: string[] }[] = [];
for (const line of LABELS_TSV.split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [word, , keys] = line.split('\t');
  if (word) listed.push({ word, keys: (keys ?? '').split(',').filter(Boolean) });
}
const TOP = 5;
const texts = (e: ReturnType<typeof createEngine>, k: string) =>
  e.transliterateWord(k, TOP).map((c) => c.text);

describe('content filter on the real labels and lexicon', { timeout: 60_000 }, () => {
  const off = createEngine({ ...BASE, labelsTsv: LABELS_TSV, filter: 'off' });
  const family = createEngine({ ...BASE, labelsTsv: LABELS_TSV, filter: 'family' });
  const kids = createEngine({ ...BASE, labelsTsv: LABELS_TSV, filter: 'kids' });

  it('has labelled words to test', () => {
    expect(labels.size).toBeGreaterThan(0);
  });

  it('family: no offensive word in the top 5 for an everyday key, and no innocent word is lost', () => {
    for (const k of INNOCENT) {
      const got = texts(family, k);
      expect(got.filter((w) => labels.isOffensive(w)), k).toEqual([]);
      // Nothing innocent is lost: every non-offensive word of the unfiltered list is still offered
      // (slang-labelled ordinary words such as the word for hair included).
      for (const w of texts(off, k).filter((x) => !labels.isOffensive(x))) expect(got, k).toContain(w);
    }
  });

  it('family: an offensive word stays reachable under each listed key where the engine produces it', () => {
    for (const { word, keys } of listed) {
      if (!labels.isOffensive(word)) continue;
      for (const k of keys) {
        if (!texts(off, k).includes(word)) continue; // the engine does not spell it that way at all
        expect(texts(family, k), k).toContain(word);
      }
    }
  });

  it('kids: no offensive or coarse word for any everyday or listed key', () => {
    const all = [...INNOCENT, ...listed.flatMap((l) => l.keys)];
    for (const k of all) {
      expect(texts(kids, k).filter((w) => labels.isOffensive(w) || labels.isCoarse(w)), k).toEqual([]);
    }
  });

  it('with bigrams on: a previous word that often precedes a labelled word does not bring it back', () => {
    // The previous words are read from the shipped pair counts: every word
    // that precedes a labelled word there (no word is written in this test).
    const BIGRAMS_TSV = read('../../core/data/bigrams.tsv');
    const flagged = new Set(listed.map((l) => l.word).filter((w) => labels.isOffensive(w) || labels.isCoarse(w)));
    const prevs = new Set<string>();
    for (const line of BIGRAMS_TSV.split('\n')) {
      const [prev, next] = line.split('\t');
      if (prev && next && flagged.has(next)) prevs.add(prev);
    }
    expect(prevs.size).toBeGreaterThan(0);
    const ctxFamily = createEngine({ ...BASE, bigramsTsv: BIGRAMS_TSV, labelsTsv: LABELS_TSV, filter: 'family' });
    const ctxKids = createEngine({ ...BASE, bigramsTsv: BIGRAMS_TSV, labelsTsv: LABELS_TSV, filter: 'kids' });
    const listedKeys = listed.flatMap((l) => l.keys);
    for (const prev of prevs) {
      for (const k of INNOCENT) {
        const got = ctxFamily.transliterateWord(k, TOP, { prev }).map((c) => c.text);
        expect(got.filter((w) => labels.isOffensive(w)), k).toEqual([]);
      }
      for (const k of [...INNOCENT, ...listedKeys]) {
        const got = ctxKids.transliterateWord(k, TOP, { prev }).map((c) => c.text);
        expect(got.filter((w) => labels.isOffensive(w) || labels.isCoarse(w)), k).toEqual([]);
      }
    }
  });

  it('off: identical to an engine with no labels at all', () => {
    const plain = createEngine({ ...BASE });
    for (const k of INNOCENT) expect(off.transliterateWord(k, TOP), k).toEqual(plain.transliterateWord(k, TOP));
  });
});
