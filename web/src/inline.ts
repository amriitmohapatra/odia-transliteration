/**
 * Live candidate bar at the caret — the Windows IME interaction.
 *
 * You type roman, a numbered list appears next to the caret as you go, and a
 * number key commits that word IN PLACE, replacing the roman with Odia. The
 * textarea therefore ends up holding a mix of committed Odia and the roman word
 * you are still typing, which is exactly what an input method does.
 *
 * That mix works because the engine's tokenizer treats anything outside ASCII
 * as pass-through: already-committed Odia is copied verbatim while the roman
 * word under the caret keeps converting.
 *
 * Caret position is measured with a mirror element — a hidden div given the
 * textarea's exact metrics, filled with the text up to the caret, with a marker
 * span at the end. Reading that span's offset is the only reliable way to place
 * something at the caret inside a <textarea>, which exposes no range geometry.
 */

import type { Candidate } from '@odia/core/types';

export interface InlineHost {
  /** Candidates for the roman word currently under the caret. */
  candidates(roman: string): Candidate[];
  /** Called after a commit, so the page can re-render and record the choice. */
  onCommit(roman: string, text: string): void;
}

/** Roman word immediately before the caret, and where it starts. */
interface Pending {
  roman: string;
  start: number;
  end: number;
}

const MAX_SHOWN = 9;

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
  private readonly area: HTMLTextAreaElement;
  private readonly host: InlineHost;
  private readonly box: HTMLDivElement;
  private readonly mirror: HTMLDivElement;

  private shown: Candidate[] = [];
  private pending: Pending | undefined;
  private active = 0;
  private enabled = true;

  constructor(area: HTMLTextAreaElement, host: InlineHost) {
    this.area = area;
    this.host = host;

    this.box = document.createElement('div');
    this.box.className = 'inline-candidates';
    this.box.hidden = true;
    this.box.setAttribute('role', 'listbox');
    document.body.appendChild(this.box);

    this.mirror = document.createElement('div');
    this.mirror.className = 'caret-mirror';
    this.mirror.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.mirror);

    area.addEventListener('input', () => this.refresh());
    area.addEventListener('click', () => this.refresh());
    area.addEventListener('keyup', (e) => {
      if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') this.refresh();
    });
    area.addEventListener('blur', () => window.setTimeout(() => this.hide(), 150));
    // keydown must run before the character reaches the textarea.
    area.addEventListener('keydown', (e) => this.onKeyDown(e));

    this.box.addEventListener('mousedown', (e) => {
      // mousedown, not click: the textarea must not blur before the commit.
      e.preventDefault();
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (btn?.dataset.index !== undefined) this.commit(Number(btn.dataset.index));
    });

    window.addEventListener('resize', () => this.hide());
    window.addEventListener('scroll', () => this.hide(), true);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.hide();
    else this.refresh();
  }

  isOpen(): boolean {
    return !this.box.hidden;
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
  }

  private draw(): void {
    this.box.textContent = '';
    this.shown.forEach((candidate, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      const latin = isLatin(candidate.text);
      item.className =
        'inline-candidate' + (latin ? ' inline-verbatim' : '') + (i === this.active ? ' is-active' : '');
      item.dataset.index = String(i);
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(i === this.active));

      const num = document.createElement('span');
      num.className = 'inline-num';
      num.textContent = String(i + 1);

      // Latin gets its own class, not '.odia' or '.inline-text': it must not be
      // drawn in the Odia font, and the dictionary overlay skips it.
      const text = document.createElement('span');
      text.className = latin ? 'inline-latin' : 'inline-text odia';
      text.textContent = candidate.text;
      if (latin) item.title = 'Keep as typed';

      item.append(num, text);
      this.box.appendChild(item);
    });

    this.box.hidden = false;
    this.place();
  }

  /** Position the bar just under the caret, kept inside the viewport. */
  private place(): void {
    const rect = this.area.getBoundingClientRect();
    const style = window.getComputedStyle(this.area);

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
    marker.textContent = '​';
    this.mirror.appendChild(marker);

    const top =
      rect.top + window.scrollY + marker.offsetTop - this.area.scrollTop +
      parseFloat(style.lineHeight || '20');
    const left = rect.left + window.scrollX + marker.offsetLeft;

    this.box.style.top = `${Math.round(top)}px`;
    this.box.style.left = `${Math.round(left)}px`;

    // Nudge back inside the viewport if the bar would run off the right edge.
    const box = this.box.getBoundingClientRect();
    const overflow = box.right - (window.innerWidth - 8);
    if (overflow > 0) this.box.style.left = `${Math.round(left - overflow)}px`;
  }
}

function isRoman(ch: string): boolean {
  return /[A-Za-z_~]/.test(ch);
}
