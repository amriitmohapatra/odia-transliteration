import { describe, it, expect } from 'vitest';

import { testRules } from './helpers.js';

/*
 * The house rule (owner decisions, 2026-10-04): ONE pick by the user beats an
 * owner preference and beats any context from the previous word. A user pick
 * scores user * ln(1 + 1); the preference term is pref * 1 for a weight-1 row;
 * the context term is at most `bigram` (its factor is 0..1, see rank.ts), and
 * the typed-spelling term at most `typed` (also 0..1).
 */
describe('[weights] in symbols.toml keep the user in charge', () => {
  const w = testRules().weights;
  const onePick = w.user * Math.log(2);

  it('one user pick beats a weight-1 owner preference', () => {
    expect(onePick).toBeGreaterThan(w.pref);
  });

  it('one user pick beats the strongest possible context term', () => {
    expect(onePick).toBeGreaterThan(w.bigram ?? 0);
  });

  // The converter weight may exceed one pick: rank.ts puts the user's most
  // picked word first whatever the other terms add (core/test/typed.test.ts).

  it('one user pick beats the strongest possible typed-spelling term', () => {
    // The typed factor is count / (total + prior), below 1 (see rank.ts).
    expect(onePick).toBeGreaterThan(w.typed ?? 0);
  });
});
