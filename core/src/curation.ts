/**
 * Owner-curated data: preferences and labels.
 *
 * Both are plain TSV files the owner edits by hand, so the parsers are strict:
 * a malformed row or a non-canonical Odia string throws at load time with the
 * line number, the same "fail loudly" contract as rules.ts. A typo must stop
 * the build, not quietly change a suggestion.
 *
 *   preferences.tsv   roman <TAB> odia <TAB> weight <TAB> note
 *       "For this roman key, put this Odia word first." Owner decision, not
 *       corpus evidence: e.g. raja -> the Raja festival, raajaa -> king.
 *       Scored through `[weights] pref` in symbols.toml, below a single user
 *       pick, so the user's own choice still wins.
 *
 *   glosses.tsv       odia <TAB> meaning <TAB> status <TAB> note
 *       The meaning to show first for a word, where the dictionary's first
 *       sense misleads today (e.g. the Raja festival, not "dust"). status is
 *       `owner` (written by the owner) or `seed` (suggested by an agent, shown,
 *       but waiting for the owner's check). Read by the app's dictionary
 *       module, not by the engine.
 *
 *   labels.tsv        odia <TAB> label <TAB> keys
 *       Whole words only, never substrings. Labels: offensive, coarse, spoken,
 *       slang, dialect. `keys` (optional, comma-separated roman) are the exact
 *       spellings under which the word may still appear in family mode. They
 *       must be keys no innocent word shares: the lexicon also files words
 *       under loose casual keys (one listed word sits under the key of the
 *       word for "closed"), so "the lexicon lists it under this key" is NOT a
 *       safe exemption. Filter levels (see index.ts):
 *         off      nothing filtered
 *         family   offensive words dropped unless the key typed is one of
 *                  their `keys`, or the user taught them, or a preference
 *                  lists them (default)
 *         kids     offensive AND coarse words dropped, no exemptions, and
 *                  learn() refuses them
 *
 * Lines starting with # and blank lines are ignored. No Odia literal appears in
 * this file; the data lives in the TSVs.
 */
import { assertCanonical } from './normalize.js';

export const LABELS = ['offensive', 'coarse', 'spoken', 'slang', 'dialect'] as const;
export type Label = (typeof LABELS)[number];

/** Owner preferences, by lowercased roman key. */
export interface Preferences {
  readonly size: number;
  /** Canonical Odia word -> preference weight, or undefined if the key has none. */
  get(key: string): Readonly<Record<string, number>> | undefined;
}

/** Word labels, by canonical Odia word. */
export interface Labels {
  readonly size: number;
  get(word: string): ReadonlySet<Label> | undefined;
  /** True when the whole word carries the `offensive` label. */
  isOffensive(word: string): boolean;
  /** True when the whole word carries the `coarse` label. */
  isCoarse(word: string): boolean;
  /** The roman keys under which the word may appear in family mode. */
  keysFor(word: string): ReadonlySet<string> | undefined;
}

export const FILTER_LEVELS = ['off', 'family', 'kids'] as const;
export type FilterLevel = (typeof FILTER_LEVELS)[number];

function rows(tsv: string, file: string): { cells: string[]; line: number }[] {
  const out: { cells: string[]; line: number }[] = [];
  tsv.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) return;
    out.push({ cells: line.split('\t').map((c) => c.trim()), line: i + 1 });
  });
  void file;
  return out;
}

export function parsePreferences(tsv: string, file = 'preferences.tsv'): Preferences {
  const map = new Map<string, Record<string, number>>();
  for (const { cells, line } of rows(tsv, file)) {
    const where = `${file}:${line}`;
    const [roman, odia, weightCell] = cells;
    if (!roman || !odia) throw new Error(`${where}: expected "roman<TAB>odia[<TAB>weight<TAB>note]"`);
    if (!/^[a-z_]+$/i.test(roman)) throw new Error(`${where}: roman key "${roman}" must be Latin letters only`);
    assertCanonical(odia, where);
    let weight = 1;
    if (weightCell !== undefined && weightCell !== '') {
      weight = Number(weightCell);
      if (!Number.isFinite(weight) || weight <= 0) throw new Error(`${where}: weight "${weightCell}" must be a number > 0`);
    }
    const key = roman.toLowerCase();
    const entry = map.get(key) ?? {};
    if (entry[odia] !== undefined) throw new Error(`${where}: duplicate preference ${key} -> ${odia}`);
    entry[odia] = weight;
    map.set(key, entry);
  }
  return { size: map.size, get: (key) => map.get(key) };
}

export function parseLabels(tsv: string, file = 'labels.tsv'): Labels {
  const map = new Map<string, Set<Label>>();
  const keys = new Map<string, Set<string>>();
  for (const { cells, line } of rows(tsv, file)) {
    const where = `${file}:${line}`;
    const [odia, label, keyCell] = cells;
    if (!odia || !label) throw new Error(`${where}: expected "odia<TAB>label[<TAB>keys]"`);
    assertCanonical(odia, where);
    if (!(LABELS as readonly string[]).includes(label)) {
      throw new Error(`${where}: unknown label "${label}" (allowed: ${LABELS.join(', ')})`);
    }
    const set = map.get(odia) ?? new Set<Label>();
    set.add(label as Label);
    map.set(odia, set);
    for (const raw of (keyCell ?? '').split(',').map((k) => k.trim()).filter((k) => k.length > 0)) {
      if (!/^[a-z_]+$/i.test(raw)) throw new Error(`${where}: key "${raw}" must be Latin letters only`);
      const ks = keys.get(odia) ?? new Set<string>();
      ks.add(raw.toLowerCase());
      keys.set(odia, ks);
    }
  }
  return {
    size: map.size,
    get: (word) => map.get(word),
    isOffensive: (word) => map.get(word)?.has('offensive') ?? false,
    isCoarse: (word) => map.get(word)?.has('coarse') ?? false,
    keysFor: (word) => keys.get(word),
  };
}

export const GLOSS_STATUS = ['owner', 'seed'] as const;
export type GlossStatus = (typeof GLOSS_STATUS)[number];

/** Owner meanings, by canonical Odia word. */
export interface Glosses {
  readonly size: number;
  get(word: string): { meaning: string; status: GlossStatus } | undefined;
}

export function parseGlosses(tsv: string, file = 'glosses.tsv'): Glosses {
  const map = new Map<string, { meaning: string; status: GlossStatus }>();
  for (const { cells, line } of rows(tsv, file)) {
    const where = `${file}:${line}`;
    const [odia, meaning, status] = cells;
    if (!odia || !meaning || !status) throw new Error(`${where}: expected "odia<TAB>meaning<TAB>status[<TAB>note]"`);
    assertCanonical(odia, where);
    if (!(GLOSS_STATUS as readonly string[]).includes(status)) {
      throw new Error(`${where}: unknown status "${status}" (allowed: ${GLOSS_STATUS.join(', ')})`);
    }
    if (map.has(odia)) throw new Error(`${where}: duplicate meaning for this word`);
    map.set(odia, { meaning, status: status as GlossStatus });
  }
  return { size: map.size, get: (word) => map.get(word) };
}

export const emptyPreferences = (): Preferences => parsePreferences('');
export const emptyLabels = (): Labels => parseLabels('');
