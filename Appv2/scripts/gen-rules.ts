/**
 * The delta compiler.
 *
 * Appv2 needs its own rule tables, but a standalone copy of symbols.toml would
 * duplicate 537 lines and drift the moment anybody tunes a weight in core. So
 * the Sanskrit profiles are expressed as a DELTA against the base, and this
 * script applies it:
 *
 *     core/rules/symbols.toml                  (read-only, never written)
 *   + Appv2/rules/sanskrit.delta.toml          (hand-edited)
 *   = Appv2/rules/sanskrit.toml                (generated, committed)
 *
 * Usage, from the repo root:
 *     npx tsx Appv2/scripts/gen-rules.ts            regenerate both profiles
 *     npx tsx Appv2/scripts/gen-rules.ts --check    exit 1 if either is stale
 *
 * ---------------------------------------------------------------------------
 * Why a line-oriented rewrite rather than re-emitting a parsed AST
 *
 * symbols.toml's comments are the project's record of WHY each weight is what
 * it is — the hiatus and digraph_split paragraphs, the ଯ/ୟ note, the ଡ଼
 * positional reasoning, the "ny/gy/ng are deliberately NOT keys" block. Parsing
 * with smol-toml and re-emitting would silently discard every one of them.
 *
 * So the base text is edited in place: only the byte span of the specific
 * `odia = [...]` array (or scalar line) being changed is rewritten, and the
 * comment above it survives untouched. The practical payoff is that
 *
 *     git diff --no-index core/rules/symbols.toml Appv2/rules/sanskrit.toml
 *
 * is a short, reviewable artefact instead of a whole-file rewrite.
 *
 * ---------------------------------------------------------------------------
 * Three guards, in order of how much they matter
 *
 * 1. FINAL GATE. Before writing anything, the generated string is fed to core's
 *    own `loadRules()`. If core's validator would reject it, nothing is written
 *    and the error propagates verbatim. Appv2 cannot ship a rule file that the
 *    engine would refuse at startup.
 *
 * 2. DRIFT GATE. `--check` regenerates into memory and byte-compares. Output is
 *    deterministic — there is deliberately NO timestamp in the header, because
 *    a timestamp would make every check fail. Appv2/eval/run.ts calls --check
 *    first, so no metric can be reported against a stale rule file.
 *
 * 3. WRITE FENCE. Every output path is resolved and rejected unless it sits
 *    inside Appv2/. The whole point of Appv2 is that no existing file changes.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseToml } from 'smol-toml';

import { assertCanonical } from '../../core/src/normalize.js';
import { loadRules } from '../../core/src/rules.js';

const APPV2_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPO_ROOT = resolve(APPV2_DIR, '..');
const BASE_PATH = resolve(REPO_ROOT, 'core/rules/symbols.toml');
const ITRANS_PATH = resolve(REPO_ROOT, 'core/rules/itrans.toml');

/** Each entry is one generated profile. */
const PROFILES: readonly { delta: string; out: string }[] = [
  { delta: 'rules/sanskrit.delta.toml', out: 'rules/sanskrit.toml' },
  { delta: 'rules/unified.delta.toml', out: 'rules/unified.toml' },
];

/* ------------------------------------------------------------------ *
 * Delta model
 * ------------------------------------------------------------------ */

type Kind = 'vowel' | 'consonant' | 'sign';
type Op = 'add' | 'merge' | 'replace' | 'drop';

const KINDS: readonly Kind[] = ['vowel', 'consonant', 'sign'];
const OPS: readonly Op[] = ['add', 'merge', 'replace', 'drop'];

interface OptionSpec {
  text: string;
  w: number;
  context?: string;
}

interface Block {
  id: string;
  kind: Kind;
  op: Op;
  roman: string;
  /** consonant/sign: the options. */
  odia?: OptionSpec[];
  /** vowel only. */
  independent?: string;
  matra?: string;
  w?: number;
  /** drop only: which option to remove. */
  text?: string;
  context?: string;
  /** Free-text, carried into the generated file above an `add`ed block. */
  note?: string;
}

interface Delta {
  profile: string;
  note?: string;
  blocks: Block[];
  /** Dotted scalar overrides, e.g. "weights.freq" -> 2.2 */
  set: Map<string, number>;
}

/* ------------------------------------------------------------------ *
 * Delta parsing
 * ------------------------------------------------------------------ */

function parseDelta(path: string, seen: Set<string> = new Set()): Delta {
  const absolute = resolve(APPV2_DIR, path);
  if (seen.has(absolute)) {
    throw new Error(`${path}: circular [meta] extends chain`);
  }
  seen.add(absolute);

  const text = readFileSync(absolute, 'utf8');
  const root = asTable(parseToml(text) as unknown, path);

  const allowedRoot = ['meta', 'set', ...KINDS];
  for (const key of Object.keys(root)) {
    if (!allowedRoot.includes(key)) {
      throw new Error(`${path}: unknown top-level key '${key}'; expected one of ${allowedRoot.join(', ')}`);
    }
  }

  const meta = asTable(root['meta'], `${path} [meta]`);
  const profile = requireString(meta, 'profile', `${path} [meta]`);
  const note = typeof meta['note'] === 'string' ? meta['note'] : undefined;

  // A profile may extend another so the two cannot diverge on shared items.
  // Semantics: start from the parent's blocks, remove every id named in
  // `exclude`, then let each of this file's blocks REPLACE the parent block
  // with the same id (or append if the id is new). That is what lets
  // unified.delta re-weight S1/S2/S3 without restating S4-S8.
  let blocks: Block[] = [];
  const extendsName = meta['extends'];
  if (extendsName !== undefined) {
    if (typeof extendsName !== 'string') {
      throw new Error(`${path} [meta] extends: must be a string`);
    }
    const parent = parseDelta(`rules/${extendsName}`, seen);
    blocks = parent.blocks;
  }

  const exclude = new Set<string>();
  if (meta['exclude'] !== undefined) {
    const list = meta['exclude'];
    if (!Array.isArray(list)) throw new Error(`${path} [meta] exclude: must be an array of ids`);
    for (const id of list) {
      if (typeof id !== 'string') throw new Error(`${path} [meta] exclude: ids must be strings`);
      exclude.add(id);
    }
  }
  if (exclude.size > 0 && extendsName === undefined) {
    throw new Error(`${path} [meta] exclude: only meaningful together with 'extends'`);
  }
  const parentIds = new Set(blocks.map((b) => b.id));
  for (const id of exclude) {
    if (!parentIds.has(id)) {
      throw new Error(`${path} [meta] exclude: no block with id '${id}' in ${String(extendsName)}`);
    }
  }
  blocks = blocks.filter((b) => !exclude.has(b.id));

  // This file's own blocks.
  const own: Block[] = [];
  for (const kind of KINDS) {
    const table = root[kind];
    if (table === undefined) continue;
    const opTable = asTable(table, `${path} [${kind}]`);
    for (const op of Object.keys(opTable)) {
      if (!OPS.includes(op as Op)) {
        throw new Error(`${path} [[${kind}.${op}]]: unknown op; expected one of ${OPS.join(', ')}`);
      }
      const rows = opTable[op];
      if (!Array.isArray(rows)) {
        throw new Error(`${path} [[${kind}.${op}]]: expected an array of tables`);
      }
      rows.forEach((row, i) => {
        own.push(readBlock(row, kind, op as Op, `${path} [[${kind}.${op}]] #${i + 1}`));
      });
    }
  }

  const ownIds = new Set<string>();
  for (const block of own) {
    if (ownIds.has(block.id)) throw new Error(`${path}: duplicate block id '${block.id}'`);
    ownIds.add(block.id);
  }

  for (const block of own) {
    const at = blocks.findIndex((b) => b.id === block.id);
    if (at >= 0) blocks[at] = block;
    else blocks.push(block);
  }

  const set = new Map<string, number>();
  if (root['set'] !== undefined) {
    const table = asTable(root['set'], `${path} [set]`);
    for (const [dotted, value] of Object.entries(table)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${path} [set] "${dotted}": must be a finite number`);
      }
      set.set(dotted, value);
    }
  }

  return { profile, note, blocks, set };
}

function readBlock(raw: unknown, kind: Kind, op: Op, where: string): Block {
  const row = asTable(raw, where);

  const allowed =
    kind === 'vowel'
      ? ['id', 'roman', 'independent', 'matra', 'w', 'note']
      : op === 'drop'
        ? ['id', 'roman', 'text', 'context', 'note']
        : ['id', 'roman', 'odia', 'note'];
  for (const key of Object.keys(row)) {
    if (!allowed.includes(key)) {
      throw new Error(`${where}: unknown key '${key}'; expected one of ${allowed.join(', ')}`);
    }
  }

  const id = requireString(row, 'id', where);
  const roman = requireString(row, 'roman', where);
  // Caught here rather than in loadRules, so the error names the delta line.
  if (!/^[a-z]+$/.test(roman)) {
    throw new Error(`${where} (${id}): roman key ${JSON.stringify(roman)} must be lowercase a-z`);
  }
  const note = typeof row['note'] === 'string' ? row['note'] : undefined;
  const block: Block = { id, kind, op, roman, note };

  if (kind === 'vowel') {
    if (op === 'merge' || op === 'drop') {
      throw new Error(
        `${where} (${id}): a vowel has no options array, so '${op}' is meaningless; use 'add' or 'replace'`,
      );
    }
    block.independent = requireString(row, 'independent', `${where} (${id})`);
    block.matra = requireString(row, 'matra', `${where} (${id})`, { allowEmpty: true });
    block.w = requireWeight(row, 'w', `${where} (${id})`);
    assertCanonical(block.independent, `${where} (${id}) independent`);
    assertCanonical(block.matra, `${where} (${id}) matra`);
    return block;
  }

  if (op === 'drop') {
    block.text = requireString(row, 'text', `${where} (${id})`);
    assertCanonical(block.text, `${where} (${id}) text`);
    block.context = typeof row['context'] === 'string' ? row['context'] : 'any';
    return block;
  }

  const options = row['odia'];
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error(`${where} (${id}): 'odia' must list at least one option`);
  }
  block.odia = options.map((option, j) => {
    const optionWhere = `${where} (${id}) odia[${j}]`;
    const table = asTable(option, optionWhere);
    for (const key of Object.keys(table)) {
      if (!['text', 'w', 'context'].includes(key)) {
        throw new Error(`${optionWhere}: unknown key '${key}'`);
      }
    }
    const text = requireString(table, 'text', optionWhere);
    assertCanonical(text, optionWhere);
    const spec: OptionSpec = { text, w: requireWeight(table, 'w', optionWhere) };
    if (table['context'] !== undefined) {
      if (typeof table['context'] !== 'string') {
        throw new Error(`${optionWhere}: 'context' must be a string`);
      }
      spec.context = table['context'];
    }
    return spec;
  });

  return block;
}

/* ------------------------------------------------------------------ *
 * Locating blocks in the base TEXT
 * ------------------------------------------------------------------ */

interface Span {
  kind: Kind;
  /** 0-based index among blocks of this kind, matching the parse order. */
  ordinal: number;
  start: number;
  end: number;
}

const ARRAY_HEADER = /^\[\[(vowel|consonant|sign)\]\]$/;
const TABLE_HEADER = /^\[[A-Za-z_][A-Za-z0-9_.-]*\]$/;

/**
 * Byte spans of every `[[vowel]]` / `[[consonant]]` / `[[sign]]` block.
 *
 * A block runs from its own header line to just before the next header of any
 * kind (or EOF), so the trailing blank line and any comment that belongs to the
 * NEXT block are handled by the caller inserting before `start`.
 *
 * The nth span of a kind corresponds to the nth element of that array in the
 * smol-toml parse: TOML array-of-tables order is preserved by any conformant
 * parser, and that correspondence is what lets us look a block's roman key up
 * from the parse and then edit the text.
 */
function findSpans(text: string): Span[] {
  const spans: Span[] = [];
  const counts: Record<Kind, number> = { vowel: 0, consonant: 0, sign: 0 };

  let offset = 0;
  let open: Span | undefined;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const arrayMatch = ARRAY_HEADER.exec(trimmed);
    const isHeader = arrayMatch !== null || TABLE_HEADER.test(trimmed);

    if (isHeader) {
      if (open !== undefined) {
        open.end = offset;
        spans.push(open);
        open = undefined;
      }
      if (arrayMatch !== null) {
        const kind = arrayMatch[1] as Kind;
        open = { kind, ordinal: counts[kind], start: offset, end: text.length };
        counts[kind] += 1;
      }
    }
    offset += line.length + 1; // +1 for the '\n' that split() removed
  }

  if (open !== undefined) {
    open.end = text.length;
    spans.push(open);
  }
  return spans;
}

/**
 * The `odia = [ ... ]` assignment inside one block.
 *
 * `start` is the beginning of the `odia` key, not of the `[` — the whole
 * assignment is replaced on rewrite, because formatOdiaArray() emits the key
 * too. `arrayStart` is the `[`, which is what re-parsing the existing options
 * needs. `end` is one past the closing `]`.
 */
function findOdiaArray(
  text: string,
  block: Span,
): { start: number; arrayStart: number; end: number } | undefined {
  const body = text.slice(block.start, block.end);
  const match = /^[ \t]*odia[ \t]*=[ \t]*/m.exec(body);
  if (match === null) return undefined;

  const keyStart = block.start + match.index + (match[0].length - match[0].trimStart().length);
  const openIdx = block.start + match.index + match[0].length;
  if (text[openIdx] !== '[') return undefined;
  return { start: keyStart, arrayStart: openIdx, end: matchBracket(text, openIdx) + 1 };
}

/**
 * Index of the `]` closing the `[` at `openIdx`, skipping bracket characters
 * that sit inside a TOML string. Nesting is counted because an option array
 * holds inline tables, and a future one could hold a nested array.
 */
function matchBracket(text: string, openIdx: number): number {
  let depth = 0;
  let quote: string | undefined;

  for (let i = openIdx; i < text.length; i += 1) {
    const ch = text[i];
    if (quote !== undefined) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? text.length : nl;
    } else if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('unterminated array in symbols.toml — the base file is malformed');
}

/** The span of a `key = value` scalar line inside a block or table. */
function findScalarLine(
  text: string,
  from: number,
  to: number,
  key: string,
): { start: number; end: number } | undefined {
  const body = text.slice(from, to);
  const match = new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*[^\\n]*$`, 'm').exec(body);
  if (match === null) return undefined;
  return { start: from + match.index, end: from + match.index + match[0].length };
}

/** The span of a `[table]` section, header line through to the next header. */
function findTable(text: string, name: string): { start: number; end: number } | undefined {
  let offset = 0;
  let start = -1;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (start >= 0 && (ARRAY_HEADER.test(trimmed) || TABLE_HEADER.test(trimmed))) {
      return { start, end: offset };
    }
    if (trimmed === `[${name}]`) start = offset;
    offset += line.length + 1;
  }
  return start >= 0 ? { start, end: text.length } : undefined;
}

/* ------------------------------------------------------------------ *
 * Emission
 * ------------------------------------------------------------------ */

const NUKTA = '଼';

/**
 * A TOML basic string.
 *
 * Anything carrying a nukta is written as \u escapes, matching the convention
 * in symbols.toml: ଡ଼ (U+0B21 U+0B3C) and the forbidden precomposed U+0B5C are
 * visually identical, so a nukta-bearing literal cannot be reviewed by eye.
 * Everything else is emitted literally, because a wall of escapes would make
 * the generated file unreadable for no safety gain.
 */
function tomlString(value: string): string {
  if (!value.includes(NUKTA)) return JSON.stringify(value);
  let out = '"';
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    out += `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return `${out}"`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function formatOption(option: OptionSpec): string {
  const parts = [`text = ${tomlString(option.text)}`, `w = ${formatNumber(option.w)}`];
  if (option.context !== undefined && option.context !== 'any') {
    parts.push(`context = ${JSON.stringify(option.context)}`);
  }
  return `{ ${parts.join(', ')} }`;
}

function formatOdiaArray(options: readonly OptionSpec[], marker: string): string {
  if (options.length === 1) {
    return `odia = [${formatOption(options[0])}]  ${marker}`;
  }
  const rows = options.map((option) => `  ${formatOption(option)},`).join('\n');
  return `odia = [  ${marker}\n${rows}\n]`;
}

function formatVowelBlock(block: Block, marker: string): string {
  return [
    '[[vowel]]',
    `roman = ${JSON.stringify(block.roman)}`,
    `independent = ${tomlString(block.independent ?? '')}`,
    `matra = ${tomlString(block.matra ?? '')}`,
    `w = ${formatNumber(block.w ?? 0)}  ${marker}`,
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * The compiler
 * ------------------------------------------------------------------ */

interface BaseIndex {
  /** `${kind}:${roman}` -> the span of that block. */
  byKey: Map<string, Span>;
  /** Keys declared by more than one block of the same kind. */
  ambiguous: Set<string>;
  spans: Span[];
}

function indexBase(text: string): BaseIndex {
  const parsed = asTable(parseToml(text) as unknown, 'symbols.toml');
  const spans = findSpans(text);
  const byKey = new Map<string, Span>();
  const ambiguous = new Set<string>();

  for (const kind of KINDS) {
    const rows = parsed[kind];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) throw new Error(`symbols.toml [[${kind}]]: expected an array`);

    const kindSpans = spans.filter((s) => s.kind === kind);
    if (kindSpans.length !== rows.length) {
      throw new Error(
        `symbols.toml: found ${kindSpans.length} [[${kind}]] headers in the text but ` +
          `${rows.length} in the parse — the block scanner and the parser disagree`,
      );
    }
    rows.forEach((row, i) => {
      const roman = (row as Record<string, unknown>)['roman'];
      if (typeof roman !== 'string') return;
      const key = `${kind}:${roman}`;
      // A roman key legitimately repeats within a kind: symbols.toml declares
      // [[vowel]] "a" twice (ଅ at w=1.0, ଆ/ା at w=0.35), and likewise ee/i/oo/u.
      // Editing "the block for a" is therefore ambiguous, so rather than
      // silently picking the first, targeting such a key is an error.
      if (byKey.has(key)) ambiguous.add(key);
      else byKey.set(key, kindSpans[i]);
    });
  }

  return { byKey, ambiguous, spans };
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

function compile(baseText: string, delta: Delta, deltaName: string): string {
  const index = indexBase(baseText);
  const edits: Edit[] = [];
  const appended: string[] = [];

  for (const block of delta.blocks) {
    const marker = `# [${delta.profile} ${block.id}]`;
    const key = `${block.kind}:${block.roman}`;
    const span = index.byKey.get(key);
    const label = `${deltaName} ${block.id} ([[${block.kind}.${block.op}]] ${block.roman})`;

    if (index.ambiguous.has(key)) {
      throw new Error(
        `${label}: symbols.toml declares '${block.roman}' as a ${block.kind} more than once, ` +
          `so it is ambiguous which block this edits. Fold the base blocks together upstream, ` +
          `or address a different key.`,
      );
    }

    if (block.op === 'add') {
      if (span !== undefined) {
        throw new Error(
          `${label}: '${block.roman}' already exists in symbols.toml as a ${block.kind}; ` +
            `use .merge to append options or .replace to swap them`,
        );
      }
      const body =
        block.kind === 'vowel'
          ? formatVowelBlock(block, marker)
          : [
              `[[${block.kind}]]`,
              `roman = ${JSON.stringify(block.roman)}`,
              formatOdiaArray(block.odia ?? [], marker),
            ].join('\n');
      appended.push(block.note !== undefined ? `# ${block.note}\n${body}` : body);
      continue;
    }

    if (span === undefined) {
      throw new Error(
        `${label}: no ${block.kind} with roman key '${block.roman}' in symbols.toml; use .add`,
      );
    }

    if (block.kind === 'vowel') {
      // replace: rewrite the three scalar lines in place.
      for (const [field, value] of [
        ['independent', tomlString(block.independent ?? '')],
        ['matra', tomlString(block.matra ?? '')],
        ['w', `${formatNumber(block.w ?? 0)}  ${marker}`],
      ] as const) {
        const line = findScalarLine(baseText, span.start, span.end, field);
        if (line === undefined) {
          throw new Error(`${label}: no '${field} = ...' line found in the base block`);
        }
        edits.push({ start: line.start, end: line.end, text: `${field} = ${value}` });
      }
      continue;
    }

    const array = findOdiaArray(baseText, span);
    if (array === undefined) {
      throw new Error(`${label}: no 'odia = [...]' array found in the base block`);
    }
    const current = parseOptions(baseText.slice(array.arrayStart, array.end), label);

    let next: OptionSpec[];
    if (block.op === 'replace') {
      next = block.odia ?? [];
    } else if (block.op === 'merge') {
      next = [...current, ...(block.odia ?? [])];
    } else {
      // drop
      const before = current.length;
      next = current.filter(
        (o) => !(o.text === block.text && (o.context ?? 'any') === (block.context ?? 'any')),
      );
      const removed = before - next.length;
      if (removed !== 1) {
        throw new Error(
          `${label}: expected to drop exactly one option matching ` +
            `text=${JSON.stringify(block.text)} context=${JSON.stringify(block.context)}, ` +
            `matched ${removed}`,
        );
      }
      if (next.length === 0) {
        throw new Error(`${label}: dropping this option would leave 'odia' empty`);
      }
    }

    assertNoDuplicates(next, label);
    edits.push({ start: array.start, end: array.end, text: formatOdiaArray(next, marker) });
  }

  // [set] — dotted scalar overrides into [weights] / [segment].
  for (const [dotted, value] of delta.set) {
    const dot = dotted.indexOf('.');
    if (dot <= 0) {
      throw new Error(`${deltaName} [set] "${dotted}": expected a dotted path like "weights.freq"`);
    }
    const table = dotted.slice(0, dot);
    const field = dotted.slice(dot + 1);
    const tableSpan = findTable(baseText, table);
    if (tableSpan === undefined) {
      throw new Error(`${deltaName} [set] "${dotted}": symbols.toml has no [${table}] table`);
    }
    const line = findScalarLine(baseText, tableSpan.start, tableSpan.end, field);
    if (line === undefined) {
      throw new Error(`${deltaName} [set] "${dotted}": [${table}] has no '${field}' key`);
    }
    edits.push({
      start: line.start,
      end: line.end,
      text: `${field} = ${formatNumber(value)}  # [${delta.profile} set]`,
    });
  }

  // Apply back-to-front so earlier offsets stay valid.
  edits.sort((a, b) => b.start - a.start);
  for (let i = 1; i < edits.length; i += 1) {
    if (edits[i].end > edits[i - 1].start) {
      throw new Error(`${deltaName}: two deltas edit overlapping spans of symbols.toml`);
    }
  }

  let out = baseText;
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }

  if (appended.length > 0) {
    out = `${out.replace(/\s*$/, '')}\n\n\n${banner(delta)}\n\n${appended.join('\n\n')}\n`;
  }

  return header(delta, deltaName) + out;
}

function banner(delta: Delta): string {
  const rule = '='.repeat(75);
  return [
    `# ${rule}`,
    `# Added by the ${delta.profile} profile. See Appv2/rules/*.delta.toml.`,
    `# ${rule}`,
  ].join('\n');
}

function header(delta: Delta, deltaName: string): string {
  const lines = [
    '# GENERATED FILE - DO NOT EDIT.',
    '#',
    `# Edit ${deltaName} and regenerate:`,
    '#     npx tsx Appv2/scripts/gen-rules.ts',
    '#',
    `# profile      = ${delta.profile}`,
    '# base         = core/rules/symbols.toml',
    `# base-sha256  = ${sha256(readFileSync(BASE_PATH, 'utf8'))}`,
    `# delta        = ${deltaName}`,
    `# delta-sha256 = ${sha256(readFileSync(resolve(APPV2_DIR, deltaName), 'utf8'))}`,
    '#',
    '# There is deliberately no timestamp here: generation is deterministic, so',
    '# `gen-rules.ts --check` can be a plain byte comparison.',
  ];
  if (delta.note !== undefined) {
    // trimEnd on each line: a TOML multi-line string keeps its final newline,
    // which would otherwise emit a "# " line with trailing whitespace.
    lines.push('#', ...delta.note.trimEnd().split('\n').map((l) => `# ${l}`.trimEnd()));
  }
  return `${lines.join('\n')}\n\n`;
}

/**
 * Re-read the options already in the base so `merge` and `drop` can reason
 * about them. Parsed as a one-key TOML document rather than by regex, so the
 * base's own escaping and formatting are honoured exactly.
 */
function parseOptions(arrayText: string, label: string): OptionSpec[] {
  const parsed = parseToml(`odia = ${arrayText}`) as Record<string, unknown>;
  const rows = parsed['odia'];
  if (!Array.isArray(rows)) throw new Error(`${label}: could not re-parse the base 'odia' array`);
  return rows.map((row) => {
    const table = asTable(row, label);
    const spec: OptionSpec = {
      text: String(table['text']),
      w: Number(table['w']),
    };
    if (typeof table['context'] === 'string') spec.context = table['context'];
    return spec;
  });
}

function assertNoDuplicates(options: readonly OptionSpec[], label: string): void {
  const seen = new Set<string>();
  for (const option of options) {
    const key = `${option.text} ${option.context ?? 'any'}`;
    if (seen.has(key)) {
      throw new Error(
        `${label}: duplicate option after merge — text=${JSON.stringify(option.text)} ` +
          `context=${JSON.stringify(option.context ?? 'any')}. Use .replace instead of .merge.`,
      );
    }
    seen.add(key);
  }
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function asTable(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected a table`);
  }
  return value as Record<string, unknown>;
}

function requireString(
  table: Record<string, unknown>,
  key: string,
  where: string,
  opts?: { allowEmpty?: boolean },
): string {
  const value = table[key];
  if (typeof value !== 'string') throw new Error(`${where}: '${key}' must be a string`);
  if (value.length === 0 && opts?.allowEmpty !== true) {
    throw new Error(`${where}: '${key}' must not be empty`);
  }
  return value;
}

function requireWeight(table: Record<string, unknown>, key: string, where: string): number {
  const value = table[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${where}: '${key}' must be a finite number >= 0`);
  }
  return value;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The write fence. Appv2 exists precisely so that nothing else changes. */
function fenced(relativePath: string): string {
  const absolute = resolve(APPV2_DIR, relativePath);
  if (absolute !== APPV2_DIR && !absolute.startsWith(`${APPV2_DIR}/`)) {
    throw new Error(`refusing to write outside Appv2/: ${absolute}`);
  }
  return absolute;
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

function main(): void {
  const check = process.argv.includes('--check');
  const baseText = readFileSync(BASE_PATH, 'utf8');
  const itransText = readFileSync(ITRANS_PATH, 'utf8');

  let stale = 0;

  for (const { delta: deltaName, out: outName } of PROFILES) {
    const delta = parseDelta(deltaName);
    const generated = compile(baseText, delta, deltaName);

    // THE FINAL GATE. If core's own validator would reject this, we do not
    // write it. The error text is core's, verbatim, so it names the offending
    // entry the same way a startup failure would.
    try {
      loadRules(generated, itransText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${outName} would be rejected by core's loadRules() and was NOT written:\n  ${message}`,
      );
    }

    const outPath = fenced(outName);
    const existing = readIfPresent(outPath);

    if (check) {
      if (existing !== generated) {
        stale += 1;
        console.error(
          existing === undefined
            ? `STALE  ${outName} does not exist`
            : `STALE  ${outName} differs from ${deltaName} + core/rules/symbols.toml`,
        );
      } else {
        console.log(`ok     ${outName}`);
      }
      continue;
    }

    if (existing === generated) {
      console.log(`ok     ${outName} (unchanged)`);
    } else {
      writeFileSync(outPath, generated, 'utf8');
      console.log(
        `wrote  ${relative(REPO_ROOT, outPath)}  ` +
          `(${delta.blocks.length} blocks, ${delta.set.size} scalar overrides)`,
      );
    }
  }

  if (check && stale > 0) {
    console.error(
      `\n${stale} generated rule file(s) out of date. Run:\n` +
        '    npx tsx Appv2/scripts/gen-rules.ts\n',
    );
    process.exit(1);
  }
}

function readIfPresent(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

main();
