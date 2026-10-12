import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanDefinition } from '../src/dictionary/clean.js';

describe('cleanDefinition (Praharaj romanization codes)', () => {
  it('turns the codes into letters', () => {
    expect(cleanDefinition('Aksh&aline;&uline;hi')).toBe('Aksha̱u̱hi');
    expect(cleanDefinition('Uttarākā&ntod;ḍa')).toBe('Uttarākāṇḍa');
    expect(cleanDefinition('a$nbsp;b')).toBe('a b');
    expect(cleanDefinition('plain text & more')).toBe('plain text & more');
  });

  it('leaves no code in the shipped dictionary text', () => {
    const text = gunzipSync(readFileSync(new URL('../src/dictionary/praharaj.bin', import.meta.url))).toString('utf8');
    expect(text).toMatch(/&aline;/); // the raw payload still has them
    expect(cleanDefinition(text).match(/[$&][A-Za-z]{2,10};/g) ?? []).toEqual([]);
  });
});
