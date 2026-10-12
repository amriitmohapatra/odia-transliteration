/** Pure editor state. Literal spans belong to the document, not the learned lexicon. */
export interface Span { start: number; end: number }
export interface EditState {
  value: string;
  start: number;
  end: number;
  direction: 'forward' | 'backward' | 'none';
  literals: readonly Span[];
}
export interface PendingRoman extends Span { roman: string; tailEnd: number }

/** Only a complete ordinary Roman word can be implicitly committed.
 * Looking at the whole whitespace-delimited token prevents converting an email
 * suffix, URL segment or identifier after the caret bar has already opened.
 */
export function pendingRoman(state: EditState): PendingRoman | undefined {
  const { value, start: caret, end } = state;
  if (caret !== end || caret === 0 || (caret < value.length && !/\s/.test(value[caret]!))) return;
  let tokenStart = caret;
  while (tokenStart > 0 && !/\s/.test(value[tokenStart - 1]!)) tokenStart--;
  const token = value.slice(tokenStart, caret);
  if (!token || state.literals.some((span) => span.start < caret && span.end > tokenStart)) return;
  if (/@|:\/\/|^www\.|[A-Za-z]\.[A-Za-z]{2,}/i.test(token) ||
      (/[A-Za-z]/.test(token) && /[0-9]/.test(token))) return;
  const match = /^([("'\[{\u2018\u2019\u201C\u201D]*)([A-Za-z_~]+)([.,!?;:)"'\]}\u2018\u2019\u201C\u201D\u0964\u0965\u2026]*)$/.exec(token);
  if (!match) return;
  const roman = match[2]!;
  if (/^[A-Z]{2,}$/.test(roman)) return;
  const start = tokenStart + match[1]!.length;
  return { roman, start, end: start + roman.length, tailEnd: caret };
}

/** Paste, drop and spell-check replacements stay literal. Composed text stays
 * literal only when it is not plain Roman: an Odia or other-script IME commits
 * what the user chose, but a Latin keyboard that composes whole words (Android
 * Gboard) must still be transliterated.
 */
export function isLiteralInput(inputType: string, composed: boolean, text: string): boolean {
  if (['insertFromPaste', 'insertFromDrop', 'insertReplacementText'].includes(inputType)) return true;
  return (composed || inputType === 'insertCompositionText') && /[^\t\n\r\x20-\x7E]/.test(text);
}

/** Replace a range without moving or destroying unrelated literal spans. */
export function replaceState(before: EditState, start: number, end: number, text: string, literal = false): EditState {
  const delta = text.length - (end - start);
  const literals: Span[] = [];
  for (const span of before.literals) {
    if (span.end <= start) literals.push({ ...span });
    else if (span.start >= end) literals.push({ start: span.start + delta, end: span.end + delta });
    else {
      if (span.start < start) literals.push({ start: span.start, end: start });
      if (span.end > end) literals.push({ start: start + text.length, end: span.end + delta });
    }
  }
  if (literal && text.length) literals.push({ start, end: start + text.length });
  literals.sort((a, b) => a.start - b.start);
  return { value: before.value.slice(0, start) + text + before.value.slice(end),
    start: start + text.length, end: start + text.length, direction: 'none', literals };
}

export class EditHistory {
  private past: EditState[] = [];
  private future: EditState[] = [];
  constructor(public current: EditState) {}
  record(before: EditState, after: EditState): void {
    this.current = after;
    if (before.value === after.value && JSON.stringify(before.literals) === JSON.stringify(after.literals)) return;
    this.past.push(before);
    if (this.past.length > 500) this.past.shift();
    this.future = [];
  }
  undo(): EditState | undefined {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(this.current);
    return this.current = previous;
  }
  redo(): EditState | undefined {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.current);
    return this.current = next;
  }
}
