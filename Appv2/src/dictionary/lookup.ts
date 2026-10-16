/**
 * Dictionary lookup, without any page: the payload format, the 1930s-spelling
 * fold, exact / stem / prefix lookup, the modern layer and the short English
 * gloss. Shared by the app's Meanings panel (overlay.ts) and the Odia Lens
 * browser extension (lens/), so both find the same entry and show the same
 * meaning for a word.
 *
 * Everything here is pure: entry finding works on a sorted key list, glosses
 * on a definition string. Where the definitions come from (one inflated
 * payload in the app, a fetched chunk in the extension) is the caller's
 * business. Every word goes through foldKey() = fold(canonical(word)) first:
 * page text can hold precomposed nukta letters and the dictionary keys do not.
 *
 * Odia characters appear ONLY as \u escapes (repo convention).
 */

import { canonical } from '@odia/core/normalize';
import type { Meaning, Meanings, VerbEndings } from '@odia/core';

import { inflate } from './pako-inflate.js';
import { cleanDefinition } from './clean.js';

/** Field separator inside an inflated payload (U+0002). */
export const SEP = '\u0002';

/* U+0B5F -> U+0B2F, U+0B71 -> U+0B2C, U+0B35 -> U+0B2C : Praharaj-era spellings. */
export function fold(w: string): string {
  return w
    .split('\u0b5f').join('\u0b2f')
    .split('\u0b71').join('\u0b2c')
    .split('\u0b35').join('\u0b2c');
}

/* Inflectional suffixes tried (longest first) when the exact form is not a
 * headword. Kept in sync with the payload builder; folded forms. */
export const SUFFIXES: readonly string[] = [
  '\u0b2e\u0b3e\u0b28\u0b19\u0b4d\u0b15\u0b30', /* -maananjkara */
  '\u0b2e\u0b3e\u0b28\u0b19\u0b4d\u0b15\u0b41', /* -maananjku */
  '\u0b17\u0b41\u0b21\u0b3c\u0b3f\u0b15\u0b41', /* -gudiku */
  '\u0b17\u0b41\u0b21\u0b3c\u0b3f\u0b15\u0b30', /* -gudikara */
  '\u0b2e\u0b3e\u0b28\u0b19\u0b4d\u0b15', /* -maananjka */
  '\u0b17\u0b41\u0b21\u0b3c\u0b3f\u0b15', /* -gudika */
  '\u0b17\u0b41\u0b21\u0b3c\u0b3e\u0b0f', /* -gudaae */
  '\u0b2e\u0b3e\u0b28\u0b47', /* -maane */
  '\u0b19\u0b4d\u0b15\u0b30', /* -njkara */
  '\u0b19\u0b4d\u0b15\u0b41', /* -njku */
  '\u0b1f\u0b3f\u0b15\u0b41', /* -tiku */
  '\u0b1f\u0b3f\u0b30\u0b47', /* -tire */
  '\u0b19\u0b4d\u0b15', /* -njka */
  '\u0b1f\u0b3f\u0b30', /* -tira */
  '\u0b30\u0b47', /* -re */
  '\u0b30\u0b41', /* -ru */
  '\u0b15\u0b41', /* -ku */
  '\u0b1f\u0b3f', /* -ti */
  '\u0b1f\u0b3e', /* -taa */
  '\u0b30', /* -ra */
  '\u0b01', /* candrabindu */
  '\u0b02', /* anusvara */
  '\u0b03', /* visarga */
];

/* ------------------------------------------------------------ *
 * Data: gzip(payload), inflated lazily.
 * payload = N SEP keys(\n-joined, sorted) SEP lens(,-joined) SEP defs(concat)
 * ------------------------------------------------------------ */

export interface Dict {
  keys: string[];
  offsets: Float64Array;
  lens: Uint32Array;
  defs: string;
}

export type How = 'exact' | 'stem' | 'prefix';

export interface Entry {
  how: How;
  head: string;
  index: number;
}

export interface ModernLine {
  tag: string;
  gloss: string;
}

export interface ModernEntry {
  how: 'exact' | 'stem';
  lines: ModernLine[];
}

export function parsePayload(gz: Uint8Array): Dict {
  const inflated = inflate(gz);
  const text = new TextDecoder('utf-8').decode(inflated);
  const a = text.indexOf(SEP);
  const b = text.indexOf(SEP, a + 1);
  const c = text.indexOf(SEP, b + 1);
  const count = parseInt(text.slice(0, a), 10);
  const keys = text.slice(a + 1, b).split('\n');
  const lenParts = text.slice(b + 1, c).split(',');
  const lens = new Uint32Array(count);
  const offsets = new Float64Array(count);
  let off = 0;
  for (let i = 0; i < count; i++) {
    lens[i] = +(lenParts[i] as string);
    offsets[i] = off;
    off += lens[i] as number;
  }
  if (keys.length !== count) throw new Error('key count mismatch');
  return { keys, offsets, lens, defs: text.slice(c + 1) };
}


/** The dictionary key for a word: canonical form, then the 1930s-spelling fold. */
export function foldKey(word: string): string {
  return fold(canonical(word));
}

/** Index of `key` in a sorted key list, or -1. */
export function bsearch(keys: readonly string[], key: string): number {
  let lo = 0;
  let hi = keys.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const k = keys[mid] as string;
    if (k === key) return mid;
    if (k < key) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** The cleaned definition text of entry `i`. */
export function defAt(dict: Dict, i: number): string {
  const start = dict.offsets[i] as number;
  return cleanDefinition(dict.defs.slice(start, start + (dict.lens[i] as number)));
}

/*
 * Praharaj lookup with fallbacks, on a folded key (foldKey):
 *   exact / stem (one suffix removed) / prefix (longest headword the word
 *   begins with, for sandhi compounds) — each marked in the UI.
 */
export function findEntry(keys: readonly string[], q: string): Entry | null {
  if (q.length === 0) return null;
  const i = bsearch(keys, q);
  if (i >= 0) return { how: 'exact', head: keys[i] as string, index: i };
  for (let s = 0; s < SUFFIXES.length; s++) {
    const suf = SUFFIXES[s] as string;
    if (q.length - suf.length >= 2 && q.slice(-suf.length) === suf) {
      const j = bsearch(keys, q.slice(0, q.length - suf.length));
      if (j >= 0) return { how: 'stem', head: keys[j] as string, index: j };
    }
  }
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((keys[mid] as string) < q) lo = mid + 1;
    else hi = mid;
  }
  let best = -1;
  let bestLen = 2;
  for (let back = lo - 1; back >= 0 && back > lo - 400; back--) {
    const k = keys[back] as string;
    if (k.length > bestLen && q.length > k.length && q.lastIndexOf(k, 0) === 0) {
      best = back;
      bestLen = k.length;
    }
    if (k.charAt(0) !== q.charAt(0)) break;
  }
  return best >= 0 ? { how: 'prefix', head: keys[best] as string, index: best } : null;
}

/*
 * Modern-layer lookup (loanwords, community MT glosses, CLDR names), on a
 * folded key. Exact and stem only — a prefix fallback on this data would
 * invent loans.
 */
export function findModern(keys: readonly string[], q: string): { index: number; how: 'exact' | 'stem' } | null {
  if (q.length === 0) return null;
  let i = bsearch(keys, q);
  if (i >= 0) return { index: i, how: 'exact' };
  for (let s = 0; s < SUFFIXES.length && i < 0; s++) {
    const suf = SUFFIXES[s] as string;
    if (q.length - suf.length >= 2 && q.slice(-suf.length) === suf) {
      i = bsearch(keys, q.slice(0, q.length - suf.length));
    }
  }
  return i >= 0 ? { index: i, how: 'stem' } : null;
}

/** The lines of a modern-layer definition: "tag \t gloss" each. */
export function modernLines(definition: string): ModernLine[] {
  return definition.split('\n').map((line) => {
    const t = line.indexOf('\t');
    return { tag: line.slice(0, t), gloss: line.slice(t + 1) };
  });
}

export const MODERN_LABEL: Record<string, string> = {
  loan: 'English loan (auto-detected)',
  mt: 'modern usage — community translation data, approximate',
  cldr: 'standard modern name (CLDR)',
  wd: 'name of a place, organisation or festival (Wikidata)',
};


export function modernChip(mo: ModernEntry | null): string | null {
  if (!mo) return null;
  const line = mo.lines.find((l) => l.tag !== 'loan');
  return line ? tidyGloss(line.gloss, mo.how !== 'exact') : null;
}

export function tidyGloss(gloss: string, approximate: boolean): string | null {
  let g = (gloss.split(';')[0] as string).replace(/\s+/g, ' ').trim().replace(/[\s.,:]+$/, '');
  if (g.length < 2) return null;
  if (g.length > 56) g = g.slice(0, 56).replace(/\s+\S*$/, '') + '\u2026';
  return (approximate ? 'maybe: ' : '') + g;
}

/* Short English gloss for the inline chip, from a Praharaj definition.
 *
 * Entries open "<headword> \u2014 Translit \u2026", so the FIRST Latin run is the
 * romanisation, not the meaning. Skip that, then prefer the English text of
 * sense 1 ("1. Trouble; distress"), then any Latin run after a dash. */
export function shortGlossOf(definition: string): string | null {
  const def = definition.slice(0, 4000);
  /* drop "head — Translit" prefix (translit = Latin with diacritics) */
  const body = def.replace(/^[^\u2014\u2013\n]{0,50}[\u2014\u2013]\s*[A-Za-z\u0100-\u02af\u1e00-\u1eff']+[.,]?\s*/, '');
  let g: string | null = null;
  let m = body.match(/\b\d\.\s*([A-Za-z][^\u0964\u0965\n]{2,90})/);
  if (!m) m = body.match(/[\u2014\u2013]\s*(?:\d+\s*)?([A-Z][a-z][^\u0964\u0965\n]{2,90})/);
  if (!m) m = body.match(/\b([A-Z][a-z][^\u0964\u0965\n]{2,90})/);
  if (m) {
    g = m[1] as string;
    /* chip is English-only: stop at the first Odia character, the next
     * numbered sense, or an opening bracket of a commentary note */
    g = g.split(/[\u0b00-\u0b7f]/)[0] as string;
    g = g.split(/\s\d\.?\s|\s*[\u2014\u2013]\s*\d|\s*\[/)[0] as string;
    g = g.replace(/\s+/g, ' ').replace(/[\s;,([\u2014\u2013-]+$/, '').trim();
    if (g.length > 56) g = g.slice(0, 56).replace(/\s+\S*$/, '') + '\u2026';
    if (g.length < 2) g = null;
  }
  return g;
}

/* ------------------------------------------------------------ *
 * AI-written meanings (core/data/meanings.tsv, decision D-13)
 * ------------------------------------------------------------ */

export interface MeaningFinder {
  /** The entry for a word: its canonical form, else its folded spelling. */
  word(word: string): Meaning | undefined;
  /** A two-word or "-suffix word" construction for `word` after `previous`. */
  after(previous: string, word: string): Meaning | undefined;
  /** The meaning of an ending ("re": in, at), or undefined. */
  ending(suffix: string): Meaning | undefined;
}

/** A meaning key that also ignores the joiners U+200C/U+200D: news sites print police
 * both with and without a joiner after the final virama (pulis + ZWNJ). It also reads a
 * consonant doubled after reph as single: newspapers print kharca and paribartana where
 * the dictionary spelling is kharcca and paribarttana (both spellings are in use). */
function looseKey(word: string): string {
  return foldKey(word)
    .replace(/[\u200c\u200d]/g, '')
    .replace(/\u0b30\u0b4d([\u0b15-\u0b39])\u0b4d\1/g, '\u0b30\u0b4d$1');
}

/**
 * Lookup over the AI layer. Exact keys first; then the same 1930s-spelling fold
 * the Praharaj keys use, so a page that writes the va letter or ya differently
 * still finds the entry.
 */
export function meaningFinder(meanings: Meanings): MeaningFinder {
  const folded = new Map<string, Meaning>();
  for (const m of meanings.all()) {
    if (m.odia.startsWith('-') || m.odia.includes(' ')) continue;
    const key = looseKey(m.odia);
    if (!folded.has(key)) folded.set(key, m);
  }
  return {
    word(word) {
      const odia = canonical(word);
      return meanings.get(odia) ?? folded.get(looseKey(odia));
    },
    after(previous, word) {
      return previous.length === 0 ? undefined : meanings.construction(canonical(previous), canonical(word));
    },
    ending: (suffix) => meanings.ending(suffix),
  };
}

/**
 * A stem match explained by its ending: rajyare = "state + in, at, on", made of
 * rajya + re. `stemMeaning` gives the headword's own short meaning: the owner's
 * or the AI layer's only. Praharaj's first sense of a stem is too often not
 * today's (tanka came out as "thigh + in", sarakaara as "lord + to"), so a
 * stem without a modern meaning stays a plain "maybe:" stem match. Null when the match is not a stem
 * match, the ending has no entry, or the stem has no meaning.
 */
export function explainEnding(
  word: string,
  entry: Entry | null,
  ai: MeaningFinder | null,
  stemMeaning: (head: string) => string | null,
): { text: string; formation: string } | null {
  if (!entry || entry.how !== 'stem' || !ai) return null;
  const q = foldKey(word);
  if (!q.startsWith(entry.head)) return null;
  const suffix = q.slice(entry.head.length);
  const end = suffix.length > 0 ? ai.ending(suffix) : undefined;
  const stem = end ? stemMeaning(entry.head) : null;
  // A verbal noun ("to play; playing"): explainVerb reads its forms (khelibaaku = "play + to …").
  if (!end || !stem || verbOf(stem) !== null) return null;
  const head = tidyGloss(stem, false);
  const text = head ? tidyGloss(`${head.replace(/\u2026$/, '')} + ${end.meaning}`, false) : null;
  return text ? { text, formation: `${entry.head} + ${suffix} (${end.meaning})` } : null;
}

/* ------------------------------------------------------------ *
 * Numbers written in Odia digits
 * ------------------------------------------------------------ */

/* Counting words after a number: -ti and -taa (things; -taa also o'clock), -jana (persons). */
const COUNTERS: readonly (readonly [string, string])[] = [
  ['\u0b1c\u0b23', 'persons'],
  ['\u0b1f\u0b3f', 'things'],
  ['\u0b1f\u0b3e', "things; or o'clock"],
];
/* Ordinal endings: 1-ma (1st), 2-ya, 3-ya (2nd, 3rd), 4-rtha (4th), 6-shtha (6th). */
const ORDINALS: readonly string[] = ['\u0b30\u0b4d\u0b25', '\u0b37\u0b4d\u0b20', '\u0b2e', '\u0b5f', '\u0b2f'];

function ordinal(n: string): string {
  const v = Number(n);
  const teen = v % 100 >= 11 && v % 100 <= 13;
  const end = teen ? 'th' : ['th', 'st', 'nd', 'rd'][v % 10] ?? 'th';
  return `${n}${end}`;
}

/**
 * A number in Odia digits, alone or with a counting word and a case ending:
 * 24 -> "24"; 6-ti -> "6 (things)"; 2019-re -> "2019 + in, at, on"; 2-ya -> "2nd".
 * Null when the word does not start with a digit, or the rest is not known.
 * Endings come from the AI layer's ending rows (ai.ending), as for words.
 */
export function readNumber(word: string, ai: MeaningFinder | null): { text: string; formation: string } | null {
  const odia = canonical(word).replace(/[\u200c\u200d]/g, '');
  const m = /^([\u0b66-\u0b6f]+)(.*)$/.exec(odia);
  if (!m) return null;
  const digits = m[1] as string;
  let rest = m[2] as string;
  const n = [...digits].map((c) => String(c.charCodeAt(0) - 0x0b66)).join('');
  if (rest.length === 0) return { text: n, formation: '' };
  if (ORDINALS.includes(rest)) return { text: ordinal(n), formation: `${digits} (${n}) + ${rest} (ordinal)` };
  const parts = [`${digits} (${n})`];
  let text = n;
  const counter = COUNTERS.find(([c]) => rest.startsWith(c));
  if (counter) {
    text += ` (${counter[1]})`;
    parts.push(`${counter[0]} (${counter[1]})`);
    rest = rest.slice(counter[0].length);
  }
  if (rest.length > 0) {
    const end = ai?.ending(rest);
    if (!end) return null;
    text += ` + ${end.meaning}`;
    parts.push(`${rest} (${end.meaning})`);
  }
  return { text, formation: parts.join(' + ') };
}

/* ------------------------------------------------------------ *
 * Verb forms (core/data/verb-endings.tsv)
 * ------------------------------------------------------------ */

/** The verb in a verbal-noun meaning: "to throw, drop; throwing" -> "throw, drop". Null otherwise. */
export function verbOf(meaning: string): string | null {
  const m = /^to ([^;()]+)/.exec(meaning.trim());
  // "be, to become" -> "be, become"
  const verb = m ? (m[1] as string).trim().replace(/,$/, '').replace(/(,\s*)to /g, '$1') : '';
  return verb.length > 0 ? verb : null;
}

const ROOT_AFTER_CONSONANT = /[\u0b15-\u0b39\u0b5c-\u0b5f]\u0b3c?$/;
const ROOT_AFTER_VOWEL = /[\u0b3e-\u0b4c]$/;

/* Irregular roots: yaa (go) -> yibaa, ho (be) -> hebaa. Not a rule for every -aa root:
 * dekhaa (show) is not dekh (see). */
const IRREGULAR: ReadonlyMap<string, string> = new Map([
  ['\u0b2f\u0b3e', '\u0b2f\u0b3f\u0b2c\u0b3e'],
  ['\u0b39\u0b4b', '\u0b39\u0b47\u0b2c\u0b3e'],
]);

/* The verbal nouns a root can have: kar -> karibaa; paa -> paaibaa; de -> debaa. */
function verbalNouns(root: string, afterVowel: boolean): string[] {
  const baa = '\u0b2c\u0b3e';
  if (!afterVowel) return [`${root}\u0b3f${baa}`];
  const irregular = IRREGULAR.get(root);
  return irregular ? [irregular] : [`${root}\u0b07${baa}`, `${root}${baa}`];
}

/**
 * A verb form explained by its ending: paaichhanti = "get + have …-ed (they; or
 * respectful)", made of paa + ichhanti. The verb comes from `wordMeaning` of its
 * verbal noun in -baa (the owner's or the AI layer's meaning, as for explainEnding),
 * and only a meaning that starts "to …" counts, so a noun that merely ends like a
 * verb ending (gharare) is not taken for one. Longest ending first. Null when no
 * ending fits a root whose verb has a meaning, or the word is an exact headword.
 */
export function explainVerb(
  word: string,
  entry: Entry | null,
  endings: VerbEndings | null,
  wordMeaning: (word: string) => string | null,
): { text: string; formation: string } | null {
  if (!endings || entry?.how === 'exact') return null;
  const odia = canonical(word).replace(/[\u200c\u200d]/g, '');
  for (const { form, afterVowel, ending } of endings.forms()) {
    if (odia.length <= form.length || !odia.endsWith(form)) continue;
    const root = odia.slice(0, -form.length);
    if (!(afterVowel ? ROOT_AFTER_VOWEL : ROOT_AFTER_CONSONANT).test(root)) continue;
    for (const noun of verbalNouns(root, afterVowel)) {
      const verb = verbOf(wordMeaning(noun) ?? '');
      if (!verb) continue;
      const text = tidyGloss(`${verb} + ${ending.meaning}`, false);
      if (text) return { text, formation: `${root} (${verb}) + ${form} (${ending.meaning})` };
    }
  }
  return null;
}

/** The label under an AI-layer meaning, on every surface. */
export function meaningSource(m: Meaning): string {
  return m.status === 'owner' ? 'meaning checked by the app owner' : 'AI-written, not yet checked by a native speaker';
}
