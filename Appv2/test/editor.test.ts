import { describe, expect, it } from 'vitest';
import { EditHistory, isLiteralInput, pendingRoman, replaceState, type EditState } from '../src/editor-state.js';
const state = (value: string, start = value.length, end = start): EditState => ({ value, start, end, direction: 'none', literals: [] });

describe('literal boundaries', () => {
  it('never converts an address, domain, acronym or identifier as a fragment', () => {
    for (const value of ['test@example.com', 'https://example.com', 'www.example.com', 'example.com', 'covid19', 'PCR2', 'PCR', 'v2.4']) {
      expect(pendingRoman(state(value))).toBeUndefined();
    }
  });
  it('keeps punctuation outside the replacement but includes it in the transaction', () => {
    expect(pendingRoman(state('namaskar,'))).toEqual({ roman: 'namaskar', start: 0, end: 8, tailEnd: 9 });
  });
  it('does not reinterpret pasted text or a selected range', () => {
    const pasted = replaceState(state(''), 0, 0, 'kemiti', true);
    expect(pendingRoman(pasted)).toBeUndefined();
    expect(pendingRoman(state('kemiti', 0, 6))).toBeUndefined();
    expect(pendingRoman(state('kemiti', 3))).toBeUndefined();
  });
  it('accepts smart quotes and script punctuation without touching their bytes', () => {
    expect(pendingRoman(state('\u201Ckemiti\u201D\u0964'))).toEqual({ roman: 'kemiti', start: 1, end: 7, tailEnd: 9 });
    expect(pendingRoman(state('kemiti\u2026'))?.roman).toBe('kemiti');
  });
  it('keeps explicit halant romanization available', () => {
    expect(pendingRoman(state('t_ha'))?.roman).toBe('t_ha');
  });
});

describe('editor transactions', () => {
  it('undoes a commit to its Roman input and restores selection on redo', () => {
    const h = new EditHistory(state('kemiti'));
    const committed = replaceState(h.current, 0, 6, '\u0b15\u0b47\u0b2e\u0b3f\u0b24\u0b3f ');
    h.record(h.current, committed);
    expect(h.undo()?.value).toBe('kemiti');
    expect(h.redo()).toEqual(committed);
  });
  it('undo restores a replaced selection including its direction', () => {
    const before = { ...state('first middle last', 6, 12), direction: 'backward' as const };
    const h = new EditHistory(before);
    h.record(before, replaceState(before, 6, 12, 'new'));
    expect(h.current.value).toBe('first new last');
    expect(h.undo()).toEqual(before);
  });
  it('maps protected paste ranges through insertion and deletion', () => {
    const pasted = replaceState(state(''), 0, 0, 'test@example.com', true);
    const prefixed = replaceState(pasted, 0, 0, 'hello ');
    expect(prefixed.literals).toEqual([{ start: 6, end: 22 }]);
    const deleted = replaceState(prefixed, 6, 22, '');
    expect(deleted.literals).toEqual([]);
  });
  it('preserves literal metadata through Clear, undo and redo', () => {
    const pasted = replaceState(state(''), 0, 0, 'kemiti', true);
    const h = new EditHistory(pasted);
    h.record(pasted, replaceState(pasted, 0, pasted.value.length, ''));
    expect(h.undo()).toEqual(pasted);
    expect(pendingRoman(h.current)).toBeUndefined();
    expect(h.redo()?.value).toBe('');
  });
  it('drops redo after a new edit following undo', () => {
    const h = new EditHistory(state('a'));
    h.record(h.current, replaceState(h.current, 1, 1, 'b'));
    h.undo();
    h.record(h.current, replaceState(h.current, 1, 1, 'c'));
    expect(h.redo()).toBeUndefined();
    expect(h.current.value).toBe('ac');
  });
});

describe('which input stays literal', () => {
  it('keeps pasted, dropped and spell-check text literal', () => {
    for (const type of ['insertFromPaste', 'insertFromDrop', 'insertReplacementText']) {
      expect(isLiteralInput(type, false, 'kemiti')).toBe(true);
    }
  });
  it('transliterates a Roman word that a phone keyboard composes (Gboard)', () => {
    expect(isLiteralInput('insertCompositionText', true, 'kemiti')).toBe(false);
    expect(isLiteralInput('insertText', true, 'kemiti')).toBe(false);
    const composed = replaceState(state(''), 0, 0, 'kemiti', isLiteralInput('insertCompositionText', true, 'kemiti'));
    expect(pendingRoman(composed)).toEqual({ roman: 'kemiti', start: 0, end: 6, tailEnd: 6 });
  });
  it('keeps text from an Odia or other-script IME as committed', () => {
    expect(isLiteralInput('insertCompositionText', true, '\u0B15\u0B47\u0B2E\u0B3F\u0B24\u0B3F')).toBe(true);
    expect(isLiteralInput('insertCompositionText', true, '\u65E5\u672C')).toBe(true);
  });
  it('treats ordinary typing as eligible', () => {
    expect(isLiteralInput('insertText', false, 'k')).toBe(false);
  });
});
