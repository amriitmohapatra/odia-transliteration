import { EditHistory, pendingRoman, replaceState, type EditState, type PendingRoman } from './editor-state.js';

/** One undo history for browser edits and scripted IME/palette/dictionary edits.
 * Native beforeinput history events cover mobile undo menus as well as keys.
 */
export class Editor {
  private readonly history: EditHistory;
  private before: EditState | undefined;
  private compositionBefore: EditState | undefined;
  private deferred: { separator: string; actions: Array<() => boolean> } | undefined;
  composing = false;

  constructor(private readonly area: HTMLTextAreaElement, private readonly changed: () => void) {
    this.history = new EditHistory({ value: area.value, start: area.selectionStart,
      end: area.selectionEnd, direction: area.selectionDirection, literals: [] });
    area.addEventListener('beforeinput', (event) => {
      const input = event as InputEvent;
      this.deferred = undefined;
      if (input.inputType === 'historyUndo' || input.inputType === 'historyRedo') {
        if (input.cancelable) { input.preventDefault(); this.restore(input.inputType === 'historyRedo'); }
        return;
      }
      this.before = this.snapshot();
    });
    area.addEventListener('keydown', (event) => {
      if (this.composing || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' || (key === 'y' && event.ctrlKey && !event.metaKey)) {
        event.preventDefault();
        this.restore(key === 'y' || event.shiftKey);
      }
    });
    area.addEventListener('compositionstart', () => {
      this.composing = true;
      this.compositionBefore = this.snapshot();
    });
    area.addEventListener('compositionend', () => {
      this.composing = false;
      if (this.compositionBefore) this.history.record(this.compositionBefore, this.snapshot());
      this.compositionBefore = undefined;
      this.before = undefined;
      this.changed();
    });
    area.addEventListener('input', (event) => this.acceptInput(event as InputEvent));
    // Keep the last selection when the user moves into dictionary search.
    for (const name of ['select', 'keyup', 'click', 'blur'] as const) {
      area.addEventListener(name, () => {
        if (area.value === this.history.current.value) this.history.current = this.snapshot();
      });
    }
  }

  snapshot(): EditState {
    return { ...this.history.current, value: this.area.value, start: this.area.selectionStart,
      end: this.area.selectionEnd, direction: this.area.selectionDirection };
  }

  pending(): PendingRoman | undefined {
    return this.composing ? undefined : pendingRoman(this.snapshot());
  }

  /** Some mobile beforeinput events cannot be canceled. Wait for precisely
   * the expected native insertion, then commit it as one editor transaction. */
  deferBoundary(separator: string, action: () => boolean): void {
    if (this.deferred?.separator === separator) this.deferred.actions.push(action);
    else this.deferred = { separator, actions: [action] };
  }

  replace(start: number, end: number, text: string, literal = false, selection?: Pick<EditState, 'start' | 'end' | 'direction'>): void {
    const before = this.snapshot();
    const after = replaceState(before, start, end, text, literal);
    if (selection) {
      after.start = selection.start;
      after.end = selection.end;
      after.direction = selection.direction;
    }
    this.before = undefined;
    this.deferred = undefined;
    this.history.record(before, after);
    this.apply(after);
  }

  /** Protect an explicitly kept word without changing its spelling. */
  keep(start: number, end: number): void {
    const selection = this.snapshot();
    this.replace(start, end, this.area.value.slice(start, end), true, selection);
  }

  undo(): void { this.restore(false); }

  private restore(redo: boolean): void {
    this.history.current = this.snapshot();
    const state = redo ? this.history.redo() : this.history.undo();
    this.before = undefined;
    if (state) this.apply(state);
  }

  private apply(state: EditState): void {
    this.area.value = state.value;
    this.area.setSelectionRange(state.start, state.end, state.direction);
    this.changed();
  }

  private acceptInput(event: InputEvent): void {
    const before = this.before ?? this.history.current;
    const value = this.area.value;
    const deferred = this.deferred;
    this.deferred = undefined;
    if (deferred && !this.composing && !event.isComposing && before.start === before.end &&
        value === before.value.slice(0, before.start) + deferred.separator + before.value.slice(before.end) &&
        this.area.selectionStart === before.start + deferred.separator.length &&
        this.area.selectionStart === this.area.selectionEnd) {
      const nativeStart = this.area.selectionStart;
      const nativeDirection = this.area.selectionDirection;
      // This synchronous restore is never rendered: a successful callback
      // replaces the token AND separator; a declined callback restores native
      // input unchanged. No extra history record is created for the separator.
      this.area.value = before.value;
      this.area.setSelectionRange(before.start, before.end, before.direction);
      if (deferred.actions.some((action) => action())) return;
      this.area.value = value;
      this.area.setSelectionRange(nativeStart, nativeStart, nativeDirection);
    }
    // Prefer the beforeinput selection; a common-prefix diff alone misplaces
    // a paste when identical letters are adjacent to the insertion point.
    let start = before.start;
    let end = before.end;
    let insertedLength = value.length - (before.value.length - (end - start));
    if (insertedLength < 0 || value.slice(0, start) !== before.value.slice(0, start) ||
        value.slice(start + insertedLength) !== before.value.slice(end)) {
      start = 0;
      while (start < value.length && start < before.value.length && value[start] === before.value[start]) start++;
      end = before.value.length;
      let nextEnd = value.length;
      while (end > start && nextEnd > start && before.value[end - 1] === value[nextEnd - 1]) { end--; nextEnd--; }
      insertedLength = nextEnd - start;
    }
    const literal = this.composing || event.isComposing ||
      ['insertFromPaste', 'insertFromDrop', 'insertReplacementText', 'insertCompositionText'].includes(event.inputType);
    const mapped = replaceState(before, start, end, value.slice(start, start + insertedLength), literal);
    const after = { ...mapped, value, start: this.area.selectionStart, end: this.area.selectionEnd,
      direction: this.area.selectionDirection };
    if (this.composing) this.history.current = after;
    else this.history.record(before, after);
    this.before = undefined;
    this.changed();
  }
}
