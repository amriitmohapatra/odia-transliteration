import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { romanize as evalRomanize, casual } from '../eval/lib.js';
import { romanize, romanizeText } from '../src/romanize.js';

const words = (file: string): string[] =>
  Array.from(new Set(readFileSync(new URL(file, import.meta.url), 'utf8').match(/[\u0B00-\u0B7F]+/g) ?? []));

describe('read-back romanizer (Appv2/src/romanize.ts)', () => {
  it('agrees with the eval romanizer on every word of the everyday and sloka corpora', () => {
    const all = [
      ...words('../../core/test/golden/everyday-source.txt'),
      ...words('../eval/golden/sloka-source.txt'),
    ];
    expect(all.length).toBeGreaterThan(100);
    for (const w of all) expect(romanize(w), w).toBe(evalRomanize(w));
  });

  it('reads KEMITI ACHHA back as kemiti achha (careful) and keeps punctuation', () => {
    const text = '\u0B15\u0B47\u0B2E\u0B3F\u0B24\u0B3F \u0B05\u0B1B!';
    expect(romanizeText(text)).toBe('kemiti achha!');
    expect(casual(romanizeText(text))).toBe('kemiti achha!');
  });

  it('reads the decomposed flap as d (ODISHA -> odishaa)', () => {
    expect(romanize('\u0B13\u0B21\u0B3C\u0B3F\u0B36\u0B3E')).toBe('odishaa');
  });
});
