/**
 * The Odia Lens engine, without any browser-extension API: loading the packed
 * dictionary, the lookup that builds a card, and the handling of words read
 * by OCR (correction, splitting). Used by the extension's background worker and
 * by the Mac lens's page (mac-lens/), each with its own file loader.
 *
 * The dictionary is split at build time (lens/build.mjs): the Praharaj keys in
 * one file, the definitions in chunks of `chunk` entries, so a worker that the
 * browser stopped after 30 s idle restarts in milliseconds, not the second it
 * takes to unpack the whole 24 MB text.
 */

import { parseGlosses, parseMeanings, parseVerbEndings } from '@odia/core';
import { canonical } from '@odia/core/normalize';

import {
  defAt,
  findEntry,
  findModern,
  foldKey,
  meaningFinder,
  modernLines,
  parsePayload,
  type Dict,
} from '../../Appv2/src/dictionary/lookup.js';
import { cleanDefinition } from '../../Appv2/src/dictionary/clean.js';
import { parseOrigin } from '../../Appv2/src/dictionary/origin.js';
import { parseLoans } from '../../Appv2/src/dictionary/loans.js';
import { inflate } from '../../Appv2/src/dictionary/pako-inflate.js';
import glossesTsv from '../../core/data/glosses.tsv';
import meaningsTsv from '../../core/data/meanings.tsv';
import verbEndingsTsv from '../../core/data/verb-endings.tsv';
import loansTsv from '../../Appv2/src/dictionary/loans.tsv';

import { parseWordList, separate, type WordList } from './correct.js';
import { chooseSplits, describeWord, partGloss, type LensCard, type LensData, type WordPart } from './describe.js';
import type { FrameLine, FrameWord, Reading } from './messages.js';
import { HAS_ODIA, cleanRead, lineText, type OcrWord } from './picture.js';

interface ChunkIndex {
  count: number;
  chunk: number;
  files: number;
}

let keys: Promise<{ keys: string[]; index: ChunkIndex }> | undefined;
let extras: Promise<LensData> | undefined;
/** Recently used definition chunks; a few are enough for one page. */
const chunks = new Map<number, Promise<string[]>>();
const CHUNKS_KEPT = 12;

/** Reads a packed file by its path inside the package (dict/..., ocr/...). Set once by the host. */
let bytes: (path: string) => Promise<Uint8Array> = () => Promise.reject(new Error('odia lens engine: no file loader set'));

export function setLoader(loader: (path: string) => Promise<Uint8Array>): void {
  bytes = loader;
}

/** The usual loader: fetch a URL made from the path. */
export const fetchLoader = (url: (path: string) => string) => async (path: string): Promise<Uint8Array> => {
  const response = await fetch(url(path));
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

const text = async (path: string): Promise<string> => new TextDecoder('utf-8').decode(inflate(await bytes(path)));

export function loadKeys(): Promise<{ keys: string[]; index: ChunkIndex }> {
  keys ??= Promise.all([text('dict/praharaj-keys.bin'), bytes('dict/index.json')]).then(([k, i]) => ({
    keys: k.split('\n'),
    index: JSON.parse(new TextDecoder('utf-8').decode(i)) as ChunkIndex,
  }));
  return keys;
}

export function loadExtras(): Promise<LensData> {
  extras ??= (async (): Promise<LensData> => {
    const { keys: k } = await loadKeys();
    let modern: Dict | null = null;
    try {
      modern = parsePayload(await bytes('dict/modern.bin'));
    } catch {
      modern = null; // optional, as in the app
    }
    let origin: string[] | null = null;
    try {
      origin = parseOrigin(await text('dict/origin.bin'), k);
    } catch {
      origin = null;
    }
    let ai: LensData['ai'] = null;
    try {
      ai = meaningFinder(parseMeanings(meaningsTsv, 'core/data/meanings.tsv'));
    } catch {
      ai = null; // a broken file must not take the lens down; the unit tests catch it
    }
    let verbs: LensData['verbs'] = null;
    try {
      verbs = parseVerbEndings(verbEndingsTsv, 'core/data/verb-endings.tsv');
    } catch {
      verbs = null;
    }
    return { modern, origin, owner: parseGlosses(glossesTsv, 'core/data/glosses.tsv'), loans: parseLoans(loansTsv), ai, verbs };
  })();
  return extras;
}

async function definition(i: number): Promise<string> {
  const { index } = await loadKeys();
  const n = Math.floor(i / index.chunk);
  let chunk = chunks.get(n);
  if (chunk === undefined) {
    chunk = text(`dict/praharaj-${String(n).padStart(3, '0')}.bin`).then((t) => JSON.parse(t) as string[]);
    chunks.set(n, chunk);
    if (chunks.size > CHUNKS_KEPT) chunks.delete(chunks.keys().next().value as number);
  }
  return cleanDefinition((await chunk)[i - n * index.chunk] ?? '');
}

export async function lookup(word: string, previous: string): Promise<LensCard | null> {
  const odia = canonical(word);
  const key = foldKey(odia);
  if (key.length === 0) return null;
  const [{ keys: k }, data] = await Promise.all([loadKeys(), loadExtras()]);
  const entry = findEntry(k, key);
  const def = entry ? await definition(entry.index) : null;
  const parts = entry === null || entry.how === 'prefix' ? wordParts(odia, key, data) : null;
  return describeWord(odia, key, entry, def, data, previous, parts);
}

/**
 * A word no dictionary has, read as two known words (jibana-shaili: jibana
 * "life" + shaili "style"), or null. Only for a word without an owner, AI or
 * modern meaning; each part needs one of those meanings, and a part that is
 * an ending (re, ru, maane) is not a word.
 */
function wordParts(odia: string, key: string, data: LensData): [WordPart, WordPart] | null {
  if (data.owner.get(odia) || data.ai?.word(odia)) return null;
  if (/[\u0b66-\u0b6f]/.test(odia)) return null;
  if (data.modern && findModern(data.modern.keys, key)) return null;
  const modernGloss = (part: string): string | null => {
    if (!data.modern) return null;
    const found = findModern(data.modern.keys, foldKey(part));
    if (!found || found.how !== 'exact') return null;
    const line = modernLines(defAt(data.modern, found.index)).find((l) => l.tag !== 'loan');
    return line ? partGloss(line.gloss) : null;
  };
  const known = (part: string): string | null => {
    const m = data.owner.get(part)?.meaning ?? data.ai?.word(part)?.meaning;
    return m ? partGloss(m) : modernGloss(part);
  };
  const meaning = (part: string): string | null => (data.ai?.ending(part) ? null : known(part));
  const best = chooseSplits(odia, (part) => meaning(part) !== null)[0];
  if (!best) return null;
  const [a, b] = best;
  return [{ word: a, gloss: meaning(a) as string }, { word: b, gloss: meaning(b) as string }];
}

/* ------------------------------------------------------------ *
 * Words read by OCR (picture mode, frame, Mac lens)
 * ------------------------------------------------------------ */

let words: Promise<WordList> | undefined;
export const loadWords = (): Promise<WordList> => (words ??= text('dict/words.bin').then(parseWordList));

/** A word read by OCR: canonical, corrected to a known word when it is not one, then the usual card. */
export async function readWord(
  raw: string,
  conf: number,
  whole?: string,
  /** The word before it on the same line (already corrected), for constructions ("-ku nei"). */
  previous = '',
): Promise<{ card: LensCard | null; reading: Reading } | null> {
  const odia = canonical(cleanRead(raw));
  if (odia.length === 0) return null;
  const [{ keys: k }, data, list] = await Promise.all([loadKeys(), loadExtras(), loadWords()]);
  // A word the list knows takes the list's spelling (OCR mixes up ya and yya);
  // a word the dictionaries know stays; any other word is corrected.
  const fromList = /[\u0b66-\u0b6f]/.test(odia) ? { word: odia, distance: 0 } : list.correct(odia);
  // A word the dictionary can already explain stays as read (barana-ru, "from
  // the ban", is right; the list's karana-ru is only more common).
  const entry = findEntry(k, foldKey(odia));
  const known =
    fromList.distance === 0 ||
    data.owner.get(odia) !== undefined ||
    data.ai?.word(odia) !== undefined ||
    entry?.how === 'exact' ||
    (entry?.how === 'stem' && conf >= 50);
  const corrected = fromList.distance === 0 ? fromList.word : known ? odia : fromList.word;
  const card = await lookup(corrected, previous);
  const partOf = whole ? canonical(cleanRead(whole)) : '';
  // Only a spelling the fold treats as the same word (ya / yya) is not a correction.
  const changed = foldKey(corrected) !== foldKey(odia);
  return { card, reading: { readAs: odia, corrected: changed ? corrected : null, conf, partOf: partOf && partOf !== odia ? partOf : null } };
}

/** Explainable as a whole word: the list, the owner, the AI layer, or Praharaj (headword or stem) knows it. */
export async function explainer(): Promise<(text: string) => boolean> {
  const [{ keys: k }, data, list] = await Promise.all([loadKeys(), loadExtras(), loadWords()]);
  return (text) => {
    const odia = canonical(cleanRead(text));
    if (odia.length === 0) return false;
    const how = findEntry(k, foldKey(odia))?.how;
    return list.has(odia) || data.owner.get(odia) !== undefined || data.ai?.word(odia) !== undefined || how === 'exact' || how === 'stem';
  };
}

/**
 * Lines read by OCR as the lens shows them (the frame, the Mac lens, the PDF
 * reader): each line as read, then its Odia words, split and corrected
 * (correct.ts), each with its card, looked up with the word before it.
 */
export async function explainLines(
  lines: readonly { words: readonly OcrWord[] }[],
  /** Typed text (a PDF's own text, V4.7): the words are exact, so no splitting and no correction. */
  { exact = false }: { exact?: boolean } = {},
): Promise<FrameLine[]> {
  const [list, explainable] = await Promise.all([loadWords(), explainer()]);
  const out: FrameLine[] = [];
  for (const line of lines) {
    if (exact) {
      const words: FrameWord[] = [];
      let previous = '';
      for (const w of line.words) {
        const word = canonical(cleanRead(w.text));
        if (!HAS_ODIA.test(word)) continue;
        const card = await lookup(word, previous);
        words.push({ text: word, conf: 100, box: w.box, card, reading: { readAs: word, corrected: null, conf: 100, partOf: null } });
        previous = word;
      }
      out.push({ read: canonical(lineText(line.words.map((w) => w.text))), words });
      continue;
    }
    const pieces = separate([...line.words], list, (t) => canonical(cleanRead(t)), explainable);
    const words: FrameWord[] = [];
    let previous = '';
    for (const w of pieces) {
      if (!HAS_ODIA.test(w.text)) continue;
      const found = await readWord(w.text, w.conf, w.whole, previous);
      if (!found) continue;
      words.push({ text: w.text, conf: w.conf, box: w.box, card: found.card, reading: found.reading });
      previous = found.reading.corrected ?? found.reading.readAs;
    }
    out.push({ read: canonical(lineText(line.words.map((w) => w.text))), words });
  }
  return out;
}
