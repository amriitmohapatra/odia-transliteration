/**
 * Shared plumbing for the Appv2 eval harnesses.
 *
 * Two things this file exists to avoid.
 *
 * `createEngineFromDisk()` is not usable here. It reads core/rules AND
 * core/data unconditionally, so it can only ever build the everyday engine —
 * which is exactly the arm we are measuring AGAINST. Appv2's harnesses build
 * their own engines from explicit file paths instead.
 *
 * `core/dist` is not required. Everything imports `../../core/src/*.js` by
 * relative path and runs under tsx, the pattern
 * tools/build-data/webcorpus/fix_trial.ts already proves. So a fresh clone can
 * run the evals without `npm run build -w core` first.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Engine,
  loadRules,
  emptyBigrams,
  emptyLexicon,
  emptyUnigrams,
  parseBigrams,
  parseLexicon,
  parseUnigrams,
  parseLabels,
  parsePreferences,
  parseConverter,
} from '../../core/src/index.js';
import type { Bigrams, Lexicon, SpellingConverter, Unigrams } from '../../core/src/types.js';
import { gunzipped, readCoreBytes } from '../../core/src/node.js';

import { mergeLexicons, mergeUnigrams } from '../src/compose.js';
import { PROFILES, type AssetKey, type ProfileId } from '../src/profiles.js';

export const APPV2 = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const ROOT = resolve(APPV2, '..');

/**
 * Where each named asset lives on disk.
 *
 * The FULL lexicons, not the "-web" pruned ones the browser loads. An eval is
 * measuring the engine, not the phone budget, and scoring against a pruned
 * dictionary would understate coverage for reasons that have nothing to do
 * with the rules.
 */
const PATHS: Record<AssetKey, string> = {
  coreRules: resolve(ROOT, 'core/rules/symbols.toml'),
  unifiedRules: resolve(APPV2, 'rules/unified.toml'),
  sanskritRules: resolve(APPV2, 'rules/sanskrit.toml'),
  itrans: resolve(ROOT, 'core/rules/itrans.toml'),
  coreLexicon: resolve(ROOT, 'core/data/lexicon.tsv'),
  sanskritLexicon: resolve(APPV2, 'data/sanskrit-lexicon.tsv'),
  coreUnigrams: resolve(ROOT, 'core/data/unigrams.tsv'),
  sanskritUnigrams: resolve(APPV2, 'data/sanskrit-unigrams.tsv'),
  coreBigrams: resolve(ROOT, 'core/data/bigrams.tsv'),
  typed: resolve(ROOT, 'core/data/typed.tsv'),
  nextWords: resolve(ROOT, 'core/data/nextword.tsv'),
  preferences: resolve(ROOT, 'core/data/preferences.tsv'),
  labels: resolve(ROOT, 'core/data/labels.tsv'),
};

const rawCache = new Map<AssetKey, string | undefined>();
const lexCache = new Map<AssetKey, Lexicon>();
const uniCache = new Map<AssetKey, Unigrams>();

function raw(key: AssetKey): string | undefined {
  if (!rawCache.has(key)) {
    try {
      rawCache.set(key, readFileSync(PATHS[key], 'utf8'));
    } catch {
      rawCache.set(key, undefined);
    }
  }
  return rawCache.get(key);
}

function lexicon(key: AssetKey): Lexicon {
  let parsed = lexCache.get(key);
  if (parsed === undefined) {
    const text = raw(key);
    parsed = text === undefined ? emptyLexicon() : parseLexicon(text);
    lexCache.set(key, parsed);
  }
  return parsed;
}

function unigrams(key: AssetKey): Unigrams {
  let parsed = uniCache.get(key);
  if (parsed === undefined) {
    const text = raw(key);
    parsed = text === undefined ? emptyUnigrams() : parseUnigrams(text);
    uniCache.set(key, parsed);
  }
  return parsed;
}

let converterCache: SpellingConverter | undefined;

function converter(): SpellingConverter | undefined {
  if (converterCache === undefined) {
    const bytes = gunzipped(readCoreBytes('data/converter.bin'));
    converterCache = bytes === undefined ? undefined : parseConverter(bytes);
  }
  return converterCache;
}

let bigramCache: Bigrams | undefined;

function bigrams(): Bigrams {
  if (bigramCache === undefined) {
    const text = raw('coreBigrams');
    bigramCache = text === undefined ? emptyBigrams() : parseBigrams(text, PATHS.coreBigrams);
  }
  return bigramCache;
}

export interface EvalEngineOptions {
  /** Omit the lexicons, to measure what the RULES alone can do. */
  rulesOnly?: boolean;
}

/** Build the engine a profile describes. Caches parsed tables across calls. */
export function engineFor(id: ProfileId, opts: EvalEngineOptions = {}): Engine {
  const profile = PROFILES[id];
  const rulesToml = raw(profile.rules);
  if (rulesToml === undefined) {
    throw new Error(
      `missing rule file for profile "${id}": ${PATHS[profile.rules]}\n` +
        '  run:  npx tsx Appv2/scripts/gen-rules.ts',
    );
  }

  return new Engine({
    rules: loadRules(rulesToml, raw('itrans')),
    lexicon: opts.rulesOnly
      ? emptyLexicon()
      : mergeLexicons(
          profile.lexicons.map((ref) => ({
            lexicon: lexicon(ref.asset),
            priority: ref.priority,
          })),
        ),
    unigrams: opts.rulesOnly ? emptyUnigrams() : mergeUnigrams(profile.unigrams.map(unigrams)),
    // The app loads word pairs for every profile (context in transliterate()).
    bigrams: opts.rulesOnly ? undefined : bigrams(),
    // Typed-spelling pairs, as the adult app loads them.
    typed: opts.rulesOnly ? undefined : lexicon('typed'),
    // The spelling converter, as the app attaches it once loaded.
    converter: opts.rulesOnly ? undefined : converter(),
    // Same owner data the app loads, so evals measure what users get.
    preferences: opts.rulesOnly ? undefined : parsePreferences(raw('preferences') ?? ''),
    labels: parseLabels(raw('labels') ?? ''),
  });
}

export function profileHasData(id: ProfileId): boolean {
  return PROFILES[id].lexicons.some((ref) => raw(ref.asset) !== undefined);
}

/* ------------------------------------------------------------------ *
 * The inverse romanizer
 * ------------------------------------------------------------------ */

/*
 * Forked from tools/eval/everyday.ts, extended for the Sanskrit characters.
 *
 * Deriving the roman from real Odia rather than hand-authoring it is what keeps
 * the measurement honest: nobody gets to quietly pick the romanizations the
 * engine happens to like. Duplicated rather than imported because
 * tools/eval/everyday.ts is measurement-only and must not be perturbed.
 */

const NUKTA = '଼';
const VIRAMA = '୍';

const CLUSTER: Record<string, string> = {
  ['ଡ' + NUKTA]: 'd',
  ['ଢ' + NUKTA]: 'dh',
};

const CONSONANT: Record<string, string> = {
  ['କ']: 'k', ['ଖ']: 'kh', ['ଗ']: 'g', ['ଘ']: 'gh', ['ଙ']: 'ng',
  ['ଚ']: 'ch', ['ଛ']: 'chh', ['ଜ']: 'j', ['ଝ']: 'jh', ['ଞ']: 'ny',
  ['ଟ']: 't', ['ଠ']: 'th', ['ଡ']: 'd', ['ଢ']: 'dh', ['ଣ']: 'n',
  ['ତ']: 't', ['ଥ']: 'th', ['ଦ']: 'd', ['ଧ']: 'dh', ['ନ']: 'n',
  ['ପ']: 'p', ['ଫ']: 'ph', ['ବ']: 'b', ['ଭ']: 'bh', ['ମ']: 'm',
  ['ଯ']: 'y', ['ର']: 'r', ['ଲ']: 'l', ['ଳ']: 'l',
  ['ୱ']: 'w', ['ଶ']: 'sh', ['ଷ']: 'sh', ['ସ']: 's', ['ହ']: 'h',
  ['ୟ']: 'y',
};

const INDEPENDENT: Record<string, string> = {
  ['ଅ']: 'a', ['ଆ']: 'aa', ['ଇ']: 'i', ['ଈ']: 'ii',
  ['ଉ']: 'u', ['ଊ']: 'uu', ['ଏ']: 'e',
  ['ଐ']: 'ai', ['ଓ']: 'o', ['ଔ']: 'au',
  ['ଋ']: 'ru', ['ୠ']: 'rri', ['ଌ']: 'lri', ['ୡ']: 'llri',
};

const MATRA: Record<string, string> = {
  ['ା']: 'aa', ['ି']: 'i', ['ୀ']: 'ii', ['ୁ']: 'u',
  ['ୂ']: 'uu', ['େ']: 'e', ['ୈ']: 'ai',
  ['ୋ']: 'o', ['ୌ']: 'au',
  ['ୃ']: 'ru', ['ୄ']: 'rri', ['ୢ']: 'lri', ['ୣ']: 'llri',
};

const SIGN: Record<string, string> = {
  ['ଂ']: 'm', ['ଁ']: 'n', ['ଃ']: 'h',
};

/** Marks that contribute nothing to what a person types. */
const SILENT = new Set(['ଽ', '୕', 'ୖ', 'ୗ', '॑', '॒']);

/** Careful romanization: long vowels written out, retroflex undifferentiated. */
export function romanize(word: string): string {
  let out = '';
  let i = 0;
  let pendingInherent = false;

  const flushInherent = () => {
    if (pendingInherent) {
      out += 'a';
      pendingInherent = false;
    }
  };

  while (i < word.length) {
    const two = word.slice(i, i + 2);
    if (CLUSTER[two] !== undefined) {
      flushInherent();
      out += CLUSTER[two];
      pendingInherent = true;
      i += 2;
      continue;
    }

    const ch = word[i] as string;
    if (ch === VIRAMA) {
      pendingInherent = false;
      i += 1;
      continue;
    }
    if (SILENT.has(ch)) {
      i += 1;
      continue;
    }
    if (CONSONANT[ch] !== undefined) {
      flushInherent();
      out += CONSONANT[ch];
      pendingInherent = true;
      i += 1;
      continue;
    }
    if (MATRA[ch] !== undefined) {
      pendingInherent = false;
      out += MATRA[ch];
      i += 1;
      continue;
    }
    if (INDEPENDENT[ch] !== undefined) {
      flushInherent();
      out += INDEPENDENT[ch];
      i += 1;
      continue;
    }
    if (SIGN[ch] !== undefined) {
      flushInherent();
      out += SIGN[ch];
      i += 1;
      continue;
    }
    if (ch === NUKTA) {
      i += 1;
      continue;
    }
    i += 1; // anything else: drop
  }

  flushInherent();
  return out;
}

/** How most people actually type: long vowels collapse to short. */
export function casual(roman: string): string {
  return roman.replace(/aa/g, 'a').replace(/ii/g, 'i').replace(/uu/g, 'u');
}

/**
 * The register of someone copying from a printed book: IAST with the diacritics
 * dropped, because that is what a plain keyboard produces. Everyday Odia has no
 * equivalent — nobody copies casual Odia out of a book — so this register only
 * exists in the Sanskrit harness.
 */
export function iastFold(roman: string): string {
  return casual(roman).replace(/ru/g, 'ri');
}

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

export function pct(hit: number, total: number): string {
  return total === 0 ? '  n/a' : `${((100 * hit) / total).toFixed(1)}%`;
}

export function rule(title: string): void {
  console.log(`\n${title}\n${'-'.repeat(Math.max(title.length, 48))}`);
}
