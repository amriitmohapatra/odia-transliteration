import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseLabels } from '../../core/src/index.js';
import { canonical } from '../../core/src/normalize.js';
import { parseLoans } from '../src/dictionary/loans.js';

/* The generated loan list, on the real file. Odia comes only from the files. */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const loans = parseLoans(read('../src/dictionary/loans.tsv'));
const labels = parseLabels(read('../../core/data/labels.tsv'));

describe('loan-word list', () => {
  it('has English and Persian/Arabic/Hindi loans', () => {
    expect(loans.size).toBeGreaterThan(3000);
    const langs = new Set([...loans.byOdia.values()].flat().map((l) => l.language));
    for (const lang of ['en', 'fa', 'ar']) expect(langs.has(lang as never), lang).toBe(true);
  });

  it('finds the everyday loans by English word', () => {
    for (const word of ['phone', 'video', 'mobile', 'school', 'police', 'bank', 'train', 'shop', 'poor', 'land']) {
      expect(loans.byEnglish.get(word)?.length, word).toBeGreaterThan(0);
    }
  });

  it('is canonical and contains no labelled offensive or coarse word', () => {
    for (const [odia] of loans.byOdia) {
      expect(odia).toBe(canonical(odia));
      expect(labels.isOffensive(odia) || labels.isCoarse(odia), odia).toBe(false);
    }
  });
});
