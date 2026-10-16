/**
 * The input method's engine inside JavaScriptCore (V5, Stage C). Bundled by
 * ime-macos/build.mjs into one script that defines `globalThis.OdiaIME`; the
 * Swift side (Sources/EngineBridge.swift) reads the data files from the app
 * bundle and calls `OdiaIME.load(...)` once, then `OdiaIME.key(...)` per key.
 *
 * The engine is built like the web app's default "Everyday" mode (Appv2/src/
 * engine.ts, profile `unified`): the same rules, word lists, typed spellings,
 * spelling converter, next-word table and owner files, so a word comes first
 * here when it comes first on the website. No network, no DOM, no TextDecoder:
 * only what plain JavaScriptCore has.
 */

import {
  Engine,
  MemoryLearnStore,
  emptyLexicon,
  loadRules,
  parseBigrams,
  parseConverter,
  parseLabels,
  parseLexicon,
  parseNextWords,
  parsePreferences,
  parseUnigrams,
} from '@odia/core';
import type { LearnStore } from '@odia/core/types';

import { mergeLexicons, mergeUnigrams } from '../../Appv2/src/compose.js';
import { inflate } from '../../Appv2/src/dictionary/pako-inflate.js';
import { Composer, type Key, type Step } from './composer.js';

/** The files Swift hands over, by name (ime-macos/build.mjs copies them into Resources/data/). */
export interface Files {
  'unified.toml': string;
  'itrans.toml': string;
  'lexicon-web.tsv': string;
  'sanskrit-lexicon-web.tsv'?: string;
  'unigrams-web.tsv': string;
  'sanskrit-unigrams-web.tsv'?: string;
  'bigrams-web.tsv'?: string;
  'typed.tsv'?: string;
  'nextword.tsv'?: string;
  'preferences.tsv'?: string;
  'labels.tsv'?: string;
  /** core/data/converter.bin (gzip), as base64: JavaScriptCore takes strings, not bytes. */
  'converter.bin.b64'?: string;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 to bytes, without atob (not in a bare JavaScriptCore context). */
export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i] as string) << 18) |
      (B64.indexOf(clean[i + 1] as string) << 12) |
      ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) |
      (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/** The engine of the web app's "Everyday" mode, from file contents. */
export function buildEngine(files: Files, learnStore: LearnStore): Engine {
  const lexicon = mergeLexicons([
    { lexicon: parseLexicon(files['lexicon-web.tsv']), priority: 1 },
    // Below core, as in Appv2/src/profiles.ts: a word that is both everyday Odia
    // and Sanskrit keeps its everyday spelling first.
    { lexicon: files['sanskrit-lexicon-web.tsv'] ? parseLexicon(files['sanskrit-lexicon-web.tsv']) : emptyLexicon(), priority: 0.85 },
  ]);
  const unigrams = mergeUnigrams(
    [files['unigrams-web.tsv'], files['sanskrit-unigrams-web.tsv']].filter((t): t is string => t !== undefined).map((t) => parseUnigrams(t)),
  );
  const converterB64 = files['converter.bin.b64'];
  return new Engine({
    rules: loadRules(files['unified.toml'], files['itrans.toml']),
    lexicon,
    unigrams,
    bigrams: files['bigrams-web.tsv'] ? parseBigrams(files['bigrams-web.tsv']) : undefined,
    typed: files['typed.tsv'] ? parseLexicon(files['typed.tsv']) : undefined,
    nextWords: files['nextword.tsv'] ? parseNextWords(files['nextword.tsv']) : undefined,
    converter: converterB64 ? parseConverter(inflate(fromBase64(converterB64))) : undefined,
    preferences: parsePreferences(files['preferences.tsv'] ?? '', 'core/data/preferences.tsv'),
    labels: parseLabels(files['labels.tsv'] ?? '', 'core/data/labels.tsv'),
    learnStore,
    filter: 'family',
  });
}

/** Odia candidates for the composer: the engine's words, then whole-word completions. */
export function wordsFor(engine: Engine, roman: string, previous: string): string[] {
  const words = engine.transliterateWord(roman, 9, previous ? { prev: previous } : undefined).map((c) => c.text);
  const more = engine.complete(roman, 2, words).map((c) => c.text);
  const out: string[] = [];
  for (const w of [...words, ...more]) if (/[\u0b00-\u0b7f]/.test(w) && !out.includes(w)) out.push(w);
  return out;
}

let composer: Composer | null = null;
let store: MemoryLearnStore | null = null;

const api = {
  /** Build the engine. Returns '' when ready, else what went wrong. */
  load(files: Files, learnedJson: string): string {
    try {
      let saved: unknown;
      try {
        saved = learnedJson ? JSON.parse(learnedJson) : undefined;
      } catch {
        saved = undefined; // a broken file starts empty rather than stopping the keyboard
      }
      store = new MemoryLearnStore(saved as never);
      const engine = buildEngine(files, store);
      const s = store;
      composer = new Composer({
        candidates: (roman, previous) => wordsFor(engine, roman, previous),
        learn: (roman, word) => s.record(roman, word),
      });
      return '';
    } catch (error) {
      composer = null;
      return error instanceof Error ? error.message : String(error);
    }
  },
  /** One key: `kind` is char/space/enter/backspace/escape/up/down/tab. Returns the Step as JSON. */
  key(kind: string, char: string): string {
    if (!composer) return JSON.stringify({ handled: false, commit: '', view: { roman: '', marked: '', candidates: [], selected: 0 } } satisfies Step);
    const k: Key = kind === 'char' ? { kind: 'char', char } : ({ kind } as Key);
    return JSON.stringify(composer.key(k));
  },
  /** Commit what is being composed (focus lost, input source switched). */
  flush(): string {
    return composer?.flush() ?? '';
  },
  /** The user's choices as JSON, for Swift to save. */
  learned(): string {
    return JSON.stringify(store?.toJSON() ?? {});
  },
};

(globalThis as unknown as { OdiaIME: typeof api }).OdiaIME = api;
