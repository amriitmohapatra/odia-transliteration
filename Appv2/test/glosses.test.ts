import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { parseGlosses } from '../../core/src/curation.js';

/*
 * core/data/glosses.tsv is hand-edited by the owner. The app must never crash
 * on it, so it swallows a parse error at runtime; THIS test is where a bad row
 * has to fail, loudly, with the line number.
 */
describe('core/data/glosses.tsv', () => {
  const tsv = readFileSync(new URL('../../core/data/glosses.tsv', import.meta.url), 'utf8');

  it('parses: canonical Odia, known status, no duplicates', () => {
    const g = parseGlosses(tsv, 'core/data/glosses.tsv');
    expect(g.size).toBeGreaterThan(0);
  });

  it('gives the Raja festival as the meaning of RAJA', () => {
    expect(parseGlosses(tsv).get('\u0B30\u0B1C')?.meaning).toMatch(/Raja festival/);
  });

  it('rejects a bad status or a precomposed nukta', () => {
    expect(() => parseGlosses('\u0B30\u0B1C\tx\tmaybe\n')).toThrow(/unknown status/);
    expect(() => parseGlosses('\u0B13\u0B5C\tx\towner\n')).toThrow(/glosses\.tsv:1/);
  });
});
