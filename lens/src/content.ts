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
 * v1 limits: the top frame only, and a word inside one text node (web Odia is
 * real text, so no OCR). Pages that draw text on a canvas are not read.
 */

import type { LensCard } from './describe.js';
import { wordAt, wordBefore } from './word.js';
import { LOOKUP, type LookupRequest, type LookupResponse } from './messages.js';

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
@media (prefers-color-scheme: dark) {
  .card { background: #24221d; color: #f1ece0; border-color: #4a4538; }
  .roman, .source, .note { color: #c3bba8; }
  .say { background: #34302a; border-color: #4a4538; }
  .foot { color: #9d957f; }
}
`;

/** Hide the card this long after the pointer leaves the word (it may be going to the card). */
const HIDE_DELAY_MS = 250;

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

  const odiaVoice = (): SpeechSynthesisVoice | undefined =>
    typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('or'));

  function hide(): void {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
    card.hidden = true;
    current = '';
    currentNode = null;
    currentStart = -1;
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

  function render(word: string, lensCard: LensCard | null, rect: DOMRect): void {
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
    const foot = document.createElement('div');
    foot.className = 'foot';
    foot.textContent = 'Odia Lens · offline · Esc closes';
    card.append(foot);
    card.hidden = false;
    place(rect);
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
    if (!hit) return hideSoon();
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
  const onScroll = (): void => hide();
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
        // Voices load late in Chrome; asking once starts the load.
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices();
      } else {
        hide();
        document.removeEventListener('mousemove', onMove, { capture: true });
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('scroll', onScroll, { capture: true });
        host.remove();
      }
      return active;
    },
  };
}

if (!window.__odiaLens) window.__odiaLens = start();
