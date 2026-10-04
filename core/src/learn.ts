/**
 * User learning: what the typist actually picked, per roman key.
 *
 *   { "kemiti": { "କେମିତି": 12 }, "achha": { "ଅଛ": 7, "ଆଛା": 1 } }
 *
 * A personal dictionary holds thousands of entries at most, so this is a JSON
 * blob, not a database. Revisit only if it exceeds about a megabyte.
 *
 * All three implementations share two rules. Roman keys are lowercased, so
 * "Kemiti" and "kemiti" are one entry. Chosen words go through `canonical()`,
 * because a user dictionary keyed on a precomposed nukta form would stop
 * matching engine output the moment anything applied NFC.
 *
 * `JsonFileLearnStore` takes its file access as a parameter rather than
 * importing `node:fs`. The engine has to run unchanged in a browser and inside
 * JavaScriptCore, and a static `node:fs` import in a module the browser build
 * pulls in would break both. `node.ts` supplies the concrete node
 * implementation.
 */

import { canonical } from './normalize.js';
import type { LearnStore } from './types.js';

type Counts = Record<string, number>;

/** The on-disk / in-localStorage shape. */
export type LearnData = Record<string, Counts>;

function normaliseKey(roman: string): string {
  return roman.trim().toLowerCase();
}

/* ------------------------------------------------------------------ *
 * In memory
 * ------------------------------------------------------------------ */

/** The base implementation. Also what tests and the CLI use when nothing is persisted. */
export class MemoryLearnStore implements LearnStore {
  protected data: LearnData;

  constructor(initial?: LearnData) {
    this.data = {};
    if (initial !== undefined) this.merge(initial);
  }

  get(roman: string): Counts | undefined {
    return this.data[normaliseKey(roman)];
  }

  record(roman: string, chosen: string): void {
    const key = normaliseKey(roman);
    const word = canonical(chosen);
    if (key.length === 0 || word.length === 0) return;

    const counts = (this.data[key] ??= {});
    counts[word] = (counts[word] ?? 0) + 1;
    this.persist();
  }

  /** A plain object suitable for `JSON.stringify`. */
  toJSON(): LearnData {
    return this.data;
  }

  /** Fold parsed JSON in, canonicalising as it goes. Unknown shapes are ignored. */
  merge(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return;

    for (const [roman, counts] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof counts !== 'object' || counts === null || Array.isArray(counts)) continue;

      const key = normaliseKey(roman);
      const bucket = (this.data[key] ??= {});
      for (const [word, count] of Object.entries(counts as Record<string, unknown>)) {
        if (typeof count !== 'number' || !Number.isFinite(count)) continue;
        const canonicalWord = canonical(word);
        bucket[canonicalWord] = (bucket[canonicalWord] ?? 0) + count;
      }
    }
  }

  /** Called after every `record`. Nothing to do in memory. */
  protected persist(): void {}
}

/* ------------------------------------------------------------------ *
 * JSON file (node, via injected I/O)
 * ------------------------------------------------------------------ */

/** The two file operations a persistent store needs. Synchronous, like everything else here. */
export interface FileIO {
  /** File contents, or `undefined` if it does not exist or cannot be read. */
  read(path: string): string | undefined;
  write(path: string, contents: string): void;
}

/**
 * A learn store backed by a JSON file — `~/Library/Application Support/
 * OdiaTranslit/userdict.json` on macOS, the platform equivalent elsewhere.
 *
 * A missing or corrupt file is not an error: the store starts empty and the
 * next `record()` writes a good one. Losing a personal dictionary is annoying;
 * refusing to start because of it would be worse.
 */
export class JsonFileLearnStore extends MemoryLearnStore {
  constructor(
    private readonly path: string,
    private readonly io: FileIO,
  ) {
    super();
    const contents = this.io.read(this.path);
    if (contents === undefined) return;
    try {
      this.merge(JSON.parse(contents));
    } catch {
      // Corrupt file. Start clean; the next record() overwrites it.
    }
  }

  protected override persist(): void {
    this.io.write(this.path, JSON.stringify(this.data));
  }
}

/* ------------------------------------------------------------------ *
 * localStorage (browser)
 * ------------------------------------------------------------------ */

/** The slice of the Web Storage API this needs, declared locally so core needs no DOM types. */
interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Read `localStorage` defensively. It is absent under node and in
 * JavaScriptCore, and Safari throws on access in some private-browsing
 * configurations rather than returning null.
 */
function findLocalStorage(): WebStorageLike | undefined {
  try {
    const storage = (globalThis as { localStorage?: WebStorageLike }).localStorage;
    return storage ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * A learn store backed by `localStorage`. With no `localStorage` available it
 * degrades silently to an in-memory store, so the PWA and the CLI can share
 * one code path.
 */
export class LocalStorageLearnStore extends MemoryLearnStore {
  private readonly storage: WebStorageLike | undefined;

  constructor(private readonly storageKey = 'odia.userdict') {
    super();
    this.storage = findLocalStorage();

    const raw = this.storage?.getItem(this.storageKey) ?? null;
    if (raw === null) return;
    try {
      this.merge(JSON.parse(raw));
    } catch {
      // Corrupt entry; start clean.
    }
  }

  /** False when there is no `localStorage`, i.e. nothing will survive a reload. */
  get persistent(): boolean {
    return this.storage !== undefined;
  }

  protected override persist(): void {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.data));
    } catch {
      // Quota exceeded or storage disabled. Keep the in-memory copy.
    }
  }
}
