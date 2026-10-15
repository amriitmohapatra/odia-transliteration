/**
 * The lens frame (frame mode, lens 0.3+): a see-through box the reader moves and
 * resizes over Odia in a picture. Everything inside it is read together, line
 * by line, and the panel under it lists each line as read and each word with
 * its meaning.
 *
 * Owner, 2026-10-15: "ability to adjust the box size by dragging any of the
 * edges" and "working more on the UI/UX of the box". So:
 * - four edges and four corners resize it; the bar above it moves it;
 * - viewfinder corner marks sit just outside the reading area, so they are never
 *   in the screenshot that is read;
 * - the frame shows when it is reading (a moving dashed outline), and the panel
 *   stays where it is meanwhile, dimmed, instead of flickering away;
 * - the panel can be folded away, copies the text read, and shows a word's full
 *   card inside itself (no floating card over the page).
 *
 * The extension's content script owns the shadow root and the messaging; this
 * module owns the frame's DOM, layout and pointer handling.
 */

import { TRANSLATE_NOTICE } from './assist.js';
import { FRAME_VIEW_CSS, renderDetail, renderLines } from './frameview.js';
import type { FrameLine, FrameResponse, TranslateResponse } from './messages.js';

export const FRAME_CSS = `
/* Theme: a Pattachitra painting's border around the frame (hingula red, haritala
 * yellow, lamp-black), a Nilachakra-indigo bar with the Konark wheel, a shankha-white
 * panel under a band of temple-flag triangles. */
:host {
  --nila: #1e2f5c; --nila-deep: #15213f; --hingula: #b7321e; --haritala: #e8b23a;
  --shankha: #fbf6ea; --kajal: #1c1712; --stone: #6f6253; --line: #e3d6bb;
}
.frame {
  position: fixed; z-index: 2147483646; box-sizing: border-box; pointer-events: none;
  border: 3px solid var(--hingula); border-radius: 2px;
  box-shadow: 0 0 0 2px var(--haritala), 0 0 0 3px var(--kajal), 0 6px 22px rgba(28, 23, 18, 0.28);
  transition: border-color 0.2s;
}
.frame.reading { border-color: var(--haritala); }
.frame[hidden], .panel[hidden] { display: none; }

/* Resize: invisible strips over the edges; temple-corner marks just outside. */
.edge { position: absolute; pointer-events: auto; touch-action: none; }
.edge.n, .edge.s { left: 12px; right: 12px; height: 12px; cursor: ns-resize; }
.edge.e, .edge.w { top: 12px; bottom: 12px; width: 12px; cursor: ew-resize; }
.edge.n { top: -8px; } .edge.s { bottom: -8px; } .edge.e { right: -8px; } .edge.w { left: -8px; }
.corner { position: absolute; width: 18px; height: 18px; pointer-events: auto; touch-action: none; }
.corner::after {
  content: ""; position: absolute; width: 9px; height: 9px; background: var(--haritala);
  border: 2px solid var(--kajal); transform: rotate(45deg); box-sizing: border-box;
}
.corner.nw { left: -11px; top: -11px; cursor: nwse-resize; }
.corner.ne { right: -11px; top: -11px; cursor: nesw-resize; }
.corner.sw { left: -11px; bottom: -11px; cursor: nesw-resize; }
.corner.se { right: -11px; bottom: -11px; cursor: nwse-resize; }
.corner::after { left: 4px; top: 4px; }
.corner:hover::after { background: var(--hingula); }

/* The bar: Nilachakra indigo, the Konark wheel, sizes, read again, close. */
.bar {
  position: absolute; left: -5px; bottom: calc(100% + 9px); display: flex; align-items: center; gap: 2px;
  padding: 3px 3px 3px 4px; border-radius: 10px; background: var(--nila); color: var(--shankha);
  border: 1px solid var(--nila-deep); box-shadow: 0 6px 18px rgba(21, 33, 63, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  font: 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  pointer-events: auto; cursor: grab; user-select: none; white-space: nowrap; touch-action: none;
}
.bar.dragging { cursor: grabbing; }
.grip { display: flex; align-items: center; gap: 7px; padding: 3px 9px 3px 3px; }
.wheel { width: 22px; height: 22px; color: var(--haritala); flex: none; }
.wheel.reading { animation: odia-turn 1.6s linear infinite; }
.wheel.failed { color: #ff8a73; }
@keyframes odia-turn { to { transform: rotate(360deg); } }
.brand { font: italic 600 13.5px/1 "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; letter-spacing: 0.01em; }
.sizes { display: flex; border-radius: 7px; background: rgba(0, 0, 0, 0.22); padding: 2px; }
.bar button {
  cursor: pointer; border: 0; border-radius: 6px; padding: 5px 9px; background: transparent;
  color: inherit; font: inherit;
}
.bar button:hover { background: rgba(232, 178, 58, 0.18); color: #fff; }
.bar button:focus-visible { outline: 2px solid var(--haritala); outline-offset: -2px; }
.bar button[aria-pressed="true"] { background: var(--haritala); color: var(--kajal); font-weight: 600; }
.sep { width: 1px; height: 18px; margin: 0 3px; background: rgba(251, 246, 234, 0.2); }

/* The panel: shankha white under a band of temple-flag triangles. */
.panel {
  position: fixed; z-index: 2147483646; box-sizing: border-box; display: flex; flex-direction: column;
  max-height: 46vh; overflow: hidden; border-radius: 12px; background: var(--shankha); color: var(--kajal);
  border: 1px solid var(--line); box-shadow: 0 14px 34px rgba(28, 23, 18, 0.25);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.panel::before {
  content: ""; flex: none; height: 7px;
  background:
    linear-gradient(135deg, var(--hingula) 25%, transparent 25%) 0 0 / 14px 7px repeat-x,
    linear-gradient(225deg, var(--hingula) 25%, transparent 25%) 0 0 / 14px 7px repeat-x,
    var(--haritala);
}
.panel-head {
  display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 12px;
  border-bottom: 1px solid var(--line); font-size: 12px; color: var(--stone);
}
.panel-status { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.panel-head button {
  cursor: pointer; border: 1px solid var(--line); border-radius: 7px; padding: 3px 9px;
  background: #fff; color: var(--kajal); font: inherit;
}
.panel-head button:hover { border-color: var(--hingula); color: var(--hingula); }
.panel-head button:focus-visible { outline: 2px solid var(--nila); outline-offset: 1px; }
.panel-head button.primary { background: var(--nila); border-color: var(--nila); color: var(--shankha); font-weight: 600; }
.panel-head button.primary:hover { background: var(--hingula); border-color: var(--hingula); color: #fff; }
.panel-body { overflow: auto; padding: 10px 12px 12px; transition: opacity 0.15s; }
.panel.stale .panel-body { opacity: 0.45; }
.panel.folded .panel-body { display: none; }
.panel.folded .panel-head { border-bottom: 0; }
/* The English translation (V4.5): an indigo block above the lines. */
.translation {
  margin: 0 0 12px; padding: 10px 12px; border-radius: 10px; background: var(--nila); color: var(--shankha);
  font-size: 14.5px; line-height: 1.5;
}
.translation-label {
  display: block; margin-bottom: 4px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--haritala);
}
.translation.pending { opacity: 0.75; }
.translation p { margin: 0; white-space: pre-wrap; }
.translation .off { font-size: 13px; }
.translation button {
  margin-top: 8px; cursor: pointer; border: 0; border-radius: 7px; padding: 5px 11px;
  background: var(--haritala); color: var(--kajal); font: 600 12.5px system-ui, sans-serif;
}
.translation button:focus-visible { outline: 2px solid var(--shankha); outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  .translation { background: #22325f; }
  .panel { background: #17150f; color: #f3ead6; border-color: #3a3326; }
  .panel-head { color: #c9bb9d; border-bottom-color: #3a3326; }
  .panel-head button { background: #231f17; border-color: #3a3326; color: #f3ead6; }
}
@media (prefers-reduced-motion: reduce) {
  .wheel.reading { animation: none; }
  .frame { transition: none; }
}
` + FRAME_VIEW_CSS;

/**
 * The Konark wheel (the sun temple's chariot wheel, also a sundial): rim, hub,
 * eight broad spokes and eight thin ones. currentColor, so the bar sets it.
 */
const KONARK_WHEEL = `<svg class="wheel" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor">
<circle cx="12" cy="12" r="10.2" stroke-width="2"/><circle cx="12" cy="12" r="7.6" stroke-width="0.8"/>
<g stroke-width="1.7" stroke-linecap="round"><path d="M12 4.4V9.6M12 14.4V19.6M4.4 12H9.6M14.4 12H19.6M6.6 6.6L10.3 10.3M13.7 13.7L17.4 17.4M17.4 6.6L13.7 10.3M10.3 13.7L6.6 17.4"/></g>
<g stroke-width="0.7"><path d="M14.9 5L13 9.7M9.1 19L11 14.3M5 9.1L9.7 11M19 14.9L14.3 13M9.1 5L11 9.7M14.9 19L13 14.3M5 14.9L9.7 13M19 9.1L14.3 11"/></g>
<circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none"/></svg>`;

/** Frame sizes (CSS pixels of the inside): one word, one line, a paragraph. */
export const FRAME_SIZES = { Word: [190, 56], Line: [560, 64], Para: [560, 240] } as const;
type SizeName = keyof typeof FRAME_SIZES;
/** Smallest frame. */
const MIN = { w: 60, h: 28 };
/** Room kept free around the frame (the bar needs space above). */
const MARGIN = { side: 8, top: 44 };
/** The frame's border (the inside starts after it). */
const BORDER = 3;

export interface FrameHost {
  root: ShadowRoot;
  isActive(): boolean;
  /** Hide the hover card (it must not cover the frame). */
  hideCard(): void;
  /** Ask for a reading of the inside of the frame (CSS pixels of the viewport). */
  read(box: { x0: number; y0: number; x1: number; y1: number }, done: (response: FrameResponse | undefined, error?: string) => void): void;
  /** After this long, say "Reading…". */
  slowMs: number;
  /** Translate the lines read (online, only when the reader turned it on). */
  translate(text: string, done: (response: TranslateResponse | undefined, error?: string) => void): void;
  /** Open the lens's settings (where translation is turned on or off). */
  openSettings(): void;
}

export interface Frame {
  readonly open: boolean;
  /** Open around a point (CSS pixels), or in the middle of the window. */
  show(at: { x: number; y: number } | null): void;
  hide(): void;
  /** The page scrolled or the window changed size: keep the frame in view and read again. */
  moved(): void;
}

type Edge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

export function createFrame(host: FrameHost): Frame {
  const doc = host.root.ownerDocument ?? document;
  const el = (tag: string, cls: string, parent?: HTMLElement): HTMLElement => {
    const e = doc.createElement(tag);
    e.className = cls;
    parent?.append(e);
    return e;
  };

  const frameEl = el('div', 'frame');
  frameEl.hidden = true;
  frameEl.setAttribute('role', 'region');
  frameEl.setAttribute('aria-label', 'Odia Lens frame: Odia inside it is read');

  // The bar: grip (drag), status dot, sizes, read again, close.
  const bar = el('div', 'bar', frameEl);
  bar.title = 'Drag to move the frame. Odia inside it is read when you let go.';
  const grip = el('span', 'grip', bar);
  grip.insertAdjacentHTML('beforeend', KONARK_WHEEL);
  const dot = grip.firstElementChild as HTMLElement; // the wheel turns while the frame is read
  el('span', 'brand', grip).textContent = 'Odia Lens';
  const sizes = el('span', 'sizes', bar);
  const sizeButtons = new Map<SizeName, HTMLButtonElement>();
  const button = (parent: HTMLElement, label: string, title: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', '', parent) as HTMLButtonElement;
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    b.addEventListener('pointerdown', (event) => event.stopPropagation());
    return b;
  };
  for (const name of Object.keys(FRAME_SIZES) as SizeName[]) {
    const [w, h] = FRAME_SIZES[name];
    const words = { Word: 'one word', Line: 'one line', Para: 'a paragraph' }[name];
    sizeButtons.set(name, button(sizes, name, `Frame size: ${words}`, () => {
      box.w = w;
      box.h = h;
      layout();
      readSoon(0);
    }));
  }
  el('span', 'sep', bar);
  button(bar, '\u21bb', 'Read again', () => readSoon(0));
  button(bar, '\u2715', 'Close the frame (Esc, or Alt+Shift+F)', () => api.hide());

  // Edges and corners resize.
  const handles: Edge[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
  for (const edge of handles) {
    const h = el('div', `${edge.length === 1 ? 'edge' : 'corner'} ${edge}`, frameEl);
    h.title = 'Drag to resize';
    drag(h, (dx, dy, start) => resize(edge, dx, dy, start));
  }
  drag(bar, (dx, dy, start) => {
    box.x = start.x + dx;
    box.y = start.y + dy;
  });

  // The panel.
  const panel = el('div', 'panel');
  panel.hidden = true;
  panel.lang = 'en';
  const head = el('div', 'panel-head', panel);
  const status = el('div', 'panel-status', head);
  const copy = button(head, 'Copy text', 'Copy the Odia text read inside the frame', () => {
    const text = lines.map((l) => l.read).join('\n');
    if (text) void navigator.clipboard?.writeText(text).then(() => flash(copy, 'Copied'), () => flash(copy, 'Not allowed here'));
  });
  const translateButton = button(head, 'Translate', 'Translate the text read into English (online: turn it on in the lens settings)', () => translateNow());
  translateButton.className = 'primary';
  head.insertBefore(translateButton, copy);
  const english = el('div', 'translation');
  english.setAttribute('aria-live', 'polite');
  const fold = button(head, '\u25be', 'Fold the panel away', () => {
    panel.classList.toggle('folded');
    const folded = panel.classList.contains('folded');
    fold.textContent = folded ? '\u25b8' : '\u25be';
    fold.title = folded ? 'Show the panel' : 'Fold the panel away';
  });
  const body = el('div', 'panel-body', panel);
  host.root.append(frameEl, panel);

  const box = { x: 0, y: 0, w: FRAME_SIZES.Line[0] as number, h: FRAME_SIZES.Line[1] as number };
  let open = false;
  let timer: number | undefined;
  let slow: number | undefined;
  let ticket = 0;
  let lines: FrameLine[] = [];

  function flash(b: HTMLElement, text: string): void {
    const before = b.textContent;
    b.textContent = text;
    window.setTimeout(() => {
      b.textContent = before;
    }, 1200);
  }

  function layout(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    box.w = Math.max(MIN.w, Math.min(box.w, vw - 2 * MARGIN.side));
    box.h = Math.max(MIN.h, Math.min(box.h, vh - MARGIN.top - MARGIN.side));
    box.x = Math.min(Math.max(MARGIN.side, box.x), vw - box.w - MARGIN.side);
    box.y = Math.min(Math.max(MARGIN.top, box.y), vh - box.h - MARGIN.side);
    Object.assign(frameEl.style, {
      left: `${Math.round(box.x)}px`,
      top: `${Math.round(box.y)}px`,
      width: `${Math.round(box.w)}px`,
      height: `${Math.round(box.h)}px`,
    });
    for (const [name, b] of sizeButtons) {
      const [w, h] = FRAME_SIZES[name];
      b.setAttribute('aria-pressed', String(Math.round(box.w) === w && Math.round(box.h) === h));
    }
    // The panel: under the frame, or above it (and its bar) when there is more room there.
    const width = Math.min(Math.max(box.w, 340), vw - 2 * MARGIN.side);
    panel.style.width = `${Math.round(width)}px`;
    panel.style.left = `${Math.round(Math.min(Math.max(MARGIN.side, box.x), vw - width - MARGIN.side))}px`;
    const below = box.y + box.h + 12;
    if (vh - below >= 260 || vh - below >= box.y - 44) {
      panel.style.top = `${Math.round(below)}px`;
      panel.style.bottom = '';
      panel.style.maxHeight = `${Math.round(Math.max(120, vh - below - MARGIN.side))}px`;
    } else {
      panel.style.top = '';
      panel.style.bottom = `${Math.round(vh - box.y + 44)}px`;
      panel.style.maxHeight = `${Math.round(Math.max(120, box.y - 44 - MARGIN.side))}px`;
    }
  }

  function resize(edge: Edge, dx: number, dy: number, start: typeof box): void {
    if (edge.includes('e')) box.w = Math.max(MIN.w, start.w + dx);
    if (edge.includes('s')) box.h = Math.max(MIN.h, start.h + dy);
    if (edge.includes('w')) {
      const w = Math.max(MIN.w, start.w - dx);
      box.x = start.x + start.w - w;
      box.w = w;
    }
    if (edge.includes('n')) {
      const h = Math.max(MIN.h, start.h - dy);
      box.y = start.y + start.h - h;
      box.h = h;
    }
  }

  /** Drag a handle; read when it is let go. */
  function drag(handle: HTMLElement, onMove: (dx: number, dy: number, start: typeof box) => void): void {
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      const start = { ...box };
      const x0 = event.clientX;
      const y0 = event.clientY;
      window.clearTimeout(timer);
      host.hideCard();
      if (handle === bar) bar.classList.add('dragging');
      const move = (e: PointerEvent): void => {
        onMove(e.clientX - x0, e.clientY - y0, start);
        layout();
      };
      const up = (): void => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        bar.classList.remove('dragging');
        readSoon();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  /** Translate the lines read, into a block above them. */
  function translateNow(): void {
    const text = lines.map((l) => l.read).join('\n');
    if (!text) return;
    const mine = ticket;
    english.className = 'translation pending';
    english.textContent = 'Translating\u2026';
    body.prepend(english);
    host.translate(text, (response, error) => {
      if (mine !== ticket) return; // a new reading replaced the lines
      english.className = 'translation';
      english.textContent = '';
      const label = el('span', 'translation-label', english);
      if (response?.ok) {
        label.textContent = 'English \u00b7 machine translation, can be wrong';
        el('p', '', english).textContent = response.translation;
        english.lang = 'en';
        return;
      }
      if (response && !response.ok && response.off) {
        label.textContent = 'Translation is off';
        el('p', 'off', english).textContent = TRANSLATE_NOTICE;
        const on = el('button', '', english) as HTMLButtonElement;
        on.type = 'button';
        on.textContent = 'Open settings to turn it on';
        on.addEventListener('click', () => host.openSettings());
        return;
      }
      label.textContent = 'Could not translate';
      el('p', '', english).textContent = error ?? (response && !response.ok ? response.error : 'No answer.');
    });
  }

  function readSoon(delay = 300): void {
    window.clearTimeout(timer);
    timer = window.setTimeout(read, delay);
  }

  function setStatus(text: string, state: 'reading' | 'done' | 'failed' | 'idle'): void {
    status.textContent = text;
    status.title = text;
    dot.setAttribute('class', `wheel ${state}`);
    frameEl.classList.toggle('reading', state === 'reading');
    panel.classList.toggle('stale', state === 'reading');
  }

  function read(): void {
    timer = undefined;
    if (!open || !host.isActive()) return;
    const mine = ++ticket;
    host.hideCard();
    setStatus('Reading the frame…', 'reading');
    window.clearTimeout(slow);
    slow = window.setTimeout(() => {
      if (mine === ticket && open) panel.hidden = false;
    }, host.slowMs);
    // Two frames: the hover card is off the screen before the screenshot.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      host.read(
        { x0: box.x + BORDER, y0: box.y + BORDER, x1: box.x + box.w - BORDER, y1: box.y + box.h - BORDER },
        (response, error) => {
          window.clearTimeout(slow);
          if (mine !== ticket || !open) return;
          panel.hidden = false;
          if (!response?.ok) {
            const why = error ?? (response && !response.ok ? response.error : 'no answer');
            setStatus(`Could not read the frame: ${why}`, 'failed');
            return;
          }
          lines = response.lines;
          const n = lines.length;
          const words = lines.reduce((s, l) => s + l.words.length, 0);
          setStatus(
            n === 0
              ? 'Nothing read'
              : `${n} line${n === 1 ? '' : 's'} · ${words} word${words === 1 ? '' : 's'} · ${(response.ms / 1000).toFixed(1)} s · click a word for its card`,
            n === 0 ? 'idle' : 'done',
          );
          copy.hidden = n === 0;
          translateButton.hidden = n === 0;
          body.textContent = '';
          const detail = el('div', 'detail-slot');
          body.append(
            renderLines(doc, lines, (w, chip) => {
              for (const c of Array.from(body.querySelectorAll('.chip[aria-pressed="true"]'))) c.setAttribute('aria-pressed', 'false');
              chip.setAttribute('aria-pressed', 'true');
              detail.textContent = '';
              detail.append(renderDetail(doc, w));
              // Under the word's own line, so the reader keeps their place.
              (chip.closest('.line') ?? body).append(detail);
              detail.scrollIntoView({ block: 'nearest' });
            }),
          );
          layout();
        },
      );
    }));
  }

  const api: Frame = {
    get open() {
      return open;
    },
    show(at) {
      open = true;
      box.x = at ? at.x - box.w / 2 : (window.innerWidth - box.w) / 2;
      box.y = at ? at.y - box.h / 2 : (window.innerHeight - box.h) / 2;
      frameEl.hidden = false;
      panel.classList.remove('folded');
      fold.textContent = '\u25be';
      setStatus('', 'idle');
      layout();
      readSoon(150);
    },
    hide() {
      open = false;
      ticket++;
      window.clearTimeout(timer);
      window.clearTimeout(slow);
      frameEl.hidden = true;
      panel.hidden = true;
    },
    moved() {
      if (!open) return;
      layout();
      setStatus('The page moved: reading again…', 'reading');
      readSoon(450);
    },
  };
  return api;
}
