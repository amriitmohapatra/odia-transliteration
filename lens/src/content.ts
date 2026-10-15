/**
 * Odia Lens content script: the card for the Odia word under the pointer.
 *
 * Injected only when the user turns the lens on for a tab (background.ts).
 * Injecting it again is harmless: the first copy stays, and the background
 * calls window.__odiaLens.toggle().
 *
 * The card lives in a shadow root, styled with a constructed style
 * sheet (a <style> element can be blocked by a strict page CSP), so the page
 * and the card cannot restyle each other. It never takes the pointer except
 * over its own speaker button.
 *
 * Odia that is page text is read from the page (v1). Odia inside a picture
 * (an ePaper page image, a canvas, a paused video) is read by OCR (picture
 * mode, V4.2): when the pointer rests on a picture, the background takes a
 * screenshot of the tab, reads the line under the pointer offline, and the
 * card says what it read. The words of that line stay cached until the page
 * scrolls, so moving along the line needs no new reading.
 *
 * Limits: the top frame only; a word inside one text node.
 */

import type { LensCard } from './describe.js';
import { wordAt, wordBefore } from './word.js';
import {
  LOOKUP,
  PICTURE,
  READ_WORD,
  type LookupRequest,
  type LookupResponse,
  type PictureRequest,
  type PictureResponse,
  type Reading,
  type ReadWordRequest,
  type ReadWordResponse,
} from './messages.js';
import { pickWord, type OcrWord } from './picture.js';

interface Lens {
  toggle(): boolean;
}

declare global {
  interface Window {
    __odiaLens?: Lens;
  }
}

const CSS = `
:host { all: initial; }
.card {
  position: fixed; z-index: 2147483647; max-width: 340px; min-width: 180px;
  box-sizing: border-box; padding: 10px 12px; border-radius: 10px;
  background: #fffdf8; color: #1d1b16; border: 1px solid #d9d2c3;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  pointer-events: none;
}
.card[hidden] { display: none; }
.word { font: 600 22px/1.3 "Noto Sans Oriya", "Oriya Sangam MN", "Kalinga", "Odia MN", sans-serif; }
.roman { font-style: italic; color: #5a5446; margin-top: 1px; }
.row { display: flex; align-items: baseline; gap: 8px; }
.meanings { margin: 6px 0 0; padding: 0; list-style: none; }
.meanings li { margin-top: 4px; }
.source, .note { display: block; font-size: 11.5px; color: #6b6455; }
.say {
  pointer-events: auto; cursor: pointer; margin-left: auto; border: 1px solid #d9d2c3;
  border-radius: 6px; background: #f4efe4; color: inherit; font: inherit; font-size: 12px; padding: 1px 8px;
}
.foot { margin-top: 6px; font-size: 10.5px; color: #8a8370; }
.read { display: block; font-size: 11.5px; color: #6b4e12; margin-top: 2px; }
.unclear { color: #a33a1c; }
@media (prefers-color-scheme: dark) {
  .card { background: #24221d; color: #f1ece0; border-color: #4a4538; }
  .roman, .source, .note { color: #c3bba8; }
  .say { background: #34302a; border-color: #4a4538; }
  .foot { color: #9d957f; }
}
`;

/** Hide the card this long after the pointer leaves the word (it may be going to the card). */
const HIDE_DELAY_MS = 250;
/** Read a picture only after the pointer rests this long on it. */
const REST_MS = 350;
/** Say "Reading the picture…" if the reading takes longer than this. */
const SLOW_MS = 700;
/** Below this OCR confidence the card says the reading is unclear. */
const UNCLEAR_BELOW = 60;
/** Elements whose pixels may hold Odia that is not page text. */
const PICTURES = new Set(['IMG', 'CANVAS', 'VIDEO', 'EMBED', 'OBJECT', 'IFRAME', 'PICTURE']);

interface PictureCache {
  words: OcrWord[];
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  video: HTMLVideoElement | null;
  videoTime: number;
  found: Map<number, { card: LensCard | null; reading: Reading }>;
}

function start(): Lens {
  const host = document.createElement('odia-lens');
  // Open, not closed: the browser check reads the card; a page learns nothing
  // from it that it could not compute itself.
  const root = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  root.adoptedStyleSheets = [sheet];
  const card = document.createElement('div');
  card.className = 'card';
  card.hidden = true;
  card.setAttribute('role', 'tooltip');
  card.lang = 'en';
  root.append(card);

  let active = false;
  let current = '';
  let currentNode: Node | null = null;
  let currentStart = -1;
  let asked = 0;
  let frame = 0;
  let hideTimer: number | undefined;
  let overCard = false;
  let lastX = 0;
  let lastY = 0;
  let picture: PictureCache | null = null;
  let pictureIndex = -1;
  let restTimer: number | undefined;
  let slowTimer: number | undefined;
  let reads = 0;

  const odiaVoice = (): SpeechSynthesisVoice | undefined =>
    typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('or'));

  function hide(): void {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
    card.hidden = true;
    current = '';
    currentNode = null;
    currentStart = -1;
    pictureIndex = -1;
  }

  function hideSoon(): void {
    if (hideTimer !== undefined || card.hidden) return;
    hideTimer = window.setTimeout(() => {
      hideTimer = undefined;
      if (!overCard) hide();
    }, HIDE_DELAY_MS);
  }

  function place(rect: DOMRect): void {
    const gap = 6;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    let left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    let top = rect.bottom + gap;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - gap);
    if (left < 8) left = 8;
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }

  function render(word: string, lensCard: LensCard | null, rect: DOMRect, reading: Reading | null = null): void {
    card.textContent = '';
    const head = document.createElement('div');
    head.className = 'row';
    const w = document.createElement('span');
    w.className = 'word';
    w.lang = 'or';
    w.textContent = lensCard?.word ?? word;
    head.append(w);
    const voice = odiaVoice();
    if (voice) {
      const say = document.createElement('button');
      say.type = 'button';
      say.className = 'say';
      say.textContent = 'Say it';
      say.setAttribute('aria-label', 'Say this word aloud');
      say.addEventListener('click', () => {
        const u = new SpeechSynthesisUtterance(lensCard?.word ?? word);
        u.voice = voice;
        u.lang = voice.lang;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      });
      head.append(say);
    }
    card.append(head);
    if (lensCard) {
      const roman = document.createElement('div');
      roman.className = 'roman';
      roman.textContent = lensCard.roman;
      card.append(roman);
      const list = document.createElement('ul');
      list.className = 'meanings';
      for (const m of lensCard.meanings) {
        const li = document.createElement('li');
        li.textContent = m.text;
        const src = document.createElement('span');
        src.className = 'source';
        src.textContent = m.source;
        li.append(src);
        list.append(li);
      }
      if (lensCard.meanings.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No meaning in the dictionaries.';
        list.append(li);
      }
      card.append(list);
      if (reading) card.append(readLine(reading));
      for (const [line, odia] of [
        [lensCard.approximateHead ? `Approximate: the dictionary word is ${lensCard.approximateHead}` : null, false],
        [lensCard.more, false],
        [lensCard.formation, true],
        [lensCard.loan, false],
        [lensCard.origin, false],
      ] as const) {
        if (!line) continue;
        const note = document.createElement('span');
        note.className = 'note';
        if (odia) note.lang = 'or';
        note.textContent = line;
        card.append(note);
      }
    }
    if (!lensCard && reading) card.append(readLine(reading));
    const foot = document.createElement('div');
    foot.className = 'foot';
    foot.textContent = 'Odia Lens · offline · Esc closes';
    card.append(foot);
    card.hidden = false;
    place(rect);
  }

  /** How the word was read from a picture: what OCR saw, and whether it was corrected. */
  function readLine(reading: Reading): HTMLElement {
    const el = document.createElement('span');
    el.className = 'read';
    const said = document.createElement('span');
    said.lang = 'or';
    said.textContent = reading.readAs;
    if (reading.corrected) {
      el.append('Read from the picture as ', said, ', corrected to a dictionary word');
    } else {
      el.append('Read from the picture');
    }
    if (reading.conf < UNCLEAR_BELOW) {
      const unclear = document.createElement('span');
      unclear.className = 'unclear';
      unclear.textContent = ' (unclear print: check the word)';
      el.append(unclear);
    }
    return el;
  }

  /** A one-line card: "Reading the picture…", or why a picture could not be read. */
  function notice(text: string, rect: DOMRect): void {
    card.textContent = '';
    const line = document.createElement('div');
    line.textContent = text;
    card.append(line);
    card.hidden = false;
    place(rect);
  }

  /** A picture (image, canvas, video, frame) under the point, unless page text is there. */
  function pictureUnder(x: number, y: number): Element | null {
    if (textUnder(x, y)) return null;
    for (const el of document.elementsFromPoint(x, y).slice(0, 8)) {
      if (el === host) continue;
      if (PICTURES.has(el.tagName)) return el;
      if (el.tagName === 'svg' || el.tagName === 'image') return el;
      // A background picture of an element (not of the whole page: reading blank paper costs CPU).
      if (el !== document.body && el !== document.documentElement && /url\(/.test(getComputedStyle(el).backgroundImage)) return el;
    }
    return null;
  }

  /** Page text (any script) right under the point: picture mode leaves it to the text path. */
  function textUnder(x: number, y: number): boolean {
    const range = typeof document.caretRangeFromPoint === 'function' ? document.caretRangeFromPoint(x, y) : null;
    const node = range?.startContainer;
    if (!node || node.nodeType !== Node.TEXT_NODE || !(node as Text).data.trim()) return false;
    const r = document.createRange();
    r.selectNodeContents(node);
    return Array.from(r.getClientRects()).some((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom);
  }

  function cacheValid(): PictureCache | null {
    if (!picture) return null;
    const moved =
      picture.scrollX !== window.scrollX || picture.scrollY !== window.scrollY ||
      picture.width !== window.innerWidth || picture.height !== window.innerHeight;
    const playing = picture.video !== null && picture.video.currentTime !== picture.videoTime;
    if (moved || playing) picture = null;
    return picture;
  }

  /** The point is within the band of the cached line (between its words, say). */
  function onLine(cache: PictureCache, x: number, y: number): boolean {
    if (cache.words.length === 0) return false;
    const x0 = Math.min(...cache.words.map((w) => w.box.x0));
    const x1 = Math.max(...cache.words.map((w) => w.box.x1));
    const y0 = Math.min(...cache.words.map((w) => w.box.y0));
    const y1 = Math.max(...cache.words.map((w) => w.box.y1));
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }

  const rectOf = (w: OcrWord): DOMRect => new DOMRect(w.box.x0, w.box.y0, w.box.x1 - w.box.x0, w.box.y1 - w.box.y0);

  function showPictureWord(cache: PictureCache, index: number): void {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
    if (index === pictureIndex && !card.hidden) return;
    pictureIndex = index;
    current = '';
    currentNode = null;
    const word = cache.words[index] as OcrWord;
    const known = cache.found.get(index);
    if (known) return render(known.reading.corrected ?? known.reading.readAs, known.card, rectOf(word), known.reading);
    const request: ReadWordRequest = { type: READ_WORD, text: word.text, conf: word.conf };
    chrome.runtime.sendMessage(request, (response: ReadWordResponse | undefined) => {
      if (chrome.runtime.lastError || !response?.ok || picture !== cache || pictureIndex !== index || !active) return;
      cache.found.set(index, { card: response.card, reading: response.reading });
      render(response.reading.corrected ?? response.reading.readAs, response.card, rectOf(word), response.reading);
    });
  }

  /** Read the picture at the pointer: hide the card (it must not be in the screenshot), then ask. */
  function readPicture(target: Element): void {
    restTimer = undefined;
    if (!active) return;
    hide();
    const x = lastX;
    const y = lastY;
    const ticket = ++reads;
    const video = target.closest('video') ?? (target.tagName === 'VIDEO' ? (target as HTMLVideoElement) : null);
    // Two frames: the hidden card is off the screen before the capture.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const request: PictureRequest = { type: PICTURE, x, y, viewportWidth: window.innerWidth };
      const at = { scrollX: window.scrollX, scrollY: window.scrollY, width: window.innerWidth, height: window.innerHeight };
      window.clearTimeout(slowTimer);
      slowTimer = window.setTimeout(() => {
        if (ticket === reads && active) notice('Reading the picture\u2026', new DOMRect(x, y, 1, 18));
      }, SLOW_MS);
      chrome.runtime.sendMessage(request, (response: PictureResponse | undefined) => {
        window.clearTimeout(slowTimer);
        if (chrome.runtime.lastError || !response?.ok || !active) {
          if (ticket !== reads || !active) return;
          // Say why, so a report can name it (for example a page the browser does not let extensions capture).
          const why = chrome.runtime.lastError?.message ?? (response && !response.ok ? response.error : 'no answer');
          notice(`Could not read the picture: ${why}`, new DOMRect(x, y, 1, 18));
          return;
        }
        const cache: PictureCache = {
          words: response.words, ...at, video, videoTime: video?.currentTime ?? 0, found: new Map(),
        };
        if (response.index >= 0 && response.reading) {
          cache.found.set(response.index, { card: response.card, reading: response.reading });
        }
        picture = cache;
        if (ticket !== reads) return;
        const index = pickWord(cache.words, lastX, lastY);
        if (index >= 0) showPictureWord(cache, index);
        else hide();
      });
    }));
  }

  /** The Odia word under the point, with its box, or null. */
  function wordAtPoint(x: number, y: number): { word: string; previous: string; node: Node; start: number; rect: DOMRect } | null {
    let node: Node | null = null;
    let offset = 0;
    const doc = document as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null };
    if (typeof doc.caretPositionFromPoint === 'function') {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos) ({ offsetNode: node, offset } = pos);
    } else if (typeof document.caretRangeFromPoint === 'function') {
      const range = document.caretRangeFromPoint(x, y);
      if (range) {
        node = range.startContainer;
        offset = range.startOffset;
      }
    }
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const found = wordAt((node as Text).data, offset);
    if (!found) return null;
    const range = document.createRange();
    range.setStart(node, found.start);
    range.setEnd(node, found.end);
    // caretRangeFromPoint answers with the nearest caret even past the end of
    // a line: only a pointer over the word's own box counts.
    for (const r of Array.from(range.getClientRects())) {
      if (x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1) {
        return { word: found.word, previous: wordBefore((node as Text).data, found.start), node, start: found.start, rect: r };
      }
    }
    return null;
  }

  function onFrame(): void {
    frame = 0;
    if (!active || overCard) return;
    const hit = wordAtPoint(lastX, lastY);
    if (!hit) {
      window.clearTimeout(restTimer);
      restTimer = undefined;
      const target = pictureUnder(lastX, lastY);
      if (!target) return hideSoon();
      const cache = cacheValid();
      const index = cache ? pickWord(cache.words, lastX, lastY, 2) : -1;
      if (cache && index >= 0) return showPictureWord(cache, index);
      hideSoon();
      // Between two words of the line already read: nothing new to read.
      if (cache && onLine(cache, lastX, lastY)) return;
      restTimer = window.setTimeout(() => readPicture(target), REST_MS);
      return;
    }
    window.clearTimeout(restTimer);
    restTimer = undefined;
    pictureIndex = -1;
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
    if (hit.node === currentNode && hit.start === currentStart && !card.hidden) return;
    current = hit.word;
    currentNode = hit.node;
    currentStart = hit.start;
    const ticket = ++asked;
    const request: LookupRequest = { type: LOOKUP, word: hit.word, previous: hit.previous };
    chrome.runtime.sendMessage(request, (response: LookupResponse | undefined) => {
      if (ticket !== asked || current !== hit.word || !active) return;
      if (chrome.runtime.lastError || !response) return render(hit.word, null, hit.rect);
      render(hit.word, response.ok ? response.card : null, hit.rect);
    });
  }

  const onMove = (event: MouseEvent): void => {
    if (event.composedPath().includes(host)) return;
    lastX = event.clientX;
    lastY = event.clientY;
    if (frame === 0) frame = window.requestAnimationFrame(onFrame);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !card.hidden) hide();
  };
  const onScroll = (): void => {
    picture = null;
    window.clearTimeout(restTimer);
    hide();
  };
  card.addEventListener('pointerenter', () => {
    overCard = true;
  });
  card.addEventListener('pointerleave', () => {
    overCard = false;
    hideSoon();
  });

  return {
    toggle(): boolean {
      active = !active;
      if (active) {
        document.documentElement.append(host);
        document.addEventListener('mousemove', onMove, { passive: true, capture: true });
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('scroll', onScroll, { passive: true, capture: true });
        window.addEventListener('resize', onScroll, { passive: true });
        // Voices load late in Chrome; asking once starts the load.
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices();
      } else {
        hide();
        document.removeEventListener('mousemove', onMove, { capture: true });
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('scroll', onScroll, { capture: true });
        window.removeEventListener('resize', onScroll);
        window.clearTimeout(restTimer);
        picture = null;
        host.remove();
      }
      return active;
    },
  };
}

if (!window.__odiaLens) window.__odiaLens = start();
