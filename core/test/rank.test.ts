import { describe, it, expect } from 'vitest';

import { rank } from '../src/rank.js';
import type { RuleCandidate } from '../src/segment.js';
import type { LexiconEntry, RankWeights, Unigrams } from '../src/types.js';
import { ODISHA, PRECOMPOSED_RRA, RRA } from './helpers.js';

/*
 * Small opaque fixtures rather than real Odia words: what is under test here
 * is the arithmetic of merging three sources, and real words would make a
 * failure look like a linguistics problem when it is an ordering bug. The
 * nukta cases at the end are the exception, because there the identity of a
 * candidate really is a Unicode question.
 */

const WEIGHTS: RankWeights = { rule: 1, freq: 0.6, user: 2 };

const A = 'କ';
const B = 'ଖ';
const C = 'ଗ';

function noUnigrams(): Unigrams {
  return { size: 0, logfreq: () => 0 };
}

function unigrams(table: Record<string, number>): Unigrams {
  return { size: Object.keys(table).length, logfreq: (w) => table[w] ?? 0 };
}

function ruleCandidates(...pairs: [string, number][]): RuleCandidate[] {
  return pairs.map(([text, score]) => ({ text, score }));
}

function lexiconEntries(...pairs: [string, number][]): LexiconEntry[] {
  return pairs.map(([word, weight]) => ({ word, weight }));
}

function run(overrides: Partial<Parameters<typeof rank>[0]> = {}) {
  return rank({
    roman: 'ka',
    ruleCandidates: [],
    lexiconEntries: [],
    unigrams: noUnigrams(),
    weights: WEIGHTS,
    topk: 5,
    ...overrides,
  });
}

const scoreOf = (candidates: ReturnType<typeof rank>, text: string): number =>
  candidates.find((c) => c.text === text)?.score ?? Number.NaN;

describe('rank: merging sources', () => {
  it('ranks a word found by BOTH rule and lexicon above one found by either alone', () => {
    // This is the reason rule and lexicon evidence is added rather than maxed.
    const out = run({
      ruleCandidates: ruleCandidates([A, 1], [B, 1]),
      lexiconEntries: lexiconEntries([A, 1], [C, 1]),
    });

    expect(out[0]?.text).toBe(A);
    expect(scoreOf(out, A)).toBeGreaterThan(scoreOf(out, B));
    expect(scoreOf(out, A)).toBeGreaterThan(scoreOf(out, C));
  });

  it('keeps a lexicon-only word that the rules never produced', () => {
    const out = run({ ruleCandidates: ruleCandidates([A, 1]), lexiconEntries: lexiconEntries([C, 1]) });
    expect(out.map((c) => c.text)).toContain(C);
  });

  it('keeps a word the user has chosen even if nothing else suggests it', () => {
    const out = run({ ruleCandidates: ruleCandidates([A, 1]), userCounts: { [C]: 3 } });
    expect(out.map((c) => c.text)).toContain(C);
    expect(out[0]?.text).toBe(C);
  });

  it('normalises lexicon weights against the best hit for the key', () => {
    // Raw corpus counts vary by orders of magnitude between keys; without
    // normalisation the lexicon term would swamp or vanish depending on the word.
    const small = run({ lexiconEntries: lexiconEntries([A, 0.001]) });
    const large = run({ lexiconEntries: lexiconEntries([A, 9999]) });
    expect(scoreOf(small, A)).toBe(scoreOf(large, A));
  });
});

describe('rank: the scoring formula', () => {
  it('applies weights.rule to the rule score', () => {
    const out = run({ ruleCandidates: ruleCandidates([A, 1], [B, 0.5]) });
    expect(scoreOf(out, A) - scoreOf(out, B)).toBeCloseTo(WEIGHTS.rule * 0.5, 10);
  });

  it('applies weights.freq to corpus log frequency', () => {
    const out = run({
      ruleCandidates: ruleCandidates([A, 1], [B, 1]),
      unigrams: unigrams({ [B]: 2 }),
    });
    expect(scoreOf(out, B) - scoreOf(out, A)).toBeCloseTo(WEIGHTS.freq * 2, 10);
    expect(out[0]?.text).toBe(B);
  });

  it('applies weights.user to log(1 + count), so learning saturates', () => {
    const once = run({ ruleCandidates: ruleCandidates([A, 1]), userCounts: { [A]: 1 } });
    const twice = run({ ruleCandidates: ruleCandidates([A, 1]), userCounts: { [A]: 3 } });
    expect(scoreOf(once, A)).toBeCloseTo(WEIGHTS.rule + WEIGHTS.user * Math.log(2), 10);
    expect(scoreOf(twice, A)).toBeCloseTo(WEIGHTS.rule + WEIGHTS.user * Math.log(4), 10);
  });

  it('lets corpus frequency overturn a rule preference', () => {
    // The rules like A twice as much as B, but B is a real word and A is not.
    const out = run({
      ruleCandidates: ruleCandidates([A, 1], [B, 0.5]),
      unigrams: unigrams({ [B]: 3 }),
    });
    expect(out[0]?.text).toBe(B);
  });
});

describe('rank: source labelling', () => {
  it('reports user over lexicon over rule', () => {
    const out = run({
      ruleCandidates: ruleCandidates([A, 1], [B, 1], [C, 1]),
      lexiconEntries: lexiconEntries([A, 1], [B, 1]),
      userCounts: { [A]: 1 },
    });
    expect(out.find((c) => c.text === A)?.source).toBe('user');
    expect(out.find((c) => c.text === B)?.source).toBe('lexicon');
    expect(out.find((c) => c.text === C)?.source).toBe('rule');
  });
});

describe('rank: the verbatim fallback', () => {
  it('always appends the roman token last, with source verbatim', () => {
    const out = run({ roman: 'PCR', ruleCandidates: ruleCandidates([A, 1]) });
    const last = out[out.length - 1];
    expect(last?.text).toBe('PCR');
    expect(last?.source).toBe('verbatim');
  });

  it('appends it even when nothing else matched at all', () => {
    const out = run({ roman: 'PCR' });
    expect(out).toEqual([{ text: 'PCR', score: 0, source: 'verbatim' }]);
  });

  it('never lists the verbatim token twice', () => {
    // An all-digit token in arabic mode is the case that would duplicate.
    const out = run({ roman: '42', ruleCandidates: ruleCandidates(['42', 1]) });
    expect(out.filter((c) => c.text === '42')).toHaveLength(1);
    expect(out[out.length - 1]?.source).toBe('verbatim');
  });

  it('does not count against topk', () => {
    const out = run({
      ruleCandidates: ruleCandidates([A, 1], [B, 0.9], [C, 0.8]),
      topk: 2,
    });
    expect(out).toHaveLength(3);
    expect(out.map((c) => c.source)).toEqual(['rule', 'rule', 'verbatim']);
  });
});

describe('rank: canonical identity', () => {
  it('merges a rule candidate and a lexicon entry that differ only in nukta encoding', () => {
    // The rules can only emit canonical text, but a lexicon row could arrive
    // precomposed. If those were two candidates the user would see the same
    // word twice, and the merged score that should have won would be split.
    const precomposed = 'ଓ' + PRECOMPOSED_RRA + 'ିଶା';
    expect(precomposed).not.toBe(ODISHA);

    const out = run({
      roman: 'odisha',
      ruleCandidates: ruleCandidates([ODISHA, 1]),
      lexiconEntries: lexiconEntries([precomposed, 1]),
    });

    expect(out.filter((c) => c.text !== 'odisha')).toHaveLength(1);
    expect(out[0]?.text).toBe(ODISHA);
    expect(out[0]?.text).toContain(RRA);
    expect(out[0]?.text).not.toContain(PRECOMPOSED_RRA);
    // Merged, so it carries both sources' evidence.
    expect(out[0]?.score).toBeCloseTo(WEIGHTS.rule * 2, 10);
  });

  it('canonicalises words that arrive only from the user dictionary', () => {
    const precomposed = 'ଓ' + PRECOMPOSED_RRA + 'ିଶା';
    const out = run({ roman: 'odisha', userCounts: { [precomposed]: 4 } });
    expect(out[0]?.text).toBe(ODISHA);
  });
});

describe('rank: ordering', () => {
  it('returns candidates in descending score order', () => {
    const out = run({
      ruleCandidates: ruleCandidates([A, 0.2], [B, 1], [C, 0.6]),
      topk: 10,
    });
    const ranked = out.filter((c) => c.source !== 'verbatim');
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i]?.score).toBeLessThanOrEqual(ranked[i - 1]?.score as number);
    }
    expect(ranked.map((c) => c.text)).toEqual([B, C, A]);
  });

  it('is stable for ties, so the candidate list does not jitter between keystrokes', () => {
    const first = run({ ruleCandidates: ruleCandidates([C, 1], [A, 1], [B, 1]), topk: 10 });
    const second = run({ ruleCandidates: ruleCandidates([B, 1], [C, 1], [A, 1]), topk: 10 });
    expect(first.map((c) => c.text)).toEqual(second.map((c) => c.text));
  });
});
