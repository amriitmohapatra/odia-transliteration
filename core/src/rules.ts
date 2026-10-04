/**
 * Load and validate the TOML rule files.
 *
 * This module is the gate. Everything downstream — the segmenter, strict mode,
 * the ranker — assumes that every Odia string it sees is already canonical and
 * that every field it reads exists. That assumption is only safe because this
 * file refuses to return a `Rules` object when it is not true.
 *
 * Validation is deliberately unforgiving: an unknown key, a missing field, a
 * weight that is not a number, or a precomposed nukta character all throw. A
 * typo in symbols.toml must stop the process at startup rather than quietly
 * degrade transliteration six months later.
 */

import { parse as parseToml } from 'smol-toml';

import { assertCanonical, canonical, VIRAMA } from './normalize.js';
import type {
  ConsonantRule,
  OdiaOption,
  RankWeights,
  RuleEntry,
  Rules,
  SignContext,
  SignOption,
  SignRule,
  StrictScheme,
  StrictSchemeName,
  SegmentWeights,
  VowelRule,
} from './types.js';

/* ------------------------------------------------------------------ *
 * Positional context for consonant options
 * ------------------------------------------------------------------ */

/**
 * Where a consonant option is allowed to fire, evaluated against the ROMAN
 * input rather than against the partially assembled Odia string.
 *
 * `types.ts` gives signs their own smaller `SignContext` vocabulary. Consonants
 * need a positional one instead, because the case that motivates the whole
 * mechanism is the flap ଡ଼: rare word-initially, common between vowels and at
 * the end of a word.
 */
export type PositionContext =
  | 'any'
  | 'word_initial'
  | 'non_initial'
  | 'intervocalic'
  | 'word_final';

const POSITION_CONTEXTS: readonly string[] = [
  'any',
  'word_initial',
  'non_initial',
  'intervocalic',
  'word_final',
];
const SIGN_CONTEXTS: readonly string[] = ['any', 'before_consonant', 'before_vowel', 'word_final'];

/**
 * A consonant option that carries a positional predicate. `ConsonantRule` in
 * types.ts stores plain `OdiaOption`s; this is the structural extension the
 * loader actually builds, and every option it produces has a `context`.
 */
export interface PositionedOption extends OdiaOption {
  context: PositionContext;
}

/** The context of a consonant option, defaulting to `'any'`. */
export function optionContext(option: OdiaOption): PositionContext {
  return (option as Partial<PositionedOption>).context ?? 'any';
}

/* ------------------------------------------------------------------ *
 * Public entry point
 * ------------------------------------------------------------------ */

/**
 * Parse and validate `symbols.toml`, and optionally `itrans.toml`.
 *
 * Takes the file *contents*, not paths: the engine does no I/O, so that the
 * same code runs under node, in a browser and inside JavaScriptCore. See
 * `node.ts` for the convenience wrapper that reads the shipped files.
 */
export function loadRules(symbolsToml: string, itransToml?: string): Rules {
  const raw = parseToml(symbolsToml) as unknown;
  const root = requireTable(raw, 'symbols.toml');

  rejectUnknownKeys(
    root,
    ['meta', 'weights', 'segment', 'digits', 'vowel', 'consonant', 'sign'],
    'symbols.toml',
  );

  const vowels = readVowels(root['vowel']);
  const consonants = readConsonants(root['consonant']);
  const signs = readSigns(root['sign']);
  const digits = readDigits(root['digits']);
  const weights = readWeights(root['weights']);
  const segmentWeights = readSegmentWeights(root['segment']);

  const strictSchemes = new Map<StrictSchemeName, StrictScheme>();
  if (itransToml !== undefined) {
    strictSchemes.set('itrans', loadStrictScheme(itransToml, 'itrans.toml'));
  }

  return new CompiledRules(
    vowels,
    consonants,
    signs,
    digits,
    weights,
    segmentWeights,
    strictSchemes,
  );
}

/* ------------------------------------------------------------------ *
 * The compiled lookup structure
 * ------------------------------------------------------------------ */

class CompiledRules implements Rules {
  readonly consonants: readonly ConsonantRule[];
  readonly vowels: readonly VowelRule[];
  readonly signs: readonly SignRule[];
  readonly digits: readonly string[];
  readonly weights: RankWeights;
  readonly segmentWeights: SegmentWeights;
  readonly virama = VIRAMA;
  readonly maxKeyLength: number;
  readonly strictSchemes?: ReadonlyMap<StrictSchemeName, StrictScheme>;

  /** Roman key -> every entry declaring it, in file order. */
  private readonly byKey: Map<string, RuleEntry[]>;

  constructor(
    vowels: VowelRule[],
    consonants: ConsonantRule[],
    signs: SignRule[],
    digits: string[],
    weights: RankWeights,
    segmentWeights: SegmentWeights,
    strictSchemes: Map<StrictSchemeName, StrictScheme>,
  ) {
    this.vowels = vowels;
    this.consonants = consonants;
    this.signs = signs;
    this.digits = digits;
    this.weights = weights;
    this.segmentWeights = segmentWeights;
    this.strictSchemes = strictSchemes.size > 0 ? strictSchemes : undefined;

    this.byKey = new Map();
    let longest = 0;
    for (const entry of [...vowels, ...consonants, ...signs] as RuleEntry[]) {
      const bucket = this.byKey.get(entry.roman);
      if (bucket === undefined) this.byKey.set(entry.roman, [entry]);
      else bucket.push(entry);
      if (entry.roman.length > longest) longest = entry.roman.length;
    }
    this.maxKeyLength = longest;
  }

  match(key: string): readonly RuleEntry[] {
    return this.byKey.get(key) ?? EMPTY_ENTRIES;
  }

  matchAt(roman: string, at: number): readonly RuleEntry[] {
    const remaining = roman.length - at;
    if (remaining <= 0) return EMPTY_ENTRIES;

    const out: RuleEntry[] = [];
    // Longest key first, so the caller can expand in preference order.
    for (let len = Math.min(this.maxKeyLength, remaining); len >= 1; len -= 1) {
      const bucket = this.byKey.get(roman.slice(at, at + len));
      if (bucket !== undefined) out.push(...bucket);
    }
    return out;
  }
}

const EMPTY_ENTRIES: readonly RuleEntry[] = Object.freeze([]);

/* ------------------------------------------------------------------ *
 * symbols.toml readers
 * ------------------------------------------------------------------ */

function readVowels(raw: unknown): VowelRule[] {
  const rows = requireArray(raw, 'symbols.toml [[vowel]]');
  const out: VowelRule[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const where = `symbols.toml [[vowel]] #${i + 1}`;
    const row = requireTable(rows[i], where);
    rejectUnknownKeys(row, ['roman', 'independent', 'matra', 'w'], where);

    const roman = readRomanKey(row, where);
    const independent = requireString(row, 'independent', `${where} (${roman})`);
    const matra = requireString(row, 'matra', `${where} (${roman})`, { allowEmpty: true });

    if (independent.length === 0) {
      throw new Error(`${where} (${roman}): 'independent' must not be empty`);
    }
    assertCanonical(independent, `${where} (${roman}) independent`);
    assertCanonical(matra, `${where} (${roman}) matra`);

    out.push({
      kind: 'vowel',
      roman,
      independent,
      matra,
      weight: readWeight(row, 'w', `${where} (${roman})`),
    });
  }

  if (out.length === 0) throw new Error('symbols.toml declares no vowels');
  return out;
}

function readConsonants(raw: unknown): ConsonantRule[] {
  const rows = requireArray(raw, 'symbols.toml [[consonant]]');
  const out: ConsonantRule[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const where = `symbols.toml [[consonant]] #${i + 1}`;
    const row = requireTable(rows[i], where);
    rejectUnknownKeys(row, ['roman', 'odia'], where);

    const roman = readRomanKey(row, where);
    const label = `${where} (${roman})`;
    const options = requireArray(row['odia'], `${label} odia`);
    if (options.length === 0) throw new Error(`${label}: 'odia' must list at least one option`);

    const parsed: PositionedOption[] = options.map((option, j) => {
      const optionWhere = `${label} odia[${j}]`;
      const table = requireTable(option, optionWhere);
      rejectUnknownKeys(table, ['text', 'w', 'context'], optionWhere);

      const text = requireString(table, 'text', optionWhere);
      if (text.length === 0) throw new Error(`${optionWhere}: 'text' must not be empty`);
      assertCanonical(text, optionWhere);

      return {
        text,
        weight: readWeight(table, 'w', optionWhere),
        context: readContext(table, optionWhere, POSITION_CONTEXTS) as PositionContext,
      };
    });

    out.push({ kind: 'consonant', roman, options: parsed });
  }

  if (out.length === 0) throw new Error('symbols.toml declares no consonants');
  return out;
}

function readSigns(raw: unknown): SignRule[] {
  if (raw === undefined) return [];
  const rows = requireArray(raw, 'symbols.toml [[sign]]');
  const out: SignRule[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const where = `symbols.toml [[sign]] #${i + 1}`;
    const row = requireTable(rows[i], where);
    rejectUnknownKeys(row, ['roman', 'odia'], where);

    const roman = readRomanKey(row, where);
    const label = `${where} (${roman})`;
    const options = requireArray(row['odia'], `${label} odia`);
    if (options.length === 0) throw new Error(`${label}: 'odia' must list at least one option`);

    const parsed: SignOption[] = options.map((option, j) => {
      const optionWhere = `${label} odia[${j}]`;
      const table = requireTable(option, optionWhere);
      rejectUnknownKeys(table, ['text', 'w', 'context'], optionWhere);

      const text = requireString(table, 'text', optionWhere);
      if (text.length === 0) throw new Error(`${optionWhere}: 'text' must not be empty`);
      assertCanonical(text, optionWhere);

      return {
        text,
        weight: readWeight(table, 'w', optionWhere),
        context: readContext(table, optionWhere, SIGN_CONTEXTS) as SignContext,
      };
    });

    out.push({ kind: 'sign', roman, options: parsed });
  }

  return out;
}

function readDigits(raw: unknown): string[] {
  const table = requireTable(raw, 'symbols.toml [digits]');
  rejectUnknownKeys(table, ['odia'], 'symbols.toml [digits]');

  const values = requireArray(table['odia'], 'symbols.toml [digits] odia');
  if (values.length !== 10) {
    throw new Error(`symbols.toml [digits] odia must list exactly 10 digits, found ${values.length}`);
  }

  return values.map((value, i) => {
    const where = `symbols.toml [digits] odia[${i}]`;
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${where} must be a non-empty string`);
    }
    assertCanonical(value, where);
    return value;
  });
}

function readSegmentWeights(raw: unknown): SegmentWeights {
  const table = requireTable(raw, 'symbols.toml [segment]');
  rejectUnknownKeys(table, ['hiatus', 'digraph_split'], 'symbols.toml [segment]');
  return {
    hiatus: readWeight(table, 'hiatus', 'symbols.toml [segment]'),
    digraphSplit: readWeight(table, 'digraph_split', 'symbols.toml [segment]'),
  };
}

function readWeights(raw: unknown): RankWeights {
  const table = requireTable(raw, 'symbols.toml [weights]');
  rejectUnknownKeys(table, ['rule', 'freq', 'user', 'pref', 'bigram'], 'symbols.toml [weights]');
  return {
    rule: readWeight(table, 'rule', 'symbols.toml [weights]'),
    freq: readWeight(table, 'freq', 'symbols.toml [weights]'),
    user: readWeight(table, 'user', 'symbols.toml [weights]'),
    pref: readWeight(table, 'pref', 'symbols.toml [weights]'),
    // Optional: a rule file written before context ranking existed loads and
    // scores exactly as before. A present but invalid value still throws.
    bigram: table['bigram'] === undefined ? 0 : readWeight(table, 'bigram', 'symbols.toml [weights]'),
  };
}

/**
 * Natural mode folds case before matching, so a key with a capital in it could
 * never fire. Rejecting it here is the difference between "my rule does
 * nothing" and a startup error naming the line.
 */
function readRomanKey(row: Record<string, unknown>, where: string): string {
  const roman = requireString(row, 'roman', where);
  if (!/^[a-z]+$/.test(roman)) {
    throw new Error(
      `${where}: roman key ${JSON.stringify(roman)} must be lowercase a-z ` +
        `(natural mode folds case; use itrans.toml for a case-sensitive table)`,
    );
  }
  return roman;
}

function readContext(
  table: Record<string, unknown>,
  where: string,
  allowed: readonly string[],
): string {
  const value = table['context'];
  if (value === undefined) return 'any';
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(
      `${where}: unknown context ${JSON.stringify(value)}; expected one of ${allowed.join(', ')}`,
    );
  }
  return value;
}

/* ------------------------------------------------------------------ *
 * itrans.toml -> StrictScheme
 * ------------------------------------------------------------------ */

/**
 * Compile the three itrans.toml tables into one flat longest-match map.
 *
 * The consonant x vowel product is generated here so that `strict.ts` can stay
 * a plain longest-match loop with no orthography state machine: "ki" is only
 * ever matched by the combined key, so the bare consonant key — which carries
 * the virama — is only reached when the virama actually belongs there.
 */
export function loadStrictScheme(itransToml: string, where: string): StrictScheme {
  const root = requireTable(parseToml(itransToml) as unknown, where);
  rejectUnknownKeys(root, ['meta', 'vowels', 'consonants', 'signs'], where);

  const meta = requireTable(root['meta'], `${where} [meta]`);
  const name = requireString(meta, 'name', `${where} [meta]`);
  if (name !== 'itrans') {
    throw new Error(`${where} [meta] name: only 'itrans' is supported, found ${JSON.stringify(name)}`);
  }

  const vowelTable = requireTable(root['vowels'], `${where} [vowels]`);
  const consonantTable = requireTable(root['consonants'], `${where} [consonants]`);
  const signTable = requireTable(root['signs'], `${where} [signs]`);

  const vowelForms: { key: string; independent: string; matra: string }[] = [];
  for (const [key, value] of Object.entries(vowelTable)) {
    const label = `${where} [vowels] ${key}`;
    const form = requireTable(value, label);
    rejectUnknownKeys(form, ['independent', 'matra'], label);
    const independent = requireString(form, 'independent', label);
    const matra = requireString(form, 'matra', label, { allowEmpty: true });
    assertCanonical(independent, `${label} independent`);
    assertCanonical(matra, `${label} matra`);
    vowelForms.push({ key, independent, matra });
  }

  const map = new Map<string, string>();
  const put = (key: string, value: string, label: string): void => {
    if (map.has(key)) {
      throw new Error(`${label}: key ${JSON.stringify(key)} is already defined in ${where}`);
    }
    map.set(key, value);
  };

  for (const vowel of vowelForms) {
    put(vowel.key, vowel.independent, `${where} [vowels] ${vowel.key}`);
  }

  for (const [key, value] of Object.entries(consonantTable)) {
    const label = `${where} [consonants] ${key}`;
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${label} must be a non-empty string`);
    }
    assertCanonical(value, label);

    put(key, canonical(value + VIRAMA), label);
    for (const vowel of vowelForms) {
      put(key + vowel.key, canonical(value + vowel.matra), `${label} + ${vowel.key}`);
    }
  }

  for (const [key, value] of Object.entries(signTable)) {
    const label = `${where} [signs] ${key}`;
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${label} must be a non-empty string`);
    }
    assertCanonical(value, label);
    put(key, value, label);
  }

  let maxKeyLength = 0;
  for (const key of map.keys()) {
    if (key.length > maxKeyLength) maxKeyLength = key.length;
  }

  return { name: 'itrans', map, maxKeyLength };
}

/* ------------------------------------------------------------------ *
 * Small TOML validation helpers
 * ------------------------------------------------------------------ */

function requireTable(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected a table, found ${describe(value)}`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${where}: expected an array, found ${describe(value)}`);
  }
  return value;
}

function requireString(
  table: Record<string, unknown>,
  key: string,
  where: string,
  opts?: { allowEmpty?: boolean },
): string {
  const value = table[key];
  if (typeof value !== 'string') {
    throw new Error(`${where}: '${key}' must be a string, found ${describe(value)}`);
  }
  if (value.length === 0 && opts?.allowEmpty !== true) {
    throw new Error(`${where}: '${key}' must not be empty`);
  }
  return value;
}

function readWeight(table: Record<string, unknown>, key: string, where: string): number {
  const value = table[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${where}: '${key}' must be a finite number >= 0, found ${describe(value)}`);
  }
  return value;
}

function rejectUnknownKeys(
  table: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
): void {
  for (const key of Object.keys(table)) {
    if (!allowed.includes(key)) {
      throw new Error(`${where}: unknown key '${key}'; expected one of ${allowed.join(', ')}`);
    }
  }
}

function describe(value: unknown): string {
  if (value === undefined) return 'nothing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `${typeof value} ${JSON.stringify(value)}`;
}
