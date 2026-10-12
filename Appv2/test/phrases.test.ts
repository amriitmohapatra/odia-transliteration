import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseLabels } from '../../core/src/index.js';
import { createEngineFromDisk } from '../../core/src/node.js';
import { canonical } from '../../core/src/normalize.js';
import { CATEGORY_LABEL, PHRASE_CATEGORIES, parsePhrases, searchPhrases } from '../src/dictionary/phrases.js';

/*
 * The phrase table on the REAL file, core/data/phrases.tsv. No Odia literal is
 * written here: phrases are read back from the file.
 */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const phrases = parsePhrases(read('../../core/data/phrases.tsv'), 'core/data/phrases.tsv');
const labels = parseLabels(read('../../core/data/labels.tsv'), 'core/data/labels.tsv');
const odiaOf = (meaning: string) => phrases.find((p) => p.meaning === meaning)?.odia;

describe('phrase table data', () => {
  it('parses, with every group present and a heading for each', () => {
    expect(phrases.length).toBeGreaterThanOrEqual(20);
    for (const category of PHRASE_CATEGORIES) {
      expect(phrases.some((p) => p.category === category), category).toBe(true);
      expect(CATEGORY_LABEL[category]).toBeTruthy();
    }
  });

  it('contains no word labelled offensive or coarse', () => {
    const flagged = phrases.flatMap((p) => canonical(p.odia).split(' '))
      .filter((w) => labels.isOffensive(w) || labels.isCoarse(w));
    expect(flagged).toEqual([]);
  });

  it('the first spelling of each phrase types it: word by word, the top suggestion', { timeout: 60_000 }, () => {
    const engine = createEngineFromDisk();
    for (const phrase of phrases) {
      const typed = phrase.keys[0]!.split(' ').map((w) => engine.transliterateWord(w, 1)[0]?.text ?? '');
      expect(typed.join(' '), phrase.keys[0]).toBe(phrase.odia.replace(/[?!,\u0964\u0965]/g, '').trim());
    }
  });
});

describe('searchPhrases', () => {
  it('lists everything, group by group, for an empty query', () => {
    const all = searchPhrases(phrases, '');
    expect(all).toHaveLength(phrases.length);
    const order = all.map((h) => PHRASE_CATEGORIES.indexOf(h.phrase.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('finds by English meaning, by typed spelling, by group and by Odia text', () => {
    expect(searchPhrases(phrases, 'Birthday').map((h) => h.phrase.meaning)).toEqual(['happy birthday']);
    expect(searchPhrases(phrases, 'shubha sakala')[0]?.phrase.meaning).toBe('good morning');
    expect(searchPhrases(phrases, 'shubh').length).toBeGreaterThanOrEqual(3);
    const you = searchPhrases(phrases, 'you').filter((h) => h.phrase.category === 'you');
    expect(you).toHaveLength(3);
    expect(searchPhrases(phrases, 'festivals').every((h) => h.phrase.category === 'festival')).toBe(true);
    expect(searchPhrases(phrases, odiaOf('happy birthday')!)[0]?.exact).toBe(true);
    expect(searchPhrases(phrases, 'zzzz')).toEqual([]);
  });

  it('drops a phrase when any of its words is hidden (kids edition)', () => {
    const word = odiaOf('happy birthday')!.split(' ')[1]!;
    const hits = searchPhrases(phrases, '', (w) => w === word);
    expect(hits.some((h) => h.phrase.odia.split(' ').includes(word))).toBe(false);
    expect(hits.length).toBeLessThan(phrases.length);
  });
});
