import { describe, it, expect } from 'vitest';

import { emptyBigrams, parseBigrams } from '../src/bigrams.js';
import { createEngine } from '../src/index.js';
import { loadRules } from '../src/rules.js';
import { rank } from '../src/rank.js';
import type { RankWeights } from '../src/types.js';
import { ITRANS_TOML, SYMBOLS_TOML } from './helpers.js';

/*
 * Context ranking from word pairs. Fixtures are inline (never core/data) and
 * every Odia string is a \u escape.
 *
 *   EKA   = U+0B0F U+0B15                 the previous word ("eka")
 *   KALA  = U+0B15 U+0B32 U+0B3E          one reading of "kala"
 *   KALLA = U+0B15 U+0B33 U+0B3E          the other reading of "kala"
 */
const EKA = '\u0B0F\u0B15';
const KALA = '\u0B15\u0B32\u0B3E';
const KALLA = '\u0B15\u0B33\u0B3E';
const RRA = '\u0B21\u0B3C';
const PRECOMPOSED_RRA = '\u0B5C';
const BADA = '\u0B2C' + RRA; // a word with the nukta, canonical
const BADA_PRECOMPOSED = '\u0B2C' + PRECOMPOSED_RRA;

const BIGRAMS_TSV = [
  '# prev\tnext\tcount',
  '',
  `${EKA}\t*\t100`,
  `${EKA}\t${KALLA}\t40`,
  `${EKA}\t${KALA}\t2`,
  `${BADA_PRECOMPOSED}\t*\t9`,
  `${BADA_PRECOMPOSED}\t${KALLA}\t9`,
].join('\n');

/* KALA leads KALLA on the lexicon, narrowly; EKA is the only word for "eka". */
const LEXICON_TSV = [
  `eka\t${EKA}\t2.0`,
  `kala\t${KALA}\t1.0`,
  `kala\t${KALLA}\t0.9`,
  `bada\t${BADA}\t2.0`,
].join('\n');
const UNIGRAMS_TSV = [`${EKA}\t2.0`, `${KALA}\t1.0`, `${KALLA}\t1.0`, `${BADA}\t1.5`].join('\n');

const withWeight = (w: number | undefined): string =>
  w === undefined
    ? SYMBOLS_TOML.replace(/^bigram\s*=.*$/m, '')
    : SYMBOLS_TOML.replace(/^bigram\s*=.*$/m, `bigram = ${w}`);

const engine = (opts: { bigrams?: boolean; weight?: number } = {}) =>
  createEngine({
    rulesToml: withWeight(opts.weight ?? 2),
    itransToml: ITRANS_TOML,
    lexiconTsv: LEXICON_TSV,
    unigramsTsv: UNIGRAMS_TSV,
    bigramsTsv: opts.bigrams === false ? undefined : BIGRAMS_TSV,
  });

const texts = (cands: { text: string }[]) => cands.map((c) => c.text);

describe('parseBigrams', () => {
  it('scores ln(1 + count) / ln(1 + total), and 0 for an unseen pair', () => {
    const b = parseBigrams(BIGRAMS_TSV);
    expect(b.size).toBe(3);
    expect(b.score(EKA, KALLA)).toBeCloseTo(Math.log(41) / Math.log(101), 12);
    expect(b.score(EKA, KALA)).toBeCloseTo(Math.log(3) / Math.log(101), 12);
    expect(b.score(EKA, EKA)).toBe(0);
    expect(b.score(KALA, EKA)).toBe(0);
  });

  it('canonicalises on load: a precomposed nukta key is found by its canonical spelling', () => {
    const b = parseBigrams(BIGRAMS_TSV);
    expect(b.score(BADA, KALLA)).toBe(1);
    expect(b.score(BADA_PRECOMPOSED, KALLA)).toBe(0); // lookups are by canonical text only
  });

  it('accepts CRLF line ends, comments and blank lines', () => {
    expect(parseBigrams(BIGRAMS_TSV.replace(/\n/g, '\r\n')).size).toBe(3);
  });

  it('emptyBigrams scores nothing', () => {
    expect(emptyBigrams().size).toBe(0);
    expect(emptyBigrams().score(EKA, KALLA)).toBe(0);
  });

  const bad: [string, string, RegExp][] = [
    ['two cells', `${EKA}\t*\t5\n${EKA}\t${KALA}`, /:2: expected/],
    ['four cells', `${EKA}\t*\t5\n${EKA}\t${KALA}\t1\tx`, /:2: expected/],
    ['zero count', `${EKA}\t*\t5\n${EKA}\t${KALA}\t0`, /:2: count "0"/],
    ['fractional count', `${EKA}\t*\t5\n${EKA}\t${KALA}\t1.5`, /:2: count "1.5"/],
    ['word count', `${EKA}\t*\tmany`, /:1: count "many"/],
    ['empty word', `\t*\t5`, /:1: empty word/],
    ['duplicate pair', `${EKA}\t*\t5\n${EKA}\t${KALA}\t1\n${EKA}\t${KALA}\t2`, /:3: duplicate pair/],
    ['duplicate total', `${EKA}\t*\t5\n${EKA}\t*\t6\n${EKA}\t${KALA}\t1`, /:2: second total/],
    ['pair without total', `${EKA}\t${KALA}\t1`, /no "\*" total row/],
    ['total without pairs', `${EKA}\t*\t5`, /:1: total row with no pairs/],
    ['count above total', `${EKA}\t*\t5\n${EKA}\t${KALA}\t6`, /exceeds the total/],
  ];
  for (const [name, tsv, error] of bad) {
    it(`throws on ${name}`, () => {
      expect(() => parseBigrams(tsv, 'fixture.tsv')).toThrow(error);
    });
  }
});

describe('[weights] bigram in symbols.toml', () => {
  it('is optional and defaults to 0', () => {
    expect(loadRules(withWeight(undefined)).weights.bigram).toBe(0);
  });

  it('rejects a negative value', () => {
    expect(() => loadRules(withWeight(-1))).toThrow(/'bigram' must be a finite number >= 0/);
  });
});

describe('rank: the context term', () => {
  const W: RankWeights = { rule: 1, freq: 1.5, user: 2, pref: 1, bigram: 2 };
  const base = {
    roman: 'kala',
    ruleCandidates: [],
    lexiconEntries: [
      { word: KALA, weight: 1 },
      { word: KALLA, weight: 0.9 },
    ],
    unigrams: { size: 0, logfreq: () => 0 },
    topk: 5,
  };

  it('adds weights.bigram x the term, and nothing to a word with no pair', () => {
    const without = rank({ ...base, weights: W });
    const term = (w: string) => (w === KALLA ? 0.5 : 0);
    const withCtx = rank({ ...base, weights: W, bigram: term });
    const score = (list: typeof without, w: string) => list.find((c) => c.text === w)?.score;
    expect(score(withCtx, KALLA)).toBeCloseTo((score(without, KALLA) as number) + 2 * 0.5, 12);
    expect(score(withCtx, KALA)).toBe(score(without, KALA));
    expect(texts(withCtx)[0]).toBe(KALLA);
  });

  it('is skipped entirely when the weight is absent or 0', () => {
    const term = () => 1;
    const plain = rank({ ...base, weights: { rule: 1, freq: 1.5, user: 2, pref: 1 } });
    expect(rank({ ...base, weights: { rule: 1, freq: 1.5, user: 2, pref: 1 }, bigram: term })).toEqual(plain);
    expect(rank({ ...base, weights: { ...W, bigram: 0 }, bigram: term })).toEqual(plain);
  });
});

describe('engine: context ranking', () => {
  it('without context, the candidates are identical, scores included, with and without bigram data', () => {
    const on = engine();
    const off = engine({ bigrams: false });
    for (const k of ['kala', 'eka', 'bada', 'ka', 'kal']) {
      expect(on.transliterateWord(k, 8), k).toEqual(off.transliterateWord(k, 8));
    }
  });

  it('with context but no bigram data, or weight 0, the candidates are identical', () => {
    const plain = engine({ bigrams: false }).transliterateWord('kala', 8);
    expect(engine({ bigrams: false }).transliterateWord('kala', 8, { prev: EKA })).toEqual(plain);
    expect(engine({ weight: 0 }).transliterateWord('kala', 8, { prev: EKA })).toEqual(plain);
    expect(engine().transliterateWord('kala', 8, {})).toEqual(plain);
  });

  it('the previous word lifts the word that follows it in the corpus', () => {
    const e = engine();
    const plain = texts(e.transliterateWord('kala', 8));
    expect(plain.indexOf(KALA)).toBeLessThan(plain.indexOf(KALLA));
    expect(texts(e.transliterateWord('kala', 8, { prev: EKA }))[0]).toBe(KALLA);
  });

  it('canonicalises the previous word (a precomposed nukta from a host text field)', () => {
    const e = engine();
    expect(e.transliterateWord('kala', 8, { prev: BADA_PRECOMPOSED })).toEqual(
      e.transliterateWord('kala', 8, { prev: BADA }),
    );
    expect(texts(e.transliterateWord('kala', 8, { prev: BADA }))[0]).toBe(KALLA);
  });

  it('transliterate() passes the previous top-1 across spaces only', () => {
    const e = engine();
    const off = engine({ bigrams: false });
    expect(e.transliterate('eka kala').text).toBe(`${EKA} ${KALLA}`);
    expect(off.transliterate('eka kala').text).toBe(`${EKA} ${KALA}`);
    // Punctuation, a line break, digits or a Latin word end the context.
    for (const sentence of ['eka, kala', 'eka\nkala', 'eka 12 kala']) {
      expect(e.transliterate(sentence), JSON.stringify(sentence)).toEqual(off.transliterate(sentence));
    }
  });

  it('transliterate() without bigram data is unchanged by the context plumbing', () => {
    const off = engine({ bigrams: false });
    const result = off.transliterate('eka kala bada kala');
    expect(result.words.map((w) => w.candidates)).toEqual(
      ['eka', 'kala', 'bada', 'kala'].map((k) => off.transliterateWord(k, 8)),
    );
  });

  it('never brings back a word the family filter drops, however strong its pair', () => {
    // KALLA stands in for an offensive word here; the label is a fixture.
    const e = createEngine({
      rulesToml: withWeight(8),
      itransToml: ITRANS_TOML,
      lexiconTsv: LEXICON_TSV,
      unigramsTsv: UNIGRAMS_TSV,
      bigramsTsv: BIGRAMS_TSV,
      labelsTsv: `${KALLA}\toffensive`,
    });
    expect(texts(e.transliterateWord('kala', 8, { prev: EKA }))).not.toContain(KALLA);
    expect(texts(e.transliterateWord('kala', 8, { prev: BADA }))).not.toContain(KALLA);
    expect(e.transliterate('eka kala').text).toBe(`${EKA} ${KALA}`);
  });
});
