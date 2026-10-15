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

import { canonical } from '@odia/core/normalize';

import { separate } from './correct.js';
import { explainer, fetchLoader, loadWords, readWord, setLoader } from './engine.js';
import { FRAME_VIEW_CSS, renderDetail, renderLines } from './frameview.js';
import type { FrameLine, FrameWord } from './messages.js';
import { HAS_ODIA, cleanRead, lineText, type Box } from './picture.js';

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
  const [list, explainable] = await Promise.all([loadWords(), explainer()]);
  const out: FrameLine[] = [];
  for (const line of lines) {
    const pieces = separate(line.words, list, (t) => canonical(cleanRead(t)), explainable);
    const words: FrameWord[] = [];
    let previous = '';
    for (const w of pieces) {
      if (!HAS_ODIA.test(w.text)) continue;
      const found = await readWord(w.text, w.conf, w.whole, previous);
      if (!found) continue;
      words.push({ text: w.text, conf: w.conf, box: w.box, card: found.card, reading: found.reading });
      previous = found.reading.corrected ?? found.reading.readAs;
    }
    out.push({ read: canonical(lineText(line.words.map((w) => w.text))), words });
  }
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

window.odiaMac = {
  show,
  status(text: string) {
    steps.last = text;
    showStatus();
  },
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
