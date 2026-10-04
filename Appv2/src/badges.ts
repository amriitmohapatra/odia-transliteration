/**
 * Text badges for flagged words: "offensive" and "can be rude"
 * (plan/design/v1-ux-proposal.md 3.6). Text, not colour alone.
 *
 * The ONLY source of a flag is the engine: `engine.labelsOf(word)`, which
 * reads the owner-curated core/data/labels.tsv. The UI keeps no word list of
 * its own, ever. Today labels.tsv is empty, so no badge shows; the path is
 * tested with a fixture in Appv2/test/badges.test.ts.
 *
 * Pure: no DOM. main.ts and inline.ts render the badge.
 */

export type BadgeKind = 'danger' | 'warn';

export interface Badge {
  text: string;
  kind: BadgeKind;
}

/** The slice of the engine this needs (optional: the degraded engine has none). */
export interface LabelSource {
  labelsOf?(word: string): ReadonlySet<string> | undefined;
}

/** The badge for an Odia word, or undefined when it carries no flag. */
export function badgeFor(engine: LabelSource | undefined, word: string): Badge | undefined {
  let labels: ReadonlySet<string> | undefined;
  try {
    labels = engine?.labelsOf?.(word);
  } catch {
    return undefined; // a badge is never worth breaking the suggestion bar
  }
  if (labels === undefined) return undefined;
  if (labels.has('offensive')) return { text: 'offensive', kind: 'danger' };
  if (labels.has('coarse')) return { text: 'can be rude', kind: 'warn' };
  return undefined;
}
