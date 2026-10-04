/**
 * Loads the bundled rule and data files and hands back a ready engine.
 *
 * Two things are worth knowing about this file.
 *
 * **The assets are optional.** `core/rules/*.toml` and `core/data/*.tsv` are
 * produced by Stage A and the data pipeline, and may not exist while the PWA is
 * being worked on. `import.meta.glob` returns an empty object for a pattern that
 * matches nothing, so a missing file is a build-time no-op rather than a build
 * failure, and the engine is constructed with whatever did exist. Rule-only is a
 * supported configuration.
 *
 * **Only the pruned lexicon is ever referenced.** `lexicon-web.tsv`, roughly
 * 30k words. The full `lexicon.tsv` is 8-12 MB and would not survive the ~48 MB
 * ceiling an iOS keyboard extension has to live under. Keeping the reference
 * here narrow is what keeps that artifact honest.
 *
 * The globs are lazy, so each file becomes its own chunk: the shell paints
 * before the dictionary has been parsed, and the service worker precaches the
 * chunks alongside everything else.
 */

import { createEngine } from '@odia/core';
import type { DigitMode, LearnStore } from '@odia/core/types';
import { verbatimEngine, type EngineLike } from './verbatim';

/** Which build of the engine the bundler found. Injected by vite.config.ts. */
declare const __CORE_MODE__: 'src' | 'dist' | 'stub';

type RawGlob = Record<string, () => Promise<unknown>>;

// One glob per file, never a wildcard: a wildcard over core/data/ would pull the
// full multi-megabyte lexicon into the bundle the moment the pipeline emits it.
// The options object has to be an inline literal — Vite parses it statically.
const symbolsToml: RawGlob = import.meta.glob('../../core/rules/symbols.toml', {
  query: '?raw',
  import: 'default',
});
const itransToml: RawGlob = import.meta.glob('../../core/rules/itrans.toml', {
  query: '?raw',
  import: 'default',
});
const lexiconTsv: RawGlob = import.meta.glob('../../core/data/lexicon-web.tsv', {
  query: '?raw',
  import: 'default',
});
// Note the "-web" suffix. The full unigrams.tsv is ~12 MB / 345k rows, which is
// fine for the CLI and the eval harness and completely wrong here: it would be
// four times the size of everything else in the bundle put together, and it is
// the same artifact a future iOS keyboard extension would have to fit under a
// ~48 MB ceiling. Until the pipeline emits a pruned unigrams-web.tsv, the web
// build runs without corpus frequencies and leans on the weights already
// carried in lexicon-web.tsv.
const unigramsTsv: RawGlob = import.meta.glob('../../core/data/unigrams-web.tsv', {
  query: '?raw',
  import: 'default',
});

export interface LoadedAssets {
  rulesToml?: string;
  itransToml?: string;
  lexiconTsv?: string;
  unigramsTsv?: string;
}

export interface EngineHandle {
  engine: EngineLike;
  /** False when the real engine could not be built and the app is passing text through. */
  ready: boolean;
  /** One short sentence for the status line. Empty when everything is fine. */
  note: string;
  assets: LoadedAssets;
}

let assetsPromise: Promise<LoadedAssets> | undefined;

/** Read all four optional assets once; later calls reuse the same strings. */
export function loadAssets(): Promise<LoadedAssets> {
  assetsPromise ??= (async () => ({
    rulesToml: await firstRaw(symbolsToml),
    itransToml: await firstRaw(itransToml),
    lexiconTsv: await firstRaw(lexiconTsv),
    unigramsTsv: await firstRaw(unigramsTsv),
  }))();
  return assetsPromise;
}

/**
 * Build an engine for the given digit mode.
 *
 * `digits` is fixed at construction by `EngineConfig`, so switching the toggle
 * rebuilds. The asset strings are already in memory by then, so the rebuild is
 * a parse and nothing else.
 */
export function buildEngine(assets: LoadedAssets, digits: DigitMode, learnStore: LearnStore): EngineHandle {
  if (__CORE_MODE__ === 'stub') {
    return degraded(assets, 'Engine not built yet — showing your text unchanged.');
  }

  // rulesToml is the one asset createEngine() insists on; there is no engine
  // without rules. Everything else is optional by design.
  if (assets.rulesToml === undefined) {
    return degraded(assets, 'No rule file bundled — showing your text unchanged.');
  }

  try {
    // The loader takes file *contents*. Parsing, validation and the canonical()
    // checks are the engine's job, not the browser's.
    const engine = createEngine({
      rulesToml: assets.rulesToml,
      itransToml: assets.itransToml,
      lexiconTsv: assets.lexiconTsv,
      unigramsTsv: assets.unigramsTsv,
      learnStore,
      digits,
    });

    const note = assets.lexiconTsv === undefined ? 'Rules only — no dictionary bundled yet.' : '';
    return { engine, ready: true, note, assets };
  } catch (error) {
    // A rule file that fails validation lands here. Say so rather than showing
    // a blank page: the message is the one thing that makes it fixable.
    return degraded(assets, `Engine failed to load: ${message(error)}`);
  }
}

function degraded(assets: LoadedAssets, note: string): EngineHandle {
  return { engine: verbatimEngine(), ready: false, note, assets };
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
