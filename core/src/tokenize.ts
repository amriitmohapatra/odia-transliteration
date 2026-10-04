/**
 * Split input into runs the engine treats differently.
 *
 * Only `word` runs go through the segmenter and only `digits` runs are
 * affected by the digit mode. Punctuation and whitespace pass through
 * untouched, and every token keeps its original text and offsets, so
 * concatenating the tokens back together reproduces the input exactly. That
 * round-trip property is what lets `Engine.transliterate` rebuild a sentence
 * without a second parse.
 */

export type TokenKind = 'word' | 'digits' | 'punct' | 'space';

export interface Token {
  kind: TokenKind;
  /** The original text, exactly as it appeared. */
  text: string;
  /** Start offset in the input string, inclusive. */
  start: number;
  /** End offset in the input string, exclusive. */
  end: number;
}

/**
 * Classify one UTF-16 code unit.
 *
 * Only ASCII letters make a word: the roman input the engine understands is
 * ASCII, and anything else — including Odia the user has already typed, and
 * astral characters — is punctuation that passes straight through. Splitting a
 * surrogate pair across two `punct` units is harmless because adjacent units
 * of the same kind merge into one token.
 */
function classify(ch: string): TokenKind {
  if (ch >= 'a' && ch <= 'z') return 'word';
  if (ch >= 'A' && ch <= 'Z') return 'word';
  // The explicit halant. It is part of the word, not punctuation: splitting the
  // token here made "kamala_" transliterate as "kamala" plus a stray underscore,
  // and left ଟ୍ହ-shaped conjuncts unwritable because "tha" is owned by ଥ.
  if (ch === '_') return 'word';
  if (ch >= '0' && ch <= '9') return 'digits';
  if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v') {
    return 'space';
  }
  return 'punct';
}

/** Split `input` into maximal runs of a single kind. */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  if (input.length === 0) return tokens;

  let start = 0;
  let kind = classify(input[0] as string);

  for (let i = 1; i < input.length; i += 1) {
    const next = classify(input[i] as string);
    if (next !== kind) {
      tokens.push({ kind, text: input.slice(start, i), start, end: i });
      start = i;
      kind = next;
    }
  }
  tokens.push({ kind, text: input.slice(start), start, end: input.length });

  return tokens;
}
