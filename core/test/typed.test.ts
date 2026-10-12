import { describe, it, expect } from 'vitest';

import { createEngine } from '../src/index.js';
import { MemoryLearnStore } from '../src/learn.js';
import { SYMBOLS_TOML } from './helpers.js';

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
