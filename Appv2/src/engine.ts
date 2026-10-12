/**
 * Load the bundled assets and build a profile-specific engine.
 *
 * Forked from web/src/engine.ts and keeping its contracts verbatim — the
 * optional-asset discipline, the `degraded()` fallback, the status-line note.
 * Two things are new:
 *
 *   1. There are more assets, because Appv2 ships its own generated rule files
 *      and its own Sanskrit lexicon alongside core's.
 *   2. The engine is constructed with `new Engine(...)` and a COMPOSITE lexicon
 *      rather than through `createEngine()`, which takes only one lexicon TSV.
 *      See compose.ts for why that beats merging the files at build time.
 *
 * As in web/, there is one `import.meta.glob` per file and never a wildcard: a
 * wildcard over core/data/ would pull the full multi-megabyte lexicon into the
 * bundle the moment the pipeline emits it. Only the "-web" pruned artefacts are
 * referenced here.
 */

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
  parseNextWords,
} from '@odia/core';
import type { Bigrams, DigitMode, LearnStore, Lexicon, NextWords, SpellingConverter, Unigrams } from '@odia/core/types';

import converterUrl from '../../core/data/converter.bin?url';
import { inflate } from './dictionary/pako-inflate.js';

import { mergeLexicons, mergeUnigrams, type LexiconSource } from './compose.js';
import { PROFILES, type AssetKey, type Profile, type ProfileId } from './profiles.js';
import { verbatimEngine, type EngineLike } from './verbatim.js';

/** Which build of the engine the bundler found. Injected by vite.config.ts. */
declare const __CORE_MODE__: 'src' | 'dist' | 'stub';
/** Which edition is being built. Injected by vite.config.ts. */
declare const __APP_EDITION__: 'adult' | 'kids';

type RawGlob = Record<string, () => Promise<unknown>>;

const GLOBS: Record<AssetKey, RawGlob> = {
  coreRules: import.meta.glob('../../core/rules/symbols.toml', {
    query: '?raw',
    import: 'default',
  }),
  unifiedRules: import.meta.glob('../rules/unified.toml', {
    query: '?raw',
    import: 'default',
  }),
  sanskritRules: import.meta.glob('../rules/sanskrit.toml', {
    query: '?raw',
    import: 'default',
  }),
  itrans: import.meta.glob('../../core/rules/itrans.toml', {
    query: '?raw',
    import: 'default',
  }),
  coreLexicon: import.meta.glob('../../core/data/lexicon-web.tsv', {
    query: '?raw',
    import: 'default',
  }),
  sanskritLexicon: import.meta.glob('../data/sanskrit-lexicon-web.tsv', {
    query: '?raw',
    import: 'default',
  }),
  coreUnigrams: import.meta.glob('../../core/data/unigrams-web.tsv', {
    query: '?raw',
    import: 'default',
  }),
  sanskritUnigrams: import.meta.glob('../data/sanskrit-unigrams-web.tsv', {
    query: '?raw',
    import: 'default',
  }),
  coreBigrams: import.meta.glob('../../core/data/bigrams-web.tsv', {
    query: '?raw',
    import: 'default',
  }),
  // Not in the kids edition: these are adults' chat choices, and a word that
  // is not in labels.tsv would pass the kids filter. The constant condition
  // lets the bundler drop the chunk from the kids build entirely.
  typed:
    __APP_EDITION__ === 'kids'
      ? {}
      : import.meta.glob('../../core/data/typed.tsv', {
          query: '?raw',
          import: 'default',
        }),
  // Not in the kids edition either: predictions from adults' chat.
  nextWords:
    __APP_EDITION__ === 'kids'
      ? {}
      : import.meta.glob('../../core/data/nextword.tsv', {
          query: '?raw',
          import: 'default',
        }),
  preferences: import.meta.glob('../../core/data/preferences.tsv', {
    query: '?raw',
    import: 'default',
  }),
  labels: import.meta.glob('../../core/data/labels.tsv', {
    query: '?raw',
    import: 'default',
  }),
};

/** The palette is not an engine asset, but it loads the same way. */
const PALETTE_GLOB: RawGlob = import.meta.glob('../rules/palette.toml', {
  query: '?raw',
  import: 'default',
});

export interface EngineHandle {
  engine: EngineLike;
  /** False when the real engine could not be built and text is passing through. */
  ready: boolean;
  /** One short sentence for the status line. Empty when everything is fine. */
  note: string;
  /**
   * False when a word list (lexicon) the profile needs did not load: the
   * engine still spells by rules, but the UI says the word list failed and
   * offers Reload (V1 states).
   */
  wordList: boolean;
  profile: Profile;
}

const rawCache = new Map<AssetKey, string | undefined>();
const lexiconCache = new Map<AssetKey, Lexicon>();
const unigramCache = new Map<AssetKey, Unigrams>();
const bigramCache = new Map<AssetKey, Bigrams>();
let converter: SpellingConverter | undefined;
/** True once loadExtras() has parsed the typed pairs and the next-word table. */
let extrasReady = false;

/**
 * The Desh-data layers (V2.13-V2.16): typed spellings, next-word table and the
 * spelling converter. Parsed after the first engine is built, each in its own
 * task, so start-up costs what it did before them (A-7); the caller rebuilds
 * the engine when this resolves. Typing works meanwhile, without them.
 */
export async function loadExtras(): Promise<void> {
  await nextTask();
  lexiconFor('typed');
  await nextTask();
  nextWordsFor();
  extrasReady = true;
  await loadConverter();
}
let converterLoad: Promise<boolean> | undefined;

/**
 * Fetch and parse the spelling converter (core/data/converter.bin, gzip, ~0.8
 * MB). Not part of loadProfileAssets: typing works without it, so the app
 * loads it after start-up and rebuilds the engine once it is here. Resolves
 * false when it cannot load; the engine then simply has no converter term.
 * Like the dictionary payloads it is named .bin, so no server decompresses it,
 * and it is inflated with the vendored pako (the browser floor is Safari 13).
 */
export function loadConverter(): Promise<boolean> {
  // Inflating and parsing are separate tasks with a yield between them, so
  // neither blocks typing for long (A-7: no long task while data loads).
  converterLoad ??= fetch(converterUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`converter fetch failed: ${response.status}`);
      return response.arrayBuffer();
    })
    .then(async (buffer) => {
      await nextTask();
      const bytes = inflate(new Uint8Array(buffer));
      await nextTask();
      converter = parseConverter(bytes);
      await nextTask();
      return true;
    })
    .catch(() => false);
  return converterLoad;
}

/** Let the browser handle input before the next step. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Fetch the assets a profile needs.
 *
 * Only the ones it needs: the Sanskrit lexicon is a separate lazily-globbed
 * chunk, so selecting `everyday` never downloads or parses it.
 */
export async function loadProfileAssets(id: ProfileId): Promise<void> {
  const profile = PROFILES[id];
  const wanted: AssetKey[] = [
    profile.rules,
    'itrans',
    ...profile.lexicons.map((l) => l.asset),
    ...profile.unigrams,
    'coreBigrams',
    'typed',
    'nextWords',
    'preferences',
    'labels',
  ];
  await Promise.all(wanted.map(readAsset));
}

export async function loadPaletteToml(): Promise<string | undefined> {
  return firstRaw(PALETTE_GLOB);
}

async function readAsset(key: AssetKey): Promise<string | undefined> {
  if (!rawCache.has(key)) rawCache.set(key, await firstRaw(GLOBS[key]));
  return rawCache.get(key);
}

/**
 * Build an engine for a profile and digit mode.
 *
 * Both are fixed at construction by `EngineConfig`, so changing either
 * rebuilds. Parsed lexicons and unigram tables are cached by asset key, so a
 * profile switch re-parses only what it has not seen — swapping between
 * `unified` and `sloka` reuses both tables and costs a rule parse.
 *
 * Call `loadProfileAssets(id)` first; this function is synchronous so that the
 * caller can rebuild inside an event handler without an await.
 */
export function buildEngine(
  id: ProfileId,
  digits: DigitMode,
  learnStore: LearnStore,
  familySafe = true,
  kids = false,
): EngineHandle {
  const profile = PROFILES[id];

  if (__CORE_MODE__ === 'stub') {
    return degraded(profile, 'Engine not built yet — showing your text unchanged.');
  }

  const rulesToml = rawCache.get(profile.rules);
  if (rulesToml === undefined) {
    return degraded(
      profile,
      `No rule file bundled for the ${profile.label} mode — showing your text unchanged.`,
    );
  }

  try {
    const sources: LexiconSource[] = profile.lexicons.map((ref) => ({
      lexicon: lexiconFor(ref.asset),
      priority: ref.priority,
    }));

    const engine = new Engine({
      rules: loadRules(rulesToml, rawCache.get('itrans')),
      lexicon: mergeLexicons(sources),
      unigrams: mergeUnigrams(profile.unigrams.map(unigramsFor)),
      // Context ranking for engine.transliterate(sentence). A missing chunk
      // means no context term; a malformed file throws, like a bad rule file.
      bigrams: bigramsFor('coreBigrams'),
      // What keyboard users typed and chose. Parsed once like a lexicon; a
      // missing chunk means no typed term, the engine still works.
      typed: extrasReady ? lexiconFor('typed') : undefined,
      // Next-word predictions after a space (V2.15).
      nextWords: extrasReady ? nextWordsFor() : undefined,
      // Spellings for words the word lists do not know (V2.14). Absent until
      // loadConverter() has finished.
      converter,
      learnStore,
      digits,
      preferences: parsePreferences(rawCache.get('preferences') ?? '', 'core/data/preferences.tsv'),
      labels: parseLabels(rawCache.get('labels') ?? '', 'core/data/labels.tsv'),
      // Kids edition: offensive and coarse words never appear, whatever the switch.
      filter: kids ? 'kids' : familySafe ? 'family' : 'off',
    });

    // Every word list the profile names must have loaded: a missing one is a
    // failed fetch in practice (the chunk exists in every build), and the
    // mode is not what the user chose without it.
    const wordList = sources.every((s) => s.lexicon.size > 0);
    const note = sources.every((s) => s.lexicon.size === 0)
      ? 'Rules only — no dictionary bundled yet.'
      : '';
    return { engine, ready: true, note, profile, wordList };
  } catch (error) {
    // A generated rule file that fails core's validation lands here. Say so
    // rather than showing a blank page: the message is what makes it fixable.
    return degraded(profile, `Engine failed to load: ${message(error)}`);
  }
}

function lexiconFor(key: AssetKey): Lexicon {
  let parsed = lexiconCache.get(key);
  if (parsed === undefined) {
    const raw = rawCache.get(key);
    parsed = raw === undefined ? emptyLexicon() : parseLexicon(raw);
    lexiconCache.set(key, parsed);
  }
  return parsed;
}

let nextWordsCache: NextWords | undefined;

function nextWordsFor(): NextWords | undefined {
  if (nextWordsCache === undefined) {
    const raw = rawCache.get('nextWords');
    if (raw !== undefined) nextWordsCache = parseNextWords(raw);
  }
  return nextWordsCache;
}

function unigramsFor(key: AssetKey): Unigrams {
  let parsed = unigramCache.get(key);
  if (parsed === undefined) {
    const raw = rawCache.get(key);
    parsed = raw === undefined ? emptyUnigrams() : parseUnigrams(raw);
    unigramCache.set(key, parsed);
  }
  return parsed;
}

function bigramsFor(key: AssetKey): Bigrams {
  let parsed = bigramCache.get(key);
  if (parsed === undefined) {
    const raw = rawCache.get(key);
    parsed = raw === undefined ? emptyBigrams() : parseBigrams(raw, 'core/data/bigrams-web.tsv');
    bigramCache.set(key, parsed);
  }
  return parsed;
}

function degraded(profile: Profile, note: string): EngineHandle {
  return { engine: verbatimEngine(), ready: false, note, profile, wordList: false };
}

/** The one file a single-file glob matched, or undefined if it matched nothing. */
async function firstRaw(glob: RawGlob): Promise<string | undefined> {
  const [path] = Object.keys(glob);
  if (path === undefined) return undefined;
  try {
    const loaded = await glob[path]();
    return typeof loaded === 'string' ? loaded : undefined;
  } catch {
    return undefined;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
