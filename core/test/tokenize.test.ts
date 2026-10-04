import { describe, it, expect } from 'vitest';

import { tokenize } from '../src/tokenize.js';
import { ODIA } from './helpers.js';

/**
 * The contract tokenize.ts owes the engine is not "splits sensibly" but
 * "splits losslessly": Engine.transliterate rebuilds the output string by
 * walking these tokens, so anything the tokenizer drops, mangles or reorders
 * is silently deleted from the user's text.
 */

const kinds = (input: string): string[] => tokenize(input).map((t) => t.kind);
const texts = (input: string): string[] => tokenize(input).map((t) => t.text);

describe('tokenize: run splitting', () => {
  it('splits words on whitespace, keeping the space as its own token', () => {
    expect(kinds('PCR test')).toEqual(['word', 'space', 'word']);
    expect(texts('PCR test')).toEqual(['PCR', ' ', 'test']);
  });

  it('separates digit runs from words', () => {
    expect(kinds('abc123def')).toEqual(['word', 'digits', 'word']);
    expect(texts('abc123def')).toEqual(['abc', '123', 'def']);
  });

  it('merges adjacent characters of the same kind into one run', () => {
    expect(texts('hello   world')).toEqual(['hello', '   ', 'world']);
    expect(texts('...')).toEqual(['...']);
  });

  it('treats punctuation as its own kind', () => {
    expect(kinds('kemiti achha!')).toEqual(['word', 'space', 'word', 'punct']);
  });

  it('keeps mixed case inside a single word token', () => {
    // Case folding is the engine's job, not the tokenizer's: the verbatim
    // candidate has to be able to give "PCR" back exactly as typed.
    expect(texts('McKinsey')).toEqual(['McKinsey']);
  });

  it('returns nothing for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('handles input that is only whitespace', () => {
    expect(kinds('  ')).toEqual(['space']);
  });

  it('classifies tabs and newlines as space', () => {
    expect(kinds('a\tb\nc')).toEqual(['word', 'space', 'word', 'space', 'word']);
  });

  it('treats Odia the user already typed as passthrough, not as a word', () => {
    // Only ASCII letters are roman input. Anything else must survive untouched.
    expect(kinds(ODIA)).toEqual(['punct']);
    expect(texts(ODIA)).toEqual([ODIA]);
  });
});

describe('tokenize: offsets and round-trip', () => {
  const FIXTURES: readonly string[] = [
    '',
    ' ',
    'kemiti achha',
    'PCR test',
    'namaskaara!',
    'odisha, 1936',
    '  leading and trailing  ',
    'a\tb\nc',
    'don’t',
    ODIA + ' mixed 42',
    '\u{1F600} astral',
  ];

  it('reproduces the input exactly when the tokens are joined', () => {
    for (const fixture of FIXTURES) {
      expect(
        tokenize(fixture)
          .map((t) => t.text)
          .join(''),
        `round-trip failed for ${JSON.stringify(fixture)}`,
      ).toBe(fixture);
    }
  });

  it('reports offsets that slice back to the token text', () => {
    for (const fixture of FIXTURES) {
      for (const token of tokenize(fixture)) {
        expect(fixture.slice(token.start, token.end)).toBe(token.text);
      }
    }
  });

  it('produces contiguous, gap-free, non-empty tokens', () => {
    for (const fixture of FIXTURES) {
      let cursor = 0;
      for (const token of tokenize(fixture)) {
        expect(token.start).toBe(cursor);
        expect(token.end).toBeGreaterThan(token.start);
        cursor = token.end;
      }
      expect(cursor).toBe(fixture.length);
    }
  });

  it('never emits two adjacent tokens of the same kind', () => {
    // Adjacent same-kind tokens would mean a run was split, which would let a
    // word be transliterated in two halves.
    for (const fixture of FIXTURES) {
      const tokens = tokenize(fixture);
      for (let i = 1; i < tokens.length; i += 1) {
        expect(tokens[i]?.kind, `split run in ${JSON.stringify(fixture)}`).not.toBe(
          tokens[i - 1]?.kind,
        );
      }
    }
  });
});
