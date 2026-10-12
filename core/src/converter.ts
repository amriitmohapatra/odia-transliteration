/**
 * Latin -> Odia spelling converter: an n-best decoder for a weighted finite-state
 * transducer (a joint n-gram model of letter groups and Odia pieces), loaded from the
 * compact binary that tools/build-data/build_converter.py writes (core/data/converter.bin).
 * The format is documented in that script; keep the two in step.
 *
 * Pure, synchronous, no I/O: the caller supplies the bytes. Runs under node, in browsers
 * and inside JavaScriptCore -- no Buffer, no TextDecoder (output strings are stored as
 * UTF-16 code units).
 *
 * Search (matches the reference decoder used to measure the model):
 *   - best-first over (cost, position in the roman string, FST state, output so far),
 *     ties broken in that order, the output compared as a string;
 *   - a hypothesis (position, state, output) is expanded once; a (position, state) pair
 *     is expanded at most `visitCap` times (default 6);
 *   - epsilon arcs consume nothing; other arcs consume their 1- or 2-letter token;
 *   - a hypothesis at the end of the input in a final state yields its output, which goes
 *     through canonical() and is deduplicated on that canonical form;
 *   - the search stops after n distinct outputs or `maxPops` heap pops.
 * Results come out in the order they are found, i.e. by path cost before the final-state
 * cost. The reported cost includes the final cost, so it is not always ascending.
 *
 * Implementation notes: costs are integers (the binary stores quantised weights), so sums
 * are exact and ties are deterministic. Each decode builds a trie of the output strings it
 * produces; a trie node id is both the identity of an output string (for the
 * "expanded once" rule) and a back-pointer chain from which the string is rebuilt, so no
 * strings are concatenated per pop. A hypothesis on the heap holds its parent's trie node
 * plus the arc's output label, and is extended into the trie only when popped.
 */

import { canonical } from './normalize.js';

export interface ConverterCandidate {
  /** Odia spelling, in canonical form. */
  text: string;
  /** Total path cost (tropical: lower is better), final-state cost included. */
  cost: number;
}

export interface Converter {
  /**
   * Up to `n` distinct Odia spellings for `roman`, best first. The input is lower-cased;
   * input with a character outside the converter's alphabet (or empty) gives [].
   * `maxPops` overrides the instance's pop cap for this call.
   */
  decode(roman: string, n: number, maxPops?: number): ConverterCandidate[];
}

export interface ConverterOptions {
  /** Heap pops allowed per decode. Default 20000. */
  maxPops?: number;
  /** Expansions allowed per (position, state). Default 6. */
  visitCap?: number;
  /** Entries in the per-instance result memo (LRU). Default 256; 0 disables it. */
  memoSize?: number;
  /** Longer input gives []. Default 64. */
  maxInputLength?: number;
  /**
   * Do not push a hypothesis onto a (position, state) that has already been expanded
   * `visitCap` times: it would be popped and discarded. Same results, fewer pops, so a pop
   * cap goes further. Default true; false counts pops exactly like the reference decoder.
   */
  skipFull?: boolean;
}

export const CONVERTER_MAGIC = 'OCNV';
export const CONVERTER_VERSION = 1;

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

class ByteReader {
  pos = 0;
  constructor(private readonly b: Uint8Array) {}

  need(n: number): void {
    if (this.pos + n > this.b.length) {
      throw new Error(`converter.bin truncated at byte ${this.pos} (need ${n} more)`);
    }
  }
  u8(): number {
    this.need(1);
    return this.b[this.pos++] as number;
  }
  u16(): number {
    this.need(2);
    const b = this.b;
    const v = (b[this.pos] as number) | ((b[this.pos + 1] as number) << 8);
    this.pos += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const b = this.b;
    const p = this.pos;
    const v =
      ((b[p] as number) |
        ((b[p + 1] as number) << 8) |
        ((b[p + 2] as number) << 16) |
        ((b[p + 3] as number) << 24)) >>>
      0;
    this.pos += 4;
    return v;
  }
  varint(): number {
    let v = 0;
    let mul = 1;
    for (;;) {
      const byte = this.u8();
      v += (byte & 0x7f) * mul;
      if (byte < 0x80) return v;
      mul *= 128;
      if (mul > 2 ** 35) throw new Error(`converter.bin: varint too long at byte ${this.pos}`);
    }
  }
  /** `count` unsigned integers of `width` bytes stored as byte planes. */
  planes(count: number, width: number, out: Uint8Array | Uint16Array | Int32Array): void {
    this.need(count * width);
    const b = this.b;
    for (let k = 0; k < width; k++) {
      const base = this.pos + k * count;
      const shift = 8 * k;
      if (k === 0) for (let i = 0; i < count; i++) out[i] = b[base + i] as number;
      else for (let i = 0; i < count; i++) out[i] = (out[i] as number) | ((b[base + i] as number) << shift);
    }
    this.pos += count * width;
  }
}

/** Parse converter.bin. Throws on a bad magic, version, or a truncated or oversized file. */
export function parseConverter(bytes: Uint8Array, options: ConverterOptions = {}): Converter {
  const r = new ByteReader(bytes);
  let magic = '';
  for (let i = 0; i < 4; i++) magic += String.fromCharCode(r.u8());
  if (magic !== CONVERTER_MAGIC) throw new Error(`converter.bin: bad magic "${magic}"`);
  const version = r.u16();
  if (version !== CONVERTER_VERSION) throw new Error(`converter.bin: unsupported version ${version}`);
  const flags = r.u16();
  const nStates = r.u32();
  const nArcs = r.u32();
  const start = r.u32();
  const scale = r.u32();
  const nIn = r.u16();
  const nOut = r.u16();
  const nPairs = r.u16();
  const nFinals = r.u32();
  if (flags !== 0 || start >= nStates || scale === 0 || nIn === 0 || nOut === 0 || nPairs === 0) {
    throw new Error('converter.bin: inconsistent header');
  }

  const inTokens: string[] = [''];
  for (let i = 1; i < nIn; i++) {
    const len = r.u8();
    let t = '';
    for (let k = 0; k < len; k++) t += String.fromCharCode(r.u8());
    inTokens.push(t);
  }

  const outStrings: string[] = [];
  const outStart = new Int32Array(nOut + 1);
  const units: number[] = [];
  for (let i = 0; i < nOut; i++) {
    const len = r.u8();
    outStart[i] = units.length;
    let s = '';
    for (let k = 0; k < len; k++) {
      const u = r.u16();
      units.push(u);
      s += String.fromCharCode(u);
    }
    outStrings.push(s);
  }
  outStart[nOut] = units.length;
  if (outStrings[0] !== '') throw new Error('converter.bin: output id 0 must be empty');

  const offsets = new Int32Array(nStates + 1);
  for (let s = 0; s < nStates; s++) offsets[s + 1] = (offsets[s] as number) + r.varint();
  if (offsets[nStates] !== nArcs) throw new Error('converter.bin: arc counts do not add up');
  const isEps = new Uint8Array(nArcs);
  let nEps = 0;
  for (let s = 0; s < nStates; s++) {
    const k = r.varint();
    const a0 = offsets[s] as number;
    if (k > (offsets[s + 1] as number) - a0) throw new Error('converter.bin: bad epsilon count');
    isEps.fill(1, a0, a0 + k);
    nEps += k;
  }

  const pairIn = new Int32Array(nPairs);
  const pairOut = new Int32Array(nPairs);
  for (let i = 1; i < nPairs; i++) {
    pairIn[i] = r.varint();
    pairOut[i] = r.varint();
    if (pairIn[i] === 0 || (pairIn[i] as number) >= nIn || (pairOut[i] as number) >= nOut) {
      throw new Error('converter.bin: label pair out of range');
    }
  }
  const stateLabel = new Uint16Array(nStates);
  r.planes(nStates, 2, stateLabel);

  const epsOut = new Uint16Array(nEps);
  {
    const count = r.varint();
    let k = 0;
    for (let i = 0; i < count; i++) {
      k += r.varint();
      const ol = r.varint();
      if (k >= nEps || ol >= nOut) throw new Error('converter.bin: epsilon output out of range');
      epsOut[k] = ol;
    }
  }
  const wEps = new Uint16Array(nEps);
  r.planes(nEps, 2, wEps);
  const wOther = new Uint16Array(nArcs - nEps);
  r.planes(nArcs - nEps, 2, wOther);

  const weight = new Int32Array(nArcs);
  const dst = new Int32Array(nArcs);
  for (const eps of [1, 0]) {
    let prev = 0;
    for (let a = 0; a < nArcs; a++) {
      if (isEps[a] !== eps) continue;
      const z = r.varint();
      prev += z % 2 === 0 ? z / 2 : -(z + 1) / 2;
      if (prev < 0 || prev >= nStates) throw new Error('converter.bin: arc destination out of range');
      dst[a] = prev;
    }
  }

  const ilabel = nIn > 256 ? new Uint16Array(nArcs) : new Uint8Array(nArcs);
  const olabel = new Uint16Array(nArcs);
  {
    let ie = 0;
    let io = 0;
    for (let a = 0; a < nArcs; a++) {
      if (isEps[a] === 1) {
        weight[a] = wEps[ie] as number;
        olabel[a] = epsOut[ie] as number;
        ie++;
      } else {
        weight[a] = wOther[io++] as number;
        const pr = stateLabel[dst[a] as number] as number;
        if (pr === 0 || pr >= nPairs) throw new Error('converter.bin: arc into an unlabelled state');
        ilabel[a] = pairIn[pr] as number;
        olabel[a] = pairOut[pr] as number;
      }
    }
  }
  // Inside a state, input labels must be non-decreasing (binary search relies on it).
  for (let s = 0; s < nStates; s++) {
    for (let a = (offsets[s] as number) + 1; a < (offsets[s + 1] as number); a++) {
      if ((ilabel[a] as number) < (ilabel[a - 1] as number)) {
        throw new Error(`converter.bin: arcs of state ${s} not sorted by input label`);
      }
    }
  }

  const finalCost = new Int32Array(nStates).fill(-1);
  const finalStates = new Int32Array(nFinals);
  {
    let prev = 0;
    for (let i = 0; i < nFinals; i++) {
      prev += r.varint();
      if (prev >= nStates) throw new Error('converter.bin: final state out of range');
      finalStates[i] = prev;
    }
    const costs = new Uint16Array(nFinals);
    r.planes(nFinals, 2, costs);
    for (let i = 0; i < nFinals; i++) finalCost[finalStates[i] as number] = costs[i] as number;
  }
  if (r.pos !== bytes.length) {
    throw new Error(`converter.bin: ${bytes.length - r.pos} unexpected trailing bytes`);
  }

  return new FstConverter(
    {
      nStates,
      start,
      scale,
      inTokens,
      outStrings,
      outUnits: Uint16Array.from(units),
      outStart,
      offsets,
      ilabel,
      olabel,
      weight,
      dst,
      finalCost,
    },
    options,
  );
}

/* ------------------------------------------------------------------ *
 * Decoding
 * ------------------------------------------------------------------ */

interface Model {
  nStates: number;
  start: number;
  scale: number;
  inTokens: string[];
  outStrings: string[];
  outUnits: Uint16Array;
  outStart: Int32Array;
  offsets: Int32Array;
  ilabel: Uint8Array | Uint16Array;
  olabel: Uint16Array;
  weight: Int32Array;
  dst: Int32Array;
  finalCost: Int32Array;
}

function grow<T extends Int32Array | Uint16Array>(a: T, need: number): T {
  if (need <= a.length) return a;
  let len = a.length * 2;
  while (len < need) len *= 2;
  const b = new (a.constructor as new (n: number) => T)(len);
  b.set(a);
  return b;
}

class FstConverter implements Converter {
  private readonly m: Model;
  private readonly defaultMaxPops: number;
  private readonly visitCap: number;
  private readonly memoSize: number;
  private readonly maxInputLength: number;
  private readonly memo = new Map<string, ConverterCandidate[]>();

  /** Token text -> input id, and the longest token length. */
  private readonly tokenId = new Map<string, number>();
  private readonly maxTok: number;
  /** Character codes (< 128) that occur in some input token. */
  private readonly alphabet = new Uint8Array(128);

  // Hypothesis pool (index = hypothesis id), reused across decodes.
  private hCost = new Int32Array(1024);
  private hPos = new Int32Array(1024);
  private hState = new Int32Array(1024);
  private hNode = new Int32Array(1024); // parent trie node
  private hOut = new Int32Array(1024); // output label still to append
  private free = new Int32Array(1024);
  private nFree = 0;
  private nHyp = 0;
  private heap = new Int32Array(1024);
  private heapSize = 0;

  // Output trie, rebuilt per decode. Node 0 is the empty string.
  private tParent = new Int32Array(4096);
  private tUnit = new Uint16Array(4096);
  private nNodes = 1;
  /** (parent node * nUnits + unit id) -> child node. Small keys stay small integers. */
  private tChild = new Map<number, number>();
  private readonly unitIdOf: Uint16Array; // per entry of model.outUnits
  private readonly nUnits: number;

  // Expansions per (position, state): visit key -> slot; a slot lists the trie nodes
  // (outputs) already expanded there, at most visitCap of them.
  private visits = new Map<number, number>();
  private slotCount = new Int32Array(1024);
  private slotNodes = new Int32Array(1024 * 6);
  private readonly skipFull: boolean;

  constructor(model: Model, options: ConverterOptions) {
    this.m = model;
    this.defaultMaxPops = options.maxPops ?? 20000;
    this.visitCap = options.visitCap ?? 6;
    this.memoSize = options.memoSize ?? 256;
    this.maxInputLength = options.maxInputLength ?? 64;
    this.skipFull = options.skipFull ?? true;
    if (!(this.visitCap >= 1)) throw new Error('visitCap must be at least 1');
    const unitIds = new Map<number, number>();
    this.unitIdOf = new Uint16Array(model.outUnits.length);
    for (let i = 0; i < model.outUnits.length; i++) {
      const u = model.outUnits[i] as number;
      let id = unitIds.get(u);
      if (id === undefined) unitIds.set(u, (id = unitIds.size));
      this.unitIdOf[i] = id;
    }
    this.nUnits = Math.max(1, unitIds.size);
    let maxTok = 1;
    for (let i = 1; i < model.inTokens.length; i++) {
      const t = model.inTokens[i] as string;
      this.tokenId.set(t, i);
      if (t.length > maxTok) maxTok = t.length;
      for (let k = 0; k < t.length; k++) {
        const c = t.charCodeAt(k);
        if (c < 128) this.alphabet[c] = 1;
      }
    }
    this.maxTok = maxTok;
  }

  decode(roman: string, n: number, maxPops: number = this.defaultMaxPops): ConverterCandidate[] {
    if (!(n >= 1)) return [];
    const word = roman.toLowerCase();
    const L = word.length;
    if (L === 0 || L > this.maxInputLength) return [];
    for (let i = 0; i < L; i++) {
      const c = word.charCodeAt(i);
      if (c >= 128 || this.alphabet[c] === 0) return [];
    }

    const memoKey = `${n}:${maxPops}:${word}`;
    if (this.memoSize > 0) {
      const hit = this.memo.get(memoKey);
      if (hit !== undefined) {
        this.memo.delete(memoKey);
        this.memo.set(memoKey, hit);
        return hit.map((c) => ({ text: c.text, cost: c.cost }));
      }
    }

    const result = this.search(word, n, maxPops);

    if (this.memoSize > 0) {
      this.memo.set(memoKey, result);
      if (this.memo.size > this.memoSize) {
        const oldest = this.memo.keys().next().value as string;
        this.memo.delete(oldest);
      }
    }
    return result.map((c) => ({ text: c.text, cost: c.cost }));
  }

  private search(word: string, n: number, maxPops: number): ConverterCandidate[] {
    const m = this.m;
    const L = word.length;
    const nStates = m.nStates;
    const maxTok = this.maxTok;

    // tokAt[p * maxTok + (len - 1)] = id of the token word[p, p+len), or -1.
    const tokAt = new Int32Array((L + 1) * maxTok).fill(-1);
    for (let p = 0; p < L; p++) {
      for (let len = 1; len <= maxTok && p + len <= L; len++) {
        const id = this.tokenId.get(word.slice(p, p + len));
        if (id !== undefined) tokAt[p * maxTok + len - 1] = id;
      }
    }

    this.heapSize = 0;
    this.nHyp = 0;
    this.nFree = 0;
    this.nNodes = 1;
    this.tChild.clear();

    const visits = this.visits;
    visits.clear();
    let nSlots = 0;
    const got = new Set<string>();
    const out: ConverterCandidate[] = [];
    const { offsets, ilabel, olabel, weight, dst, finalCost } = m;
    const visitCap = this.visitCap;
    const skipFull = this.skipFull;

    this.push(0, 0, m.start, 0, 0);
    let pops = 0;
    while (this.heapSize > 0 && out.length < n && pops < maxPops) {
      const h = this.popMin();
      pops++;
      const c = this.hCost[h] as number;
      const p = this.hPos[h] as number;
      const st = this.hState[h] as number;
      const node = this.extend(this.hNode[h] as number, this.hOut[h] as number);
      this.free[this.nFree++] = h;

      // The reference keeps a set of expanded (position, state, output) and a count per
      // (position, state), skipping a pop that is in the set or over the cap. Once the
      // count reaches the cap every later pop there is skipped either way, so the set only
      // ever needs the <= visitCap outputs listed in the slot.
      const vk = p * nStates + st;
      let slot = visits.get(vk);
      if (slot === undefined) {
        slot = nSlots++;
        if (slot >= this.slotCount.length) {
          this.slotCount = grow(this.slotCount, slot + 1);
          this.slotNodes = grow(this.slotNodes, (slot + 1) * visitCap);
        }
        this.slotCount[slot] = 0;
        visits.set(vk, slot);
      }
      const count = this.slotCount[slot] as number;
      if (count >= visitCap) continue;
      const base = slot * visitCap;
      let dup = false;
      for (let i = 0; i < count; i++) {
        if (this.slotNodes[base + i] === node) {
          dup = true;
          break;
        }
      }
      if (dup) continue;
      this.slotNodes[base + count] = node;
      this.slotCount[slot] = count + 1;

      if (p === L) {
        const fc = finalCost[st] as number;
        if (fc >= 0) {
          const text = canonical(this.nodeString(node));
          if (!got.has(text)) {
            got.add(text);
            out.push({ text, cost: (c + fc) / m.scale });
          }
        }
      }

      const a0 = offsets[st] as number;
      const a1 = offsets[st + 1] as number;
      let a = a0;
      for (; a < a1 && ilabel[a] === 0; a++) {
        const d = dst[a] as number;
        if (skipFull && this.isFull(p * nStates + d)) continue;
        this.push(c + (weight[a] as number), p, d, node, olabel[a] as number);
      }
      if (p === L) continue;
      for (let len = 1; len <= maxTok; len++) {
        const id = tokAt[p * maxTok + len - 1] as number;
        if (id < 0) continue;
        // lower bound of id in ilabel[a, a1)
        let lo = a;
        let hi = a1;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if ((ilabel[mid] as number) < id) lo = mid + 1;
          else hi = mid;
        }
        const p2 = p + len;
        for (let k = lo; k < a1 && ilabel[k] === id; k++) {
          const d = dst[k] as number;
          if (skipFull && this.isFull(p2 * nStates + d)) continue;
          this.push(c + (weight[k] as number), p2, d, node, olabel[k] as number);
        }
      }
    }
    return out;
  }

  private isFull(vk: number): boolean {
    const slot = this.visits.get(vk);
    return slot !== undefined && (this.slotCount[slot] as number) >= this.visitCap;
  }

  /* -------------------------- output trie -------------------------- */

  /** Trie node for (string of `node`) + outStrings[label]. */
  private extend(node: number, label: number): number {
    const m = this.m;
    const end = m.outStart[label + 1] as number;
    for (let i = m.outStart[label] as number; i < end; i++) {
      const u = m.outUnits[i] as number;
      const key = node * this.nUnits + (this.unitIdOf[i] as number);
      let child = this.tChild.get(key);
      if (child === undefined) {
        child = this.nNodes++;
        if (child >= this.tParent.length) {
          this.tParent = grow(this.tParent, child + 1);
          this.tUnit = grow(this.tUnit, child + 1);
        }
        this.tParent[child] = node;
        this.tUnit[child] = u;
        this.tChild.set(key, child);
      }
      node = child;
    }
    return node;
  }

  private nodeString(node: number): string {
    const units: number[] = [];
    while (node !== 0) {
      units.push(this.tUnit[node] as number);
      node = this.tParent[node] as number;
    }
    units.reverse();
    return String.fromCharCode(...units);
  }

  /* -------------------------- binary heap -------------------------- */

  private push(cost: number, pos: number, state: number, node: number, label: number): void {
    let h: number;
    if (this.nFree > 0) h = this.free[--this.nFree] as number;
    else {
      h = this.nHyp++;
      if (h >= this.hCost.length) {
        const need = h + 1;
        this.hCost = grow(this.hCost, need);
        this.hPos = grow(this.hPos, need);
        this.hState = grow(this.hState, need);
        this.hNode = grow(this.hNode, need);
        this.hOut = grow(this.hOut, need);
        this.free = grow(this.free, need);
      }
    }
    this.hCost[h] = cost;
    this.hPos[h] = pos;
    this.hState[h] = state;
    this.hNode[h] = node;
    this.hOut[h] = label;

    if (this.heapSize >= this.heap.length) this.heap = grow(this.heap, this.heapSize + 1);
    const heap = this.heap;
    let i = this.heapSize++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const ph = heap[parent] as number;
      if (!this.less(h, ph)) break;
      heap[i] = ph;
      i = parent;
    }
    heap[i] = h;
  }

  private popMin(): number {
    const heap = this.heap;
    const top = heap[0] as number;
    const last = heap[--this.heapSize] as number;
    const size = this.heapSize;
    if (size > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= size) break;
        const r = l + 1;
        let child = l;
        if (r < size && this.less(heap[r] as number, heap[l] as number)) child = r;
        const ch = heap[child] as number;
        if (!this.less(ch, last)) break;
        heap[i] = ch;
        i = child;
      }
      heap[i] = last;
    }
    return top;
  }

  /** Order on (cost, pos, state, output string), as in the reference decoder. */
  private less(a: number, b: number): boolean {
    const ca = this.hCost[a] as number;
    const cb = this.hCost[b] as number;
    if (ca !== cb) return ca < cb;
    const pa = this.hPos[a] as number;
    const pb = this.hPos[b] as number;
    if (pa !== pb) return pa < pb;
    const sa = this.hState[a] as number;
    const sb = this.hState[b] as number;
    if (sa !== sb) return sa < sb;
    const na = this.hNode[a] as number;
    const nb = this.hNode[b] as number;
    const oa = this.hOut[a] as number;
    const ob = this.hOut[b] as number;
    if (na === nb && oa === ob) return false;
    // Rare: a full tie up to the output. Compare the strings (UTF-16 order = code point
    // order inside the BMP).
    const strA = this.nodeString(na) + (this.m.outStrings[oa] as string);
    const strB = this.nodeString(nb) + (this.m.outStrings[ob] as string);
    return strA < strB;
  }
}
