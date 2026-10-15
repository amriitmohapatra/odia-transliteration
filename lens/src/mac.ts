/**
 * The page inside the Mac lens (mac-lens/): the results panel under the
 * see-through frame. The Swift app captures the screen below the frame, runs
 * Tesseract on it (the `tesseract` program, model `ori`) and calls
 * `window.odiaMac.show(lines)` with the lines and words it read. This page
 * does the rest with the extension's own code: correction and splitting
 * (correct.ts), lookup with the word before (engine.ts), the list
 * (frameview.ts), and a card for a chosen word.
 *
 * Files come from the app bundle through the app's `odialens:` scheme
 * (relative paths: dict/...). Nothing goes over the network.
 *
 * The status line names each step (dictionary, OCR, last reading), so a first
 * report from the owner tells which step failed.
 */

import { explainLines, explainer, fetchLoader, loadWords, lookup, setLoader } from './engine.js';
import { wordAt, wordBefore } from './word.js';
import { FRAME_VIEW_CSS, renderDetail, renderLines } from './frameview.js';
import type { FrameWord } from './messages.js';
import type { Box } from './picture.js';

/** A line as the Swift side read it (boxes in screen points inside the frame). */
interface NativeLine {
  box?: Box;
  words: { text: string; conf: number; box: Box; whole?: string }[];
}

interface NativeInfo {
  /** Milliseconds for capture plus OCR in the app. */
  ms?: number;
  /** The OCR program and version, e.g. "tesseract 5.5.0". */
  engine?: string;
  /** An error from the app (capture or OCR), shown as it is. */
  error?: string;
}

declare global {
  interface Window {
    odiaMac: {
      show(lines: NativeLine[], info?: NativeInfo): Promise<number>;
      status(text: string): void;
      /** Card mode (V4.8): the word at `offset` (UTF-16) in `text`, the text an app shows around the pointer. */
      word(text: string, offset: number): Promise<boolean>;
    };
    webkit?: { messageHandlers?: { lens?: { postMessage(message: unknown): void } } };
  }
}

setLoader(fetchLoader((path) => path));

const CSS = `
:root {
  color-scheme: light dark;
  --nila: #1e2f5c; --hingula: #b7321e; --haritala: #e8b23a;
  --shankha: #fbf6ea; --kajal: #1c1712; --stone: #6f6253; --line: #e3d6bb;
}
body { margin: 0; padding: 0 12px 12px; background: var(--shankha); color: var(--kajal);
  font: 14px/1.4 -apple-system, system-ui, sans-serif; }
body::before {
  content: ""; display: block; height: 7px; margin: 0 -12px 8px;
  background:
    linear-gradient(135deg, var(--hingula) 25%, transparent 25%) 0 0 / 14px 7px repeat-x,
    linear-gradient(225deg, var(--hingula) 25%, transparent 25%) 0 0 / 14px 7px repeat-x,
    var(--haritala);
}
.status { font-size: 11.5px; color: var(--stone); margin-bottom: 8px; }
.status .bad { color: var(--hingula); }
body.card-mode { padding: 0 10px 10px; }
body.card-mode::before { margin: 0 -10px 8px; }
body.card-mode .detail { margin-top: 0; border: 0; padding: 4px 2px; background: transparent; }
@media (prefers-color-scheme: dark) {
  :root { --shankha: #17150f; --kajal: #f3ead6; --stone: #c9bb9d; --line: #3a3326; }
}
` + FRAME_VIEW_CSS;

const style = document.createElement('style');
style.textContent = CSS;
document.head.append(style);
const statusEl = document.createElement('div');
statusEl.className = 'status';
const listEl = document.createElement('div');
const cardEl = document.createElement('div');
document.body.append(statusEl, listEl, cardEl);

const steps = { dictionary: 'loading…', ocr: 'waiting for the first reading', last: '' };
function showStatus(bad = false): void {
  statusEl.textContent = '';
  const line = `Dictionary: ${steps.dictionary} · OCR: ${steps.ocr}${steps.last ? ` · ${steps.last}` : ''}`;
  const span = document.createElement('span');
  if (bad) span.className = 'bad';
  span.textContent = line;
  statusEl.append(span);
}
showStatus();

const post = (message: unknown): void => window.webkit?.messageHandlers?.lens?.postMessage(message);

async function show(lines: NativeLine[], info: NativeInfo = {}): Promise<number> {
  cardEl.textContent = '';
  if (info.error) {
    steps.ocr = info.error;
    steps.last = '';
    showStatus(true);
    listEl.textContent = '';
    return 0;
  }
  if (info.engine) steps.ocr = info.engine;
  const t0 = performance.now();
  const out = await explainLines(lines);
  const lookupMs = Math.round(performance.now() - t0);
  steps.last = `${out.length} line${out.length === 1 ? '' : 's'}${info.ms !== undefined ? ` · read ${info.ms} ms` : ''} · meanings ${lookupMs} ms`;
  showStatus();
  listEl.textContent = '';
  listEl.append(
    renderLines(document, out, (w, chip) => {
      for (const c of Array.from(listEl.querySelectorAll('.chip[aria-pressed="true"]'))) c.setAttribute('aria-pressed', 'false');
      chip.setAttribute('aria-pressed', 'true');
      cardEl.textContent = '';
      cardEl.append(renderDetail(document, w));
      // Under the word's own line, so the reader keeps their place.
      (chip.closest('.line') ?? document.body).append(cardEl);
      cardEl.scrollIntoView({ block: 'nearest' });
    }),
  );
  post({ type: 'shown', lines: out.length, height: document.documentElement.scrollHeight });
  return out.length;
}

/**
 * Card mode (V4.8, the page loaded as index.html#card in the Mac lens's small
 * card panel): the exact word under the pointer in any app, read through macOS
 * Accessibility by the Swift side, which sends the text around the pointer.
 */
const cardMode = location.hash === '#card';
if (cardMode) {
  statusEl.hidden = true;
  document.body.classList.add('card-mode');
}

async function word(text: string, offset: number): Promise<boolean> {
  const found = wordAt(text, offset);
  if (!found) {
    post({ type: 'card', found: false });
    return false;
  }
  const previous = wordBefore(text, found.start);
  const card = await lookup(found.word, previous);
  const w: FrameWord = {
    text: found.word,
    conf: 100,
    box: { x0: 0, y0: 0, x1: 0, y1: 0 },
    card,
    reading: { readAs: found.word, corrected: null, conf: 100, partOf: null },
  };
  listEl.textContent = '';
  cardEl.textContent = '';
  cardEl.append(renderDetail(document, w, 'Text under the pointer'));
  document.body.append(cardEl);
  // The card's own height (the document is at least as tall as the panel).
  post({ type: 'card', found: true, height: Math.ceil(cardEl.getBoundingClientRect().bottom + 10) });
  return true;
}

window.odiaMac = {
  show,
  status(text: string) {
    steps.last = text;
    showStatus();
  },
  word,
};

// Load the dictionary now, so the first reading is quick; say when it is ready.
Promise.all([loadWords(), explainer()]).then(
  () => {
    steps.dictionary = 'ready';
    showStatus();
    post({ type: 'ready' });
  },
  (error: unknown) => {
    steps.dictionary = `failed (${String(error)})`;
    showStatus(true);
    post({ type: 'error', error: String(error) });
  },
);
