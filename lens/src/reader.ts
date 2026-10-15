/**
 * The Odia Lens reader (V4.6): Odia books and newspapers saved as PDF, the
 * owner's acid test (scanned books such as those linked from odia.org).
 *
 * Chrome's own PDF viewer does not let extensions in, so the lens has its own
 * reader page. pdf.js (pdfjs-dist, Apache-2.0) draws each page; the lens reads
 * the page from its own pixels (sharper than a screenshot), once per page, with
 * Tesseract's page layout (ocr.ts readPage), and keeps the words with their
 * boxes. Pointing at a word then shows its card at once; the side panel has the
 * page's text, copy and the opt-in translation (V4.5).
 *
 * The PDF comes from this computer (file picker, drag and drop): no permission,
 * nothing sent anywhere. When the lens icon is clicked on a PDF open in Chrome's
 * viewer, the background opens this page with the PDF's address (#url=...), and
 * the page says how to download it and open it here.
 */

// The legacy build: the modern one needs JavaScript features (Map.getOrInsertComputed)
// that many current browsers lack; the legacy one carries them itself.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

import { TRANSLATE_NOTICE } from './assist.js';
import { explainLines, explainer, fetchLoader, loadWords, setLoader } from './engine.js';
import { KONARK_WHEEL } from './frame.js';
import { FRAME_VIEW_CSS, renderDetail, renderLines } from './frameview.js';
import { OPEN_SETTINGS, TRANSLATE, type FrameLine, type FrameWord, type TranslateRequest, type TranslateResponse } from './messages.js';
import { readPage, setOcrPaths } from './ocr.js';
import { pickWord, type OcrLine } from './picture.js';
import { canonical } from '@odia/core/normalize';
import { spokenWords, textLines, trustText, type TextRun } from './textlayer.js';

setLoader(fetchLoader((path) => chrome.runtime.getURL(path)));
setOcrPaths({
  workerPath: chrome.runtime.getURL('ocr/worker.min.js'),
  corePath: chrome.runtime.getURL('ocr/tesseract-core-simd-lstm.wasm.js'),
  langPath: chrome.runtime.getURL('ocr/'),
});
pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf/pdf.worker.min.mjs');

/** Pages are read at about 300 dots per inch (PDF points are 1/72 inch), at most this many pixels wide. */
const OCR_DPI = 300;
const OCR_MAX_WIDTH = 3000;
/** The translation server takes at most this many characters (api/_lib/translate.ts). */
const TRANSLATE_MAX = 2000;
/** Widest page on the screen at 100% (CSS pixels). */
const PAGE_WIDTH = 860;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const pagesEl = $('pages');
const emptyEl = $('empty');
const statusEl = $('status');
const wordEl = $('word');
const textEl = $('text');
const translationEl = $('translation');
const fileInput = $<HTMLInputElement>('file');
const pageNo = $<HTMLInputElement>('pageNo');

const style = document.createElement('style');
style.textContent = FRAME_VIEW_CSS;
document.head.append(style);
$('grip').insertAdjacentHTML('afterbegin', KONARK_WHEEL);
const wheel = $('grip').firstElementChild as SVGElement;

interface Page {
  n: number;
  el: HTMLDivElement;
  canvas: HTMLCanvasElement;
  hl: HTMLDivElement;
  /** Page size in PDF points. */
  width: number;
  height: number;
  drawn: number; // the display scale it was drawn at (0: not drawn)
  /** The OCR picture's width in pixels (boxes are in its pixels). */
  ocrWidth: number;
  lines: FrameLine[] | null;
  /** How the page was read: its own typed text (exact) or OCR of its picture. */
  mode: 'text' | 'ocr' | null;
  words: FrameWord[];
  /** The line each word is on (same order as words). */
  lineOf: number[];
}

let doc: PDFDocumentProxy | null = null;
let loading: PDFDocumentLoadingTask | null = null;
let pages: Page[] = [];
let zoom = 1;
let fileName = '';
let pinned: { page: Page; index: number } | null = null;
const queue: Page[] = [];
let busy = false;

function setStatus(text: string, reading = false): void {
  statusEl.textContent = text;
  wheel.setAttribute('class', reading ? 'wheel reading' : 'wheel');
}

/* ------------------------------ opening ------------------------------ */

async function openFile(file: File): Promise<void> {
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
    setStatus(`${file.name} is not a PDF.`);
    return;
  }
  fileName = file.name;
  await openData(new Uint8Array(await file.arrayBuffer()));
}

async function openData(data: Uint8Array): Promise<void> {
  setStatus('Opening…', true);
  await loading?.destroy();
  doc = null;
  try {
    loading = pdfjs.getDocument({
      data,
      wasmUrl: chrome.runtime.getURL('pdf/wasm/'),
      standardFontDataUrl: chrome.runtime.getURL('pdf/standard_fonts/'),
      enableXfa: false,
    });
    doc = await loading.promise;
  } catch (error) {
    setStatus(`Could not open the PDF: ${String(error)}`);
    return;
  }
  document.title = `${fileName} · Odia Lens reader`;
  $('name').textContent = fileName;
  emptyEl.hidden = true;
  $('pager').hidden = false;
  $('zoom').hidden = false;
  $('pageCount').textContent = String(doc.numPages);
  pagesEl.querySelectorAll('.page').forEach((p) => p.remove());
  pages = [];
  queue.length = 0;
  pinned = null;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const v = page.getViewport({ scale: 1 });
    const el = document.createElement('div');
    el.className = 'page';
    el.dataset.n = String(n);
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = `Page ${n}`;
    const canvas = document.createElement('canvas');
    const hl = document.createElement('div');
    hl.className = 'hl';
    hl.hidden = true;
    el.append(num, canvas, hl);
    pagesEl.append(el);
    pages.push({ n, el, canvas, hl, width: v.width, height: v.height, drawn: 0, ocrWidth: 0, lines: null, mode: null, words: [], lineOf: [] });
  }
  layout();
  pagesEl.scrollTop = 0;
  setStatus(`${doc.numPages} page${doc.numPages === 1 ? '' : 's'}. Point at a word, or wait for the page to be read.`);
  $('tools').hidden = false;
  observe();
  void loadWords();
  void explainer();
}

/* ------------------------------ drawing ------------------------------ */

function displayScale(p: Page): number {
  const avail = Math.min(PAGE_WIDTH, pagesEl.clientWidth - 32);
  return (avail / p.width) * zoom;
}

function layout(): void {
  for (const p of pages) {
    const s = displayScale(p);
    p.el.style.width = `${Math.round(p.width * s)}px`;
    p.el.style.height = `${Math.round(p.height * s)}px`;
    if (p.drawn && Math.abs(p.drawn - s) > 0.01) p.drawn = 0;
  }
  $('zoomLabel').textContent = `${Math.round(zoom * 100)}%`;
  if (pinned) showWord(pinned.page, pinned.index);
}

async function draw(p: Page): Promise<void> {
  if (!doc || p.drawn) return;
  const s = displayScale(p);
  p.drawn = s;
  const page = await doc.getPage(p.n);
  const v = page.getViewport({ scale: s * devicePixelRatio });
  p.canvas.width = Math.round(v.width);
  p.canvas.height = Math.round(v.height);
  await page.render({ canvas: p.canvas, viewport: v }).promise.catch(() => undefined);
}

function release(p: Page): void {
  if (!p.drawn) return;
  p.drawn = 0;
  p.canvas.width = p.canvas.height = 0;
}

let observer: IntersectionObserver | null = null;
function observe(): void {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const p = pages[Number((e.target as HTMLElement).dataset.n) - 1];
        if (!p) continue;
        if (e.isIntersecting) {
          void draw(p);
          enqueue(p);
        } else release(p);
      }
    },
    { root: pagesEl, rootMargin: '1200px 0px' },
  );
  for (const p of pages) observer.observe(p.el);
}

/** The page at the middle of the view. */
function currentPage(): Page | undefined {
  const mid = pagesEl.getBoundingClientRect().top + pagesEl.clientHeight / 2;
  return pages.find((p) => {
    const r = p.el.getBoundingClientRect();
    return r.top <= mid && r.bottom >= mid;
  }) ?? pages.find((p) => p.el.getBoundingClientRect().bottom > 0);
}

/* ------------------------------ reading ------------------------------ */

function enqueue(p: Page, first = false): void {
  if (p.lines || queue.includes(p)) return;
  if (first) queue.unshift(p);
  else queue.push(p);
  void work();
}

async function work(): Promise<void> {
  if (busy || !doc) return;
  // The page in view first, then the others in view order.
  const now = currentPage();
  const next = (now && queue.includes(now) ? now : undefined) ?? queue.find((p) => near(p)) ?? undefined;
  if (!next) return;
  queue.splice(queue.indexOf(next), 1);
  busy = true;
  try {
    await readOne(next);
  } catch (error) {
    setStatus(`Could not read page ${next.n}: ${String(error)}`);
  }
  busy = false;
  void work();
}

/** Within two screens of the view (pages far away wait until the reader gets there). */
function near(p: Page): boolean {
  const r = p.el.getBoundingClientRect();
  const view = pagesEl.getBoundingClientRect();
  return r.bottom > view.top - 2 * view.height && r.top < view.bottom + 2 * view.height;
}

/**
 * The page's own text, when it is real Unicode Odia (a typed PDF): lines and
 * words in the pixels of viewport `v`, or null (a scan, an old non-Unicode font,
 * broken text): then the page is read by OCR.
 */
async function typedLines(page: PDFPageProxy, v: ReturnType<PDFPageProxy['getViewport']>): Promise<OcrLine[] | null> {
  const content = await page.getTextContent({ disableNormalization: true });
  const runs: TextRun[] = [];
  for (const item of content.items) {
    if (!('str' in item)) continue;
    const t = pdfjs.Util.transform(v.transform, item.transform) as number[];
    runs.push({ str: item.str, x: t[4] as number, y: t[5] as number, width: item.width * v.scale, height: Math.hypot(t[2] as number, t[3] as number), eol: item.hasEOL });
  }
  if (runs.length === 0) return null;
  const lines = textLines(runs);
  const list = await loadWords();
  for (const line of lines) line.words = spokenWords(line.words, (x) => list.count(x), canonical);
  return trustText(lines, (w) => list.has(canonical(w))).use ? lines : null;
}

async function readOne(p: Page): Promise<void> {
  if (!doc) return;
  const t0 = performance.now();
  p.el.classList.add('reading');
  setStatus(`Reading page ${p.n}…`, true);
  const page: PDFPageProxy = await doc.getPage(p.n);
  const scale = Math.min(OCR_DPI / 72, OCR_MAX_WIDTH / p.width);
  const v = page.getViewport({ scale });
  const typed = await typedLines(page, v).catch(() => null);
  if (typed) {
    p.mode = 'text';
    p.ocrWidth = v.width;
    keep(p, await explainLines(typed, { exact: true }));
    p.el.classList.remove('reading');
    setStatus(`Page ${p.n}: typed text, used exactly as it is (${p.lines?.length ?? 0} lines, ${p.words.length} words).`);
    if (currentPage() === p && !textEl.hidden) showText(p);
    return;
  }
  p.mode = 'ocr';
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(v.width);
  canvas.height = Math.round(v.height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport: v, background: '#ffffff' }).promise;
  const bitmap = await createImageBitmap(canvas);
  canvas.width = canvas.height = 0;
  const lines = await readPage(bitmap, (done, total) => {
    if (total > 0) setStatus(`Reading page ${p.n}: checking unclear lines ${done} of ${total}…`, true);
  });
  p.ocrWidth = bitmap.width;
  bitmap.close();
  keep(p, await explainLines(lines));
  p.el.classList.remove('reading');
  const s = ((performance.now() - t0) / 1000).toFixed(1);
  setStatus(`Page ${p.n} read from its picture: ${p.lines?.length ?? 0} lines, ${p.words.length} words (${s} s).`);
  if (currentPage() === p && !textEl.hidden) showText(p);
}

/** Keep a page's lines, and its words in reading order with the line each is on. */
function keep(p: Page, lines: FrameLine[]): void {
  p.lines = lines;
  p.words = [];
  p.lineOf = [];
  lines.forEach((line, i) => {
    for (const w of line.words) {
      p.words.push(w);
      p.lineOf.push(i);
    }
  });
}

/* ------------------------------ pointing ------------------------------ */

function pageAt(target: EventTarget | null): Page | undefined {
  const el = (target as HTMLElement | null)?.closest?.('.page') as HTMLElement | null;
  return el ? pages[Number(el.dataset.n) - 1] : undefined;
}

/** CSS pixels on the page → OCR pixels, and back. */
const toOcr = (p: Page): number => p.ocrWidth / p.el.clientWidth;

function wordAt(p: Page, event: MouseEvent): number {
  if (!p.lines) return -1;
  const r = p.el.getBoundingClientRect();
  const k = toOcr(p);
  return pickWord(p.words, (event.clientX - r.left) * k, (event.clientY - r.top) * k, 6 * k);
}

function showWord(p: Page, index: number): void {
  const w = p.words[index];
  if (!w) return;
  const k = 1 / toOcr(p);
  Object.assign(p.hl.style, {
    left: `${w.box.x0 * k - 3}px`,
    top: `${w.box.y0 * k - 3}px`,
    width: `${(w.box.x1 - w.box.x0) * k + 6}px`,
    height: `${(w.box.y1 - w.box.y0) * k + 6}px`,
  });
  for (const q of pages) q.hl.hidden = q !== p;
  p.hl.hidden = false;
  wordEl.textContent = '';
  wordEl.append(renderDetail(document, w, p.mode === 'text' ? 'Typed text of the PDF' : 'Read from the page picture'));
  const line = p.lines?.[p.lineOf[index] ?? -1];
  if (line) {
    const of = document.createElement('div');
    of.className = 'line-of';
    of.lang = 'or';
    of.textContent = line.read;
    wordEl.append(of);
  }
}

let frame = 0;
pagesEl.addEventListener('mousemove', (event) => {
  if (pinned) return;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const p = pageAt(event.target);
    if (!p) return;
    if (!p.lines) {
      enqueue(p, true);
      wordEl.innerHTML = '';
      const m = document.createElement('p');
      m.className = 'muted';
      m.textContent = `Page ${p.n} is being read. Its words show here in a moment.`;
      wordEl.append(m);
      return;
    }
    const i = wordAt(p, event);
    if (i >= 0) showWord(p, i);
  });
});

pagesEl.addEventListener('click', (event) => {
  const p = pageAt(event.target);
  if (!p) return;
  const i = wordAt(p, event);
  if (i < 0) {
    pinned = null;
    p.hl.hidden = true;
    return;
  }
  pinned = pinned && pinned.page === p && pinned.index === i ? null : { page: p, index: i };
  showWord(p, i);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    pinned = null;
    for (const p of pages) p.hl.hidden = true;
  }
});

/* --------------------------- page text, copy, translate --------------------------- */

function showText(p: Page): void {
  textEl.textContent = '';
  if (!p.lines) {
    const m = document.createElement('p');
    m.className = 'muted';
    m.textContent = `Page ${p.n} is being read.`;
    textEl.append(m);
    enqueue(p, true);
    return;
  }
  textEl.append(
    renderLines(document, p.lines, (w, chip) => {
      for (const c of Array.from(textEl.querySelectorAll('.chip[aria-pressed="true"]'))) c.setAttribute('aria-pressed', 'false');
      chip.setAttribute('aria-pressed', 'true');
      const i = p.words.indexOf(w);
      pinned = { page: p, index: i };
      showWord(p, i);
      p.hl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }),
  );
}

$('showText').addEventListener('click', () => {
  const button = $('showText');
  textEl.hidden = !textEl.hidden;
  button.setAttribute('aria-pressed', String(!textEl.hidden));
  const p = currentPage();
  if (p && !textEl.hidden) showText(p);
});

const pageText = (p: Page | undefined): string => (p?.lines ?? []).map((l) => l.read).join('\n');

$('copy').addEventListener('click', () => {
  const text = pageText(currentPage());
  const button = $('copy');
  if (!text) return;
  void navigator.clipboard.writeText(text).then(
    () => flash(button, 'Copied'),
    () => flash(button, 'Not allowed'),
  );
});

function flash(b: HTMLElement, text: string): void {
  const before = b.textContent;
  b.textContent = text;
  setTimeout(() => (b.textContent = before), 1200);
}

$('translate').addEventListener('click', () => {
  const p = currentPage();
  let text = pageText(p);
  if (!p || !text) {
    setStatus('This page is not read yet: wait a moment, then press Translate again.');
    if (p) enqueue(p, true);
    return;
  }
  const cut = text.length > TRANSLATE_MAX;
  if (cut) text = text.slice(0, text.lastIndexOf('\n', TRANSLATE_MAX) > 0 ? text.lastIndexOf('\n', TRANSLATE_MAX) : TRANSLATE_MAX);
  translationEl.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'translation';
  box.textContent = 'Translating…';
  translationEl.append(box);
  const request: TranslateRequest = { type: TRANSLATE, text };
  chrome.runtime.sendMessage(request, (response: TranslateResponse | undefined) => {
    box.textContent = '';
    const label = document.createElement('span');
    label.className = 'translation-label';
    box.append(label);
    const body = document.createElement('p');
    box.append(body);
    if (response?.ok) {
      label.textContent = `Page ${p.n} in English · machine translation, can be wrong${cut ? ' · first part of the page' : ''}`;
      body.textContent = response.translation;
      body.lang = 'en';
    } else if (response && !response.ok && response.off) {
      label.textContent = 'Translation is off';
      body.textContent = TRANSLATE_NOTICE;
      const on = document.createElement('button');
      on.type = 'button';
      on.textContent = 'Open settings to turn it on';
      on.addEventListener('click', () => chrome.runtime.sendMessage({ type: OPEN_SETTINGS }, () => void chrome.runtime.lastError));
      box.append(on);
    } else {
      label.textContent = 'Could not translate';
      body.textContent = chrome.runtime.lastError?.message ?? (response && !response.ok ? response.error : 'No answer.');
    }
  });
});

/* ------------------------------ controls ------------------------------ */

const choose = (): void => fileInput.click();
$('open').addEventListener('click', choose);
$('open2').addEventListener('click', choose);
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void openFile(file);
  fileInput.value = '';
});

pagesEl.addEventListener('dragover', (event) => {
  event.preventDefault();
  pagesEl.classList.add('dragging');
});
pagesEl.addEventListener('dragleave', () => pagesEl.classList.remove('dragging'));
pagesEl.addEventListener('drop', (event) => {
  event.preventDefault();
  pagesEl.classList.remove('dragging');
  const file = event.dataTransfer?.files?.[0];
  if (file) void openFile(file);
});

function goTo(n: number): void {
  const p = pages[Math.min(pages.length, Math.max(1, n)) - 1];
  if (p) p.el.scrollIntoView({ block: 'start' });
}
$('prev').addEventListener('click', () => goTo((currentPage()?.n ?? 1) - 1));
$('next').addEventListener('click', () => goTo((currentPage()?.n ?? 0) + 1));
pageNo.addEventListener('change', () => goTo(Number(pageNo.value) || 1));

function setZoom(z: number): void {
  const p = currentPage();
  zoom = Math.min(3, Math.max(0.5, Math.round(z * 10) / 10));
  layout();
  observe();
  p?.el.scrollIntoView({ block: 'start' });
}
$('zoomIn').addEventListener('click', () => setZoom(zoom + 0.2));
$('zoomOut').addEventListener('click', () => setZoom(zoom - 0.2));

let scrollTimer = 0;
pagesEl.addEventListener('scroll', () => {
  clearTimeout(scrollTimer);
  scrollTimer = window.setTimeout(() => {
    const p = currentPage();
    if (!p) return;
    pageNo.value = String(p.n);
    enqueue(p, true);
    if (!textEl.hidden) showText(p);
  }, 150);
});
window.addEventListener('resize', () => {
  if (pages.length) {
    layout();
    observe();
  }
});

// Opened from a PDF in Chrome's viewer (background.ts): say how to bring it here.
const fromUrl = new URLSearchParams(location.hash.slice(1)).get('url');
if (fromUrl) {
  const note = $('fromViewer');
  note.hidden = false;
  note.textContent =
    `This PDF is open in Chrome’s own viewer, which extensions cannot read: ${fromUrl}. ` +
    'Download it (the ⤓ button at the top of the viewer), then choose the downloaded file here.';
}

// For the browser check (lens/eval/lens-check.mjs).
(window as unknown as { odiaReader: unknown }).odiaReader = {
  openData: (bytes: number[], name: string) => {
    fileName = name;
    return openData(new Uint8Array(bytes));
  },
  pages: () => pages.map((p) => ({ n: p.n, read: !!p.lines, mode: p.mode, words: p.words.map((w) => w.card?.word ?? w.text) })),
};
