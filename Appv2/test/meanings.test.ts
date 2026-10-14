import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseLabels, parseMeanings } from '@odia/core';

/* The shipped AI-written meanings (core/data/meanings.tsv, decision D-13). */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('core/data/meanings.tsv', () => {
  const meanings = parseMeanings(read('../../core/data/meanings.tsv'), 'core/data/meanings.tsv');

  it('parses (strict: canonical Odia, no duplicates, English meanings)', () => {
    expect(meanings.size).toBeGreaterThan(0);
  });

  it('defines no word on the owner\'s offensive or coarse list', () => {
    const labels = parseLabels(read('../../core/data/labels.tsv'), 'core/data/labels.tsv');
    const defined = meanings.all().filter((m) => labels.isOffensive(m.odia) || labels.isCoarse(m.odia));
    expect(defined.map((m) => m.odia)).toEqual([]);
  });
});
