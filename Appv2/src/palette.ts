/**
 * The insert palette: rare marks, reachable by tapping rather than by typing.
 *
 * Loaded from Appv2/rules/palette.toml so that adding a mark is a data change,
 * matching the project's rule that linguistic content lives in TOML and never
 * in TypeScript.
 *
 * Browser-safe: no node: imports, and the TOML arrives as a string exactly the
 * way `loadRules` takes rule files.
 */

import { parse as parseToml } from 'smol-toml';

import { canonical, codepoints } from '@odia/core/normalize';

/** U+25CC, the standard base for showing a combining mark on its own. */
export const DOTTED_CIRCLE = '◌';

export interface PaletteEntry {
  /** Canonical text inserted at the caret. */
  text: string;
  /** Human name, e.g. "avagraha (elision)". */
  label: string;
  /** How to type it instead, or "" when there is no keystroke. */
  roman: string;
  /** Render on a dotted circle — the mark does not stand alone. */
  combining: boolean;
}

export interface PaletteGroup {
  name: string;
  hint: string;
  entries: PaletteEntry[];
}

/**
 * Parse and validate palette.toml.
 *
 * Validation is loud for the same reason core/src/rules.ts is loud: a palette
 * button that silently inserts a non-canonical string would poison the lexicon
 * through `learn()`, and the damage would surface months later as a word that
 * stopped matching.
 */
export function loadPalette(paletteToml: string): PaletteGroup[] {
  const root = parseToml(paletteToml) as Record<string, unknown>;
  const groups = root['group'];
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error('palette.toml declares no [[group]]');
  }

  const seen = new Set<string>();

  return groups.map((raw, g) => {
    const where = `palette.toml [[group]] #${g + 1}`;
    const group = asTable(raw, where);
    const name = requireString(group, 'name', where);
    const hint = typeof group['hint'] === 'string' ? group['hint'] : '';

    const rows = group['entries'];
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`${where} (${name}): 'entries' must list at least one mark`);
    }

    const entries = rows.map((row, e) => {
      const entryWhere = `${where} (${name}) entries[${e}]`;
      const table = asTable(row, entryWhere);

      const text = requireString(table, 'text', entryWhere);
      // Not assertCanonical: this file also carries Devanagari-block marks
      // (danda, the Vedic accents), which are legitimately outside the Odia
      // range that core's helper is phrased around. The property that matters
      // is the same one though — what we insert must survive an NFC pass
      // unchanged, or a lexicon keyed on it stops matching.
      if (canonical(text) !== text) {
        throw new Error(
          `${entryWhere}: ${JSON.stringify(text)} is not canonical.\n` +
            `  found:  ${codepoints(text)}\n` +
            `  wanted: ${codepoints(canonical(text))}`,
        );
      }
      if (seen.has(text)) {
        throw new Error(`${entryWhere}: ${codepoints(text)} already appears in the palette`);
      }
      seen.add(text);

      return {
        text,
        label: requireString(table, 'label', entryWhere),
        roman: typeof table['roman'] === 'string' ? table['roman'] : '',
        combining: table['combining'] === true,
      };
    });

    return { name, hint, entries };
  });
}

/** What the button shows. Combining marks get a base so they have somewhere to sit. */
export function displayText(entry: PaletteEntry): string {
  return entry.combining ? DOTTED_CIRCLE + entry.text : entry.text;
}

/** Tooltip line: what it is, how else to type it, and the code points. */
export function describeEntry(entry: PaletteEntry): string {
  const how = entry.roman === '' ? '' : `  (type ${entry.roman})`;
  return `${entry.label}${how}  ${codepoints(entry.text)}`;
}

/* ------------------------------------------------------------------ *
 * Local validation helpers — deliberately not shared with gen-rules.ts,
 * which runs under node and may not be bundled alongside this.
 * ------------------------------------------------------------------ */

function asTable(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected a table`);
  }
  return value as Record<string, unknown>;
}

function requireString(table: Record<string, unknown>, key: string, where: string): string {
  const value = table[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${where}: '${key}' must be a non-empty string`);
  }
  return value;
}
