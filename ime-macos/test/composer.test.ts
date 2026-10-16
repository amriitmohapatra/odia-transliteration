// The input method's key handling (js/composer.ts), with a stand-in word source.
import { describe, expect, it } from 'vitest';

import { Composer, MAX_CANDIDATES, type Key, type WordSource } from '../js/composer.js';

const BHALA = '\u0b2d\u0b32'; // good
const BHALLA = '\u0b2d\u0b32\u0b4d\u0b32';
const ACHHA = '\u0b05\u0b1b'; // is (you are)
const DANDA = '\u0964';

function source(): WordSource & { learned: [string, string][]; asked: [string, string][] } {
  const table: Record<string, string[]> = { bhala: [BHALA, BHALLA], achha: [ACHHA], many: Array.from({ length: 12 }, (_, i) => `w${i}`) };
  const s = {
    learned: [] as [string, string][],
    asked: [] as [string, string][],
    candidates(roman: string, previous: string) {
      s.asked.push([roman, previous]);
      return table[roman.toLowerCase()] ?? [];
    },
    learn(roman: string, word: string) {
      s.learned.push([roman, word]);
    },
  };
  return s;
}

const type = (c: Composer, text: string) => [...text].map((ch) => c.key(ch === ' ' ? { kind: 'space' } : { kind: 'char', char: ch }));
const press = (c: Composer, kind: Exclude<Key['kind'], 'char'>) => c.key({ kind } as Key);

describe('Composer', () => {
  it('shows the best Odia word inline while typing, and Space commits it with a space', () => {
    const c = new Composer(source());
    const steps = type(c, 'bhala');
    expect(steps.every((s) => s.handled && s.commit === '')).toBe(true);
    expect(c.view()).toEqual({ roman: 'bhala', marked: BHALA, candidates: [BHALA, BHALLA], selected: 0 });
    expect(press(c, 'space')).toMatchObject({ handled: true, commit: `${BHALA} ` });
    expect(c.view().roman).toBe('');
  });

  it('passes keys through when nothing is being composed', () => {
    const c = new Composer(source());
    expect(press(c, 'space').handled).toBe(false);
    expect(press(c, 'enter').handled).toBe(false);
    expect(press(c, 'backspace').handled).toBe(false);
    expect(press(c, 'down').handled).toBe(false);
    expect(c.key({ kind: 'char', char: '5' }).handled).toBe(false);
    expect(c.key({ kind: 'char', char: ',' }).handled).toBe(false);
  });

  it('arrows move the highlight, Enter takes it, and the choice is learned', () => {
    const s = source();
    const c = new Composer(s);
    type(c, 'bhala');
    press(c, 'down');
    expect(c.view()).toMatchObject({ selected: 1, marked: BHALLA });
    press(c, 'down');
    expect(c.view().selected).toBe(0); // wraps
    press(c, 'up');
    expect(press(c, 'enter')).toMatchObject({ handled: true, commit: BHALLA });
    expect(s.learned).toEqual([['bhala', BHALLA]]);
  });

  it('a digit takes that numbered word while composing', () => {
    const c = new Composer(source());
    type(c, 'bhala');
    expect(c.key({ kind: 'char', char: '2' })).toMatchObject({ handled: true, commit: BHALLA });
    type(c, 'bhala');
    // No ninth word: the digit commits the highlighted word and is typed after it.
    expect(c.key({ kind: 'char', char: '9' })).toMatchObject({ handled: true, commit: `${BHALA}9` });
  });

  it('Escape keeps the English letters as typed; Backspace edits the letters', () => {
    const s = source();
    const c = new Composer(s);
    type(c, 'bhalx');
    press(c, 'backspace');
    expect(c.view()).toMatchObject({ roman: 'bhal' });
    type(c, 'a');
    expect(c.view().marked).toBe(BHALA);
    expect(press(c, 'escape')).toMatchObject({ handled: true, commit: 'bhala' });
    expect(s.learned).toEqual([]);
    type(c, 'x');
    press(c, 'backspace');
    expect(c.view()).toEqual({ roman: '', marked: '', candidates: [], selected: 0 });
  });

  it('punctuation commits the word first; | is the danda', () => {
    const c = new Composer(source());
    type(c, 'achha');
    expect(c.key({ kind: 'char', char: '?' })).toMatchObject({ handled: true, commit: `${ACHHA}?` });
    expect(c.key({ kind: 'char', char: '|' })).toMatchObject({ handled: true, commit: DANDA });
  });

  it('asks for words with the previous Odia word as context, and forgets it after punctuation', () => {
    const s = source();
    const c = new Composer(s);
    type(c, 'bhala ');
    type(c, 'achha');
    expect(s.asked.at(-1)).toEqual(['achha', BHALA]);
    c.key({ kind: 'char', char: '.' });
    type(c, 'bhala');
    expect(s.asked.at(-1)).toEqual(['bhala', '']);
  });

  it('a word with no candidates commits its letters; at most nine candidates are shown', () => {
    const c = new Composer(source());
    type(c, 'zzz');
    expect(c.view().marked).toBe('zzz');
    expect(press(c, 'space').commit).toBe('zzz ');
    type(c, 'many');
    expect(c.view().candidates).toHaveLength(MAX_CANDIDATES);
  });

  it('flush commits the highlighted word when the app loses focus', () => {
    const c = new Composer(source());
    type(c, 'bhala');
    expect(c.flush()).toBe(BHALA);
    expect(c.flush()).toBe('');
  });
});
