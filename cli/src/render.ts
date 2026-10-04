/**
 * Terminal rendering for the CLI.
 *
 * One layout rule holds throughout: every padded ASCII column comes *before*
 * any Odia text on a line, and Odia is always last. Conjuncts and combining
 * marks have no reliable display width in a terminal, so padding a column that
 * sits after an Odia string mangles the alignment of everything to its right.
 */

import { codepoints, splitClusters } from '@odia/core/normalize';
import type { Result } from '@odia/core/types';

/** U+0B5C, the forbidden precomposed RRA. */
const CP_PRECOMPOSED_DDA_NUKTA = 0x0b5c;

/** U+0B5D, the forbidden precomposed RHA. */
const CP_PRECOMPOSED_DDHA_NUKTA = 0x0b5d;

const VIOLATION = '  <- PRECOMPOSED NUKTA, INVARIANT VIOLATED';

/**
 * True when a string contains a precomposed nukta letter, i.e. the invariant
 * has been broken somewhere upstream.
 *
 * Tested by numeric code point rather than against a string literal on
 * purpose: a literal in this file would itself be rewritten by any tool that
 * NFC-normalises the source, which is exactly the failure being detected.
 */
function hasPrecomposedNukta(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp === CP_PRECOMPOSED_DDA_NUKTA || cp === CP_PRECOMPOSED_DDHA_NUKTA) return true;
  }
  return false;
}

/**
 * A string's code points, with two spaces between cursor-safe clusters:
 *
 *     U+0B13  U+0B21 U+0B3C U+0B3F  U+0B36
 *
 * Grouping costs nothing and shows which base a nukta or matra attached to,
 * which is the question being asked whenever anyone runs `--codepoints`.
 */
export function codepointLine(text: string): string {
  return splitClusters(text).map(codepoints).join('  ');
}

/** `codepointLine` plus the violation marker, for a single standalone string. */
export function renderCodepoints(text: string): string {
  return codepointLine(text) + (hasPrecomposedNukta(text) ? VIOLATION : '');
}

/**
 * The top-1 line, then one block per word listing its candidates with source
 * and score.
 *
 * Every candidate the engine returned is shown. `topk` was already applied by
 * the engine, and it appends the verbatim Latin token *past* that limit — so
 * truncating again here would hide exactly the candidate you need when typing
 * "PCR" or "Bayesian", and would disagree with what --json prints.
 *
 * `withCodepoints` adds a code-point column rather than a separate section, so
 * that *every* candidate can be checked by eye and not just the winner. The
 * correct and the forbidden nukta spellings are visually identical, so this
 * column is the only thing on screen that can tell them apart.
 */
export function renderResult(result: Result, withCodepoints = false): string {
  const lines: string[] = [result.text];

  // Column widths are computed across the whole result, not per word: the
  // blocks sit directly under each other, so per-block widths read as ragged.
  const allShown = result.words.flatMap((w) => w.candidates);
  const sourceWidth = Math.max(0, ...allShown.map((c) => c.source.length));
  const cpWidth = withCodepoints
    ? Math.max(0, ...allShown.map((c) => codepointLine(c.text).length))
    : 0;

  for (const word of result.words) {
    lines.push('', word.roman);

    if (word.candidates.length === 0) {
      lines.push('    (no candidates)');
      continue;
    }

    word.candidates.forEach((candidate, i) => {
      const rank = String(i + 1).padStart(3);
      const source = candidate.source.padEnd(sourceWidth);
      const score = candidate.score.toFixed(2).padStart(8);
      const cp = withCodepoints ? `  ${codepointLine(candidate.text).padEnd(cpWidth)}` : '';
      const flag = hasPrecomposedNukta(candidate.text) ? VIOLATION : '';
      lines.push(`${rank}  ${source}  ${score}${cp}  ${candidate.text}${flag}`);
    });
  }

  return lines.join('\n');
}
