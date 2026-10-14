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
 *   phrases.tsv       roman <TAB> odia <TAB> category <TAB> meaning <TAB> status <TAB> note
 *       Whole phrases (greetings, wishes, the three levels of "you") for the
 *       app's Meanings panel. roman holds one or more typed spellings, `|`
 *       separated. Read by the app, not by the engine: phrases never enter
 *       word ranking.
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

export const PHRASE_CATEGORIES = ['greeting', 'wish', 'festival', 'you', 'family', 'everyday'] as const;
export type PhraseCategory = (typeof PHRASE_CATEGORIES)[number];

export interface Phrase {
  /** Typed spellings, lower case; the first is the careful one. */
  readonly keys: readonly string[];
  /** Canonical Odia phrase. */
  readonly odia: string;
  readonly category: PhraseCategory;
  readonly meaning: string;
  readonly status: GlossStatus;
  /** When or to whom it is said; empty when not given. */
  readonly note: string;
}

const PHRASE_KEY = /^[a-z][a-z']*( [a-z][a-z']*)*$/;
/** Odia letters and signs, spaces and sentence punctuation (danda, ?, !, comma). */
const PHRASE_ODIA = /^[\u0B00-\u0B7F\u0964\u0965\u200C\u200D ?!,]+$/;

export function parsePhrases(tsv: string, file = 'phrases.tsv'): Phrase[] {
  const phrases: Phrase[] = [];
  const seen = new Set<string>();
  for (const { cells, line } of rows(tsv, file)) {
    const where = `${file}:${line}`;
    const [keyCell, odia, category, meaning, status, note = ''] = cells;
    if (!keyCell || !odia || !category || !meaning || !status) {
      throw new Error(`${where}: expected "roman<TAB>odia<TAB>category<TAB>meaning<TAB>status[<TAB>note]"`);
    }
    const keys = keyCell.split('|');
    for (const key of keys) {
      if (!PHRASE_KEY.test(key)) throw new Error(`${where}: bad roman spelling "${key}" (lower case a-z, single spaces)`);
    }
    if (!PHRASE_ODIA.test(odia) || !/[\u0B00-\u0B7F]/.test(odia) || odia !== odia.trim() || / {2}/.test(odia)) {
      throw new Error(`${where}: the Odia cell must be Odia script with single spaces`);
    }
    assertCanonical(odia, where);
    if (!(PHRASE_CATEGORIES as readonly string[]).includes(category)) {
      throw new Error(`${where}: unknown category "${category}" (allowed: ${PHRASE_CATEGORIES.join(', ')})`);
    }
    if (!(GLOSS_STATUS as readonly string[]).includes(status)) {
      throw new Error(`${where}: unknown status "${status}" (allowed: ${GLOSS_STATUS.join(', ')})`);
    }
    if (seen.has(odia)) throw new Error(`${where}: duplicate phrase`);
    seen.add(odia);
    phrases.push({ keys, odia, category: category as PhraseCategory, meaning, status: status as GlossStatus, note });
  }
  return phrases;
}

/* ------------------------------------------------------------------ *
 * AI-written meanings (core/data/meanings.tsv)
 * ------------------------------------------------------------------ */

/**
 * ai     written by Claude for this project, not yet checked by a native speaker
 * owner  checked (or written) by the owner
 * wrong  rejected: never shown, kept so the row is not written again
 */
export const MEANING_STATUS = ['ai', 'owner', 'wrong'] as const;
export type MeaningStatus = (typeof MEANING_STATUS)[number];

/** Where a word comes from, in one word. Empty when unknown. */
export const MEANING_ORIGINS = [
  'native', 'sanskrit', 'persian', 'arabic', 'english', 'hindi', 'portuguese', 'name', 'mixed',
] as const;
export type MeaningOrigin = (typeof MEANING_ORIGINS)[number];

export interface Meaning {
  /** The key as written: one word, two words, "-suffix word" (a construction) or "-suffix" (an ending). */
  odia: string;
  /** One line for the suggestion chip and the lens (at most 56 characters). */
  meaning: string;
  /** All senses, modern first. */
  senses: string[];
  /** How the word is made, for prefixed or compound words ("ana (not) + chhaatra (student)", written in Odia). */
  formation: string;
  origin: MeaningOrigin | '';
  status: MeaningStatus;
  note: string;
}

export interface Meanings {
  readonly size: number;
  /** The entry for one canonical word, or for two words "a b"; never a "wrong" row. */
  get(key: string): Meaning | undefined;
  /**
   * A construction for `word` after `previous` ("-ku nei": nei after a word
   * ending in -ku, "over, regarding"), or undefined.
   */
  construction(previous: string, word: string): Meaning | undefined;
  /** Every shown entry (not "wrong"), single words and pairs, in file order. */
  all(): readonly Meaning[];
  /** The entry for an ending ("-re": in, at), keyed without the hyphen, or undefined. */
  ending(suffix: string): Meaning | undefined;
}

/** A word, two words, "-suffix word" or "-suffix": Odia letters and single spaces. */
const MEANING_KEY = /^-?[\u0B00-\u0B7F\u200C\u200D]+( [\u0B00-\u0B7F\u200C\u200D]+)?$/;
/** The longest one-line meaning: the chip's limit (Appv2/src/dictionary/lookup.ts tidyGloss). */
const MEANING_MAX = 56;

export function parseMeanings(tsv: string, file = 'meanings.tsv'): Meanings {
  const map = new Map<string, Meaning>();
  const constructions = new Map<string, Meaning[]>();
  const endings = new Map<string, Meaning>();
  const ordered: Meaning[] = [];
  let size = 0;
  for (const { cells, line } of rows(tsv, file)) {
    const where = `${file}:${line}`;
    const [odia, meaning, senses = '', formation = '', origin = '', status, note = ''] = cells;
    if (!odia || !meaning || status === undefined) {
      throw new Error(`${where}: expected "odia<TAB>meaning<TAB>senses<TAB>formation<TAB>origin<TAB>status[<TAB>note]"`);
    }
    if (!MEANING_KEY.test(odia)) throw new Error(`${where}: the key must be Odia: a word, two words, or "-suffix word"`);
    assertCanonical(odia, where);
    if (!(MEANING_STATUS as readonly string[]).includes(status)) {
      throw new Error(`${where}: unknown status "${status}" (allowed: ${MEANING_STATUS.join(', ')})`);
    }
    if (origin !== '' && !(MEANING_ORIGINS as readonly string[]).includes(origin)) {
      throw new Error(`${where}: unknown origin "${origin}" (allowed: ${MEANING_ORIGINS.join(', ')}, or empty)`);
    }
    if (meaning.length > MEANING_MAX) throw new Error(`${where}: the meaning is longer than ${MEANING_MAX} characters`);
    for (const [name, cell] of [['meaning', meaning], ['senses', senses]] as const) {
      if (/[\u0B00-\u0B7F]/.test(cell)) throw new Error(`${where}: the ${name} column must be English (Odia goes in formation or note)`);
    }
    assertCanonical(formation, where);
    const isEnding = odia.startsWith('-') && !odia.includes(' ');
    if (map.has(odia) || (isEnding && endings.has(odia.slice(1))) ||
        constructions.get(odia.slice(1).split(' ')[1] ?? '')?.some((m) => m.odia === odia)) {
      throw new Error(`${where}: duplicate entry`);
    }
    const entry: Meaning = {
      odia,
      meaning,
      senses: senses.split(';').map((x) => x.trim()).filter((x) => x.length > 0),
      formation,
      origin: origin as MeaningOrigin | '',
      status: status as MeaningStatus,
      note,
    };
    size += 1;
    if (isEnding) {
      endings.set(odia.slice(1), entry);
      continue;
    }
    if (entry.status !== 'wrong') ordered.push(entry);
    if (odia.startsWith('-')) {
      const word = odia.split(' ')[1] as string;
      const list = constructions.get(word) ?? [];
      list.push(entry);
      constructions.set(word, list);
    } else {
      map.set(odia, entry);
    }
  }
  const shown = (m: Meaning | undefined): Meaning | undefined => (m && m.status !== 'wrong' ? m : undefined);
  return {
    size,
    get: (key) => shown(map.get(key)),
    all: () => ordered,
    ending: (suffix) => shown(endings.get(suffix)),
    construction(previous, word) {
      const exact = shown(map.get(`${previous} ${word}`));
      if (exact) return exact;
      // The longest matching suffix wins ("-nku" before "-ku").
      let best: Meaning | undefined;
      for (const m of constructions.get(word) ?? []) {
        const suffix = m.odia.slice(1).split(' ')[0] as string;
        if (m.status !== 'wrong' && previous.endsWith(suffix) && previous.length > suffix.length &&
            (best === undefined || suffix.length > best.odia.split(' ')[0]!.length - 1)) best = m;
      }
      return best;
    },
  };
}

/* ------------------------------------------------------------ *
 * Verb endings (core/data/verb-endings.tsv)
 * ------------------------------------------------------------ */

export interface VerbEnding {
  /** The ending as written after a root that ends in a consonant (starts with a vowel sign), or ''. */
  readonly afterConsonant: string;
  /** The ending as written after a root that ends in a vowel, or ''. */
  readonly afterVowel: string;
  /** English, "…" for the verb: "have …-ed (they; or respectful)". */
  readonly meaning: string;
  readonly note: string;
}

export interface VerbEndings {
  readonly size: number;
  /** Every written form, longest first: the order to try them in. */
  forms(): readonly { form: string; afterVowel: boolean; ending: VerbEnding }[];
}

const VERB_ENDING_MAX = 40;
const ODIA_ONLY = /^[\u0b00-\u0b7f]+$/;

export function parseVerbEndings(tsv: string, file = 'verb-endings.tsv'): VerbEndings {
  const seen = new Set<string>();
  const forms: { form: string; afterVowel: boolean; ending: VerbEnding }[] = [];
  let size = 0;
  for (const { cells, line } of rows(tsv, file)) {
    const where = `${file}:${line}`;
    const [afterConsonant = '', afterVowel = '', meaning = '', note = ''] = cells;
    if (!meaning || (!afterConsonant && !afterVowel)) {
      throw new Error(`${where}: expected "after_consonant<TAB>after_vowel<TAB>meaning[<TAB>note]" with at least one ending`);
    }
    for (const form of [afterConsonant, afterVowel]) {
      if (form === '') continue;
      if (!ODIA_ONLY.test(form)) throw new Error(`${where}: an ending must be Odia letters only: "${form}"`);
      assertCanonical(form, where);
    }
    if (/[\u0b00-\u0b7f]/.test(meaning)) throw new Error(`${where}: the meaning column must be English`);
    if (meaning.includes(';')) throw new Error(`${where}: no ";" in a verb-ending meaning (the chip stops at the first one)`);
    if (meaning.length > VERB_ENDING_MAX) throw new Error(`${where}: the meaning is longer than ${VERB_ENDING_MAX} characters`);
    const ending: VerbEnding = { afterConsonant, afterVowel, meaning, note };
    for (const [form, vowel] of [[afterConsonant, false], [afterVowel, true]] as const) {
      if (form === '') continue;
      const key = `${vowel ? 'v' : 'c'}:${form}`;
      if (seen.has(key)) throw new Error(`${where}: duplicate ending "${form}"`);
      seen.add(key);
      forms.push({ form, afterVowel: vowel, ending });
    }
    size += 1;
  }
  forms.sort((a, b) => b.form.length - a.form.length);
  return { size, forms: () => forms };
}

export const emptyVerbEndings = (): VerbEndings => parseVerbEndings('');

export const emptyPreferences = (): Preferences => parsePreferences('');
export const emptyLabels = (): Labels => parseLabels('');
export const emptyMeanings = (): Meanings => parseMeanings('');
