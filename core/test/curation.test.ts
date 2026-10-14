import { describe, it, expect } from 'vitest';

import { createEngine } from '../src/index.js';
import { parseLabels, parseMeanings, parsePhrases, parsePreferences } from '../src/curation.js';
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

  it('still offers the word under one of its listed keys, or once the user taught it', () => {
    const byKey = createEngine({
      rulesToml: SYMBOLS_TOML,
      labelsTsv: `${FAKE}\toffensive\tbush\n`,
      lexiconTsv: `bush\t${FAKE}\t1\n`,
    });
    expect(texts(byKey.transliterateWord('bush', 5))).toContain(FAKE);

    const taught = createEngine({ rulesToml: SYMBOLS_TOML, labelsTsv: OFFENSIVE, learnStore: new MemoryLearnStore() });
    taught.learn('bus', FAKE);
    expect(taught.transliterateWord('bus', 5)[0]?.text).toBe(FAKE);
  });

  // The real case behind this rule: the lexicon also files words under loose
  // casual keys, and one listed word sat under the key of the word for
  // "closed". "The lexicon lists it under this key" is not a safe exemption.
  it('drops it when the lexicon files it under a key that is not one of its listed keys', () => {
    const engine = createEngine({
      rulesToml: SYMBOLS_TOML,
      labelsTsv: `${FAKE}\toffensive\tbushh\n`,
      lexiconTsv: `bus\t${FAKE}\t1\n`,
    });
    expect(texts(engine.transliterateWord('bus', 5))).not.toContain(FAKE);
  });

  it('shows a coarse word normally in family mode', () => {
    const engine = createEngine({ rulesToml: SYMBOLS_TOML, labelsTsv: `${FAKE}\tcoarse\n` });
    expect(texts(engine.transliterateWord('bus', 5))).toContain(FAKE);
  });

  describe('kids level', () => {
    const KIDS = { rulesToml: SYMBOLS_TOML, filter: 'kids' as const };

    it('drops offensive and coarse words with no exemption: not under a listed key, not when taught', () => {
      const off = createEngine({
        ...KIDS,
        labelsTsv: `${FAKE}\toffensive\tbus\n`,
        lexiconTsv: `bus\t${FAKE}\t1\n`,
        learnStore: new MemoryLearnStore(),
      });
      off.learn('bus', FAKE);
      expect(texts(off.transliterateWord('bus', 5))).not.toContain(FAKE);

      const coarse = createEngine({ ...KIDS, labelsTsv: `${FAKE}\tcoarse\n` });
      expect(texts(coarse.transliterateWord('bus', 5))).not.toContain(FAKE);
    });

    it('never remembers a labelled word, and cannot be switched off', () => {
      const store = new MemoryLearnStore();
      const engine = createEngine({ ...KIDS, labelsTsv: OFFENSIVE, learnStore: store });
      engine.learn('bus', FAKE);
      expect(store.get('bus')).toBeUndefined();
      engine.setFamilySafe(false);
      expect(engine.filter).toBe('kids');
      expect(engine.familySafe).toBe(true);
      expect(texts(engine.transliterateWord('bus', 5))).not.toContain(FAKE);
    });

    it('changes nothing while the label list is empty', () => {
      const none = createEngine({ rulesToml: SYMBOLS_TOML });
      const kids = createEngine({ ...KIDS, labelsTsv: '# empty\n' });
      expect(kids.transliterateWord('bus', 9)).toEqual(none.transliterateWord('bus', 9));
    });
  });

  it('rejects a key that is not Latin letters', () => {
    expect(() => parseLabels(`${FAKE}\toffensive\tb us\n`)).toThrow(/Latin letters/);
  });

  it('never touches strict mode', () => {
    const engine = createEngine({ rulesToml: SYMBOLS_TOML, labelsTsv: OFFENSIVE });
    expect(() => engine.labelsOf(FAKE)).not.toThrow();
    expect([...(engine.labelsOf(FAKE) ?? [])]).toEqual(['offensive']);
  });
});

describe('phrases.tsv', () => {
  const HELLO = '\u0B28\u0B2E\u0B38\u0B4D\u0B15\u0B3E\u0B30'; // namaskara
  const HOW_ARE_YOU = '\u0B15\u0B47\u0B2E\u0B3F\u0B24\u0B3F \u0B05\u0B1B'; // kemiti achha
  const GOOD = [
    '# comment',
    `namaskara|namaskar\t${HELLO}\tgreeting\thello\towner`,
    `kemiti achha\t${HOW_ARE_YOU}\tgreeting\thow are you?\tseed\tfamiliar`,
  ].join('\n');

  it('reads keys, the Odia phrase, category, meaning, status and optional note', () => {
    const phrases = parsePhrases(GOOD);
    expect(phrases).toHaveLength(2);
    expect(phrases[0]).toEqual({ keys: ['namaskara', 'namaskar'], odia: HELLO, category: 'greeting',
      meaning: 'hello', status: 'owner', note: '' });
    expect(phrases[1]?.note).toBe('familiar');
  });

  it('accepts a phrase with a danda and a one-word entry', () => {
    expect(parsePhrases(`kemiti achha\t${HOW_ARE_YOU}\u0964\tgreeting\thow are you?\tseed`)).toHaveLength(1);
  });

  it('fails loudly on a bad row', () => {
    expect(() => parsePhrases(`Namaskara\t${HELLO}\tgreeting\thello\tseed`)).toThrow(/bad roman/);
    expect(() => parsePhrases(`namaskara\thello\tgreeting\thello\tseed`)).toThrow(/Odia script/);
    expect(() => parsePhrases(`namaskara\t${HELLO}\tsong\thello\tseed`)).toThrow(/unknown category/);
    expect(() => parsePhrases(`namaskara\t${HELLO}\tgreeting\thello\tmaybe`)).toThrow(/unknown status/);
    expect(() => parsePhrases(`namaskara\t${HELLO}\tgreeting`)).toThrow(/expected/);
    expect(() => parsePhrases(`${GOOD}\nnamaste\t${HELLO}\tgreeting\thello\tseed`)).toThrow(/duplicate/);
  });

  it('rejects a precomposed nukta letter', () => {
    expect(() => parsePhrases(`odisha\t\u0B13${PRECOMPOSED_RRA}\u0B3F\u0B36\u0B3E\tfamily\tOdisha\tseed`))
      .toThrow(/Non-canonical/);
  });
});


describe('meanings.tsv (AI-written meanings)', () => {
  const WORD = 'ନେଇ'; // nei: taking; regarding
  const KU = 'କୁ';
  const NKU = 'ଙ୍କୁ';
  const ROW = (odia: string, meaning: string, status = 'ai', extra = '') =>
    `${odia}\t${meaning}\tsense one; sense two\t\tnative\t${status}\t${extra}\n`;

  it('reads a word, a two-word key and a "-suffix word" construction', () => {
    const m = parseMeanings(
      ROW(WORD, 'taking') + ROW(`-${KU} ${WORD}`, 'over; regarding') + ROW(`-${NKU} ${WORD}`, 'about them'),
    );
    expect(m.size).toBe(3);
    expect(m.get(WORD)?.senses).toEqual(['sense one', 'sense two']);
    expect(m.construction(`ପ୍ରବେଶ${KU}`, WORD)?.meaning).toBe('over; regarding');
    // The longest matching suffix wins.
    expect(m.construction(`ତା${NKU}`, WORD)?.meaning).toBe('about them');
    expect(m.construction(KU, WORD)).toBeUndefined(); // the suffix alone is not a word
  });

  it('reads an ending row, and a word that ends like an ending is still a word', () => {
    const RE = '\u0B30\u0B47'; // -re: in, at
    const KARE = '\u0B15' + RE; // a word made of ka + re
    const m = parseMeanings(ROW(`-${RE}`, 'in, at, on') + ROW(KARE, 'does'));
    expect(m.ending(RE)?.meaning).toBe('in, at, on');
    expect(m.get(KARE)?.meaning).toBe('does');
    expect(m.all().map((x) => x.odia)).toEqual([KARE]);
    expect(() => parseMeanings(ROW(`-${RE}`, 'a') + ROW(`-${RE}`, 'b'))).toThrow(/duplicate/);
  });

  it('never shows a row marked wrong', () => {
    const m = parseMeanings(ROW(WORD, 'no', 'wrong'));
    expect(m.get(WORD)).toBeUndefined();
    expect(m.all()).toEqual([]);
  });

  it('fails loudly on bad rows, with the line number', () => {
    expect(() => parseMeanings(ROW(WORD, 'x', 'seed'))).toThrow(/meanings.tsv:1: unknown status/);
    expect(() => parseMeanings(`${WORD}\tx\t\t\tklingon\tai\n`)).toThrow(/unknown origin/);
    expect(() => parseMeanings(ROW(WORD, `odia ${WORD}`))).toThrow(/must be English/);
    expect(() => parseMeanings(ROW(WORD, 'x'.repeat(57)))).toThrow(/longer than 56/);
    expect(() => parseMeanings(ROW(WORD, 'a') + ROW(WORD, 'b'))).toThrow(/meanings.tsv:2: duplicate/);
    expect(() => parseMeanings(ROW('nei', 'x'))).toThrow(/must be Odia/);
    expect(() => parseMeanings(ROW(`ପ${PRECOMPOSED_RRA}`, 'x'))).toThrow();
  });
});
