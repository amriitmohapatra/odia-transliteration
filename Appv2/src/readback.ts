/**
 * The "Reads as" line under the text box (plan/design/v1-ux-proposal.md 3.2,
 * 3.7): one romanised word per Odia word, worked out from the Odia letters
 * (romanize.ts), not echoed from what was typed. That is what makes it a
 * check for someone who speaks Odia but cannot read the script.
 *
 * The text box is the only composing surface. It holds committed Odia and,
 * at times, roman words that have not been converted yet (the word under the
 * caret, a word followed by punctuation, text typed before the word list
 * loaded). This module cuts the box's value into SLOTS so that each read-back
 * word knows exactly which characters of the box it stands for, and a choice
 * in the Alternatives sheet can replace them in place.
 *
 * Pure: no DOM, no engine. main.ts renders the slots; test/readback.test.ts
 * checks the cutting.
 */

import type { WordResult } from '@odia/core/types';

import { romanizeText } from './romanize.js';

export type Slot =
  /** Spaces, punctuation, digits: shown as they are. */
  | { kind: 'text'; text: string }
  /** An Odia word already in the box. */
  | { kind: 'odia'; start: number; end: number; odia: string; reads: string }
  /**
   * A roman word that will be converted (on copy, or when picked). `odia` is
   * the engine's top choice. `pending` is the word still being typed at the
   * caret.
   */
  | {
      kind: 'roman';
      start: number;
      end: number;
      odia: string;
      reads: string;
      word: WordResult;
      pending: boolean;
    }
  /** A roman word that stays English (kept as typed, or no Odia reading). */
  | { kind: 'latin'; start: number; end: number; text: string };

/**
 * An Odia word: letters and signs, with ZWJ/ZWNJ allowed inside. Odia digits
 * (U+0B66-0B6F) are excluded: they romanise to nothing, so they stay text.
 */
const ODIA_WORD = /[\u0B00-\u0B65\u0B70-\u0B7F][\u0B00-\u0B65\u0B70-\u0B7F\u200C\u200D]*/g;
const HAS_ODIA = /[\u0B00-\u0B7F]/;
const JOINERS = /[\u200C\u200D]/g;

/** Romanised reading of one Odia word, or '' when it has no letters to read. */
export function readingOf(odia: string): string {
  return romanizeText(odia).replace(JOINERS, '');
}

/**
 * Cut `raw` (the text box value) into slots.
 *
 * `words` are the engine's words for `preprocess(raw)`, in order. Roman words
 * are ASCII letter runs that preprocess never touches, so each is found in
 * `raw` itself by a forward search; everything between them is cut into Odia
 * words and plain text.
 *
 * `display(word)` is the Odia the word will become: the top candidate
 * normally, the strict ITRANS result in strict mode.
 */
export function buildSlots(
  raw: string,
  words: readonly WordResult[],
  caret: number | null,
  display: (word: WordResult) => string = (word) => word.candidates[0]?.text ?? word.roman,
): Slot[] {
  const slots: Slot[] = [];
  let cursor = 0;

  for (const word of words) {
    const at = raw.indexOf(word.roman, cursor);
    if (at < 0) continue; // cannot place it; the gap logic below still shows the text
    pushGap(slots, raw.slice(cursor, at), cursor);
    const end = at + word.roman.length;
    const odia = display(word);
    const reads = HAS_ODIA.test(odia) ? readingOf(odia) : '';
    if (reads.length > 0) {
      slots.push({ kind: 'roman', start: at, end, odia, reads, word, pending: caret === end });
    } else if (HAS_ODIA.test(odia)) {
      pushText(slots, odia); // e.g. Odia digits
    } else {
      slots.push({ kind: 'latin', start: at, end, text: word.roman });
    }
    cursor = end;
  }

  pushGap(slots, raw.slice(cursor), cursor);
  return slots;
}

function pushGap(slots: Slot[], gap: string, base: number): void {
  if (gap.length === 0) return;
  let cursor = 0;
  for (const match of gap.matchAll(ODIA_WORD)) {
    const at = match.index ?? 0;
    const odia = match[0];
    const reads = readingOf(odia);
    if (at > cursor) pushText(slots, gap.slice(cursor, at));
    if (reads.length > 0) {
      slots.push({ kind: 'odia', start: base + at, end: base + at + odia.length, odia, reads });
    } else {
      pushText(slots, odia);
    }
    cursor = at + odia.length;
  }
  if (cursor < gap.length) pushText(slots, gap.slice(cursor));
}

function pushText(slots: Slot[], text: string): void {
  const last = slots[slots.length - 1];
  if (last !== undefined && last.kind === 'text') last.text += text;
  else slots.push({ kind: 'text', text });
}

/** True when the line has at least one word worth showing. */
export function hasWords(slots: readonly Slot[]): boolean {
  return slots.some((slot) => slot.kind !== 'text');
}

/** The read-back as one plain string (for the phone strip's one-line note). */
export function readbackText(slots: readonly Slot[]): string {
  return slots
    .map((slot) => (slot.kind === 'text' ? slot.text : slot.kind === 'latin' ? slot.text : slot.reads))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
