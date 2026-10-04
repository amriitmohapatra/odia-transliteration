import { describe, it, expect } from 'vitest';

import { createEngine } from '../src/index.js';
import { MemoryLearnStore } from '../src/learn.js';
import { codepoints, isCanonical } from '../src/normalize.js';
import {
  SYMBOLS_TOML,
  ITRANS_TOML,
  KEMITI,
  NAMASKAARA,
  ODIA_FIVE,
  ODISHA,
  PRECOMPOSED_RRA,
  RRA,
} from './helpers.js';

/*
 * Engine-level tests: the seams between the modules, not the modules.
 *
 * segment.test.ts already proves the lattice reaches ଓଡ଼ିଶା and rank.test.ts
 * proves the arithmetic of merging three sources. What is only observable from
 * here is whether Engine wires them together without losing anything on the
 * way — case folding that must not reach the verbatim candidate, digit runs
 * that never touch the segmenter, and the data files being optional.
 *
 * No test here reads core/data/. That directory is a build artifact which can
 * be regenerated at any time, so a test that depended on its contents would
 * fail for reasons that have nothing to do with the engine. Where a lexicon is
 * needed it is built inline, three rows of it.
 */

/** The engine as it exists before the data pipeline has ever run. */
function ruleOnlyEngine() {
  return createEngine({ rulesToml: SYMBOLS_TOML, itransToml: ITRANS_TOML });
}

const textsOf = (candidates: readonly { text: string }[]): string[] =>
  candidates.map((c) => c.text);

describe('Engine: the nukta invariant survives the whole pipeline', () => {
  it('offers the canonical flap as a candidate for "odisha"', () => {
    const candidates = textsOf(ruleOnlyEngine().transliterateWord('odisha', 10));
    expect(
      candidates.some((t) => t.includes(RRA)),
      `no candidate contained U+0B21 U+0B3C: ${candidates.join(' ')}`,
    ).toBe(true);
  });

  it('never emits the precomposed U+0B5C from any entry point', () => {
    const engine = ruleOnlyEngine();

    for (const text of textsOf(engine.transliterateWord('odisha', 20))) {
      expect(text.includes(PRECOMPOSED_RRA), `U+0B5C in ${codepoints(text)}`).toBe(false);
    }

    // The whole-string path reassembles candidates by hand, so it is a
    // separate opportunity to leak a non-canonical spelling.
    const result = engine.transliterate('odisha odia padhiba');
    expect(result.text.includes(PRECOMPOSED_RRA)).toBe(false);
    for (const word of result.words) {
      for (const candidate of word.candidates) {
        if (candidate.source === 'verbatim') continue;
        expect(
          isCanonical(candidate.text),
          `non-canonical ${codepoints(candidate.text)}`,
        ).toBe(true);
      }
    }
  });

  it('canonicalises a precomposed word on its way into the user dictionary', () => {
    // learn() is the one place a string from outside the engine — whatever the
    // host text field handed back — enters long-lived storage.
    const store = new MemoryLearnStore();
    createEngine({ rulesToml: SYMBOLS_TOML, learnStore: store }).learn(
      'odisha',
      'ଓ' + PRECOMPOSED_RRA + 'ିଶା',
    );

    const stored = Object.keys(store.get('odisha') ?? {});
    expect(stored).toEqual([ODISHA]);
    expect(stored[0]).toContain(RRA);
    expect(stored[0]).not.toContain(PRECOMPOSED_RRA);
  });
});

describe('Engine: orthography through the public API', () => {
  it('forms the conjunct ସ୍କ, so "namaskaara" reaches ନମସ୍କାର', () => {
    expect(textsOf(ruleOnlyEngine().transliterateWord('namaskaara', 40))).toContain(NAMASKAARA);
  });

  it('transliterates a whole sentence and keeps punctuation and spacing exactly', () => {
    const result = ruleOnlyEngine().transliterate('kemiti achha!  ');
    expect(result.text).toBe(KEMITI + ' ' + 'ଅଛ' + '!  ');
    // Punctuation and whitespace are not candidates for anything, so they
    // appear in `text` but never as words.
    expect(result.words.map((w) => w.roman)).toEqual(['kemiti', 'achha']);
  });
});

describe('Engine: mixed English', () => {
  it('keeps "PCR" available verbatim, in its original case', () => {
    const result = ruleOnlyEngine().transliterate('PCR test');
    expect(result.words.map((w) => w.roman)).toEqual(['PCR', 'test']);

    const pcr = result.words[0]?.candidates ?? [];
    const last = pcr[pcr.length - 1];
    expect(last?.text).toBe('PCR');
    expect(last?.source).toBe('verbatim');
  });

  it('folds case for matching without folding the verbatim candidate', () => {
    // "PCR" and "pcr" must reach the same Odia spellings, but the verbatim
    // fallback has to give back exactly what was typed.
    const engine = ruleOnlyEngine();
    const upper = engine.transliterateWord('PCR', 5);
    const lower = engine.transliterateWord('pcr', 5);

    const odiaOnly = (cs: typeof upper): string[] =>
      cs.filter((c) => c.source !== 'verbatim').map((c) => c.text);

    expect(odiaOnly(upper)).toEqual(odiaOnly(lower));
    expect(upper[upper.length - 1]?.text).toBe('PCR');
    expect(lower[lower.length - 1]?.text).toBe('pcr');
  });

  it('ends every word candidate list with the verbatim token', () => {
    for (const word of ruleOnlyEngine().transliterate('kemiti PCR 42 Bayesian').words) {
      const last = word.candidates[word.candidates.length - 1];
      expect(last?.source, `no verbatim fallback for "${word.roman}"`).toBe('verbatim');
      expect(last?.text).toBe(word.roman);
    }
  });
});

describe('Engine: digit modes', () => {
  const digitsOf = (mode: 'arabic' | 'odia', input: string): string =>
    createEngine({ rulesToml: SYMBOLS_TOML, digits: mode }).transliterate(input).text;

  it('leaves digits as 5 in arabic mode and rewrites them as ୫ in odia mode', () => {
    expect(digitsOf('arabic', '5')).toBe('5');
    expect(digitsOf('odia', '5')).toBe(ODIA_FIVE);
    expect(ODIA_FIVE).not.toBe('5');
  });

  it('defaults to arabic when no mode is given', () => {
    expect(createEngine({ rulesToml: SYMBOLS_TOML }).transliterate('5').text).toBe('5');
  });

  it('converts every digit of a run, in order', () => {
    expect(digitsOf('odia', '2024')).toBe('୨୦୨୪');
  });

  it('keeps the arabic form available as the verbatim candidate in odia mode', () => {
    // Switching mode must never make the typed digits unreachable.
    const words = createEngine({ rulesToml: SYMBOLS_TOML, digits: 'odia' })
      .transliterate('5')
      .words;
    expect(textsOf(words[0]?.candidates ?? [])).toEqual([ODIA_FIVE, '5']);
  });

  it('converts digits inside a sentence without disturbing the words', () => {
    const result = digitsOf('odia', 'odisha 1936');
    expect(result).toContain('୧୯୩୬');
    expect(result).not.toContain('1936');
  });
});

describe('Engine: the data files are optional', () => {
  it('works with no lexicon and no unigrams at all', () => {
    // This is the state the project is in before the data pipeline runs, and
    // an engine that refused to start without a lexicon would be unusable
    // during exactly the work that produces one.
    const engine = ruleOnlyEngine();
    expect(engine.lexiconSize).toBe(0);

    const candidates = engine.transliterateWord('kemiti', 5);
    expect(candidates.length).toBeGreaterThan(1);
    expect(textsOf(candidates)).toContain(KEMITI);
    // With no lexicon and no user history, every real suggestion is rule-borne.
    for (const candidate of candidates.slice(0, -1)) {
      expect(candidate.source).toBe('rule');
    }
  });

  it('uses the lexicon when there is one, and labels the source', () => {
    const engine = createEngine({
      rulesToml: SYMBOLS_TOML,
      lexiconTsv: `odisha\t${ODISHA}\t100\n`,
    });

    expect(engine.lexiconSize).toBe(1);
    const top = engine.transliterateWord('odisha', 5)[0];
    expect(top?.text).toBe(ODISHA);
    expect(top?.source).toBe('lexicon');
  });

  it('throws a useful error from strict() when no ITRANS table was loaded', () => {
    expect(() => createEngine({ rulesToml: SYMBOLS_TOML }).strict('namaskaara')).toThrow(
      /strict mode is unavailable/,
    );
  });
});

describe('Engine: learning', () => {
  it('promotes a spelling the user picked to the top for that key', () => {
    const engine = createEngine({
      rulesToml: SYMBOLS_TOML,
      learnStore: new MemoryLearnStore(),
    });

    const before = engine.transliterateWord('achha', 5);
    const runnerUp = before[2]?.text as string;
    expect(runnerUp).toBeDefined();
    expect(before[0]?.text).not.toBe(runnerUp);

    engine.learn('achha', runnerUp);

    const after = engine.transliterateWord('achha', 5);
    expect(after[0]?.text).toBe(runnerUp);
    expect(after[0]?.source).toBe('user');
  });

  it('is a no-op, not a crash, when no learn store is configured', () => {
    const engine = ruleOnlyEngine();
    expect(() => engine.learn('achha', 'ଅଛ')).not.toThrow();
  });

  it('treats the roman key case-insensitively', () => {
    const engine = createEngine({
      rulesToml: SYMBOLS_TOML,
      learnStore: new MemoryLearnStore(),
    });
    engine.learn('Kemiti', KEMITI);
    expect(engine.transliterateWord('kemiti', 5)[0]?.text).toBe(KEMITI);
  });
});

describe('Engine: strict mode', () => {
  it('is deterministic and returns one answer, not candidates', () => {
    const engine = ruleOnlyEngine();
    expect(engine.strict('namaskaara')).toBe(NAMASKAARA);
    expect(engine.strict('namaskaara')).toBe(engine.strict('namaskaara'));
  });
});

describe('Engine: topk', () => {
  it('returns at most topk ranked candidates, plus the verbatim fallback', () => {
    const engine = ruleOnlyEngine();
    // The verbatim token is a fallback, not a suggestion, so it is appended
    // after the cut rather than competing for a slot.
    expect(engine.transliterateWord('kemiti', 3)).toHaveLength(4);
    expect(engine.transliterateWord('kemiti', 1)).toHaveLength(2);
  });

  it('honours a topk passed to transliterate()', () => {
    const result = ruleOnlyEngine().transliterate('kemiti achha', { topk: 2 });
    for (const word of result.words) {
      expect(word.candidates.length).toBeLessThanOrEqual(3);
    }
  });
});
