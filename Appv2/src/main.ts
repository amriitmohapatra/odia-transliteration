/**
 * Wiring for Appv2.
 *
 * Forked from web/src/main.ts; the clipboard handling is unchanged. Appv2
 * added the profile selector, the preprocess step and the insert palette. V1
 * made the text box the only composing surface: the separate ODIA output box
 * is gone, replaced by the "Reads as" line (readback.ts) and copyText().
 *
 * No framework, for the same reason as before: every kilobyte here is a
 * kilobyte JavaScriptCore has to interpret on an iPhone.
 */

import './style.css';
import { badgeElement, DOCK_QUERY, InlineCandidates } from './inline.js';
// After style.css: the overlay's stylesheet overrides parts of the caret bar.
import { startDictionary, type DictionaryState } from './dictionary/index.js';

import { LocalStorageLearnStore } from '@odia/core';
import type { DigitMode, WordResult } from '@odia/core/types';

import {
  buildEngine,
  loadPaletteToml,
  loadProfileAssets,
  type EngineHandle,
} from './engine.js';
import { describeEntry, displayText, loadPalette, type PaletteEntry } from './palette.js';
import { preprocess, PREPROCESS_HINTS } from './preprocess.js';
import { badgeFor } from './badges.js';
import { buildSlots, hasWords, readbackText, type Slot } from './readback.js';
import { casual } from './romanize.js';
import {
  DEFAULT_PROFILE,
  isProfileId,
  PROFILE_PREF_KEY,
  PROFILES,
  type ProfileId,
} from './profiles.js';

/* ------------------------------------------------------------------ *
 * Elements
 * ------------------------------------------------------------------ */

const romanEl = must<HTMLTextAreaElement>('roman');
const readbackRowEl = must<HTMLDivElement>('readback-row');
const readbackEl = must<HTMLDivElement>('readback');
const statusEl = must<HTMLParagraphElement>('status');
const bannerEl = must<HTMLDivElement>('banner');
const bannerReloadEl = must<HTMLButtonElement>('banner-reload');
const offlineChipEl = must<HTMLSpanElement>('offline-chip');
const offlineChipTextEl = must<HTMLSpanElement>('offline-chip-text');
const copyEl = must<HTMLButtonElement>('copy');
const shareEl = must<HTMLButtonElement>('share');
const clearEl = must<HTMLButtonElement>('clear');
const digitsEl = must<HTMLInputElement>('toggle-digits');
const strictEl = must<HTMLInputElement>('toggle-strict');
const modeEverydayEl = must<HTMLInputElement>('mode-everyday');
const modeSlokaEl = must<HTMLInputElement>('mode-sloka');
const classicEl = must<HTMLInputElement>('toggle-classic');
const familySafeEl = must<HTMLInputElement>('toggle-family-safe');
const textSizeEls = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="text-size"]'));
const profileHintEl = must<HTMLElement>('profile-hint');
const paletteEl = must<HTMLDivElement>('palette');
const shortcutsEl = must<HTMLElement>('shortcuts');
const pickerEl = must<HTMLDivElement>('picker');
const pickerTitleEl = must<HTMLHeadingElement>('picker-title');
const pickerListEl = must<HTMLUListElement>('picker-list');
const toastEl = must<HTMLDivElement>('toast');
const toastTextEl = must<HTMLSpanElement>('toast-text');
const toastActionEl = must<HTMLButtonElement>('toast-action');
const settingsEl = must<HTMLDivElement>('settings');
const openSettingsEl = must<HTMLButtonElement>('open-settings');

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
/** "Hide rude words". ON by default: a missing key reads as on. */
const PREF_FAMILY_SAFE = 'odia.pref.familySafe';
/**
 * Settings > Text size: 'normal' | 'large' | 'xl', missing = normal. Applied as
 * a class on <html> that multiplies the --fs-* scale (style.css). The inline
 * script in index.html reads the same key before first paint.
 */
const PREF_TEXT_SIZE = 'odia.pref.textSize';
const TEXT_SIZES = ['normal', 'large', 'xl'] as const;
type TextSize = (typeof TEXT_SIZES)[number];
const TEXT_SIZE_CLASS: Record<TextSize, string> = { normal: '', large: 'text-large', xl: 'text-xl' };

/**
 * Declared before boot() runs (it is called at module load), like every
 * constant boot() reaches. What users see for each profile (proposal "Mode note"). Labels only: the ids
 * and the stored odia.pref.profile value are unchanged, and profiles.ts keeps
 * its own labels for the eval harnesses.
 */
const MODE_HINT: Record<ProfileId, string> = {
  unified: '',
  sloka: 'For verse: Sanskrit spellings come first.',
  everyday: 'Classic engine: the original word list, without Sanskrit forms.',
};

/** How many candidates the picker offers. */
const TOPK = 8;

/* V1 states (proposal 3.11). Copy deck strings. */
const LOADING_WORDS = 'Loading words\u2026 your text will convert in a moment';
const LOADING_MEANINGS = 'Loading meanings\u2026';
const MEANINGS_FAILED = 'Meanings are unavailable right now. Typing still works.';
const EMPTY_COPY = 'Type something first';
/* Share / Copy / Clear (proposal 3.10, copy deck 6). */
const COPIED = 'Copied \u2014 now paste it in WhatsApp';
const COPY_FAILED = "Couldn't copy. The text is selected \u2014 press and hold, then Copy.";
const SHARE_FAILED = "Couldn't open sharing. Use Copy instead.";
const CLEARED = 'Cleared';
/** Toasts stay long enough for older readers (proposal 5: at least 4 s). */
const TOAST_MS = 4000;
const UNDO_MS = 6000;

/**
 * The phone's share sheet (WhatsApp, Messages...). Feature-detected: absent on
 * most desktop browsers and in the test Chromium. Sharing is the user's own
 * hand-off to the OS, not a network call from the app.
 */
const CAN_SHARE = typeof navigator.share === 'function';
const phoneQuery = typeof window.matchMedia === 'function' ? window.matchMedia(DOCK_QUERY) : undefined;

type Phase = 'loading' | 'ready' | 'failed';
/** The engine and its word list: loading until built, failed if degraded. */
let enginePhase: Phase = 'loading';
/** What is loading while a mode switch fetches its word list. */
let loadingText = LOADING_WORDS;
let dictPhase: DictionaryState = 'idle';
/** A note from the engine or an error (setStatus). */
let note = '';
let noteWarn = false;

/**
 * `?debug=1` shows engine detail (the LEXICON / RULE source of each
 * alternative) that is never shown to users (audit H5).
 */
const DEBUG = new URLSearchParams(window.location.search).get('debug') === '1';

const learnStore = new LocalStorageLearnStore();

let profileId: ProfileId = DEFAULT_PROFILE;
let handle: EngineHandle | undefined;
let inline: InlineCandidates | undefined;

/** The text box cut into read-back slots (readback.ts), as last rendered. */
let slots: Slot[] = [];
/** Odia word -> the English key it was committed under, this session. */
const commitKeys = new Map<string, string>();
/** Odia words converted in bulk (paste, late word list) and not yet picked. */
const uncheckedWords = new Set<string>();

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

void boot();

async function boot(): Promise<void> {
  digitsEl.checked = readPref(PREF_DIGITS);
  strictEl.checked = readPref(PREF_STRICT);
  familySafeEl.checked = readPref(PREF_FAMILY_SAFE, true);
  applyTextSize(readTextSize());
  profileId = readProfilePref();

  buildProfileSelect();
  buildShortcutHints();
  bindEvents();

  inline = new InlineCandidates(romanEl, {
    candidates: (roman) =>
      guard(() => handle?.engine.transliterateWord(roman, 9) ?? [], []),
    onCommit: (roman, text) => {
      guard(() => handle?.engine.learn(roman, text), undefined);
      commitKeys.set(text, roman);
      uncheckedWords.delete(text);
      render();
    },
    badge: (text) => badgeFor(handle?.engine, text),
  });
  inline.setEnabled(!strictEl.checked);

  // Copy rides on the phone strip too, so it stays reachable with the
  // keyboard open (finish gate 2). Acts on click: the iOS clipboard needs the
  // click as its user gesture; the strip's mousedown handler only keeps focus.
  // One primary action on the strip (finish gate 2): Share\u2026 where the
  // phone has a share sheet, else Copy. Both act on click, inside the gesture.
  const dockShare = document.createElement('button');
  dockShare.type = 'button';
  dockShare.id = 'share-dock';
  dockShare.className = 'btn btn-primary';
  dockShare.textContent = 'Share\u2026';
  dockShare.hidden = true;
  dockShare.addEventListener('click', onShare);
  const dockCopy = document.createElement('button');
  dockCopy.type = 'button';
  dockCopy.id = 'copy-dock';
  dockCopy.className = 'btn btn-primary';
  dockCopy.textContent = 'Copy';
  dockCopy.addEventListener('click', onCopy);
  inline.toolbar.append(dockShare, dockCopy);
  layoutActions();

  updateStates();
  render(); // paint the empty shell immediately

  await loadProfileAssets(profileId);
  rebuildEngine();
  // Words typed while the word list loaded convert now, in place, and the
  // word at the caret gets its suggestions.
  convertInPlace();
  inline.setEnabled(!strictEl.checked);
  render();
  startDictionary((s) => {
    dictPhase = s;
    updateStates();
  }); // glosses + side panel; its data loads lazily

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
  // familySafe on EVERY rebuild (digits, mode), or it would silently reset.
  handle = buildEngine(profileId, digitMode(), learnStore, familySafeEl.checked);
  enginePhase = handle.ready && handle.wordList ? 'ready' : 'failed';
  loadingText = LOADING_WORDS;
  // The degraded engine's own note is for engineers; the banner says it plainly.
  setStatus(handle.ready ? handle.note : '', false);
  profileHintEl.textContent = MODE_HINT[profileId];
}

/* ------------------------------------------------------------------ *
 * Rendering: the read-back line
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

/**
 * The text box is the only composing surface (audit H1). What used to be the
 * ODIA output box is now two things: copyText(), which converts whatever is
 * still roman exactly as that box did, and the "Reads as" line, which shows
 * how the result reads.
 */
function render(): void {
  const engine = handle?.engine;
  const raw = romanEl.value;
  const caret = document.activeElement === romanEl ? romanEl.selectionEnd : null;

  let words: readonly WordResult[] = [];
  if (engine) {
    // ONE preprocessed string for the engine. Roman words are ASCII letter
    // runs that preprocess never touches, so buildSlots finds each of them in
    // the raw box value in order, and the slot offsets are offsets in the box.
    const input = preprocess(raw, PROFILES[profileId].preprocess);
    words = guard(() => engine.transliterate(input, { topk: TOPK }).words, []);
  }

  const display = strictEl.checked && engine
    ? (word: WordResult) => guard(() => engine.strict(word.roman, 'itrans'), word.roman)
    : undefined;
  slots = buildSlots(raw, words, caret, display);
  renderReadback();
}

function renderReadback(): void {
  const fragment = document.createDocumentFragment();

  slots.forEach((slot, index) => {
    if (slot.kind === 'text') {
      fragment.append(slot.text);
      return;
    }
    if (slot.kind === 'latin') {
      const span = document.createElement('span');
      span.className = 'rb-latin';
      span.textContent = slot.text;
      fragment.append(span);
      return;
    }

    // DOM CONTRACT with dictionary/overlay.ts: `.rb-word` inside #readback,
    // with the Odia word in data-odia (the visible text is Latin).
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rb-word';
    button.dataset.slot = String(index);
    button.dataset.odia = slot.odia;
    button.textContent = slot.reads;
    const unchecked = slot.kind === 'roman' || uncheckedWords.has(slot.odia);
    if (unchecked) button.classList.add('rb-unchecked');
    if (slot.kind === 'roman' && slot.pending) button.classList.add('rb-pending');
    if (strictEl.checked && slot.kind === 'roman') button.disabled = true;
    button.setAttribute(
      'aria-label',
      `${slot.reads}${unchecked ? ', not checked yet' : ''}. Change this word`,
    );
    fragment.append(button);
  });

  readbackEl.replaceChildren(fragment);
  readbackRowEl.hidden = !hasWords(slots);
  updateStripNote();
  updateCopyState();
}

/** The last `max` characters, with an ellipsis at the start when cut. */
function tail(text: string, max: number): string {
  return text.length <= max ? text : `\u2026${text.slice(text.length - max + 1)}`;
}

/**
 * What Copy puts on the clipboard: the box with every roman word that is
 * still there converted to its top candidate (or strict ITRANS), and the
 * preprocess marks (| -> danda and so on) applied. Byte-for-byte what the old
 * output box showed, so copying never regresses.
 */
function copyText(): string {
  const engine = handle?.engine;
  const input = preprocess(romanEl.value, PROFILES[profileId].preprocess);
  if (!engine) return input;
  if (strictEl.checked) return guard(() => engine.strict(input, 'itrans'), input);
  return guard(() => engine.transliterate(input, { topk: 1 }).text, input);
}

/** Convert one stretch of the box the way copyText() would. */
function convertStretch(text: string, engine: EngineHandle['engine']): string {
  if (!/[A-Za-z]/.test(text)) return text;
  const input = preprocess(text, PROFILES[profileId].preprocess);
  if (strictEl.checked) return guard(() => engine.strict(input, 'itrans'), text);
  const result = guard(() => engine.transliterate(input, { topk: 1 }), undefined);
  if (!result) return text;
  for (const word of result.words) {
    const top = word.candidates[0]?.text;
    if (top !== undefined && /[\u0B00-\u0B7F]/.test(top)) uncheckedWords.add(top);
  }
  return result.text;
}

/**
 * Convert roman words in the box to Odia IN PLACE, except the word still being
 * typed at the caret (the suggestion bar owns that one). Runs when the word
 * list becomes ready (text typed while it loaded) and after a paste. Converted
 * words are marked "not checked yet" in the read-back until the user picks.
 */
function convertInPlace(): void {
  const engine = handle?.engine;
  if (!engine || !handle?.ready) return;
  const raw = romanEl.value;
  if (!/[A-Za-z]/.test(raw)) return;

  const focused = document.activeElement === romanEl;
  const caret = focused ? (romanEl.selectionEnd ?? raw.length) : raw.length;
  const before = raw.slice(0, caret);
  const after = raw.slice(caret);
  const pending = focused ? (/[A-Za-z_~]+$/.exec(before)?.[0] ?? '') : '';
  const head = before.slice(0, before.length - pending.length);

  const newHead = convertStretch(head, engine);
  const newAfter = convertStretch(after, engine);
  if (newHead === head && newAfter === after) return;

  romanEl.value = newHead + pending + newAfter;
  const at = newHead.length + pending.length;
  if (focused) romanEl.setSelectionRange(at, at);
  render();
}

/**
 * Strict mode has no suggestion bar, so on Space or Enter the run before the
 * caret is replaced by its strict ITRANS result in place, before the key's
 * own character goes in. ITRANS uses `.` `^` `~` and capitals, so the run is
 * everything back to the previous whitespace.
 */
function strictCommit(event: KeyboardEvent): void {
  if (!strictEl.checked || (event.key !== ' ' && event.key !== 'Enter')) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const engine = handle?.engine;
  const { value, selectionStart, selectionEnd } = romanEl;
  if (!engine || selectionStart === null || selectionStart !== selectionEnd) return;

  let start = selectionStart;
  while (start > 0 && !/\s/.test(value[start - 1] as string)) start -= 1;
  const run = value.slice(start, selectionStart);
  if (!/[A-Za-z]/.test(run)) return;

  const input = preprocess(run, PROFILES[profileId].preprocess);
  const odia = guard(() => engine.strict(input, 'itrans'), run);
  romanEl.value = value.slice(0, start) + odia + value.slice(selectionStart);
  const caret = start + odia.length;
  romanEl.setSelectionRange(caret, caret);
}

/* ------------------------------------------------------------------ *
 * Profile selector
 * ------------------------------------------------------------------ */


/** Put the mode controls in step with `profileId`. */
function buildProfileSelect(): void {
  modeSlokaEl.checked = profileId === 'sloka';
  modeEverydayEl.checked = profileId !== 'sloka';
  classicEl.checked = profileId === 'everyday';
  profileHintEl.textContent = MODE_HINT[profileId];
  profileHintEl.hidden = MODE_HINT[profileId].length === 0;
}

/**
 * The profile the controls ask for. "Classic engine" applies to Everyday
 * only: choosing Śloka turns it off, and turning it on selects Everyday.
 */
function profileFromControls(): ProfileId {
  if (modeSlokaEl.checked) return 'sloka';
  return classicEl.checked ? 'everyday' : 'unified';
}

async function onProfileChange(): Promise<void> {
  const next = profileFromControls();
  if (!isProfileId(next) || next === profileId) return;

  profileId = next;
  writeProfilePref(next);

  // The Sanskrit lexicon is its own lazily-globbed chunk, so the first switch
  // into a profile that uses it is a fetch. Say so rather than appearing to
  // hang: on a cold load over a slow link it is a megabyte.
  enginePhase = 'loading';
  loadingText = next === 'sloka' ? 'Switching to \u015Aloka (verse)\u2026' : 'Switching mode\u2026';
  updateStates();
  buildProfileSelect();
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
      // The group name ("Vocalics", "Signs") is engine vocabulary: it names
      // the group for screen readers but is not shown (audit H5).
      const section = document.createElement('div');
      section.className = 'palette-group';
      section.setAttribute('role', 'group');
      section.setAttribute('aria-label', group.name);
      section.title = group.hint;

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
 * Candidate picker (the Alternatives sheet), opened from a read-back word
 * ------------------------------------------------------------------ */

interface PickerRow {
  text: string;
  source: string;
}

/** The slot whose alternatives are showing, with the box text it stood for. */
let openSlot: { start: number; end: number; was: string; key: string } | undefined;
let openTrigger: HTMLElement | undefined;

function openPicker(index: number, trigger: HTMLElement): void {
  const slot = slots[index];
  const engine = handle?.engine;
  if (!slot || !engine || (slot.kind !== 'odia' && slot.kind !== 'roman')) return;

  // The English key: the word as typed for a roman slot; for a committed word,
  // the key it was committed under in this session, else its romanisation in
  // the way people type it (long vowels short).
  const key = slot.kind === 'roman' ? slot.word.roman : commitKeys.get(slot.odia) ?? casual(slot.reads);
  const candidates: PickerRow[] =
    slot.kind === 'roman'
      ? slot.word.candidates.map((c) => ({ text: c.text, source: c.source }))
      : guard(() => engine.transliterateWord(key, TOPK + 1), []).map((c) => ({ text: c.text, source: c.source }));
  // The current word is always on the list, so the sheet can say "this one".
  if (!candidates.some((c) => c.text === slot.odia)) candidates.unshift({ text: slot.odia, source: 'current' });

  openSlot = { start: slot.start, end: slot.end, was: romanEl.value.slice(slot.start, slot.end), key };
  pickerTitleEl.replaceChildren('Alternatives for ', romanLabel(key));
  // DOM CONTRACT with dictionary/overlay.ts: #picker-list > li > button.candidate
  // with the Odia word in a `.text` child; the overlay appends .dict-gloss.
  pickerListEl.replaceChildren(...candidates.map((c) => candidateRow(c, c.text === slot.odia)));

  pickerEl.hidden = false;
  document.documentElement.style.overflow = 'hidden';
  trigger.classList.add('open');
  openTrigger = trigger;

  const first = pickerListEl.querySelector<HTMLButtonElement>('button.candidate');
  first?.focus();
}

function romanLabel(roman: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'roman';
  span.textContent = roman;
  return span;
}

function candidateRow(candidate: PickerRow, current: boolean): HTMLLIElement {
  const item = document.createElement('li');
  const button = document.createElement('button');

  button.type = 'button';
  button.className = 'candidate';
  if (current) button.setAttribute('aria-current', 'true');

  const text = document.createElement('span');
  text.className = /[\u0B00-\u0B7F]/.test(candidate.text) ? 'text' : 'text text-latin';
  if (/[\u0B00-\u0B7F]/.test(candidate.text)) text.lang = 'or';
  text.textContent = candidate.text;

  button.append(text);
  const badge = badgeFor(handle?.engine, candidate.text);
  if (badge) button.append(badgeElement(badge));
  if (DEBUG) {
    const source = document.createElement('span');
    source.className = 'source';
    source.textContent = candidate.source;
    button.append(source);
  }
  button.addEventListener('click', () => choose(candidate.text));
  item.append(button);
  return item;
}

/** Replace the open slot's text in the box with the chosen word. */
function choose(text: string): void {
  const slot = openSlot;
  const index = openTrigger?.dataset.slot;
  closePicker(false);
  if (!slot) return;

  const value = romanEl.value;
  // The box may have changed under the sheet; never replace the wrong text.
  if (value.slice(slot.start, slot.end) !== slot.was) {
    render();
    return;
  }

  romanEl.value = value.slice(0, slot.start) + text + value.slice(slot.end);
  guard(() => handle?.engine.learn(slot.key, text), undefined);
  commitKeys.set(text, slot.key);
  uncheckedWords.delete(text);
  uncheckedWords.delete(slot.was);

  // Keep the caret where it was, shifted by the change in length.
  const caret = romanEl.selectionEnd ?? value.length;
  const shifted = caret >= slot.end ? caret + text.length - (slot.end - slot.start) : caret;
  romanEl.setSelectionRange(shifted, shifted);
  render();
  focusReadbackWord(index);
}

function closePicker(restoreFocus = true): void {
  pickerEl.hidden = true;
  document.documentElement.style.overflow = '';
  openTrigger?.classList.remove('open');
  const index = openTrigger?.dataset.slot;
  openTrigger = undefined;
  openSlot = undefined;
  if (restoreFocus) focusReadbackWord(index);
}

/** Focus goes back to the read-back word that opened the sheet. */
function focusReadbackWord(index: string | undefined): void {
  if (index === undefined) return;
  readbackEl.querySelector<HTMLElement>(`.rb-word[data-slot="${index}"]`)?.focus();
}

/* ------------------------------------------------------------------ *
 * Settings sheet
 * ------------------------------------------------------------------ */

function openSettings(): void {
  settingsEl.hidden = false;
  document.documentElement.style.overflow = 'hidden';
  settingsEl.querySelector<HTMLInputElement>('input')?.focus();
}

function closeSettings(): void {
  settingsEl.hidden = true;
  document.documentElement.style.overflow = '';
  openSettingsEl.focus();
}

/* ------------------------------------------------------------------ *
 * Clipboard
 * ------------------------------------------------------------------ */

/**
 * Share and Copy look disabled while the box is empty and say why on tap.
 * Returns true when there is nothing to send.
 */
function refuseEmpty(): boolean {
  if (romanEl.value.trim().length > 0) return false;
  toast(EMPTY_COPY, { error: true });
  return true;
}

/**
 * On iOS the Clipboard API only works when `writeText` is reached inside the
 * user gesture that triggered it. Anything awaited first, even a microtask,
 * loses the gesture. So `copyText()` is synchronous and `writeText` is the
 * first async thing in this handler.
 */
function onCopy(): void {
  if (refuseEmpty()) return;
  const text = copyText();

  const clipboard = navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    clipboard.writeText(text).then(
      () => toast(COPIED),
      () => finish(legacyCopy(text), text),
    );
    return;
  }

  finish(legacyCopy(text), text);
}

function finish(ok: boolean, text: string): void {
  if (ok) toast(COPIED);
  else copyFailed(text);
}

/**
 * Copy failed: put exactly what would have been copied in the box (the word
 * at the caret converted, as Copy would) and select it, so the user can copy
 * it by hand. The message says how.
 */
function copyFailed(text: string): void {
  if (romanEl.value !== text) {
    romanEl.value = text;
    render();
  }
  romanEl.focus();
  romanEl.setSelectionRange(0, romanEl.value.length);
  refreshSuggestions();
  toast(COPY_FAILED, { error: true });
}

/**
 * Share\u2026 (phones): the phone's own share sheet, text only. Called
 * synchronously from the click so the browser sees the user gesture.
 * Closing the sheet without choosing an app is not an error.
 */
function onShare(): void {
  if (refuseEmpty()) return;
  if (typeof navigator.share !== 'function') {
    onCopy();
    return;
  }
  const text = copyText();
  let sharing: Promise<void>;
  try {
    sharing = navigator.share({ text });
  } catch {
    toast(SHARE_FAILED, { error: true });
    return;
  }
  sharing.catch((error: unknown) => {
    if (error instanceof Error && error.name === 'AbortError') return;
    toast(SHARE_FAILED, { error: true });
  });
}

/**
 * Phone with a share sheet: Share\u2026 is primary, Copy secondary (on the strip,
 * where only one fits, Share alone). Elsewhere Copy Odia is primary and there
 * is no Share (desktop share sheets are poor; proposal 3.10).
 */
function layoutActions(): void {
  const share = CAN_SHARE && (phoneQuery?.matches ?? false);
  shareEl.hidden = !share;
  copyEl.classList.toggle('btn-primary', !share);
  copyEl.textContent = share ? 'Copy' : 'Copy Odia';
  const dockShare = document.getElementById('share-dock');
  const dockCopy = document.getElementById('copy-dock');
  if (dockShare) dockShare.hidden = !share;
  if (dockCopy) dockCopy.hidden = share;
}

/* ------------------------------------------------------------------ *
 * Clear, with Undo
 * ------------------------------------------------------------------ */

/** What Clear removed, while its Undo toast is showing. */
let cleared: { value: string; caret: number } | undefined;

function onClear(): void {
  const value = romanEl.value;
  if (value.length === 0) {
    romanEl.focus();
    return;
  }
  const keep = { value, caret: romanEl.selectionEnd ?? value.length };
  romanEl.value = '';
  uncheckedWords.clear();
  render();
  romanEl.focus();
  refreshSuggestions();
  toast(CLEARED, { action: { label: 'Undo', run: undoClear }, ms: UNDO_MS });
  cleared = keep; // after toast(): showing it ends any earlier undo window
}

/** Put the cleared text back, caret where it was. Only while the box is still empty. */
function undoClear(): void {
  const state = cleared;
  hideToast();
  if (!state || romanEl.value.length > 0) return;
  romanEl.value = state.value;
  romanEl.focus();
  romanEl.setSelectionRange(state.caret, state.caret);
  render();
  refreshSuggestions();
}

/**
 * After the box value is set by script (no input event), the suggestion bar
 * must re-read the word at the caret, or a tap would commit into stale offsets.
 */
function refreshSuggestions(): void {
  inline?.setEnabled(!strictEl.checked);
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
let toastAction: (() => void) | undefined;

interface ToastOptions {
  error?: boolean;
  /** A button in the toast ("Undo"). */
  action?: { label: string; run: () => void };
  ms?: number;
}

/**
 * A short message (role=status) for at least 4 s. Showing any toast ends the
 * Undo window of an earlier "Cleared".
 */
function toast(text: string, options: ToastOptions = {}): void {
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  cleared = undefined;
  toastTextEl.textContent = text;
  toastAction = options.action?.run;
  toastActionEl.hidden = options.action === undefined;
  toastActionEl.textContent = options.action?.label ?? '';
  toastEl.classList.toggle('error', options.error === true);
  toastEl.classList.toggle('has-action', options.action !== undefined);
  placeToast();
  toastEl.classList.add('show');
  toastTimer = window.setTimeout(hideToast, options.ms ?? TOAST_MS);
}

function hideToast(): void {
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastTimer = undefined;
  toastEl.classList.remove('show', 'has-action');
  toastActionEl.hidden = true;
  toastAction = undefined;
  cleared = undefined;
}

/**
 * Keep the toast in sight with the keyboard open: above the phone strip when
 * it is showing, else above the bottom of the visual viewport (on iOS the
 * keyboard covers the bottom of the layout viewport, where position: fixed
 * puts it).
 */
function placeToast(): void {
  const bar = document.getElementById('kb-bar');
  const vv = window.visualViewport;
  let bottom: number | undefined;
  if (bar && document.body.classList.contains('kb-docked')) {
    bottom = window.innerHeight - bar.getBoundingClientRect().top + 12;
  } else if (vv) {
    const covered = window.innerHeight - (vv.offsetTop + vv.height);
    if (covered > 1) bottom = covered + 24;
  }
  toastEl.style.bottom = bottom === undefined ? '' : `${Math.round(bottom)}px`;
}

function setStatus(text: string, warn: boolean): void {
  note = text;
  noteWarn = warn && text.length > 0;
  updateStates();
}

/* ------------------------------------------------------------------ *
 * States: loading, failures, empty (proposal 3.11)
 * ------------------------------------------------------------------ */

type StatusKind = 'loading' | 'warn' | 'note';

/** The one line under the text box, most important first. */
function currentStatus(): { text: string; kind: StatusKind } | undefined {
  if (enginePhase === 'loading') return { text: loadingText, kind: 'loading' };
  if (note && noteWarn) return { text: note, kind: 'warn' };
  if (dictPhase === 'failed') return { text: MEANINGS_FAILED, kind: 'warn' };
  if (dictPhase === 'loading') return { text: LOADING_MEANINGS, kind: 'loading' };
  if (note) return { text: note, kind: 'note' };
  return undefined;
}

function updateStates(): void {
  const status = currentStatus();
  statusEl.hidden = status === undefined;
  statusEl.textContent = status?.text ?? '';
  statusEl.className = `status status-${status?.kind ?? 'note'}`;
  bannerEl.hidden = enginePhase !== 'failed';
  updateStripNote();
}

/**
 * The phone strip's one-line note: a loading or failure message wins over
 * the read-back summary, so the state is visible with the keyboard open.
 */
function updateStripNote(): void {
  const status = currentStatus();
  if (enginePhase === 'failed') inline?.setNote("The word list didn't load.");
  else if (status && status.kind !== 'note' && status.text !== LOADING_MEANINGS) inline?.setNote(status.text);
  else inline?.setNote(hasWords(slots) ? `Reads as: ${tail(readbackText(slots), 60)}` : '');
}

/** Copy looks disabled while the box is empty, and says why on tap (H8). */
function updateCopyState(): void {
  const empty = romanEl.value.trim().length === 0;
  const buttons = [copyEl, shareEl, document.getElementById('copy-dock'), document.getElementById('share-dock')];
  for (const button of buttons) {
    if (!button) continue;
    if (empty) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
  }
}

/* ------------------------------------------------------------------ *
 * Offline chip
 * ------------------------------------------------------------------ */

let registration: ServiceWorkerRegistration | undefined;

/**
 * "Works offline" once the service worker is active, "Saving for offline\u2026"
 * while it installs, nothing when there is no worker (dev, single file).
 */
function updateOfflineChip(): void {
  const reg = registration;
  let text = '';
  let ready = false;
  if (reg?.active) {
    ready = true;
    text = navigator.onLine === false ? 'Offline \u00B7 still works' : 'Works offline';
  } else if (reg?.installing || reg?.waiting) {
    text = 'Saving for offline\u2026';
  }
  offlineChipEl.hidden = text.length === 0;
  offlineChipEl.classList.toggle('chip-ok', ready);
  offlineChipTextEl.textContent = text;
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

/** The stored string, or null when nothing is stored or storage is unavailable. */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** A stored '1' / '0' switch. `fallback` when nothing is stored or storage is unavailable. */
function readPref(key: string, fallback = false): boolean {
  const stored = readStored(key);
  return stored === null ? fallback : stored === '1';
}

function readTextSize(): TextSize {
  const stored = readStored(PREF_TEXT_SIZE);
  return (TEXT_SIZES as readonly string[]).includes(stored ?? '') ? (stored as TextSize) : 'normal';
}

/** Set the <html> class that scales the type, and check the matching radio. */
function applyTextSize(size: TextSize): void {
  const root = document.documentElement;
  for (const cls of Object.values(TEXT_SIZE_CLASS)) if (cls) root.classList.remove(cls);
  if (TEXT_SIZE_CLASS[size]) root.classList.add(TEXT_SIZE_CLASS[size]);
  for (const radio of textSizeEls) radio.checked = radio.value === size;
}

function writeTextSize(size: TextSize): void {
  try {
    localStorage.setItem(PREF_TEXT_SIZE, size);
  } catch {
    /* storage unavailable; the size still applies for this session */
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
  romanEl.addEventListener('input', (event) => {
    const kind = (event as InputEvent).inputType;
    if (kind === 'insertFromPaste' || kind === 'insertFromDrop') convertInPlace();
    scheduleRender();
  });
  // The caret moving changes which word is "being typed".
  romanEl.addEventListener('keyup', scheduleRender);
  romanEl.addEventListener('click', scheduleRender);
  romanEl.addEventListener('blur', scheduleRender);
  romanEl.addEventListener('keydown', strictCommit);

  readbackEl.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('button.rb-word');
    const index = target?.dataset.slot;
    if (target && index !== undefined) openPicker(Number(index), target);
  });

  copyEl.addEventListener('click', onCopy);
  shareEl.addEventListener('click', onShare);
  // addListener, not addEventListener('change'): the floor is Safari 13.
  phoneQuery?.addListener(layoutActions);
  toastActionEl.addEventListener('click', () => toastAction?.());
  bannerReloadEl.addEventListener('click', () => window.location.reload());
  window.addEventListener('online', updateOfflineChip);
  window.addEventListener('offline', updateOfflineChip);

  clearEl.addEventListener('click', onClear);
  // Ctrl/Cmd+Z in the emptied box is Undo too while "Cleared" shows: the box
  // was emptied by script, so the browser's own undo has nothing to restore.
  romanEl.addEventListener('keydown', (event) => {
    const undoKey = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
    if (undoKey && cleared && romanEl.value.length === 0) {
      event.preventDefault();
      undoClear();
    }
  });

  digitsEl.addEventListener('change', () => {
    writePref(PREF_DIGITS, digitsEl.checked);
    rebuildEngine();
    render();
  });

  familySafeEl.addEventListener('change', () => {
    writePref(PREF_FAMILY_SAFE, familySafeEl.checked);
    // No rebuild needed: the engine reads the switch on every lookup.
    guard(() => handle?.engine.setFamilySafe?.(familySafeEl.checked), undefined);
    inline?.setEnabled(!strictEl.checked); // re-rank the open suggestions
    render();
  });

  for (const radio of textSizeEls) {
    radio.addEventListener('change', () => {
      if (!radio.checked || !(TEXT_SIZES as readonly string[]).includes(radio.value)) return;
      const size = radio.value as TextSize;
      applyTextSize(size);
      writeTextSize(size);
      render(); // the suggestion bar and strip re-measure with the new size
    });
  }

  strictEl.addEventListener('change', () => {
    writePref(PREF_STRICT, strictEl.checked);
    // Strict ITRANS has exactly one answer per word, so there is nothing to pick.
    inline?.setEnabled(!strictEl.checked);
    render();
  });

  modeEverydayEl.addEventListener('change', () => void onProfileChange());
  modeSlokaEl.addEventListener('change', () => {
    classicEl.checked = false;
    void onProfileChange();
  });
  classicEl.addEventListener('change', () => {
    if (classicEl.checked) modeEverydayEl.checked = true;
    void onProfileChange();
  });

  for (const closer of document.querySelectorAll('[data-picker-close]')) {
    closer.addEventListener('click', () => closePicker());
  }

  openSettingsEl.addEventListener('click', openSettings);
  for (const closer of document.querySelectorAll('[data-settings-close]')) {
    closer.addEventListener('click', closeSettings);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!pickerEl.hidden) closePicker();
    else if (!settingsEl.hidden) closeSettings();
  });
}

/* ------------------------------------------------------------------ *
 * Offline
 * ------------------------------------------------------------------ */

function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  const register = (): void => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((reg) => {
        registration = reg;
        const watch = (worker: ServiceWorker | null): void => {
          worker?.addEventListener('statechange', updateOfflineChip);
        };
        watch(reg.installing);
        watch(reg.waiting);
        reg.addEventListener('updatefound', () => {
          watch(reg.installing);
          updateOfflineChip();
        });
        updateOfflineChip();
      })
      .catch(() => {
        /* insecure origin, private mode, or unsupported: no chip */
      });
  };
  // This runs at the end of boot(), after awaited asset loads, so the 'load'
  // event has usually fired already. Waiting for it then meant the worker
  // never registered and the served app never worked offline.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
