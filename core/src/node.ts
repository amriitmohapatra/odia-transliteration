/// <reference types="node" />

/**
 * The node-only entry point: `@odia/core/node`.
 *
 * This is the ONLY module in `core/` that touches the file system. Keeping it
 * separate is not fastidiousness — `index.ts` is bundled into the PWA by Vite
 * and loaded into JavaScriptCore by the macOS input method, and a static
 * `node:fs` import anywhere in that graph breaks both. Import this module from
 * the CLI, from tests and from tools; import `@odia/core` from everywhere else.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEngine } from './index.js';
import type { CreateEngineOptions, Engine } from './index.js';
import { JsonFileLearnStore } from './learn.js';
import type { FileIO } from './learn.js';

/**
 * The `core/` directory, resolved from this module rather than from the
 * process working directory. Both `core/src/node.ts` (under vitest and tsx)
 * and `core/dist/node.js` (built) sit one level below it.
 */
const CORE_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Read a file under `core/`, returning `undefined` when it does not exist. */
export function readCoreFile(relativePath: string): string | undefined {
  try {
    return readFileSync(CORE_ROOT + relativePath, 'utf8');
  } catch {
    return undefined;
  }
}

/** Read a binary file under `core/`, returning `undefined` when it does not exist. */
export function readCoreBytes(relativePath: string): Uint8Array | undefined {
  try {
    return new Uint8Array(readFileSync(CORE_ROOT + relativePath));
  } catch {
    return undefined;
  }
}

/** `data/converter.bin` is stored gzip-compressed; parseConverter() wants it inflated. */
export function gunzipped(bytes: Uint8Array | undefined): Uint8Array | undefined {
  if (bytes === undefined || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  return new Uint8Array(gunzipSync(bytes));
}

/** Absolute path of a file under `core/`, for error messages and tooling. */
export function coreFilePath(relativePath: string): string {
  return CORE_ROOT + relativePath;
}

export const RULES_PATH = 'rules/symbols.toml';
export const ITRANS_PATH = 'rules/itrans.toml';
export const LEXICON_PATH = 'data/lexicon.tsv';
export const LEXICON_WEB_PATH = 'data/lexicon-web.tsv';
export const UNIGRAMS_PATH = 'data/unigrams.tsv';
export const BIGRAMS_PATH = 'data/bigrams.tsv';
export const BIGRAMS_WEB_PATH = 'data/bigrams-web.tsv';
export const PREFERENCES_PATH = 'data/preferences.tsv';
export const LABELS_PATH = 'data/labels.tsv';
export const TYPED_PATH = 'data/typed.tsv';
export const CONVERTER_PATH = 'data/converter.bin';

export interface CreateEngineFromDiskOptions
  extends Omit<CreateEngineOptions, 'rulesToml' | 'itransToml' | 'lexiconTsv' | 'unigramsTsv' | 'bigramsTsv'> {
  /** Use the pruned `lexicon-web.tsv` and `bigrams-web.tsv` instead of the full files. */
  web?: boolean;
  /** Load no bigram file (context ranking off). Default false. */
  noBigrams?: boolean;
  /** Load no typed-spelling file (typed term off). Default false. */
  noTyped?: boolean;
  /** Load no spelling converter (converter term off). Default false. */
  noConverter?: boolean;
}

/**
 * Build an engine from the files shipped in `core/`.
 *
 * The rule files must exist — they are source, not build output. The data
 * files need not: `core/data/` is produced by a pipeline that may not have run
 * yet, and the engine falls back to rule-only transliteration without them.
 */
export function createEngineFromDisk(opts: CreateEngineFromDiskOptions = {}): Engine {
  const rulesToml = readCoreFile(RULES_PATH);
  if (rulesToml === undefined) {
    throw new Error(`Cannot read the rule file at ${coreFilePath(RULES_PATH)}`);
  }

  const { web, noBigrams, noTyped, typedTsv, noConverter, converterBin, ...engineOptions } = opts;

  return createEngine({
    ...engineOptions,
    rulesToml,
    itransToml: readCoreFile(ITRANS_PATH),
    lexiconTsv: readCoreFile(web === true ? LEXICON_WEB_PATH : LEXICON_PATH),
    unigramsTsv: readCoreFile(UNIGRAMS_PATH),
    bigramsTsv: noBigrams === true ? undefined : readCoreFile(web === true ? BIGRAMS_WEB_PATH : BIGRAMS_PATH),
    // An explicit typedTsv wins: the eval passes a copy without held-out pairs.
    typedTsv: noTyped === true ? undefined : (typedTsv ?? readCoreFile(TYPED_PATH)),
    converterBin: noConverter === true ? undefined : (converterBin ?? gunzipped(readCoreBytes(CONVERTER_PATH))),
    preferencesTsv: readCoreFile(PREFERENCES_PATH),
    labelsTsv: readCoreFile(LABELS_PATH),
  });
}

/* ------------------------------------------------------------------ *
 * Persistent user dictionary
 * ------------------------------------------------------------------ */

/** `FileIO` backed by `node:fs`. Creates the parent directory on first write. */
export const nodeFileIO: FileIO = {
  read(path: string): string | undefined {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return undefined;
    }
  },
  write(path: string, contents: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
  },
};

/** A JSON-file learn store at `path`, using node's file system. */
export function createJsonFileLearnStore(path: string): JsonFileLearnStore {
  return new JsonFileLearnStore(path, nodeFileIO);
}

export * from './index.js';
