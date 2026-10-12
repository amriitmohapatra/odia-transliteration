import { describe, it, expect } from 'vitest';

import { createEngine, Engine, emptyLexicon, emptyUnigrams, parseLexicon } from '../src/index.js';
import { MemoryLearnStore } from '../src/learn.js';
import { SYMBOLS_TOML, testRules } from './helpers.js';

/*
 * Typed-spelling pairs (core/data/typed.tsv): what keyboard users typed for a
 * key and the word they chose. Fixtures are inline, Odia as \u escapes.
 */

const KALI_YESTERDAY = '\u0B15\u0B3E\u0B32\u0B3F'; // kaa li
const KALI_DID = '\u0B15\u0B32\u0B3F'; // ka li
const KANA = '\u0B15\u0B23'; // ka nna: "what", typed as "kn" in chat
const RRA_WORD_CANONICAL = '\u0B2A\u0B21\u0B3C\u0B3F'; // pa dda+nukta i
const RRA_WORD_PRECOMPOSED = '\u0B2A\u0B5C\u0B3F';

// "did" leads on lexicon weight alone, the way the real lexicon has it.
const LEXICON = `kali\t${KALI_DID}\t1\nkali\t${KALI_YESTERDAY}\t0.8\n`;
const TYPED = `kali\t${KALI_YESTERDAY}\t76128\nkali\t${KALI_DID}\t16105\nkn\t${KANA}\t285010\n`;

const texts = (cs: readonly { text: string }[]) => cs.map((c) => c.text);

describe('typed-spelling pairs', () => {
  it('change nothing when absent: scores are bit for bit the plain engine', () => {
    const plain = createEngine({ rulesToml: SYMBOLS_TOML, lexiconTsv: LEXICON });
    const empty = createEngine({ rulesToml: SYMBOLS_TOML, lexiconTsv: LEXICON, typedTsv: '' });
    expect(empty.transliterateWord('kali', 8)).toEqual(plain.transliterateWord('kali', 8));
  });

  it('put the word users chose first', () => {
    const plain = createEngine({ rulesToml: SYMBOLS_TOML, lexiconTsv: LEXICON });
    expect(plain.transliterateWord('kali', 5)[0]?.text).toBe(KALI_DID);

    const typed = createEngine({ rulesToml: SYMBOLS_TOML, lexiconTsv: LEXICON, typedTsv: TYPED });
    expect(typed.transliterateWord('kali', 5)[0]?.text).toBe(KALI_YESTERDAY);
  });

  it('offer a word that neither the rules nor the lexicon produce (chat shorthand)', () => {
    const typed = createEngine({ rulesToml: SYMBOLS_TOML, lexiconTsv: LEXICON, typedTsv: TYPED });
    const top = typed.transliterateWord('kn', 5)[0];
    expect(top?.text).toBe(KANA);
    expect(top?.source).toBe('typed');
  });

  it('lose to a single pick by the user', () => {
    const engine = createEngine({
      rulesToml: SYMBOLS_TOML,
      typedTsv: `kali\t${KALI_YESTERDAY}\t1000000\nkali\t${KALI_DID}\t1\n`,
      learnStore: new MemoryLearnStore(),
    });
    expect(engine.transliterateWord('kali', 5)[0]?.text).toBe(KALI_YESTERDAY);
    engine.learn('kali', KALI_DID);
    expect(engine.transliterateWord('kali', 5)[0]?.text).toBe(KALI_DID);
  });

  it('do not stop a word kept in English from leading after one Keep', () => {
    const BUS = '\u0B2C\u0B38\u0B4D'; // the loan word, a real word with a frequency
    const engine = createEngine({
      rulesToml: SYMBOLS_TOML,
      typedTsv: `bus\t${BUS}\t287\n`,
      unigramsTsv: `${BUS}\t2.0\n`,
      learnStore: new MemoryLearnStore(),
    });
    expect(engine.transliterateWord('bus', 5)[0]?.text).toBe(BUS);
    engine.learn('bus', 'bus');
    const out = engine.transliterateWord('bus', 5);
    expect(out[0]).toMatchObject({ text: 'bus', source: 'user' });
    expect(out.filter((c) => c.text === 'bus')).toHaveLength(1);
    // Two picks of the Odia word later, the Odia word leads again.
    engine.learn('bus', BUS);
    engine.learn('bus', BUS);
    expect(engine.transliterateWord('bus', 5)[0]?.text).toBe(BUS);
  });

  it('lose to an owner preference', () => {
    const engine = createEngine({
      rulesToml: SYMBOLS_TOML,
      lexiconTsv: LEXICON,
      typedTsv: TYPED,
      preferencesTsv: `kali\t${KALI_DID}\t1\tthe verb first\n`,
    });
    expect(engine.transliterateWord('kali', 5)[0]?.text).toBe(KALI_DID);
  });

  it('are canonicalised on load: a precomposed nukta row matches the canonical word', () => {
    const engine = createEngine({ rulesToml: SYMBOLS_TOML, typedTsv: `padi\t${RRA_WORD_PRECOMPOSED}\t50\n` });
    const words = texts(engine.transliterateWord('padi', 8));
    expect(words).toContain(RRA_WORD_CANONICAL);
    expect(words).not.toContain(RRA_WORD_PRECOMPOSED);
  });

  it('a rarely typed key counts less than a common one (the prior)', () => {
    const rare = createEngine({ rulesToml: SYMBOLS_TOML, typedTsv: `kn\t${KANA}\t2\n` });
    const common = createEngine({ rulesToml: SYMBOLS_TOML, typedTsv: `kn\t${KANA}\t285010\n` });
    const score = (e: typeof rare) => e.transliterateWord('kn', 5).find((c) => c.text === KANA)?.score ?? 0;
    expect(score(common)).toBeGreaterThan(score(rare));
  });
});

describe('word completion from typed pairs', () => {
  const CITY = '\u0B2D\u0B41\u0B2C\u0B28\u0B47\u0B36\u0B4D\u0B71\u0B30'; // bhubaneswar
  const BHUBANA = '\u0B2D\u0B41\u0B2C\u0B28'; // bhubana
  const MISSPELT = '\u0B2D\u0B41\u0B2C\u0B47\u0B28\u0B47\u0B36\u0B4D\u0B71\u0B30';
  const TYPED_CITY =
    `bhuban\t${BHUBANA}\t250\nbhubaneswar\t${CITY}\t7000\nbhubeneswar\t${MISSPELT}\t114\nbhubneswar\t${CITY}\t747\n`;
  const engine = createEngine({ rulesToml: SYMBOLS_TOML, typedTsv: TYPED_CITY });

  it('offers the whole word for a key still being typed, most chosen first, counts summed over keys', () => {
    const out = engine.complete('bhub', 3);
    expect(texts(out)).toEqual([CITY, BHUBANA]);
    expect(out[0]?.source).toBe('completion');
    expect(out[0]?.score).toBe(7747);
  });

  it('drops a rare misspelling next to the common word (relative floor)', () => {
    expect(texts(engine.complete('bhub', 5))).not.toContain(MISSPELT);
  });

  it('needs three letters, and skips words that are already candidates', () => {
    expect(engine.complete('bh', 3)).toEqual([]);
    expect(texts(engine.complete('bhub', 3, [CITY]))).toEqual([BHUBANA]);
  });

  it('never completes to the exact key itself', () => {
    expect(texts(engine.complete('bhuban', 3))).toEqual([CITY]);
  });

  it('is off where the typed term is off ([weights] typed = 0)', () => {
    const off = createEngine({ rulesToml: SYMBOLS_TOML.replace(/^typed = .*$/m, 'typed = 0'), typedTsv: TYPED_CITY });
    expect(off.complete('bhub', 3)).toEqual([]);
  });

  it('is empty without typed data', () => {
    expect(createEngine({ rulesToml: SYMBOLS_TOML }).complete('bhub', 3)).toEqual([]);
  });

  it('goes through the content filter', () => {
    const kids = createEngine({
      rulesToml: SYMBOLS_TOML,
      typedTsv: TYPED_CITY,
      labelsTsv: `${CITY}\toffensive\tbhubaneswar\n`,
      filter: 'kids',
    });
    expect(texts(kids.complete('bhub', 3))).not.toContain(CITY);
  });
});

describe('the spelling converter term', () => {
  const STRANGE = '\u0B15\u0B4D\u0B37'; // what a converter might say for "kx": not a rule spelling
  const fake = (out: Record<string, { text: string; cost: number }[]>) => ({ decode: (roman: string) => out[roman] ?? [] });
  const conv = fake({ kx: [{ text: STRANGE, cost: 5 }], kali: [{ text: KALI_YESTERDAY, cost: 5 }, { text: KALI_DID, cost: 9 }] });

  it('changes nothing without a converter: bit for bit the plain engine', () => {
    const plain = createEngine({ rulesToml: SYMBOLS_TOML, lexiconTsv: LEXICON });
    const withNone = createEngine({ rulesToml: SYMBOLS_TOML, lexiconTsv: LEXICON });
    expect(withNone.transliterateWord('kali', 8)).toEqual(plain.transliterateWord('kali', 8));
  });

  it('puts the converter word first for a key the word lists do not know', () => {
    const engine = new Engine({ rules: testRules(), lexicon: emptyLexicon(), unigrams: emptyUnigrams(), converter: conv });
    const top = engine.transliterateWord('kx', 5)[0];
    expect(top).toMatchObject({ text: STRANGE, source: 'converter' });
  });

  it('weighs less for a key the lexicon knows (convert_known)', () => {
    const w = testRules().weights;
    expect(w.convertKnown ?? 0).toBeLessThan(w.convert ?? 0);
    const engine = new Engine({ rules: testRules(), lexicon: parseLexicon(LEXICON), unigrams: emptyUnigrams(), converter: conv });
    const plain = new Engine({ rules: testRules(), lexicon: parseLexicon(LEXICON), unigrams: emptyUnigrams() });
    const score = (e: Engine) => e.transliterateWord('kali', 5).find((c) => c.text === KALI_YESTERDAY)?.score ?? 0;
    expect(score(engine) - score(plain)).toBeLessThanOrEqual((w.convertKnown ?? 0) + 1e-9);
    expect(score(engine)).toBeGreaterThan(score(plain));
  });

  it('loses to one pick by the user, although its weight is larger than a pick', () => {
    const store = new MemoryLearnStore();
    const engine = new Engine({ rules: testRules(), lexicon: emptyLexicon(), unigrams: emptyUnigrams(), converter: conv, learnStore: store });
    const other = engine.transliterateWord('kx', 5).find((c) => c.text !== STRANGE && c.source !== 'verbatim');
    expect(other).toBeDefined();
    engine.learn('kx', other!.text);
    expect(engine.transliterateWord('kx', 5)[0]?.text).toBe(other!.text);
  });
});
