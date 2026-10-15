/**
 * The input method's key handling (V5, Stage C), as a pure state machine so that
 * vitest reaches it: the Swift controller (Sources/OdiaInputController.swift)
 * only turns NSEvents into `Key`s and applies each `Step` (commit text, marked
 * text, candidate list). Same behaviour as the web app's caret bar where the two
 * meet: Space or Enter takes the highlighted word, 1-9 take a numbered one,
 * arrows move the highlight, Escape keeps the English letters as typed.
 */

export type Key =
  | { kind: 'char'; char: string }
  | { kind: 'space' | 'enter' | 'backspace' | 'escape' | 'up' | 'down' | 'tab' };

export interface View {
  /** The roman letters typed for the current word ('' when not composing). */
  roman: string;
  /** What the app shows inline, underlined: the highlighted Odia word. */
  marked: string;
  /** Odia words, best first (at most MAX_CANDIDATES). */
  candidates: string[];
  /** Index of the highlighted candidate. */
  selected: number;
}

export interface Step {
  /** True when the key was used here; false lets the app have it (after `commit`). */
  handled: boolean;
  /** Text to insert into the app now ('' for none). */
  commit: string;
  view: View;
}

/** Where the words come from: the engine (bridge.ts) or a test stand-in. */
export interface WordSource {
  /** Odia candidates for a roman key, best first, after the previous Odia word. */
  candidates(roman: string, previous: string): string[];
  /** The user chose `word` for `roman`: rank it higher next time. */
  learn(roman: string, word: string): void;
}

export const MAX_CANDIDATES = 9;

/** Roman letters that build a word. */
const LETTER = /^[A-Za-z]$/;
/** Characters typed as Odia punctuation: | is the danda. */
const PUNCT_MAP: Record<string, string> = { '|': '\u0964' };

export class Composer {
  private roman = '';
  private candidates: string[] = [];
  private selected = 0;
  /** The last Odia word committed, for the next word's context ('' after punctuation). */
  private previous = '';

  constructor(private readonly source: WordSource) {}

  view(): View {
    return {
      roman: this.roman,
      marked: this.roman ? (this.candidates[this.selected] ?? this.roman) : '',
      candidates: this.candidates,
      selected: this.selected,
    };
  }

  /** The app lost focus or switched input source: commit what is composed, as Odia. */
  flush(): string {
    if (!this.roman) return '';
    return this.take(this.selected);
  }

  key(k: Key): Step {
    const composing = this.roman.length > 0;
    switch (k.kind) {
      case 'char':
        return this.char(k.char);
      case 'space':
        return composing ? this.done(this.take(this.selected) + ' ') : this.pass();
      case 'enter':
        return composing ? this.done(this.take(this.selected)) : this.pass();
      case 'escape': {
        if (!composing) return this.pass();
        const raw = this.roman;
        this.reset();
        this.previous = '';
        return this.done(raw);
      }
      case 'backspace':
        if (!composing) return this.pass();
        this.roman = this.roman.slice(0, -1);
        this.refresh();
        return this.done('');
      case 'up':
      case 'down':
      case 'tab':
        if (!composing || this.candidates.length === 0) return this.pass();
        this.selected = (this.selected + (k.kind === 'up' ? -1 : 1) + this.candidates.length) % this.candidates.length;
        return this.done('');
    }
  }

  private char(c: string): Step {
    if (LETTER.test(c)) {
      this.roman += c;
      this.refresh();
      return this.done('');
    }
    const composing = this.roman.length > 0;
    // 1-9 take a numbered candidate while composing; otherwise a digit is a digit.
    if (composing && /^[1-9]$/.test(c)) {
      const i = Number(c) - 1;
      if (i < this.candidates.length) return this.done(this.take(i));
    }
    const out = PUNCT_MAP[c] ?? c;
    const word = composing ? this.take(this.selected) : '';
    this.previous = '';
    if (out === c && !composing) return this.pass(); // a plain character the app types itself
    return this.done(word + out);
  }

  /** Commit candidate `i` (or the letters, without candidates), learn it, clear the word. */
  private take(i: number): string {
    const word = this.candidates[i] ?? this.roman;
    if (this.candidates[i] !== undefined) this.source.learn(this.roman, word);
    this.previous = this.candidates[i] !== undefined ? word : '';
    this.reset();
    return word;
  }

  private refresh(): void {
    this.selected = 0;
    this.candidates = this.roman ? this.source.candidates(this.roman, this.previous).slice(0, MAX_CANDIDATES) : [];
  }

  private reset(): void {
    this.roman = '';
    this.candidates = [];
    this.selected = 0;
  }

  private done(commit: string): Step {
    return { handled: true, commit, view: this.view() };
  }

  private pass(): Step {
    return { handled: false, commit: '', view: this.view() };
  }
}
