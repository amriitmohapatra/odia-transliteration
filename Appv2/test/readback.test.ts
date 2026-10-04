import { describe, it, expect } from 'vitest';

import type { WordResult } from '@odia/core/types';

import { buildSlots, hasWords, readbackText, readingOf } from '../src/readback.js';

const KEMITI = '\u0B15\u0B47\u0B2E\u0B3F\u0B24\u0B3F';
const ACHHA = '\u0B05\u0B1B';
const DINA = '\u0B26\u0B3F\u0B28';
const ODISHA = '\u0B13\u0B21\u0B3C\u0B3F\u0B36\u0B3E'; // decomposed flap, never U+0B5C

const word = (roman: string, ...texts: string[]): WordResult => ({
  roman,
  candidates: texts.map((text) => ({ text, score: 0, source: 'lexicon' as const })),
});

describe('read-back slots (Appv2/src/readback.ts)', () => {
  it('reads committed Odia words with their offsets in the box', () => {
    const raw = `${KEMITI} ${ACHHA}!`;
    const slots = buildSlots(raw, [], null);
    expect(slots.map((s) => s.kind)).toEqual(['odia', 'text', 'odia', 'text']);
    expect(readbackText(slots)).toBe('kemiti achha!');
    const second = slots[2];
    expect(second.kind === 'odia' && raw.slice(second.start, second.end)).toBe(ACHHA);
  });

  it('places roman words, marks the one at the caret as pending, and reads its top choice', () => {
    const raw = `${KEMITI} achha dina`;
    const words = [word('achha', ACHHA), word('dina', DINA, '\u0B26\u0B40\u0B28')];
    const slots = buildSlots(raw, words, raw.length);
    const roman = slots.filter((s) => s.kind === 'roman');
    expect(roman.map((s) => s.kind === 'roman' && [s.reads, s.pending, raw.slice(s.start, s.end)])).toEqual([
      ['achha', false, 'achha'],
      ['dina', true, 'dina'],
    ]);
    expect(readbackText(slots)).toBe('kemiti achha dina');
  });

  it('keeps an English word as Latin when its top choice has no Odia', () => {
    const slots = buildSlots('bus', [word('bus', 'bus')], 3);
    expect(slots).toEqual([{ kind: 'latin', start: 0, end: 3, text: 'bus' }]);
    expect(hasWords(slots)).toBe(true);
  });

  it('treats Odia digits as text, not as words (they romanise to nothing)', () => {
    const slots = buildSlots('\u0B67\u0B68 ' + DINA, [], null);
    expect(slots[0]).toEqual({ kind: 'text', text: '\u0B67\u0B68 ' });
    expect(slots[1].kind).toBe('odia');
  });

  it('reads the decomposed flap and drops joiners from the reading', () => {
    expect(readingOf(ODISHA)).toBe('odishaa');
    expect(readingOf('\u0B15\u0B4D\u200D\u0B37')).toBe('ksha');
  });

  it('has no words for an empty or punctuation-only box', () => {
    expect(hasWords(buildSlots('', [], 0))).toBe(false);
    expect(hasWords(buildSlots(' , . ', [], 0))).toBe(false);
  });

  it('uses the display function (strict mode) for roman words', () => {
    const slots = buildSlots('dina', [word('dina', DINA)], null, () => '\u0B26\u0B3F\u0B28\u0B3E');
    expect(slots[0].kind === 'roman' && slots[0].reads).toBe('dinaa');
  });
});
