/**
 * Wiring for Appv2.
 *
 * Forked from web/src/main.ts. The structure, the clipboard handling and the
 * picker are unchanged; what is new is the profile selector, the preprocess
 * step, and the insert palette.
 *
 * No framework, for the same reason as before: every kilobyte here is a
 * kilobyte JavaScriptCore has to interpret on an iPhone.
 */

import './style.css';
import { InlineCandidates } from './inline.js';
// After style.css: the overlay's stylesheet overrides parts of the caret bar.
import { startDictionary } from './dictionary/index.js';

import { LocalStorageLearnStore } from '@odia/core';
import type { Candidate, DigitMode, WordResult } from '@odia/core/types';

import {
  buildEngine,
  loadPaletteToml,
  loadProfileAssets,
  type EngineHandle,
} from './engine.js';
import { describeEntry, displayText, loadPalette, type PaletteEntry } from './palette.js';
import { preprocess, PREPROCESS_HINTS } from './preprocess.js';
import {
  DEFAULT_PROFILE,
  isProfileId,
  PROFILE_ORDER,
  PROFILE_PREF_KEY,
  PROFILES,
  type ProfileId,
} from './profiles.js';

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
const profileEl = must<HTMLSelectElement>('profile');
const profileHintEl = must<HTMLElement>('profile-hint');
const paletteEl = must<HTMLDivElement>('palette');
const shortcutsEl = must<HTMLElement>('shortcuts');
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

const learnStore = new LocalStorageLearnStore();

let profileId: ProfileId = DEFAULT_PROFILE;
let handle: EngineHandle | undefined;
let inline: InlineCandidates | undefined;

let lastWords: readonly WordResult[] = [];
const overrides = new Map<string, string>();
let openWordButton: HTMLElement | undefined;

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

void boot();

async function boot(): Promise<void> {
  digitsEl.checked = readPref(PREF_DIGITS);
  strictEl.checked = readPref(PREF_STRICT);
  profileId = readProfilePref();

  buildProfileSelect();
  buildShortcutHints();
  bindEvents();

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

  await loadProfileAssets(profileId);
  rebuildEngine();
  render();
  startDictionary(); // glosses + side panel; its data loads lazily

  void buildPalette();
  registerServiceWorker();
}

function digitMode(): DigitMode {
  return digitsEl.checked ? 'odia' : 'arabic';
}

/**
 * `digits` and the rule set are both fixed by `EngineConfig` at construction,
 * so changing either rebuilds. Parsed lexicons are cached by asset key in
 * engine.ts, so switching between "Odia + Sanskrit" and "Śloka" reuses both
 * tables and costs only a rule parse.
 */
function rebuildEngine(): void {
  handle = buildEngine(profileId, digitMode(), learnStore);
  setStatus(handle.note, !handle.ready || handle.note.length > 0);
  profileHintEl.textContent = PROFILES[profileId].hint;
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
  const engine = handle?.engine;

  if (handle) setStatus(handle.note, !handle.ready || handle.note.length > 0);

  if (!engine) {
    outputEl.textContent = '';
    lastWords = [];
    return;
  }

  // ONE preprocessed string, computed once, used for BOTH the engine call and
  // the offset recovery in buildOutput(). They must be the same string: `||`
  // collapses to a single `॥`, so passing the raw value to one and the
  // preprocessed value to the other desynchronises locate()'s offsets and the
  // output silently duplicates or drops text.
  const input = preprocess(romanEl.value, PROFILES[profileId].preprocess);

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

function buildOutput(input: string, words: readonly WordResult[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const offsets = locate(input, words);

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

function outputText(): string {
  return outputEl.textContent ?? '';
}

/* ------------------------------------------------------------------ *
 * Profile selector
 * ------------------------------------------------------------------ */

function buildProfileSelect(): void {
  profileEl.replaceChildren(
    ...PROFILE_ORDER.map((id) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = PROFILES[id].label;
      return option;
    }),
  );
  profileEl.value = profileId;
  profileHintEl.textContent = PROFILES[profileId].hint;
}

async function onProfileChange(): Promise<void> {
  const next = profileEl.value;
  if (!isProfileId(next)) return;

  profileId = next;
  writeProfilePref(next);

  // The Sanskrit lexicon is its own lazily-globbed chunk, so the first switch
  // into a profile that uses it is a fetch. Say so rather than appearing to
  // hang: on a cold load over a slow link it is a megabyte.
  setStatus('Switching mode…', false);
  await loadProfileAssets(profileId);

  rebuildEngine();
  render();
}

/* ------------------------------------------------------------------ *
 * Insert palette
 * ------------------------------------------------------------------ */

async function buildPalette(): Promise<void> {
  const toml = await loadPaletteToml();
  if (toml === undefined) return;

  let groups;
  try {
    groups = loadPalette(toml);
  } catch (error) {
    // A malformed palette must not take the app down — it is an accessory.
    setStatus(`Palette failed to load: ${message(error)}`, true);
    return;
  }

  paletteEl.replaceChildren(
    ...groups.map((group) => {
      const section = document.createElement('div');
      section.className = 'palette-group';

      const heading = document.createElement('span');
      heading.className = 'palette-name';
      heading.textContent = group.name;
      heading.title = group.hint;
      section.append(heading);

      for (const entry of group.entries) {
        section.append(paletteButton(entry));
      }
      return section;
    }),
  );
  paletteEl.hidden = false;
}

function paletteButton(entry: PaletteEntry): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'palette-key';
  button.textContent = displayText(entry);
  button.title = describeEntry(entry);
  button.setAttribute('aria-label', describeEntry(entry));
  // mousedown, not click: the textarea must not blur before we read its
  // selection, or the caret position is lost and the insert lands at the end.
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
    insertAtCaret(entry.text);
  });
  return button;
}

/**
 * Insert text at the caret in the roman textarea.
 *
 * The palette inserts Odia characters into what is nominally a roman buffer.
 * That works because core/src/tokenize.ts classifies non-ASCII as punctuation
 * and Engine.transliterate copies punctuation through verbatim — the same
 * property preprocess.ts relies on.
 */
function insertAtCaret(text: string): void {
  const start = romanEl.selectionStart ?? romanEl.value.length;
  const end = romanEl.selectionEnd ?? start;

  romanEl.value = romanEl.value.slice(0, start) + text + romanEl.value.slice(end);
  const caret = start + text.length;
  romanEl.setSelectionRange(caret, caret);
  romanEl.focus();
  render();
}

function buildShortcutHints(): void {
  shortcutsEl.replaceChildren(
    ...PREPROCESS_HINTS.map((hint) => {
      const item = document.createElement('li');
      const typed = document.createElement('code');
      typed.textContent = hint.typed;
      const gives = document.createElement('span');
      gives.className = 'gives';
      gives.textContent = hint.gives;
      item.append(typed, ' → ', gives);
      item.title = hint.example;
      return item;
    }),
  );
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
 * On iOS the Clipboard API only works when `writeText` is reached inside the
 * user gesture that triggered it. Anything awaited first — even a microtask —
 * loses the gesture. So `outputText()` is synchronous and `writeText` is the
 * first async thing in this handler.
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
 * Pre-Clipboard-API fallback. It has to be genuinely on screen and genuinely
 * editable for iOS to allow the selection, which is why `.offscreen` uses
 * opacity rather than display:none.
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

function toast(text: string, isError = false): void {
  toastEl.textContent = text;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.add('show');
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1600);
}

function setStatus(text: string, warn: boolean): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('warn', warn && text.length > 0);
}

function guard<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    setStatus(`Engine error: ${message(error)}`, true);
    return fallback;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function readProfilePref(): ProfileId {
  try {
    const stored = localStorage.getItem(PROFILE_PREF_KEY);
    return isProfileId(stored) ? stored : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

function writeProfilePref(id: ProfileId): void {
  try {
    localStorage.setItem(PROFILE_PREF_KEY, id);
  } catch {
    /* storage unavailable */
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

  profileEl.addEventListener('change', () => void onProfileChange());

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
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  const register = (): void => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      /* insecure origin, private mode, or unsupported: nothing to do */
    });
  };
  // This runs at the end of boot(), after awaited asset loads, so the 'load'
  // event has usually fired already. Waiting for it then meant the worker
  // never registered and the served app never worked offline.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
