import { describe, it, expect } from 'vitest';

import { createEngine } from '../src/index.js';
import { parseNextWords } from '../src/nextword.js';
import { SYMBOLS_TOML } from './helpers.js';

/*
 * Next-word predictions (core/data/nextword.tsv). Fixtures inline, Odia as
 * \u escapes. The "offensive" fixture is an invented non-word.
 */

const BHALA = '\u0B2D\u0B32'; // good
const ACHHI = '\u0B05\u0B1B\u0B3F'; // is
const NUHEN = '\u0B28\u0B41\u0B39\u0B47\u0B01'; // is not
const MUN = '\u0B2E\u0B41\u0B01'; // I
const PILA = '\u0B2A\u0B3F\u0B32\u0B3E'; // child
const THIK = '\u0B20\u0B3F\u0B15'; // right (chat: no final virama)
const FAKE = '\u0B2C\u0B41\u0B37'; // not a word
const PRECOMPOSED_RRA = '\u0B5C';
const RRA = '\u0B21\u0B3C';

const TABLE = [
  `${BHALA}\t${PILA}\t-1.0`,
  `${BHALA}\t${ACHHI}\t-0.9`,
  `${BHALA}\t${FAKE}\t-0.5`,
  `${MUN} ${BHALA}\t${ACHHI}\t-0.2`,
  `${MUN} ${BHALA}\t${NUHEN}\t-0.3`,
  `${THIK}\t${ACHHI}\t-0.4`,
  `${PRECOMPOSED_RRA}\t${PRECOMPOSED_RRA}${ACHHI}\t-1.0`,
].join('\n');

const words = (rows: readonly { word: string }[]) => rows.map((r) => r.word);

describe('next-word table', () => {
  const table = parseNextWords(TABLE);

  it('predicts from the previous word, best first', () => {
    expect(words(table.predict([BHALA], 3))).toEqual([FAKE, ACHHI, PILA]);
  });

  it('uses two previous words first, then the last word backed off by 0.4', () => {
    const out = table.predict([MUN, BHALA], 5);
    expect(words(out)).toEqual([ACHHI, NUHEN, FAKE, PILA]);
    expect(out[2]?.score).toBeCloseTo(-0.9);
  });

  it('tries a previous word without its final virama', () => {
    expect(words(table.predict([THIK + '\u0B4D'], 3))).toEqual([ACHHI]);
  });

  it('canonicalises on load and on lookup', () => {
    expect(words(table.predict([RRA], 3))).toEqual([RRA + ACHHI]);
    expect(words(table.predict([PRECOMPOSED_RRA], 3))).toEqual([RRA + ACHHI]);
  });

  it('predicts nothing without a previous word, or for an unknown one', () => {
    expect(table.predict([], 3)).toEqual([]);
    expect(table.predict([PILA], 3)).toEqual([]);
  });
});

describe('Engine.predictNext', () => {
  it('returns candidates with source "prediction"', () => {
    const engine = createEngine({ rulesToml: SYMBOLS_TOML, nextwordTsv: TABLE, filter: 'off' });
    const out = engine.predictNext([BHALA], 2);
    expect(out.map((c) => c.text)).toEqual([FAKE, ACHHI]);
    expect(out[0]?.source).toBe('prediction');
  });

  it('never predicts an offensive word in family mode, and fills the list from the next rows', () => {
    const engine = createEngine({
      rulesToml: SYMBOLS_TOML,
      nextwordTsv: TABLE,
      labelsTsv: `${FAKE}\toffensive\tbus\n`,
    });
    expect(engine.predictNext([BHALA], 2).map((c) => c.text)).toEqual([ACHHI, PILA]);
  });

  it('never predicts a coarse word in kids mode', () => {
    const engine = createEngine({
      rulesToml: SYMBOLS_TOML,
      nextwordTsv: TABLE,
      labelsTsv: `${ACHHI}\tcoarse\n`,
      filter: 'kids',
    });
    expect(engine.predictNext([BHALA], 3).map((c) => c.text)).not.toContain(ACHHI);
  });

  it('is empty without next-word data', () => {
    expect(createEngine({ rulesToml: SYMBOLS_TOML }).predictNext([BHALA], 3)).toEqual([]);
  });
});
