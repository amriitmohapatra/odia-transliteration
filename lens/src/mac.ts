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
import type { LensCard } from './describe.js';
import { explainer, fetchLoader, loadWords, readWord, setLoader } from './engine.js';
import { FRAME_VIEW_CSS, renderLines, shownWord } from './frameview.js';
import type { FrameLine, FrameWord, Reading } from './messages.js';
import { HAS_ODIA, cleanRead, type Box } from './picture.js';

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
:root { color-scheme: light dark; }
body { margin: 0; padding: 10px 12px; background: #fffdf8; color: #1d1b16;
  font: 14px/1.4 -apple-system, system-ui, sans-serif; }
.status { font-size: 11.5px; color: #6b6455; margin-bottom: 8px; }
.status .bad { color: #a33a1c; }
.card { margin-top: 10px; padding: 8px 10px; border: 1px solid #d9d2c3; border-radius: 8px; }
.card .word { font: 600 22px/1.3 "Noto Sans Oriya", "Oriya Sangam MN", "Kalinga", sans-serif; }
.card .roman { font-style: italic; color: #5a5446; }
.card ul { margin: 6px 0 0; padding: 0; list-style: none; }
.card li { margin-top: 4px; }
.card .source, .card .note { display: block; font-size: 11.5px; color: #6b6455; }
@media (prefers-color-scheme: dark) {
  body { background: #24221d; color: #f1ece0; }
  .status, .card .source, .card .note, .card .roman { color: #c3bba8; }
  .card { border-color: #4a4538; }
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

/** The full card for one word, under the list. */
function showCard(card: LensCard | null, reading: Reading | null, fallback: string): void {
  cardEl.textContent = '';
  const box = document.createElement('div');
  box.className = 'card';
  const word = document.createElement('div');
  word.className = 'word';
  word.lang = 'or';
  word.textContent = card?.word ?? fallback;
  box.append(word);
  if (card) {
    const roman = document.createElement('div');
    roman.className = 'roman';
    roman.textContent = card.roman;
    box.append(roman);
    const list = document.createElement('ul');
    for (const m of card.meanings) {
      const li = document.createElement('li');
      li.textContent = m.text;
      const src = document.createElement('span');
      src.className = 'source';
      src.textContent = m.source;
      li.append(src);
      list.append(li);
    }
    if (card.meanings.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No meaning in the dictionaries.';
      list.append(li);
    }
    box.append(list);
  }
  const notes = [
    reading?.corrected ? `Read as ${reading.readAs}, corrected to a dictionary word` : 'Read from the screen',
    reading?.partOf ? `Part of a longer word read as ${reading.partOf}` : null,
    reading && reading.conf < 60 ? 'Unclear print: check the word' : null,
    card?.approximateHead ? `Approximate: the dictionary word is ${card.approximateHead}` : null,
    card?.more ?? null,
    card?.formation ?? null,
    card?.loan ?? null,
    card?.origin ?? null,
  ];
  for (const text of notes) {
    if (!text) continue;
    const note = document.createElement('span');
    note.className = 'note';
    if (HAS_ODIA.test(text)) note.lang = 'or';
    note.textContent = text;
    box.append(note);
  }
  cardEl.append(box);
}

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
    out.push({ read: canonical(line.words.map((w) => w.text).join(' ')).trim(), words });
  }
  const lookupMs = Math.round(performance.now() - t0);
  steps.last = `${out.length} line${out.length === 1 ? '' : 's'}${info.ms !== undefined ? ` · read ${info.ms} ms` : ''} · meanings ${lookupMs} ms`;
  showStatus();
  listEl.textContent = '';
  listEl.append(renderLines(document, out, (w) => showCard(w.card, w.reading, shownWord(w))));
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
