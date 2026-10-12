import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { parseConverter } from '../src/converter.js';
import { codepoints } from '../src/normalize.js';

/*
 * The converter tests build a tiny FST in the binary format of
 * tools/build-data/build_converter.py (the encoder below mirrors it), so they do not
 * depend on core/data/converter.bin. Odia strings are \u escapes, as in normalize.test.ts.
 */

const KA = '\u0B15'; // KA
const AA = '\u0B3E'; // vowel sign AA
const A = '\u0B05'; // independent A
const ANUSVARA = '\u0B02';
const PRECOMPOSED_RRA = '\u0B5C';
const CANONICAL_RRA = '\u0B21\u0B3C';

type Arc = [src: number, dst: number, input: string, output: string, weight: number];

interface TinyFst {
  nStates: number;
  scale: number;
  arcs: Arc[];
  finals: [state: number, cost: number][];
}

function varint(n: number, out: number[]): void {
  for (;;) {
    const b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) out.push(b | 0x80);
    else {
      out.push(b);
      return;
    }
  }
}
const zigzag = (d: number): number => (d >= 0 ? 2 * d : -2 * d - 1);
function planes(values: number[], width: number, out: number[]): void {
  for (let k = 0; k < width; k++) for (const v of values) out.push((v >> (8 * k)) & 0xff);
}
function u16(v: number, out: number[]): void {
  out.push(v & 0xff, (v >> 8) & 0xff);
}
function u32(v: number, out: number[]): void {
  out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
}

/** Encode a tiny FST. Weights and final costs are given in cost units (stored = w * scale). */
function encode(fst: TinyFst): Uint8Array {
  const tokens = [...new Set(fst.arcs.map((a) => a[2]).filter((t) => t !== ''))].sort();
  const inId = new Map(tokens.map((t, i) => [t, i + 1]));
  inId.set('', 0);
  const outs = ['', ...new Set(fst.arcs.map((a) => a[3]).filter((o) => o !== ''))];
  const outId = new Map(outs.map((o, i) => [o, i]));
  const q = (w: number): number => Math.round(w * fst.scale);
  const arcs = fst.arcs
    .map(([s, d, i, o, w]) => ({ s, d, i: inId.get(i)!, o: outId.get(o)!, w: q(w) }))
    .sort((x, y) => x.s - y.s || x.i - y.i);
  const eps = arcs.filter((a) => a.i === 0);
  const non = arcs.filter((a) => a.i !== 0);
  const pairs: [number, number][] = [[0, 0]];
  const stateIn = new Array<number>(fst.nStates).fill(0);
  for (const a of non) {
    let k = pairs.findIndex(([i, o]) => i === a.i && o === a.o);
    if (k < 0) k = pairs.push([a.i, a.o]) - 1;
    if (stateIn[a.d] !== 0 && stateIn[a.d] !== k) throw new Error('test FST: labels not a function of dst');
    stateIn[a.d] = k;
  }

  const b: number[] = [];
  for (const ch of 'OCNV') b.push(ch.charCodeAt(0));
  u16(1, b);
  u16(0, b);
  u32(fst.nStates, b);
  u32(arcs.length, b);
  u32(0, b);
  u32(fst.scale, b);
  u16(tokens.length + 1, b);
  u16(outs.length, b);
  u16(pairs.length, b);
  u32(fst.finals.length, b);
  for (const t of tokens) {
    b.push(t.length);
    for (const ch of t) b.push(ch.charCodeAt(0));
  }
  for (const o of outs) {
    b.push(o.length);
    for (let k = 0; k < o.length; k++) u16(o.charCodeAt(k), b);
  }
  for (let s = 0; s < fst.nStates; s++) varint(arcs.filter((a) => a.s === s).length, b);
  for (let s = 0; s < fst.nStates; s++) varint(eps.filter((a) => a.s === s).length, b);
  for (const [i, o] of pairs.slice(1)) {
    varint(i, b);
    varint(o, b);
  }
  planes(stateIn, 2, b);
  const sparse = eps.map((a, k) => [k, a.o] as const).filter(([, o]) => o !== 0);
  varint(sparse.length, b);
  let prev = 0;
  for (const [k, o] of sparse) {
    varint(k - prev, b);
    varint(o, b);
    prev = k;
  }
  planes(eps.map((a) => a.w), 2, b);
  planes(non.map((a) => a.w), 2, b);
  for (const group of [eps, non]) {
    prev = 0;
    for (const a of group) {
      varint(zigzag(a.d - prev), b);
      prev = a.d;
    }
  }
  const finals = [...fst.finals].sort((x, y) => x[0] - y[0]);
  prev = 0;
  for (const [s] of finals) {
    varint(s - prev, b);
    prev = s;
  }
  planes(finals.map(([, c]) => q(c)), 2, b);
  return Uint8Array.from(b);
}

/*
 * State 0 is the start, state 1 the back-off state. Paths for "ka":
 *   0 -k:KA 0.5-> 2 -a:'' 0.25-> 5 (final 0)        "KA"          path 0.75
 *   0 -k:KA 0.5-> 2 -a:AA 0.5-> 6 (final 0.5)       "KA AA"       path 1.0, total 1.5
 *   0 -ka:KA AA 2-> 3 (final 0)                     "KA AA" again (deduplicated)
 *   ... 6 -eps:ANUSVARA 3-> 8 (final 0)             "KA AA ANUSVARA"  path 4.0
 *   0 -k-> 2 -eps 2-> 1 -a:A 1-> 4 (final 0)         "KA A"        path 3.5
 * and "r" outputs a precomposed RRA (U+0B5C), which must come out decomposed.
 */
const TINY: TinyFst = {
  nStates: 9,
  scale: 4,
  arcs: [
    [0, 1, '', '', 1],
    [0, 2, 'k', KA, 0.5],
    [0, 3, 'ka', KA + AA, 2],
    [0, 7, 'r', PRECOMPOSED_RRA, 0.25],
    [1, 4, 'a', A, 1],
    [1, 2, 'k', KA, 1.5],
    [2, 1, '', '', 2],
    [2, 5, 'a', '', 0.25],
    [2, 6, 'a', AA, 0.5],
    [6, 8, '', ANUSVARA, 3],
  ],
  finals: [
    [3, 0],
    [4, 0],
    [5, 0],
    [6, 0.5],
    [7, 0],
    [8, 0],
  ],
};

describe('converter', () => {
  const bytes = encode(TINY);

  it('returns the n-best spellings in search order, deduplicated', () => {
    const conv = parseConverter(bytes);
    expect(conv.decode('ka', 5)).toEqual([
      { text: KA, cost: 0.75 },
      { text: KA + AA, cost: 1.5 },
      { text: KA + A, cost: 3.5 },
      { text: KA + AA + ANUSVARA, cost: 4 },
    ]);
    expect(conv.decode('ka', 2).map((c) => c.text)).toEqual([KA, KA + AA]);
    expect(conv.decode('k', 5)).toEqual([]); // no final state after "k" alone
  });

  it('outputs canonical nukta letters (decomposed RRA, never U+0B5C)', () => {
    const conv = parseConverter(bytes);
    const [best] = conv.decode('r', 1);
    expect(best).toBeDefined();
    expect(codepoints(best!.text)).toBe('U+0B21 U+0B3C');
    expect(best!.text).toBe(CANONICAL_RRA);
  });

  it('lower-cases input and rejects characters outside the alphabet', () => {
    const conv = parseConverter(bytes);
    expect(conv.decode('KA', 5)).toEqual(conv.decode('ka', 5));
    expect(conv.decode('', 5)).toEqual([]);
    expect(conv.decode('k9', 5)).toEqual([]);
    expect(conv.decode('kx', 5)).toEqual([]);
    expect(conv.decode('k a', 5)).toEqual([]);
    expect(conv.decode('ka', 0)).toEqual([]);
  });

  it('stops at the pop cap', () => {
    const conv = parseConverter(bytes);
    expect(conv.decode('ka', 5, 1)).toEqual([]); // only the start state was popped
    expect(conv.decode('ka', 5, 1000)).toHaveLength(4);
    const capped = parseConverter(bytes, { maxPops: 1 });
    expect(capped.decode('ka', 5)).toEqual([]);
  });

  it('gives the same results with and without skipFull', () => {
    const a = parseConverter(bytes, { skipFull: true, visitCap: 1 });
    const b = parseConverter(bytes, { skipFull: false, visitCap: 1 });
    expect(a.decode('ka', 5)).toEqual(b.decode('ka', 5));
  });

  it('memoises results without sharing mutable objects', () => {
    const conv = parseConverter(bytes, { memoSize: 2 });
    const first = conv.decode('ka', 5);
    first[0]!.text = 'changed';
    const second = conv.decode('ka', 5);
    expect(second[0]!.text).toBe(KA);
    conv.decode('r', 5);
    conv.decode('kka', 5);
    expect(conv.decode('ka', 5)).toEqual(parseConverter(bytes).decode('ka', 5));
  });

  it('fails loudly on a corrupt file', () => {
    const bad = bytes.slice();
    bad[0] = 0x58;
    expect(() => parseConverter(bad)).toThrow(/magic/);
    expect(() => parseConverter(bytes.slice(0, bytes.length - 1))).toThrow();
    const longer = new Uint8Array(bytes.length + 1);
    longer.set(bytes);
    expect(() => parseConverter(longer)).toThrow(/trailing/);
  });
});

// Smoke test on the real model when the (uncommitted) artifact is present.
const BIN = fileURLToPath(new URL('../data/converter.bin', import.meta.url));
describe.skipIf(!existsSync(BIN))('converter.bin', () => {
  it('spells odisha with a canonical nukta', () => {
    const conv = parseConverter(new Uint8Array(gunzipSync(readFileSync(BIN))));
    const texts = conv.decode('odisha', 5).map((c) => c.text);
    expect(texts).toContain('\u0B13\u0B21\u0B3C\u0B3F\u0B36\u0B3E');
    for (const t of texts) expect(t).not.toMatch(/[\u0B5C\u0B5D]/);
  });
});
