/**
 * Wiring for the Odia Phonetic PWA.
 *
 * No framework. The whole UI is one textarea, one rendered output, a bottom
 * sheet of candidates and three buttons; a framework would cost more than it
 * returns, and every kilobyte here is a kilobyte JavaScriptCore has to
 * interpret on an iPhone.
 */

import './style.css';
import { InlineCandidates } from './inline.js';

import { LocalStorageLearnStore } from '@odia/core';
import type { Candidate, DigitMode, WordResult } from '@odia/core/types';
import { buildEngine, loadAssets, type EngineHandle, type LoadedAssets } from './engine';

/* ------------------------------------------------------------------ *
 * Elements
 * ------------------------------------------------------------------ */

const romanEl = must<HTMLTextAreaElement>('roman');
const outputEl = must<HTMLDivElement>('output');
const outputHintEl = must<HTMLElement>('output-hint');
const statusEl = must<HTMLParagraphElement>('status');
const copyEl = must<HTMLButtonElement>('copy');
const clearEl = must<HTMLButtonElement>('clear');
const digitsEl = must<HTMLInputElement>('toggle-digits');
const strictEl = must<HTMLInputElement>('toggle-strict');
const pickerEl = must<HTMLDivElement>('picker');
const pickerTitleEl = must<HTMLHeadingElement>('picker-title');
const pickerListEl = must<HTMLUListElement>('picker-list');
const toastEl = must<HTMLDivElement>('toast');

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing element #${id}`);
  return element as T;
}

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const PREF_DIGITS = 'odia.pref.digits';
const PREF_STRICT = 'odia.pref.strict';

/** How many candidates the picker offers. */
const TOPK = 8;

// The engine's own store, not a web-specific one: it writes the same JSON shape
// the desktop app and the input method use, so a word taught here is a word
// they already know.
const learnStore = new LocalStorageLearnStore();

let assets: LoadedAssets = {};
let handle: EngineHandle | undefined;
let inline: InlineCandidates | undefined;

/**
 * Words the last render produced, indexed the way the output buttons are, so
 * the picker can find its candidate list without re-running the engine.
 */
let lastWords: readonly WordResult[] = [];

/**
 * Explicit per-token choices made in this session, roman token -> Odia text.
 *
 * `learn()` already persists the choice and the ranker weights user history
 * heavily, so on the next load the engine would surface it anyway. This map is
 * the immediate guarantee: the word the user just tapped changes now, and every
 * other instance of the same token in the text changes with it, without
 * depending on how the ranker resolves a tie.
 */
const overrides = new Map<string, string>();

let openWordButton: HTMLElement | undefined;

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

void boot();

async function boot(): Promise<void> {
  digitsEl.checked = readPref(PREF_DIGITS);
  strictEl.checked = readPref(PREF_STRICT);

  bindEvents();

  // Live candidate bar at the caret. Safe to construct before the dictionary
  // arrives: with no engine it simply returns nothing and stays hidden.
  inline = new InlineCandidates(romanEl, {
    candidates: (roman) =>
      guard(() => handle?.engine.transliterateWord(roman, 9) ?? [], []),
    onCommit: (roman, text) => {
      guard(() => handle?.engine.learn(roman, text), undefined);
      render();
    },
  });
  inline.setEnabled(!strictEl.checked);

  setStatus('Loading dictionary…', false);
  render(); // paint the empty shell immediately

  assets = await loadAssets();
  rebuildEngine();
  render();

  registerServiceWorker();
}

function digitMode(): DigitMode {
  return digitsEl.checked ? 'odia' : 'arabic';
}

/**
 * `digits` is fixed by `EngineConfig` at construction, so switching the toggle
 * rebuilds the engine. The asset strings are already in memory, so this is a
 * parse and nothing more.
 */
function rebuildEngine(): void {
  handle = buildEngine(assets, digitMode(), learnStore);
  setStatus(handle.note, !handle.ready || handle.note.length > 0);
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

let renderQueued = false;

function scheduleRender(): void {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function render(): void {
  const input = romanEl.value;
  const engine = handle?.engine;

  // Clear any error left by the previous render before guard() has a chance to
  // set a new one — otherwise a transient failure (toggling strict on with no
  // itrans.toml loaded, say) leaves a message that is no longer true.
  if (handle) setStatus(handle.note, !handle.ready || handle.note.length > 0);

  if (!engine) {
    outputEl.textContent = '';
    lastWords = [];
    return;
  }

  if (strictEl.checked) {
    outputHintEl.textContent = 'strict ITRANS — one spelling, one answer';
    lastWords = [];
    outputEl.textContent = guard(() => engine.strict(input, 'itrans'), input);
    return;
  }

  outputHintEl.textContent = 'tap a word for alternatives';

  const result = guard(() => engine.transliterate(input, { topk: TOPK }), undefined);
  if (!result) {
    outputEl.textContent = input;
    lastWords = [];
    return;
  }

  lastWords = result.words;
  outputEl.replaceChildren(buildOutput(input, result.words));
}

/**
 * Rebuild the output as text nodes plus one element per word.
 *
 * `WordResult` carries the roman token but not its offset, and `Result.text` is
 * already flattened. Walking the input and locating each token in order
 * recovers the separators — the whitespace and punctuation between words —
 * which is what keeps the output visually aligned with what was typed.
 */
function buildOutput(input: string, words: readonly WordResult[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const offsets = locate(input, words);

  // Tokens the engine reported but which cannot be found in the input: the two
  // have disagreed about tokenisation. Rather than emit doubled text, fall back
  // to space-separated words.
  if (!offsets) {
    words.forEach((word, index) => {
      if (index > 0) fragment.append(' ');
      fragment.append(renderWord(word, index));
    });
    return fragment;
  }

  let cursor = 0;
  words.forEach((word, index) => {
    const at = offsets[index];
    if (at > cursor) fragment.append(input.slice(cursor, at));
    fragment.append(renderWord(word, index));
    cursor = at + word.roman.length;
  });

  // Guarded, because appending "" would leave an empty text node behind and the
  // output would stop counting as :empty, hiding the placeholder.
  if (cursor < input.length) fragment.append(input.slice(cursor));
  return fragment;
}

/** Byte offset of each roman token in the input, or undefined if any is missing. */
function locate(input: string, words: readonly WordResult[]): number[] | undefined {
  const offsets: number[] = [];
  let cursor = 0;

  for (const word of words) {
    const at = input.indexOf(word.roman, cursor);
    if (at < 0) return undefined;
    offsets.push(at);
    cursor = at + word.roman.length;
  }

  return offsets;
}

function renderWord(word: WordResult, index: number): Node {
  const text = chosenText(word);
  const alternatives = word.candidates.length > 1;

  if (!alternatives) {
    const span = document.createElement('span');
    span.className = 'word word-static';
    span.textContent = text;
    return span;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word ambiguous';
  if (overrides.has(word.roman)) button.classList.add('chosen');
  button.textContent = text;
  button.dataset.index = String(index);
  button.setAttribute('aria-label', `${text} — alternatives for ${word.roman}`);
  return button;
}

function chosenText(word: WordResult): string {
  return overrides.get(word.roman) ?? word.candidates[0]?.text ?? word.roman;
}

/** The plain string the Copy button puts on the clipboard. */
function outputText(): string {
  return outputEl.textContent ?? '';
}

/* ------------------------------------------------------------------ *
 * Candidate picker
 * ------------------------------------------------------------------ */

function openPicker(index: number, trigger: HTMLElement): void {
  const word = lastWords[index];
  if (!word || word.candidates.length < 2) return;

  pickerTitleEl.replaceChildren('Alternatives for ', romanLabel(word.roman));
  pickerListEl.replaceChildren(
    ...word.candidates.map((candidate) => candidateRow(word, candidate)),
  );

  pickerEl.hidden = false;
  document.documentElement.style.overflow = 'hidden';
  trigger.classList.add('open');
  openWordButton = trigger;

  const first = pickerListEl.querySelector<HTMLButtonElement>('button.candidate');
  first?.focus();
}

function romanLabel(roman: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'roman';
  span.textContent = roman;
  return span;
}

function candidateRow(word: WordResult, candidate: Candidate): HTMLLIElement {
  const item = document.createElement('li');
  const button = document.createElement('button');

  button.type = 'button';
  button.className = 'candidate';
  if (chosenText(word) === candidate.text) button.setAttribute('aria-current', 'true');

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = candidate.text;

  const source = document.createElement('span');
  source.className = 'source';
  source.textContent = candidate.source;

  button.append(text, source);
  button.addEventListener('click', () => choose(word.roman, candidate.text));
  item.append(button);
  return item;
}

function choose(roman: string, text: string): void {
  overrides.set(roman, text);
  // learn() is what makes the choice stick past this session; the engine
  // canonicalises on the way in.
  guard(() => handle?.engine.learn(roman, text), undefined);
  closePicker();
  render();
}

function closePicker(): void {
  pickerEl.hidden = true;
  document.documentElement.style.overflow = '';
  openWordButton?.classList.remove('open');
  openWordButton = undefined;
}

/* ------------------------------------------------------------------ *
 * Clipboard
 * ------------------------------------------------------------------ */

/**
 * Copy the output.
 *
 * On iOS the Clipboard API only works when `writeText` is reached inside the
 * user gesture that triggered it. Anything awaited first — even a microtask —
 * loses the gesture and the write is rejected. So `outputText()` is synchronous
 * and `writeText` is the first async thing that happens in this handler.
 */
function onCopy(): void {
  const text = outputText();
  if (text.length === 0) {
    toast('Nothing to copy', true);
    return;
  }

  const clipboard = navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    clipboard.writeText(text).then(
      () => toast('Copied'),
      () => finish(legacyCopy(text)),
    );
    return;
  }

  finish(legacyCopy(text));
}

function finish(ok: boolean): void {
  if (ok) toast('Copied');
  else toast('Could not copy — select the text and copy manually', true);
}

/**
 * Pre-Clipboard-API fallback: a real, selectable textarea plus execCommand.
 *
 * It has to be genuinely on screen and genuinely editable for iOS to allow the
 * selection, which is why `.offscreen` uses opacity rather than display:none,
 * and why contentEditable and readOnly are both toggled.
 */
function legacyCopy(text: string): boolean {
  const scratch = document.createElement('textarea');
  scratch.className = 'offscreen';
  scratch.value = text;
  scratch.setAttribute('readonly', '');
  document.body.append(scratch);

  const selection = document.getSelection();
  const previous = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined;

  let copied = false;
  try {
    scratch.contentEditable = 'true';
    scratch.readOnly = false;

    const range = document.createRange();
    range.selectNodeContents(scratch);
    selection?.removeAllRanges();
    selection?.addRange(range);
    scratch.setSelectionRange(0, text.length);

    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    scratch.remove();
    if (previous) {
      selection?.removeAllRanges();
      selection?.addRange(previous);
    }
  }

  return copied;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

let toastTimer: number | undefined;

function toast(message: string, isError = false): void {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.add('show');
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1600);
}

function setStatus(message: string, warn: boolean): void {
  statusEl.textContent = message;
  statusEl.classList.toggle('warn', warn && message.length > 0);
}

/**
 * Run an engine call, and if it throws, say so in the status line instead of
 * leaving the user with a page that has silently stopped updating.
 */
function guard<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    setStatus(`Engine error: ${error instanceof Error ? error.message : String(error)}`, true);
    return fallback;
  }
}

function readPref(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writePref(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* storage unavailable; the toggle still works for this session */
  }
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

function bindEvents(): void {
  romanEl.addEventListener('input', scheduleRender);

  outputEl.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('button.word');
    const index = target?.dataset.index;
    if (target && index !== undefined) openPicker(Number(index), target);
  });

  copyEl.addEventListener('click', onCopy);

  clearEl.addEventListener('click', () => {
    romanEl.value = '';
    overrides.clear();
    render();
    romanEl.focus();
  });

  digitsEl.addEventListener('change', () => {
    writePref(PREF_DIGITS, digitsEl.checked);
    rebuildEngine();
    render();
  });

  strictEl.addEventListener('change', () => {
    writePref(PREF_STRICT, strictEl.checked);
    // Strict ITRANS has exactly one answer per word, so there is nothing to pick.
    inline?.setEnabled(!strictEl.checked);
    render();
  });

  for (const closer of document.querySelectorAll('[data-picker-close]')) {
    closer.addEventListener('click', closePicker);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !pickerEl.hidden) closePicker();
  });
}

/* ------------------------------------------------------------------ *
 * Offline
 * ------------------------------------------------------------------ */

function registerServiceWorker(): void {
  // Feature-detected, production-only, and never allowed to break the page:
  // the app is perfectly usable without it, just not after a cold offline start.
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      /* insecure origin, private mode, or unsupported: nothing to do */
    });
  });
}
