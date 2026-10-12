/**
 * Live candidate bar — the Windows IME interaction, in two layouts.
 *
 * You type roman, a numbered list appears as you go, and Alt+number (or a
 * tap) commits that word IN PLACE, replacing the roman with Odia. The textarea
 * therefore ends up holding a mix of committed Odia and the roman word you are
 * still typing, which is exactly what an input method does.
 *
 * That mix works because the engine's tokenizer treats anything outside ASCII
 * as pass-through: already-committed Odia is copied verbatim while the roman
 * word under the caret keeps converting.
 *
 * Two layouts share one candidate list (plan/design/v1-ux-proposal.md 3.4/3.5):
 *
 *   popover  desktop. A vertical list at the caret: number, Odia word,
 *            one-line meaning in a fixed column, "Keep ..." last (proposal
 *            3.5), so numbers line up with Alt+1-9 and nothing jumps when
 *            the meanings arrive. It opens under the caret line, or above it
 *            when below would cover the elements the host keeps clear (the
 *            "Reads as" line); if neither side has room it takes the larger
 *            side and scrolls. Caret position is
 *            measured with a mirror element — a hidden div given the
 *            textarea's exact metrics, filled with the text up to the caret,
 *            with a marker span at the end. Reading that span's offset is the
 *            only reliable way to place something at the caret inside a
 *            <textarea>, which exposes no range geometry.
 *   docked   phones. A strip pinned to the bottom of window.visualViewport, so
 *            it rides on top of the on-screen keyboard (audit B1: below the
 *            caret, the keyboard hid everything after item 4 and the Copy
 *            button). It is shown while the text box has focus. Its top row
 *            holds a note, the scroll buttons and a toolbar slot (main.ts puts
 *            Copy there), so Copy stays reachable with the keyboard open.
 *            Without visualViewport (old browsers) it falls back to
 *            `position: fixed; bottom: 0`.
 *
 * DOM CONTRACT with Appv2/src/dictionary/overlay.ts (it watches, not imports):
 *   - exactly one `div.inline-candidates` (the list; its `hidden` attribute
 *     and children are observed), in both layouts;
 *   - items are `button.inline-candidate`; an Odia item has a `.inline-text`
 *     child holding the word; the typed-English item has `.inline-latin`
 *     instead and is skipped by the overlay (no gloss);
 *   - each item's `data-label` is its accessible name without the meaning
 *     (the word, plus a flag badge); the overlay sets aria-label to
 *     data-label + ", " + the meaning when it adds the gloss (V1 B6).
 * Rename any of these only together with overlay.ts.
 *
 * Screen readers (proposal 5, audit M5): the list is a listbox the text box
 * points at (aria-controls, aria-activedescendant on the highlighted
 * option); options are not tab stops (focus stays in the text box). A
 * polite live region says how many suggestions there are after a pause in
 * typing, and which word (with its meaning) was chosen.
 */

import type { Candidate } from '@odia/core/types';

import type { Badge } from './badges.js';
import type { PendingRoman } from './editor-state.js';

export interface InlineHost {
  pending(): PendingRoman | undefined;
  replace(start: number, end: number, text: string, literal: boolean): void;
  keep(start: number, end: number): void;
  composing(): boolean;
  deferBoundary(separator: string, action: () => boolean): void;
  /** Candidates for the roman word currently under the caret. */
  candidates(roman: string): Candidate[];
  /** Called after a commit, so the page can re-render and record the choice. */
  onCommit(roman: string, text: string): void;
  /** A text badge ("offensive", "can be rude") for an Odia candidate, if flagged. */
  badge?(text: string): Badge | undefined;
  /**
   * Elements the desktop popover must never cover (the "Reads as" line and
   * the state lines under the text box). Hidden ones are ignored.
   */
  keepClear?(): readonly (HTMLElement | null)[];
}

const MAX_SHOWN = 9;

/** Quiet time before the suggestion count is announced (not on every key). */
const ANNOUNCE_MS = 900;

/**
 * Where the strip replaces the popover: phone widths, and touch-first screens
 * up to a small tablet. Matches the layout breakpoints in style.css.
 */
export const DOCK_QUERY = '(max-width: 699px), (pointer: coarse) and (max-width: 1023px)';

/** True when a candidate has no Odia in it: the typed English word, or one taught earlier. */
const isLatin = (text: string): boolean => !/[\u0B00-\u0B7F]/.test(text);

/** Mirror styles that must match the textarea for the measurement to be right. */
const MIRRORED = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
  'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'whiteSpace', 'wordWrap',
] as const;

export class InlineCandidates {
  /** Slot in the phone strip's top row; main.ts puts the Copy button here. */
  readonly toolbar: HTMLDivElement;

  private readonly area: HTMLTextAreaElement;
  private readonly host: InlineHost;
  private readonly dock: HTMLDivElement;
  private readonly note: HTMLSpanElement;
  private readonly prev: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly box: HTMLDivElement;
  private readonly mirror: HTMLDivElement;
  private readonly live: HTMLDivElement;
  private readonly dockQuery: MediaQueryList | undefined;
  private announceTimer: number | undefined;

  private shown: Candidate[] = [];
  private pending: PendingRoman | undefined;
  private active = 0;
  private enabled = true;
  private docked = false;
  private dockOpen = false;
  private positionQueued = false;
  private blurTimer: number | undefined;

  constructor(area: HTMLTextAreaElement, host: InlineHost) {
    this.area = area;
    this.host = host;

    // The dock wraps the list in both layouts. In popover mode it is
    // `display: contents`, so the list is positioned against the page exactly
    // as before.
    this.dock = document.createElement('div');
    this.dock.className = 'kb-bar';
    this.dock.id = 'kb-bar';
    this.dock.dataset.mode = 'popover';

    const top = document.createElement('div');
    top.className = 'kb-bar-top';
    this.note = document.createElement('span');
    this.note.className = 'kb-bar-note';
    // Not a live region: it changes on every key. The state line under the
    // text box (#status) and this module's own live region speak instead.
    this.prev = scrollButton('\u2039', 'Earlier suggestions');
    this.next = scrollButton('\u203A', 'More suggestions');
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'kb-bar-tools';
    top.append(this.note, this.prev, this.next, this.toolbar);

    this.box = document.createElement('div');
    this.box.className = 'inline-candidates';
    this.box.id = 'inline-candidates';
    this.box.hidden = true;
    this.box.setAttribute('role', 'listbox');
    this.box.setAttribute('aria-label', 'Suggestions');

    this.dock.append(top, this.box);
    document.body.appendChild(this.dock);

    this.mirror = document.createElement('div');
    this.mirror.className = 'caret-mirror';
    this.mirror.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.mirror);

    this.live = document.createElement('div');
    this.live.id = 'inline-live';
    this.live.className = 'sr-only';
    this.live.setAttribute('role', 'status');
    this.live.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.live);

    area.setAttribute('aria-controls', this.box.id);
    area.setAttribute('aria-autocomplete', 'list');

    area.addEventListener('input', () => this.refresh());
    area.addEventListener('compositionstart', () => this.hide());
    area.addEventListener('beforeinput', (event) => {
      const input = event as InputEvent;
      if (input.defaultPrevented || input.isComposing || this.host.composing()) return;
      const separator = input.inputType === 'insertLineBreak' || input.inputType === 'insertParagraph'
        ? '\n' : input.inputType === 'insertText' ? input.data : null;
      if (!separator || !/^[ \t\r\n]+$/.test(separator)) return;
      if (!input.cancelable) this.host.deferBoundary(separator, () => this.commitPending(separator));
      else if (this.commitPending(separator)) input.preventDefault();
    });
    area.addEventListener('click', () => this.refresh());
    area.addEventListener('keyup', (e) => {
      if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') this.refresh();
    });
    area.addEventListener('focus', () => {
      if (this.blurTimer !== undefined) window.clearTimeout(this.blurTimer);
      this.blurTimer = undefined;
      if (this.docked) this.openDock();
      // Coming back to the box (after Copy, say) with the caret after a roman
      // word: offer its suggestions again, or Space would leave it in English.
      this.refresh();
    });
    area.addEventListener('blur', () => {
      this.blurTimer = window.setTimeout(() => {
        this.blurTimer = undefined;
        this.hide();
        this.closeDock();
      }, 150);
    });
    // keydown must run before the character reaches the textarea.
    area.addEventListener('keydown', (e) => this.onKeyDown(e));

    // mousedown, not click: the textarea must not blur before the commit.
    // The whole dock does this, so tapping the scroll buttons or the toolbar
    // keeps the keyboard up. Buttons in the toolbar still act on `click`
    // (the iOS clipboard needs a click, not a mousedown, as its gesture).
    this.dock.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (btn?.dataset.index !== undefined) this.commit(Number(btn.dataset.index));
    });
    this.prev.addEventListener('click', () => this.page(-1));
    this.next.addEventListener('click', () => this.page(1));
    this.box.addEventListener('scroll', () => this.updatePaging(), { passive: true });

    window.addEventListener('resize', () => (this.docked ? this.queuePosition() : this.hide()));
    window.addEventListener(
      'scroll',
      (e) => {
        // The strip's own horizontal scroll is not a page scroll.
        if (e.target instanceof Node && this.dock.contains(e.target)) return;
        if (this.docked) this.queuePosition();
        else this.hide();
      },
      true,
    );

    // The keyboard opening or closing resizes the VISUAL viewport only (iOS,
    // and Android Chrome since 108); the layout viewport stays put. This is
    // what keeps the strip on top of the keyboard.
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', () => this.queuePosition());
      vv.addEventListener('scroll', () => this.queuePosition());
    }

    this.dockQuery = typeof window.matchMedia === 'function' ? window.matchMedia(DOCK_QUERY) : undefined;
    const onLayout = (): void => this.setDocked(this.dockQuery?.matches ?? false);
    if (this.dockQuery) {
      // addListener, not addEventListener('change'): the floor is Safari 13.
      this.dockQuery.addListener(onLayout);
    }
    onLayout();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.hide();
    else this.refresh();
  }

  isOpen(): boolean {
    return !this.box.hidden;
  }

  /** True when the phone strip layout is in use (whether or not it is showing). */
  isDocked(): boolean {
    return this.docked;
  }

  /** A short line in the strip's top row (phone only). Empty string clears it. */
  setNote(text: string): void {
    this.note.textContent = text;
  }

  /* --------------------------------------------------------------- state */

  /** The roman run ending at the caret, if the caret is inside one. */
  private pendingAt(): PendingRoman | undefined {
    return this.host.pending();
  }

  /** Copy/Share and touch-keyboard beforeinput share the same commit policy. */
  commitPending(trailing = ''): boolean {
    if (!this.enabled || this.host.composing()) return false;
    this.refresh();
    if (!this.isOpen() || !this.pending || !this.shown.length) return false;
    this.commit(this.active, trailing);
    return true;
  }

  private refresh(): void {
    if (!this.enabled || this.host.composing()) return this.hide();

    const pending = this.pendingAt();
    if (pending === undefined) return this.hide();

    // The typed word itself stays in the bar, as the last item, so an English
    // word can be kept with Alt+number. Hiding it (the earlier rule) meant
    // Escape was the only way out, and learn() never saw the choice. Once
    // picked, learn() moves it up for that key, so Space then commits it.
    // With no Odia candidate at all there is nothing to choose between, so the
    // bar stays hidden.
    const all = this.host.candidates(pending.roman);
    const ranked = all.filter((c) => c.source !== 'verbatim');
    if (ranked.length === 0) return this.hide();

    const verbatim = all.find((c) => c.source === 'verbatim');
    const candidates =
      verbatim === undefined ? ranked.slice(0, MAX_SHOWN) : [...ranked.slice(0, MAX_SHOWN - 1), verbatim];

    // The same word re-read (the keyup after an arrow key, a click in the
    // box) keeps its highlight; a new word starts at the top. Resetting here
    // used to undo every arrow-key move on the keyup that followed it.
    const same =
      this.pending !== undefined && !this.box.hidden &&
      this.pending.start === pending.start && this.pending.roman === pending.roman &&
      this.shown.length === candidates.length;
    this.pending = pending;
    this.shown = candidates;
    if (!same) this.active = 0;
    this.draw();
  }

  /* ---------------------------------------------------------------- keys */

  private onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || this.host.composing() ||
        event.metaKey || event.ctrlKey || event.getModifierState('AltGraph')) return;
    // Re-read the actual selection: touch handles and programmatic selection
    // changes do not necessarily emit click/keyup before the next key.
    this.refresh();
    if (!this.isOpen() || this.shown.length === 0) return;
    if (event.altKey) {
      const digit = /^Digit([1-9])$/.exec(event.code)?.[1] ?? (/^[1-9]$/.test(event.key) ? event.key : undefined);
      if (digit && !event.shiftKey) {
        const index = Number(digit) - 1;
        if (index < this.shown.length) { event.preventDefault(); this.commit(index); }
      }
      return;
    }
    if (event.shiftKey) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.active = (this.active + 1) % this.shown.length;
        this.draw();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active = (this.active - 1 + this.shown.length) % this.shown.length;
        this.draw();
        break;
      case 'Tab':
        event.preventDefault();
        this.commit(this.active);
        break;
      case 'Enter':
        event.preventDefault();
        this.commit(this.active, '\n');
        break;
      case ' ':
        event.preventDefault();
        this.commit(this.active, ' ');
        break;
      case 'Escape': {
        event.preventDefault();
        const pending = this.pending;
        if (pending) this.host.keep(pending.start, pending.end);
        this.hide();
        break;
      }
      default:
        break;
    }
  }

  /* -------------------------------------------------------------- commit */

  private commit(index: number, trailing = ''): void {
    const chosen = this.shown[index];
    const pending = this.pending;
    if (chosen === undefined || pending === undefined) return;

    const current = this.pendingAt();
    if (!current || current.start !== pending.start || current.roman !== pending.roman || current.tailEnd !== pending.tailEnd) {
      this.refresh();
      return;
    }
    const punctuation = this.area.value.slice(pending.end, pending.tailEnd);
    const replaced = chosen.text + punctuation + trailing;
    this.host.replace(pending.start, pending.tailEnd, replaced, isLatin(chosen.text));

    // The chosen word and its meaning, from the option's accessible name
    // (the overlay adds the meaning to it), read before the list is cleared.
    const item = this.box.children[index] as HTMLElement | undefined;
    const said = item?.getAttribute('aria-label') ?? chosen.text;

    this.hide();
    this.say(`Chosen: ${said}`);
    this.host.onCommit(pending.roman, chosen.text);
  }

  /** Polite announcement; the same text twice is still spoken. */
  private say(text: string): void {
    if (this.announceTimer !== undefined) window.clearTimeout(this.announceTimer);
    this.announceTimer = undefined;
    this.live.textContent = '';
    window.setTimeout(() => (this.live.textContent = text), 50);
  }

  /** After a pause in typing: how many suggestions, and the first one. */
  private announceLater(): void {
    if (this.announceTimer !== undefined) window.clearTimeout(this.announceTimer);
    this.announceTimer = window.setTimeout(() => {
      this.announceTimer = undefined;
      if (this.box.hidden) return;
      const first = this.box.children[0] as HTMLElement | undefined;
      const n = this.shown.length;
      this.live.textContent = `${n} suggestion${n === 1 ? '' : 's'}. 1: ${first?.getAttribute('aria-label') ?? ''}`;
    }, ANNOUNCE_MS);
  }

  /* ---------------------------------------------------------------- view */

  private hide(): void {
    this.box.hidden = true;
    this.shown = [];
    this.pending = undefined;
    this.area.removeAttribute('aria-activedescendant');
    if (this.announceTimer !== undefined) window.clearTimeout(this.announceTimer);
    this.announceTimer = undefined;
    if (this.dockOpen) {
      this.updatePaging();
      this.queuePosition();
    }
  }

  private draw(): void {
    const scroll = this.box.scrollLeft;
    const sameWord = this.box.dataset.roman === this.pending?.roman;
    this.box.textContent = '';
    this.box.dataset.roman = this.pending?.roman ?? '';
    this.shown.forEach((candidate, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      const latin = isLatin(candidate.text);
      item.className =
        'inline-candidate' + (latin ? ' inline-verbatim' : '') + (i === this.active ? ' is-active' : '');
      item.dataset.index = String(i);
      item.id = `inline-candidate-${i}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(i === this.active));
      // Not a tab stop: focus stays in the text box, which points here.
      item.tabIndex = -1;

      const num = document.createElement('span');
      num.className = 'inline-num';
      num.textContent = String(i + 1);
      num.setAttribute('aria-hidden', 'true');
      item.append(num);

      // Latin gets its own class, not '.odia' or '.inline-text': it must not be
      // drawn in the Odia font, and the dictionary overlay skips it.
      const text = document.createElement('span');
      text.className = latin ? 'inline-latin' : 'inline-text odia';
      text.textContent = candidate.text;
      if (latin) {
        item.title = 'Keep as typed';
        const keep = document.createElement('span');
        keep.className = 'inline-keep';
        keep.textContent = 'Keep';
        item.append(keep);
      } else {
        text.lang = 'or';
      }

      item.append(text);
      const badge = latin ? undefined : this.host.badge?.(candidate.text);
      if (badge) item.append(badgeElement(badge));
      // Accessible name: "<word>, <badge>"; the overlay appends the meaning.
      const label = latin ? `Keep "${candidate.text}", as typed` : candidate.text + (badge ? `, ${badge.text}` : '');
      item.dataset.label = label;
      item.setAttribute('aria-label', label);
      this.box.appendChild(item);
    });

    this.box.hidden = false;
    this.area.setAttribute('aria-activedescendant', `inline-candidate-${this.active}`);
    if (!sameWord) this.announceLater();
    if (this.docked) {
      // Arrow keys (a Bluetooth keyboard on a phone) keep the highlight visible;
      // a new word starts at the left.
      this.box.scrollLeft = sameWord ? scroll : 0;
      this.revealActive();
      this.openDock();
    } else {
      this.place();
    }
  }

  /**
   * Position the popover at the caret, kept inside the text box's column and
   * clear of the host's keep-clear elements: under the caret line if it fits
   * there, else above it, else on the roomier side with its own scroll.
   */
  private place(): void {
    const rect = this.area.getBoundingClientRect();
    const style = window.getComputedStyle(this.area);
    const marker = this.measureCaret(style);

    const lineHeight = parseFloat(style.lineHeight || '20') || 20;
    const caretTop = rect.top + window.scrollY + marker.offsetTop - this.area.scrollTop;
    const caretBottom = caretTop + lineHeight;
    const left = rect.left + window.scrollX + marker.offsetLeft;

    // Keep the bar inside the text box's column: never wider than it, and
    // nudged left rather than running past its right edge. Clamping to the
    // window instead let item 5 slide under the docked dictionary column on
    // desktop (audit H6), because that column is beside the text box, not
    // outside the window.
    const columnLeft = rect.left + window.scrollX;
    const columnRight = Math.min(rect.right, window.innerWidth - 8) + window.scrollX;
    this.box.style.maxWidth = `${Math.round(columnRight - columnLeft)}px`;
    this.box.style.left = `${Math.round(left)}px`;
    this.box.style.maxHeight = '';

    const width = this.box.getBoundingClientRect().width;
    const overflow = left + width - columnRight;
    if (overflow > 0) this.box.style.left = `${Math.round(Math.max(columnLeft, left - overflow))}px`;

    // Vertical: below the caret line down to the first keep-clear element
    // (or the window bottom), else above it up to the window top.
    const natural = this.box.getBoundingClientRect().height;
    const gap = 4;
    let limitBelow = window.scrollY + window.innerHeight - gap;
    for (const el of this.host.keepClear?.() ?? []) {
      if (!el || el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0) continue;
      const top = r.top + window.scrollY;
      if (top >= caretBottom - 1) limitBelow = Math.min(limitBelow, top - gap);
    }
    const roomBelow = limitBelow - caretBottom;
    const roomAbove = caretTop - (window.scrollY + gap);

    let top: number;
    let maxHeight: number | undefined;
    if (natural <= roomBelow) top = caretBottom;
    else if (natural <= roomAbove) top = caretTop - natural;
    else if (roomBelow >= roomAbove) {
      top = caretBottom;
      maxHeight = Math.max(0, roomBelow);
    } else {
      maxHeight = Math.max(0, roomAbove);
      top = caretTop - maxHeight;
    }
    this.box.style.top = `${Math.round(top)}px`;
    this.box.style.maxHeight = maxHeight === undefined ? '' : `${Math.floor(maxHeight)}px`;
    this.box.dataset.side = top < caretTop ? 'above' : 'below';
    this.revealActive();
  }

  /** Fill the mirror up to the caret and return the marker span at its end. */
  private measureCaret(style: CSSStyleDeclaration): HTMLSpanElement {
    for (const prop of MIRRORED) {
      this.mirror.style[prop as never] = style[prop as never];
    }
    this.mirror.style.position = 'absolute';
    this.mirror.style.visibility = 'hidden';
    this.mirror.style.whiteSpace = 'pre-wrap';
    this.mirror.style.wordWrap = 'break-word';
    this.mirror.style.overflow = 'hidden';
    this.mirror.style.height = 'auto';

    const caretIndex = this.pending?.end ?? this.area.selectionStart ?? 0;
    this.mirror.textContent = this.area.value.slice(0, caretIndex);
    const marker = document.createElement('span');
    marker.textContent = '\u200B';
    this.mirror.appendChild(marker);
    return marker;
  }

  /* ---------------------------------------------------------- phone strip */

  private setDocked(on: boolean): void {
    if (on === this.docked) return;
    this.docked = on;
    this.dock.dataset.mode = on ? 'docked' : 'popover';
    this.hide();
    this.box.style.top = '';
    this.box.style.left = '';
    this.box.style.maxWidth = '';
    this.box.style.maxHeight = '';
    if (on && document.activeElement === this.area) this.openDock();
    if (!on) this.closeDock();
  }

  private openDock(): void {
    if (!this.docked) return;
    this.dockOpen = true;
    this.dock.classList.add('is-open');
    document.body.classList.add('kb-docked');
    this.updatePaging();
    this.queuePosition();
  }

  private closeDock(): void {
    this.dockOpen = false;
    this.dock.classList.remove('is-open');
    document.body.classList.remove('kb-docked');
    document.body.style.paddingBottom = '';
  }

  private queuePosition(): void {
    if (!this.dockOpen || this.positionQueued) return;
    this.positionQueued = true;
    window.requestAnimationFrame(() => {
      this.positionQueued = false;
      this.positionDock();
    });
  }

  /**
   * Pin the strip to the bottom of the visual viewport, leave room for it at
   * the end of the page, and scroll the caret line above it.
   */
  private positionDock(): void {
    if (!this.dockOpen) return;
    const height = this.dock.offsetHeight;
    const vv = window.visualViewport;

    let stripTop: number; // in layout-viewport client coordinates
    if (vv) {
      stripTop = vv.offsetTop + vv.height - height;
      this.dock.style.top = `${Math.round(stripTop)}px`;
      this.dock.style.bottom = 'auto';
      this.dock.style.left = `${Math.round(vv.offsetLeft)}px`;
      this.dock.style.width = `${Math.round(vv.width)}px`;
    } else {
      // Graceful fallback: the CSS default (fixed to the bottom of the layout
      // viewport). Right wherever the browser resizes the layout viewport for
      // the keyboard.
      this.dock.style.top = '';
      this.dock.style.bottom = '';
      this.dock.style.left = '';
      this.dock.style.width = '';
      stripTop = window.innerHeight - height;
    }

    document.body.style.paddingBottom = `${height}px`;

    // Keep the caret line visible above the strip.
    const style = window.getComputedStyle(this.area);
    const marker = this.measureCaret(style);
    const rect = this.area.getBoundingClientRect();
    const lineHeight = parseFloat(style.lineHeight || '24') || 24;
    const caretBottom = Math.min(
      rect.bottom,
      rect.top + marker.offsetTop - this.area.scrollTop + lineHeight + 8,
    );
    const visibleTop = vv ? vv.offsetTop : 0;
    if (caretBottom > stripTop) {
      window.scrollBy(0, Math.ceil(caretBottom - stripTop));
    } else if (rect.top + marker.offsetTop - this.area.scrollTop < visibleTop) {
      window.scrollBy(0, Math.floor(rect.top + marker.offsetTop - this.area.scrollTop - visibleTop - 8));
    }
  }

  /** Scroll the strip by one screenful of cards. */
  private page(direction: 1 | -1): void {
    const step = Math.max(1, this.box.clientWidth - 8);
    const left = this.box.scrollLeft + direction * step;
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof this.box.scrollTo === 'function') this.box.scrollTo({ left, behavior: still ? 'auto' : 'smooth' });
    else this.box.scrollLeft = left;
  }

  /** Show the scroll buttons only when there is something to scroll to. */
  private updatePaging(): void {
    const scrollable = !this.box.hidden && this.box.scrollWidth > this.box.clientWidth + 1;
    this.prev.hidden = !scrollable;
    this.next.hidden = !scrollable;
    if (!scrollable) return;
    this.prev.disabled = this.box.scrollLeft <= 1;
    this.next.disabled = this.box.scrollLeft + this.box.clientWidth >= this.box.scrollWidth - 1;
  }

  /**
   * Bring the highlighted item into view inside the list (sideways in the
   * strip, up/down in a popover that had to scroll) without scrolling the page.
   */
  private revealActive(): void {
    const item = this.box.children[this.active] as HTMLElement | undefined;
    if (!item) return;
    if (!this.docked) {
      const top = item.offsetTop;
      const bottom = top + item.offsetHeight;
      if (top < this.box.scrollTop) this.box.scrollTop = top;
      else if (bottom > this.box.scrollTop + this.box.clientHeight) this.box.scrollTop = bottom - this.box.clientHeight;
      return;
    }
    const left = item.offsetLeft - this.box.offsetLeft;
    const right = left + item.offsetWidth;
    if (left < this.box.scrollLeft) this.box.scrollLeft = left;
    else if (right > this.box.scrollLeft + this.box.clientWidth) this.box.scrollLeft = right - this.box.clientWidth;
  }
}

/** A flag as text ("offensive"), never colour alone. Shared with main.ts. */
export function badgeElement(badge: Badge): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = `badge badge-${badge.kind}`;
  span.textContent = badge.text;
  return span;
}

function scrollButton(label: string, name: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'kb-bar-page';
  button.textContent = label;
  button.setAttribute('aria-label', name);
  button.hidden = true;
  return button;
}
