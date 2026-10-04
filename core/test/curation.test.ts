import { describe, it, expect } from 'vitest';

import { createEngine } from '../src/index.js';
import { parseLabels, parsePreferences } from '../src/curation.js';
import { MemoryLearnStore } from '../src/learn.js';
import { SYMBOLS_TOML } from './helpers.js';

/*
 * Owner-curated data: preferences.tsv and labels.tsv.
 *
 * Fixtures are inline, never core/data/ (a build artefact, see helpers.ts).
 * Odia is written as \u escapes. The "offensive" fixture is an invented
 * non-word that the rules happen to produce for "bus" -- no real abuse is
 * ever written into this repository by an agent.
 */

const RAJA_FESTIVAL = '\u0B30\u0B1C'; // ra ja
const KING = '\u0B30\u0B3E\u0B1C\u0B3E'; // raa jaa
const FAKE = '\u0B2C\u0B41\u0B37'; // rule spelling of "bus" with SSA: not a word
const PRECOMPOSED_RRA = '\u0B5C';

// Two real words under one key, nearly tied, the way the lexicon has them.
const LEXICON = `raja\t${KING}\t1\nraja\t${RAJA_FESTIVAL}\t0.1\n`; // scores 1.12 vs 1.10

const texts = (cs: readonly { text: string }[]) => cs.map((c) => c.text);

describe('preferences.tsv', () => {
  it('puts the preferred word first when two real words nearly tie', () => {
    const plain = createEngine({ rulesToml: SYMBOLS_TOML, lexiconTsv: LEXICON });
    expect(plain.transliterateWord('raja', 5)[0]?.text).toBe(KING);

    const pref = createEngine({
      rulesToml: SYMBOLS_TOML,
      lexiconTsv: LEXICON,
      preferencesTsv: `raja\t${RAJA_FESTIVAL}\t1\tfestival\n`,
    });
    const top = pref.transliterateWord('raja', 5)[0];
    expect(top?.text).toBe(RAJA_FESTIVAL);
    expect(top?.source).toBe('preference');
  });

  it('applies only to its own key', () => {
    const pref = createEngine({
      rulesToml: SYMBOLS_TOML,
      lexiconTsv: `raajaa\t${KING}\t1\n`,
      preferencesTsv: `raja\t${RAJA_FESTIVAL}\n`,
    });
    expect(pref.transliterateWord('raajaa', 5)[0]?.text).toBe(KING);
  });

  it('loses to a single pick by the user', () => {
    const engine = createEngine({
      rulesToml: SYMBOLS_TOML,
      lexiconTsv: LEXICON,
      preferencesTsv: `raja\t${RAJA_FESTIVAL}\n`,
      learnStore: new MemoryLearnStore(),
    });
    engine.learn('raja', KING);
    expect(engine.transliterateWord('raja', 5)[0]?.text).toBe(KING);
  });

  it('treats the roman key case-insensitively', () => {
    const prefs = parsePreferences(`Raja\t${RAJA_FESTIVAL}\n`);
    expect(prefs.get('raja')?.[RAJA_FESTIVAL]).toBe(1);
  });

  it('fails loudly on bad rows, with the line number', () => {
    expect(() => parsePreferences(`# c\nraja\t\u0B13${PRECOMPOSED_RRA}\n`)).toThrow(/preferences\.tsv:2/);
    expect(() => parsePreferences(`raja\n`)).toThrow(/expected/);
    expect(() => parsePreferences(`ra ja\t${KING}\n`)).toThrow(/Latin letters/);
    expect(() => parsePreferences(`raja\t${KING}\t0\n`)).toThrow(/weight/);
    expect(() => parsePreferences(`raja\t${KING}\nraja\t${KING}\n`)).toThrow(/duplicate/);
  });
});

describe('labels.tsv and the family-safe filter', () => {
  const OFFENSIVE = `${FAKE}\toffensive\n`;

  it('fails loudly on an unknown label or a non-canonical word', () => {
    expect(() => parseLabels(`${FAKE}\trude\n`)).toThrow(/unknown label/);
    expect(() => parseLabels(`\u0B13${PRECOMPOSED_RRA}\toffensive\n`)).toThrow(/labels\.tsv:1/);
    expect(parseLabels('# only a comment\n').size).toBe(0);
  });

  it('with the filter OFF, ranking is identical to an engine with no labels', () => {
    const none = createEngine({ rulesToml: SYMBOLS_TOML });
    const off = createEngine({ rulesToml: SYMBOLS_TOML, labelsTsv: OFFENSIVE, familySafe: false });
    expect(off.transliterateWord('bus', 5)).toEqual(none.transliterateWord('bus', 5));
    expect(texts(off.transliterateWord('bus', 5))).toContain(FAKE);
  });

  it('with the filter ON and an empty list, ranking is identical', () => {
    const none = createEngine({ rulesToml: SYMBOLS_TOML });
    const on = createEngine({ rulesToml: SYMBOLS_TOML, labelsTsv: '# empty\n' });
    expect(on.familySafe).toBe(true);
    expect(on.transliterateWord('bus', 9)).toEqual(none.transliterateWord('bus', 9));
  });

  it('with the filter ON, drops an offensive near miss and keeps the list full', () => {
    const on = createEngine({ rulesToml: SYMBOLS_TOML, labelsTsv: OFFENSIVE });
    const list = on.transliterateWord('bus', 5);
    expect(texts(list)).not.toContain(FAKE);
    expect(list.filter((c) => c.source !== 'verbatim')).toHaveLength(5);
  });

  it('can be switched at runtime', () => {
    const engine = createEngine({ rulesToml: SYMBOLS_TOML, labelsTsv: OFFENSIVE });
    engine.setFamilySafe(false);
    expect(texts(engine.transliterateWord('bus', 5))).toContain(FAKE);
    engine.setFamilySafe(true);
    expect(texts(engine.transliterateWord('bus', 5))).not.toContain(FAKE);
  });

  it('still offers the word under its own lexicon key, or once the user taught it', () => {
    const byKey = createEngine({
      rulesToml: SYMBOLS_TOML,
      labelsTsv: OFFENSIVE,
      lexiconTsv: `bush\t${FAKE}\t1\n`,
    });
    expect(texts(byKey.transliterateWord('bush', 5))).toContain(FAKE);

    const taught = createEngine({ rulesToml: SYMBOLS_TOML, labelsTsv: OFFENSIVE, learnStore: new MemoryLearnStore() });
    taught.learn('bus', FAKE);
    expect(taught.transliterateWord('bus', 5)[0]?.text).toBe(FAKE);
  });

  it('never touches strict mode', () => {
    const engine = createEngine({ rulesToml: SYMBOLS_TOML, labelsTsv: OFFENSIVE });
    expect(() => engine.labelsOf(FAKE)).not.toThrow();
    expect([...(engine.labelsOf(FAKE) ?? [])]).toEqual(['offensive']);
  });
});
