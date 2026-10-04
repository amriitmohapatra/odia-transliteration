/**
 * Live candidate bar — the Windows IME interaction, in two layouts.
 *
 * You type roman, a numbered list appears as you go, and a number key (or a
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
 *   popover  desktop. The list floats just under the caret. Caret position is
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
 *     instead and is skipped by the overlay (no gloss).
 * Rename any of these only together with overlay.ts.
 */

import type { Candidate } from '@odia/core/types';

import type { Badge } from './badges.js';

export interface InlineHost {
  /** Candidates for the roman word currently under the caret. */
  candidates(roman: string): Candidate[];
  /** Called after a commit, so the page can re-render and record the choice. */
  onCommit(roman: string, text: string): void;
  /** A text badge ("offensive", "can be rude") for an Odia candidate, if flagged. */
  badge?(text: string): Badge | undefined;
}

/** Roman word immediately before the caret, and where it starts. */
interface Pending {
  roman: string;
  start: number;
  end: number;
}

const MAX_SHOWN = 9;

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
  private readonly dockQuery: MediaQueryList | undefined;

  private shown: Candidate[] = [];
  private pending: Pending | undefined;
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
    this.note.setAttribute('aria-live', 'polite');
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

    area.addEventListener('input', () => this.refresh());
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
  private pendingAt(): Pending | undefined {
    const { value, selectionStart, selectionEnd } = this.area;
    if (selectionStart === null || selectionStart !== selectionEnd) return undefined;

    let start = selectionStart;
    while (start > 0 && isRoman(value[start - 1] as string)) start -= 1;
    if (start === selectionStart) return undefined; // caret not after a roman run

    const roman = value.slice(start, selectionStart);
    if (roman.length === 0) return undefined;
    return { roman, start, end: selectionStart };
  }

  private refresh(): void {
    if (!this.enabled) return this.hide();

    const pending = this.pendingAt();
    if (pending === undefined) return this.hide();

    // The typed word itself stays in the bar, as the last item, so an English
    // word can be kept with one number key. Hiding it (the earlier rule) meant
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

    this.pending = pending;
    this.shown = candidates;
    this.active = 0;
    this.draw();
  }

  /* ---------------------------------------------------------------- keys */

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.isOpen() || this.shown.length === 0) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    // 1-9 commit directly, the way the Windows IME does.
    if (/^[1-9]$/.test(event.key)) {
      const index = Number(event.key) - 1;
      if (index < this.shown.length) {
        event.preventDefault();
        this.commit(index);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        this.active = (this.active + 1) % this.shown.length;
        this.draw();
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        this.active = (this.active - 1 + this.shown.length) % this.shown.length;
        this.draw();
        break;
      case 'Enter':
      case 'Tab':
        event.preventDefault();
        this.commit(this.active);
        break;
      case ' ':
        // Space commits the highlighted word and keeps the space, which is how
        // you type a sentence without ever leaving the keyboard.
        event.preventDefault();
        this.commit(this.active, ' ');
        break;
      case 'Escape':
        event.preventDefault();
        this.hide();
        break;
      default:
        break;
    }
  }

  /* -------------------------------------------------------------- commit */

  private commit(index: number, trailing = ''): void {
    const chosen = this.shown[index];
    const pending = this.pending;
    if (chosen === undefined || pending === undefined) return;

    const { value } = this.area;
    const replaced = chosen.text + trailing;
    this.area.value = value.slice(0, pending.start) + replaced + value.slice(pending.end);

    const caret = pending.start + replaced.length;
    this.area.setSelectionRange(caret, caret);

    this.hide();
    this.host.onCommit(pending.roman, chosen.text);
  }

  /* ---------------------------------------------------------------- view */

  private hide(): void {
    this.box.hidden = true;
    this.shown = [];
    this.pending = undefined;
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

      const num = document.createElement('span');
      num.className = 'inline-num';
      num.textContent = String(i + 1);
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
      this.box.appendChild(item);
    });

    this.box.hidden = false;
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

  /** Position the popover just under the caret, kept inside the text box's column. */
  private place(): void {
    const rect = this.area.getBoundingClientRect();
    const style = window.getComputedStyle(this.area);
    const marker = this.measureCaret(style);

    const top =
      rect.top + window.scrollY + marker.offsetTop - this.area.scrollTop +
      parseFloat(style.lineHeight || '20');
    const left = rect.left + window.scrollX + marker.offsetLeft;

    // Keep the bar inside the text box's column: never wider than it, and
    // nudged left rather than running past its right edge. Clamping to the
    // window instead let item 5 slide under the docked dictionary column on
    // desktop (audit H6), because that column is beside the text box, not
    // outside the window.
    const columnLeft = rect.left + window.scrollX;
    const columnRight = Math.min(rect.right, window.innerWidth - 8) + window.scrollX;
    this.box.style.maxWidth = `${Math.round(columnRight - columnLeft)}px`;
    this.box.style.top = `${Math.round(top)}px`;
    this.box.style.left = `${Math.round(left)}px`;

    const width = this.box.getBoundingClientRect().width;
    const overflow = left + width - columnRight;
    if (overflow > 0) this.box.style.left = `${Math.round(Math.max(columnLeft, left - overflow))}px`;
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
    if (typeof this.box.scrollTo === 'function') this.box.scrollTo({ left, behavior: 'smooth' });
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

  /** Bring the highlighted card into the strip without scrolling the page. */
  private revealActive(): void {
    const item = this.box.children[this.active] as HTMLElement | undefined;
    if (!item) return;
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

function isRoman(ch: string): boolean {
  return /[A-Za-z_~]/.test(ch);
}
