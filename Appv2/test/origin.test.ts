import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';

import { fnv1a, originChipLabel, originLabel, parseOrigin } from '../src/dictionary/origin.js';

/*
 * Word origin (V2.4): the shipped origin.bin against the shipped praharaj.bin.
 * Known words are given by code point; the expected codes were read from the
 * Praharaj entries themselves (quoted in the comments, romanised).
 */
const read = (name: string): string =>
  gunzipSync(readFileSync(new URL(`../src/dictionary/${name}`, import.meta.url))).toString('utf8');

const payload = read('praharaj.bin');
const a = payload.indexOf('\u0002');
const b = payload.indexOf('\u0002', a + 1);
const keys = payload.slice(a + 1, b).split('\n');
const originText = read('origin.bin');
const codes = parseOrigin(originText, keys);

const codeOf = (word: string): string | undefined => {
  const i = keys.indexOf(word);
  return i >= 0 && codes ? codes[i] : undefined;
};

describe('origin.bin', () => {
  it('belongs to praharaj.bin: same key count and key checksum', () => {
    expect(codes).not.toBeNull();
    expect(codes).toHaveLength(keys.length);
    expect(keys.length).toBe(38776);
  });

  it('is refused for another key list (a stale file shows nothing)', () => {
    expect(parseOrigin(originText, keys.slice(1))).toBeNull();
    const swapped = [keys[1] as string, keys[0] as string, ...keys.slice(2)];
    expect(parseOrigin(originText, swapped)).toBeNull();
  });

  it('holds only known codes', () => {
    for (const c of codes ?? []) expect(c).toMatch(/^[STDPAEHBKGF/]*$/);
  });

  it('stays inside the 300 KB budget', () => {
    expect(Buffer.byteLength(originText, 'utf8')).toBeLessThan(300_000);
  });

  it('matches the build script checksum function', () => {
    // FNV-1a 32 test vectors (same as the Python fnv1a in build_origin_map.py).
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
  });
});

describe('known words', () => {
  it('SARAKAARA (government) is Persian: "baideshika, (Pha. sarakaara)"', () => {
    expect(codeOf('\u0B38\u0B30\u0B15\u0B3E\u0B30')).toBe('P');
  });

  it('KHABARA (news) is Arabic: "(Aa. khabar)"', () => {
    expect(codeOf('\u0B16\u0B2C\u0B30')).toBe('A');
  });

  it('OXYGEN is English: "baideshika, (Im.)"', () => {
    expect(codeOf('\u0B05\u0B15\u0B4D\u0B38\u0B3F\u0B1C\u0B47\u0B28\u0B4D')).toBe('E');
  });

  it('JORU (wife) is Hindi: "deshya, (Hi. joru)"', () => {
    expect(codeOf('\u0B1C\u0B4B\u0B30\u0B41')).toBe('H');
  });

  it('GAAN (village) is tadbhava: "deshya, (Sam. graama)"', () => {
    expect(codeOf('\u0B17\u0B3E\u0B01')).toBe('T');
  });

  it('JALA (water) is Sanskrit', () => {
    expect(codeOf('\u0B1C\u0B33')).toBe('S');
  });

  it('GOKSHA is Sanskrit, not Hindi: "(Hi. Shabdasagar)" is a citation', () => {
    expect(codeOf('\u0B17\u0B4B\u0B15\u0B4D\u0B37')).toBe('S');
  });

  it('AURA (and) is not Hindi: "(compare; Hi. ...)" is not an origin', () => {
    expect(codeOf('\u0B14\u0B30')).toBe('');
  });

  it('ODIA, a key with a nukta letter, is found in decomposed form', () => {
    expect(codeOf('\u0B13\u0B21\u0B3C\u0B3F\u0B06')).toBe('T');
    expect(keys.some((k) => /[\u0B5C\u0B5D]/.test(k))).toBe(false);
  });
});

describe('labels', () => {
  it('panel labels', () => {
    expect(originLabel('P')).toBe('from Persian');
    expect(originLabel('S')).toBe('from Sanskrit (tatsama)');
    expect(originLabel('D')).toBe('native Odia (deshaja)');
    expect(originLabel('AP')).toBe('from Arabic + Persian');
    expect(originLabel('S/D')).toBe('from Sanskrit (tatsama) or native Odia (deshaja)');
    expect(originLabel('')).toBeNull();
    expect(originLabel('X')).toBeNull();
  });

  it('chip suffix only for a borrowed word whose entries agree', () => {
    expect(originChipLabel('P')).toBe('from Persian');
    expect(originChipLabel('F')).toBe('from another language');
    expect(originChipLabel('S')).toBeNull();
    expect(originChipLabel('T')).toBeNull();
    expect(originChipLabel('D')).toBeNull();
    expect(originChipLabel('P/D')).toBeNull();
  });
});
