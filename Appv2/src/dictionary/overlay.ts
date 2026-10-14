/**
 * Dictionary overlay: an English gloss under each suggestion, plus a side panel
 * with the full entries.
 *
 * Glosses come from the Purnnachandra Odia Bhashakosha (G. C. Praharaj,
 * 1931-40) and an optional modern layer (loanwords, community MT glosses, CLDR
 * names). Sources, licences and checksums: Odia_Sanskrit_Appv2/PROVENANCE.md
 * (praharaj.bin / modern.bin are the base64-decoded payloads recorded there).
 * Word origins ("from Persian", V2.4) come from Praharaj's own origin marks,
 * extracted by Odia_Sanskrit_Appv2/build/build_origin_map.py into origin.bin.
 *
 * It is layered on top of the app by watching the DOM the app renders (the
 * caret candidate bar, the alternatives picker, the read-back words), so the
 * app modules do not need to know it exists. Everything is defensive: if any
 * of this fails, the app underneath keeps working exactly as before.
 *
 * DOM CONTRACT (the other end is commented in the file named):
 *   div.inline-candidates > button.inline-candidate > .inline-text
 *       the suggestion bar / phone strip            (Appv2/src/inline.ts)
 *       `.inline-latin` items (kept English) are skipped.
 *   #picker-list > li > button.candidate > .text
 *       the Alternatives sheet                       (Appv2/src/main.ts)
 *   [data-label] on those two kinds of button
 *       their accessible name without the meaning; when a gloss is added,
 *       aria-label becomes data-label + ", " + the gloss, so a screen reader
 *       hears "<word>, day" (V1 B6).
 *   #readback .rb-word[data-odia]
 *       the "Reads as" words; the Odia word is in data-odia because the
 *       button text is Latin                         (Appv2/src/main.ts,
 *       Appv2/index.html). Until V1 this was #output .word.
 *   [aria-controls="dict-panel"]
 *       the "Meanings" buttons main.ts makes (#dict-toggle in the actions
 *       row, #meanings-dock on the phone strip); they call
 *       setMeaningsOpen() and this module keeps their aria-expanded in
 *       step. Until V1 B5 this module drew its own floating #dict-toggle.
 *
 * The module reads no script tags and no window globals. Its data arrives
 * through the `load` callback passed to `initDictionary()`, which is called
 * lazily — shortly after start-up, or on first need — so the multi-megabyte
 * payload never sits on the page-load path.
 *
 * Odia characters appear ONLY as \u escapes, following the repo convention:
 * canonical and precomposed nukta spellings are visually identical, so a
 * literal cannot be reviewed.
 */

import { canonical } from '@odia/core/normalize';
import { parseGlosses, type Glosses } from '@odia/core';
// Owner meanings (core/data/glosses.tsv): shown first, where the dictionary's
// first sense misleads today. Small, so bundled with the app, not lazy.
import glossesTsv from '../../../core/data/glosses.tsv?raw';

import { inflate } from './pako-inflate.js';
import {
  defAt,
  findEntry,
  findModern,
  fold,
  foldKey,
  MODERN_LABEL,
  modernChip,
  modernLines,
  parsePayload,
  shortGlossOf,
  tidyGloss,
  type Dict,
  type Entry,
  type ModernEntry,
} from './lookup.js';
import { originChipLabel, originLabel, parseOrigin } from './origin.js';
import { parseEnglishEntries, searchEnglish, type EnglishEntry } from './english.js';
import englishTsv from './english.tsv?raw';
import { LANGUAGE_LABEL, parseLoans, type Loan } from './loans.js';
import loansTsv from './loans.tsv?raw';
import { CATEGORY_LABEL, parsePhrases, searchPhrases, type Phrase } from './phrases.js';
import phrasesTsv from '../../../core/data/phrases.tsv?raw';
import { DOCK_QUERY } from '../inline.js';
import './overlay.css';

const ENGLISH = parseEnglishEntries(englishTsv);
const LOANS = parseLoans(loansTsv);
/** The phrase table. A broken file shows no phrases rather than breaking the panel. */
const PHRASES: Phrase[] = (() => {
  try {
    return parsePhrases(phrasesTsv, 'core/data/phrases.tsv');
  } catch (error) {
    console.error(error);
    return [];
  }
})();

/**
 * Raw gzip payloads. `modern` and `origin` are optional: null (or absent) when
 * they could not be loaded; the glosses work without them.
 */
export interface DictionaryBytes {
  praharaj: Uint8Array;
  modern: Uint8Array | null;
  origin?: Uint8Array | null;
}

export type DictionaryLoader = () => Promise<DictionaryBytes>;

/* The fold, the payload format, entry lookup and the short gloss live in
 * ./lookup.ts, shared with the Odia Lens extension. This module keeps the
 * loaded dictionaries, the caches and the panel. */

type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

let P: Dict | null = null; // Praharaj dictionary
let M: Dict | null = null; // modern layer, same container format
let O: string[] | null = null; // origin code per P key (V2.4), same order as P.keys
let state: LoadState = 'idle';
let loader: DictionaryLoader | null = null;

/** Load state, reported to the app (main.ts shows loading / failed lines). */
export type DictionaryState = LoadState;
let onState: ((s: DictionaryState) => void) | null = null;

function setState(next: LoadState): void {
  state = next;
  try {
    onState?.(next);
  } catch {
    /* the app's listener must never break the overlay */
  }
}

/* ------------------------------------------------------------ *
 * Word origin (V2.4): codes and labels live in ./origin.ts.
 * ------------------------------------------------------------ */

/** Origin code of a lookup result. A prefix match is a different word: none. */
function originCode(entry: Entry | null): string | null {
  if (!O || !entry || entry.how === 'prefix') return null;
  const code = O[entry.index];
  return code ? code : null;
}

function loadData(): void {
  if (state !== 'idle' || loader === null) return;
  setState('loading');
  panelStatus('Unpacking dictionaries\u2026');
  let pending: Promise<DictionaryBytes>;
  try {
    pending = loader();
  } catch (err) {
    pending = Promise.reject(err);
  }
  pending
    .then((bytes) => {
      P = parsePayload(bytes.praharaj);
      try {
        M = bytes.modern ? parsePayload(bytes.modern) : null;
      } catch {
        M = null; /* modern layer is optional */
      }
      try {
        O = bytes.origin ? parseOrigin(new TextDecoder('utf-8').decode(inflate(bytes.origin)), P.keys) : null;
      } catch {
        O = null; /* origins are optional */
      }
      setState('ready');
      lookupCache = Object.create(null) as Record<string, Entry | null>;
      modernCache = Object.create(null) as Record<string, ModernEntry | null>;
      panelStatus('');
      refreshAll();
    })
    .catch(() => {
      setState('failed');
      panelStatus('Historical dictionary unavailable. English lookup and typing still work.');
    });
}

let lookupCache = Object.create(null) as Record<string, Entry | null>;
let modernCache = Object.create(null) as Record<string, ModernEntry | null>;

/* Praharaj lookup (exact / stem / prefix, see lookup.ts), cached per key. */
function lookup(word: string): Entry | null {
  const q = foldKey(word);
  if (q.length === 0) return null;
  const hit = lookupCache[q];
  if (hit !== undefined) return hit;
  const res = P ? findEntry(P.keys, q) : null;
  lookupCache[q] = res;
  return res;
}

/* Modern-layer lookup (exact and stem only, see lookup.ts), cached per key. */
function lookupModern(word: string): ModernEntry | null {
  if (!M) return null;
  const q = foldKey(word);
  if (q.length === 0) return null;
  const hit = modernCache[q];
  if (hit !== undefined) return hit;
  const found = findModern(M.keys, q);
  const res = found ? { how: found.how, lines: modernLines(defAt(M, found.index)) } : null;
  modernCache[q] = res;
  return res;
}

/* One short meaning per suggestion (plan/design/v1-ux-proposal.md 3.6):
 * the modern layer's first sense if there is one, else the first Praharaj
 * sense, never both joined. Cut at the first ";", no trailing full stop. A
 * stem or prefix match is approximate and says so in words ("maybe:"), not
 * with a symbol.
 *
 * A modern line tagged `loan` is NOT used as the meaning. The loan detector
 * has false positives that a parent sees first (KEMITI, "how", came out as
 * "English: committee", audit B5), and there is no confidence score to keep
 * only the sure ones, so such words fall through to the dictionary. */
/* Parsed once. A bad row throws in the unit test (Appv2/test/glosses.test.ts),
 * which is where it must fail; at runtime it must never take the app down. */
const OWNER: Glosses = (() => {
  try {
    return parseGlosses(glossesTsv, 'core/data/glosses.tsv');
  } catch (error) {
    console.error(error);
    return parseGlosses('');
  }
})();

function ownerGloss(word: string): { meaning: string; status: string } | undefined {
  return OWNER.get(canonical(word));
}

/* Kids edition: words the app must never explain (labelled offensive or coarse).
 * Set by initDictionary; the default hides nothing. */
let hidden: (word: string) => boolean = () => false;
// The editor owns selection and undo; the dictionary never mutates its DOM.
let insertWord: ((word: string) => boolean) | undefined;
/** Odia spellings for a roman word, best first (the app's engine). */
let spellWord: ((roman: string) => string[]) | undefined;
/** How common an Odia word is (the engine's word counts), for ranking completions. */
let wordFrequency: ((word: string) => number) | undefined;

function chipFor(word: string): string | null {
  if (hidden(word)) return null;
  const own = ownerGloss(word);
  if (own) return tidyGloss(own.meaning, false);
  const m = modernChip(lookupModern(word));
  if (m) return m;
  const entry = lookup(word);
  const g = entry ? shortGloss(entry) : null;
  return entry && g ? tidyGloss(g, entry.how !== 'exact') : null;
}

/** Origin suffix for a suggestion ("from Persian"), or null. Same gate as chipFor. */
function chipOrigin(word: string): string | null {
  if (hidden(word)) return null;
  const entry = lookup(word);
  return originChipLabel(originCode(entry));
}

/* Put the meaning (and a quiet origin suffix) into a gloss span. The accessible
 * name gets ", from Persian" rather than the middle dot. */
function fillGloss(span: HTMLElement, word: string, g: string | null): string {
  span.textContent = g ? g : NO_ENTRY;
  const o = g ? chipOrigin(word) : null;
  if (!o) return span.textContent;
  const suffix = document.createElement('span');
  suffix.className = 'dict-origin';
  suffix.textContent = ' \u00b7 ' + o;
  span.appendChild(suffix);
  return g + ', ' + o;
}

/** Shown where a suggestion has no dictionary entry (was a faint dot). */
const NO_ENTRY = 'meaning unavailable';

/* Short English gloss for the inline chip (lookup.ts), cached per headword. */
const glossCache = Object.create(null) as Record<string, string | null>;
function shortGloss(entry: Entry): string | null {
  if (!P) return null;
  const cached = glossCache[entry.head];
  if (cached !== undefined) return cached;
  const g = shortGlossOf(defAt(P, entry.index));
  glossCache[entry.head] = g;
  return g;
}

/* ------------------------------------------------------------ *
 * Panel
 * ------------------------------------------------------------ */

let panelBody: HTMLDivElement | null = null;
let panelState: HTMLParagraphElement | null = null;
let searchInput: HTMLInputElement | null = null;
let lastCandidates: { text: string; num: number }[] = [];

function buildPanel(): void {
  const panel = document.createElement('aside');
  panel.id = 'dict-panel';
  panel.setAttribute('aria-label', 'Odia dictionary');

  const head = document.createElement('div');
  head.className = 'dict-head';
  const title = document.createElement('h2');
  const tOdia = document.createElement('span');
  tOdia.className = 'odia';
  tOdia.textContent = '\u0b05\u0b2d\u0b3f\u0b27\u0b3e\u0b28'; /* abhidhaana, "dictionary" */
  title.appendChild(tOdia);
  title.appendChild(document.createTextNode(' Dictionary'));
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'dict-close';
  const closeGlyph = document.createElement('span');
  closeGlyph.className = 'dict-close-glyph';
  closeGlyph.textContent = '×';
  const closeLabel = document.createElement('span');
  closeLabel.className = 'dict-close-label';
  closeLabel.textContent = 'Back to typing';
  close.append(closeGlyph, closeLabel);
  close.setAttribute('aria-label', 'Close meanings');
  // mousedown: opened from the phone strip, the text box keeps focus (and
  // the keyboard stays up) through the close.
  close.addEventListener('mousedown', (event) => {
    if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') event.preventDefault();
  });
  close.addEventListener('click', () => closePanel(true, phoneLayout()));
  head.appendChild(title);
  head.appendChild(close);

  const sub = document.createElement('p');
  sub.className = 'dict-sub';

  sub.textContent = 'One dictionary: Odia words with English meanings (Praharaj 1931–40 and modern), English words and loan words in Odia, and phrases.';

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'dict-search odia';
  search.placeholder = 'Search Odia, English, or how you type it: \u0b2a\u0b3e\u0b23\u0b3f, water, kemiti';
  search.setAttribute('aria-label', 'Search the dictionary');
  search.addEventListener('input', debounce(onSearch, 160));
  searchInput = search;

  const stateEl = document.createElement('p');
  stateEl.className = 'dict-state';
  stateEl.hidden = true;
  panelState = stateEl;

  const body = document.createElement('div');
  body.className = 'dict-body';
  panelBody = body;

  panel.appendChild(head);
  panel.appendChild(sub);
  const tools = document.createElement('div');
  tools.className = 'dict-tools';
  tools.append(search);
  panel.appendChild(tools);
  panel.appendChild(stateEl);
  panel.appendChild(body);
  const backdrop = document.createElement('div');
  backdrop.className = 'dict-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.addEventListener('click', () => closePanel());
  document.body.append(backdrop, panel);
  document.addEventListener('focusin', (event) => {
    if (phoneLayout() && meaningsOpen() && event.target instanceof Node && !panel.contains(event.target)) {
      close.focus({ preventScroll: true });
    }
  });
  document.addEventListener('keydown', (event) => {
    if (!meaningsOpen()) return;
    if (event.key === 'Tab' && phoneLayout()) {
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button, input, select, a[href], [tabindex="0"]'))
        .filter((element) => !element.hasAttribute('disabled') && element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    if (event.key !== 'Escape' || (window.innerWidth >= 1100 && !phoneLayout())) return;
    const active = document.activeElement;
    if (!panel.contains(active) && active !== editorOpener) return;
    event.preventDefault();
    closePanel();
  });

  const layoutQuery = window.matchMedia(DOCK_QUERY);
  const layoutChanged = () => {
    // A desktop column must not become an automatically opened phone dialog.
    // Viewport resize never focuses search or opens the software keyboard.
    if (layoutQuery.matches) closePanel(false);
    else applyPhoneModal(false);
  };
  if (typeof layoutQuery.addEventListener === 'function') layoutQuery.addEventListener('change', layoutChanged);
  else layoutQuery.addListener(layoutChanged);
  setPanelOpen(window.innerWidth >= 1100 && !phoneLayout());
  renderEmpty();
}

/** The button that opened the panel on a narrow screen; focus returns there on close. */
let opener: HTMLElement | null = null;
let editorOpener: HTMLTextAreaElement | null = null;

// Same phone/coarse-tablet breakpoint as main.ts and the candidate dock.
function phoneLayout(): boolean {
  return window.matchMedia(DOCK_QUERY).matches;
}

const inerted: HTMLElement[] = [];
function applyPhoneModal(open: boolean): void {
  const panel = document.getElementById('dict-panel');
  const modal = open && phoneLayout();
  panel?.querySelector('.dict-close')?.setAttribute('aria-label', modal ? 'Back to typing' : 'Close meanings');
  document.body.classList.toggle('dict-modal-open', modal);
  if (modal) {
    panel?.setAttribute('role', 'dialog');
    panel?.setAttribute('aria-modal', 'true');
    for (const element of document.querySelectorAll<HTMLElement>('body > .app, #kb-bar')) {
      if (!element.hasAttribute('inert')) {
        element.setAttribute('inert', '');
        inerted.push(element);
      }
    }
  } else {
    panel?.removeAttribute('role');
    panel?.removeAttribute('aria-modal');
    for (const element of inerted.splice(0)) element.removeAttribute('inert');
  }
}

/** Let the composing layout collapse before choosing a visible non-text control. */
function restorePhoneControlFocus(preferred: HTMLElement | null): void {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (meaningsOpen()) return;
    const active = document.activeElement;
    // A later tap or key action owns focus; this deferred close must not steal it.
    if (active && active !== document.body && active !== document.documentElement && !active.closest('#dict-panel')) return;
    const controls = [preferred, document.getElementById('dict-toggle'), document.getElementById('open-help')];
    const target = controls.find((element): element is HTMLButtonElement =>
      element instanceof HTMLButtonElement && element.isConnected && !element.disabled &&
      element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
    target?.focus({ preventScroll: true });
  }));
}

function closePanel(restoreFocus = true, returnToTyping = false): void {
  setPanelOpen(false);
  if (restoreFocus) {
    // A dismissed software keyboard must stay dismissed. Refocus the editor
    // only if its keyboard is still visibly open, or on a desktop layout.
    const viewport = window.visualViewport;
    const keyboardVisible = viewport !== null && viewport.height < window.innerHeight - 100;
    const activeEditor = document.activeElement === editorOpener;
    const target = returnToTyping
      ? document.getElementById('roman')
      : editorOpener && (!phoneLayout() || keyboardVisible || activeEditor) ? editorOpener
        : phoneLayout() && opener instanceof HTMLTextAreaElement ? null : opener;
    if (target?.isConnected && target.getClientRects().length && document.activeElement !== target) {
      target.focus({ preventScroll: true });
    }
    if (!returnToTyping && phoneLayout()) {
      const active = document.activeElement;
      // Queue the host's focusout layout update before the deferred fallback.
      if (active instanceof HTMLElement && active.closest('#dict-panel')) active.blur();
      restorePhoneControlFocus(opener);
    }
  }
  opener = null;
  editorOpener = null;
}

function setPanelOpen(open: boolean): void {
  document.body.classList.toggle('dict-open', open);
  applyPhoneModal(open);
  const controls = document.querySelectorAll('[aria-controls="dict-panel"]');
  for (let i = 0; i < controls.length; i++) controls[i]?.setAttribute('aria-expanded', String(open));
  if (open && state === 'idle') loadData();
}

/**
 * Open or close the Meanings panel (the "Meanings" buttons in main.ts).
 * At 1100px and wider the panel is a fixed column and always shown.
 * The phone dialog receives focus on its Back to typing button; the editor
 * retains its saved selection. Explicit Back/Insert returns to typing in the
 * user gesture. Generic dismissal restores an appropriate visible control.
 */
export function setMeaningsOpen(open: boolean, from?: HTMLElement): void {
  if (!started) return;
  if (!open) {
    closePanel();
    return;
  }
  const active = document.activeElement;
  opener = from ?? (active instanceof HTMLElement ? active : null);
  editorOpener = active instanceof HTMLTextAreaElement ? active : null;
  setPanelOpen(true);
  if (phoneLayout() || (from && active === from)) {
    document.querySelector<HTMLElement>('#dict-panel .dict-close')?.focus({ preventScroll: true });
  }
}

export function meaningsOpen(): boolean {
  return document.body.classList.contains('dict-open');
}

function panelStatus(text: string): void {
  if (panelState) {
    panelState.textContent = text;
    panelState.hidden = text.length === 0;
  }
}

function renderEmpty(): void {
  if (!panelBody) return;
  panelBody.textContent = '';
  const p = document.createElement('p');
  p.className = 'dict-hint';
  p.textContent =
    'Type in the text box — meanings for each suggestion appear here as you go. Or search above: an Odia word, an English word (water), or how you type it (kemiti). A missing meaning does not mean a spelling is wrong.';
  panelBody.appendChild(p);
  panelBody.appendChild(browsePhrasesButton());
}

/** "Show all phrases": fills the search with the group word that lists them all. */
function browsePhrasesButton(): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dict-browse-phrases';
  button.textContent = 'Show all phrases';
  button.addEventListener('click', () => {
    if (!searchInput) return;
    searchInput.value = 'phrases';
    onSearch();
  });
  return button;
}

function entryBlock(word: string, num: number | null, entry: Entry | null, modern: ModernEntry | null): HTMLElement {
  const block = document.createElement('section');
  block.className = 'dict-entry';

  const h = document.createElement('div');
  h.className = 'dict-entry-head';
  if (num !== null) {
    const badge = document.createElement('span');
    badge.className = 'dict-num';
    badge.textContent = String(num);
    h.appendChild(badge);
  }
  const w = document.createElement('span');
  w.className = 'dict-word odia';
  w.lang = 'or';
  w.textContent = word;
  h.appendChild(w);

  const tag = document.createElement('span');
  tag.className = 'dict-tag';
  const own = ownerGloss(word);
  if (!entry && !modern && !own) {
    tag.textContent = NO_ENTRY;
    tag.classList.add('dict-tag-none');
  } else if (entry && entry.how === 'stem') {
    tag.textContent = 'maybe: a form of this word';
  } else if (entry && entry.how === 'prefix') {
    tag.textContent = 'maybe: starts with this word';
  }
  if (tag.textContent) h.appendChild(tag);
  const origin = originLabel(originCode(entry));
  if (origin) {
    const o = document.createElement('span');
    o.className = 'dict-tag dict-tag-origin';
    o.textContent = origin;
    o.title = 'Word origin as marked in Praharaj\u2019s dictionary (1931\u201340)';
    h.appendChild(o);
  }
  block.appendChild(h);

  if (own) {
    const obox = document.createElement('div');
    obox.className = 'dict-modern dict-owner';
    const row = document.createElement('div');
    row.className = 'dict-modern-row';
    const lab = document.createElement('span');
    lab.className = 'dict-modern-tag dict-modern-tag-owner';
    lab.textContent = 'meaning';
    lab.title =
      own.status === 'owner'
        ? 'Meaning set by the project owner (core/data/glosses.tsv)'
        : 'Suggested meaning, not yet checked by the project owner';
    const val = document.createElement('span');
    val.className = 'dict-modern-gloss';
    val.textContent = own.meaning + (own.status === 'seed' ? ' (suggested, not yet checked)' : '');
    row.appendChild(lab);
    row.appendChild(val);
    obox.appendChild(row);
    block.appendChild(obox);
  }

  if (modern && modern.lines.length) {
    const mbox = document.createElement('div');
    mbox.className = 'dict-modern';
    for (const line of modern.lines) {
      const row = document.createElement('div');
      row.className = 'dict-modern-row';
      const lab = document.createElement('span');
      lab.className = 'dict-modern-tag dict-modern-tag-' + line.tag;
      lab.textContent = line.tag === 'loan' ? 'English word?' : line.tag === 'cldr' ? 'name' : 'today';
      lab.title = MODERN_LABEL[line.tag] || line.tag;
      const val = document.createElement('span');
      val.className = 'dict-modern-gloss';
      val.textContent = (modern.how !== 'exact' ? 'maybe: ' : '') + line.gloss;
      row.appendChild(lab);
      row.appendChild(val);
      mbox.appendChild(row);
    }
    block.appendChild(mbox);
  }

  if (entry && P) {
    const def = document.createElement('div');
    def.className = 'dict-def odia';
    def.textContent = defAt(P, entry.index);
    block.appendChild(def);
  }
  return block;
}

function renderCandidates(): void {
  if (!panelBody) return;
  if (state !== 'ready') {
    if (state === 'idle') loadData();
    return;
  }
  if (lastCandidates.length === 0) {
    renderEmpty();
    return;
  }
  panelBody.textContent = '';
  const label = document.createElement('p');
  label.className = 'dict-hint';
  label.textContent = 'Suggestions under the caret:';
  panelBody.appendChild(label);
  for (const c of lastCandidates) {
    if (hidden(c.text)) continue;
    panelBody.appendChild(entryBlock(c.text, c.num, lookup(c.text), lookupModern(c.text)));
  }
}

/** A heading for one group of results. */
function groupHeading(text: string): HTMLElement {
  const heading = document.createElement('h3');
  heading.className = 'dict-group';
  heading.textContent = text;
  return heading;
}

/**
 * English word -> Odia: the hand-made starter list first, then the loan-word
 * list (English loans, and Persian / Arabic / Hindi words by English meaning).
 */
function englishSection(query: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  const results = searchEnglish(ENGLISH, query, hidden);
  for (const { entry, exact } of results) out.push(englishBlock(entry, exact));
  const shown = new Set(results.map((r) => canonical(r.entry.odia)));
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const loan of (LOANS.byEnglish.get(q) ?? []).slice(0, 4)) {
    if (shown.has(loan.odia) || hidden(loan.odia)) continue;
    shown.add(loan.odia);
    out.push(loanBlock(loan));
  }
  return out;
}

/** "English loan word: phone" under an Odia word that is in the loan list. */
function withLoanNote(block: HTMLElement, word: string): HTMLElement {
  const loans = LOANS.byOdia.get(word);
  if (loans?.length) {
    const note = document.createElement('p');
    note.className = 'dict-hint dict-loan-note';
    note.textContent = `${LANGUAGE_LABEL[loans[0]!.language]}: ${[...new Set(loans.map((l) => l.english))].slice(0, 3).join(', ')}`;
    block.querySelector('.dict-entry-head')?.after(note);
  }
  return block;
}

function loanBlock(loan: Loan): HTMLElement {
  const block = document.createElement('section');
  block.className = 'dict-entry dict-loan-entry';
  const head = document.createElement('div');
  head.className = 'dict-entry-head';
  const word = document.createElement('span');
  word.className = 'dict-word odia';
  word.lang = 'or';
  word.textContent = loan.odia;
  const tag = document.createElement('span');
  tag.className = 'dict-tag';
  tag.textContent = LANGUAGE_LABEL[loan.language];
  head.append(word, tag);
  const sense = document.createElement('p');
  sense.className = 'dict-hint';
  sense.textContent = loan.language === 'en' ? `${loan.english}, written in Odia` : `meaning: ${loan.english}`;
  const source = document.createElement('p');
  source.className = 'dict-hint';
  source.textContent = 'Loan-word list, found automatically — not yet reviewed.';
  const [actions, feedback] = odiaActions(loan.odia, `${loan.english}, loan word`);
  block.append(head, sense, source, actions, feedback);
  return block;
}

/**
 * Odia words that a roman spelling turns into: the same suggestions as typing,
 * each with its meaning when the dictionary has one, and Insert / Copy. For
 * a user who knows the sound but not the matras.
 */
function spelledSection(roman: string): HTMLElement[] {
  if (!spellWord || !/^[a-z~_]+$/i.test(roman)) return [];
  const out: HTMLElement[] = [];
  // Up to 5 spellings, then up to 2 whole-word completions ("bhub" -> the city).
  for (const word of spellWord(roman).slice(0, 7)) {
    if (hidden(word)) continue;
    const ready = state === 'ready';
    const block = withLoanNote(entryBlock(word, null, ready ? lookup(word) : null, ready ? lookupModern(word) : null), word);
    block.classList.add('dict-spelled-entry');
    const [actions, feedback] = odiaActions(word, `${word}`);
    block.append(actions, feedback);
    out.push(block);
  }
  return out;
}

/** Headwords scanned per dictionary for one Odia prefix, and how many are shown. */
const PREFIX_SCAN = 400;
const PREFIX_SHOWN = 8;

/**
 * Dictionary words that begin with an Odia query ("ନମ" -> ନମସ୍କାର, ନମସ୍ତେ...),
 * most common first, as buttons that open the word. For a user who knows how
 * a word starts but not how it ends.
 */
function prefixSection(word: string): HTMLElement[] {
  if (state !== 'ready' || [...word].length < 2) return [];
  const q = fold(word);
  const seen = new Set<string>();
  for (const dict of [P, M]) {
    if (!dict) continue;
    const keys = dict.keys;
    let lo = 0;
    let hi = keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((keys[mid] as string) < q) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < keys.length && i < lo + PREFIX_SCAN; i++) {
      const head = keys[i] as string;
      if (!head.startsWith(q)) break;
      if (head !== q && !hidden(head)) seen.add(head);
    }
  }
  if (seen.size === 0) return [];
  const freq = wordFrequency ?? (() => 0);
  const heads = [...seen]
    .sort((a, b) => freq(b) - freq(a) || a.length - b.length || (a < b ? -1 : 1))
    .slice(0, PREFIX_SHOWN);
  const row = document.createElement('div');
  row.className = 'dict-prefix-row';
  for (const head of heads) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dict-prefix odia';
    button.lang = 'or';
    button.textContent = head;
    button.setAttribute('aria-label', `Look up ${head}`);
    button.addEventListener('click', () => {
      if (!searchInput) return;
      searchInput.value = head;
      onSearch();
      searchInput.focus();
    });
    row.appendChild(button);
  }
  return [row];
}

function englishBlock(entry: EnglishEntry, exact: boolean): HTMLElement {
  const block = document.createElement('section');
  block.className = 'dict-entry dict-english-entry';
  const head = document.createElement('div');
  head.className = 'dict-entry-head';
  const word = document.createElement('span');
  word.className = 'dict-word odia';
  word.lang = 'or';
  word.textContent = entry.odia;
  const tag = document.createElement('span');
  tag.className = 'dict-tag';
  tag.textContent = entry.kind === 'translation' ? 'Translation' : 'English loan spelling';
  head.append(word, tag);
  const sense = document.createElement('p');
  sense.className = 'dict-hint';
  sense.textContent = `${entry.english}: ${entry.sense}${exact ? '' : ' (Related headword)'}`;
  const source = document.createElement('p');
  source.className = 'dict-hint';
  source.textContent = entry.status === 'owner'
    ? 'Based on an existing owner-reviewed meaning.'
    : 'Suggested entry — awaiting native-speaker review.';
  const [actions, feedback] = odiaActions(entry.odia, `${entry.english}, ${entry.sense}`);
  block.append(head, sense, source, actions, feedback);
  return block;
}

/**
 * Insert (into the text box, at the last editing position) and Copy buttons
 * for one Odia result, with a status line. `name` completes the labels
 * "Insert <name> in Odia" and "Copy <name> in Odia".
 */
function odiaActions(odiaText: string, name: string): [HTMLElement, HTMLElement] {
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'dict-copy';
  copy.textContent = 'Copy Odia';
  copy.setAttribute('aria-label', `Copy ${name}, in Odia`);
  const feedback = document.createElement('p');
  feedback.className = 'dict-hint';
  feedback.setAttribute('role', 'status');
  copy.addEventListener('click', async () => {
    copy.disabled = true;
    feedback.textContent = '';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(canonical(odiaText));
      feedback.textContent = 'Copied Odia.';
    } catch {
      // Keep the text selectable when clipboard permission or file:// blocks copying.
      feedback.textContent = 'Could not copy. Select the Odia text above and copy it manually.';
    } finally {
      copy.disabled = false;
    }
  });
  const actions = document.createElement('div');
  actions.className = 'dict-actions';
  if (insertWord) {
    const insert = document.createElement('button');
    insert.type = 'button';
    insert.className = 'dict-insert';
    insert.textContent = 'Insert Odia';
    insert.setAttribute('aria-label', `Insert ${name}, in Odia`);
    insert.addEventListener('click', () => {
      try {
        const text = canonical(odiaText);
        const inserted = !text.split(' ').some((w) => hidden(w)) && insertWord?.(text);
        feedback.textContent = inserted ? 'Inserted Odia.' : 'Could not insert. Copy the Odia text instead.';
        if (inserted && phoneLayout()) closePanel(true, true);
      } catch {
        feedback.textContent = 'Could not insert. Copy the Odia text instead.';
      }
    });
    actions.appendChild(insert);
  }
  actions.appendChild(copy);
  return [actions, feedback];
}

/** The phrase table: bundled, so it works while the dictionary payloads load. */
function phraseSection(query: string): HTMLElement[] {
  const all = /^phrases?$/i.test(query.trim());
  const results = searchPhrases(PHRASES, all ? '' : query, hidden);
  const out: HTMLElement[] = [];
  let group = '';
  for (const { phrase } of results) {
    if (all && phrase.category !== group) {
      group = phrase.category;
      out.push(groupHeading(CATEGORY_LABEL[phrase.category]));
    }
    out.push(phraseBlock(phrase));
  }
  return out;
}

function phraseBlock(phrase: Phrase): HTMLElement {
  const block = document.createElement('section');
  block.className = 'dict-entry dict-phrase-entry';
  const head = document.createElement('div');
  head.className = 'dict-entry-head';
  const text = document.createElement('span');
  text.className = 'dict-word odia';
  text.lang = 'or';
  text.textContent = phrase.odia;
  const tag = document.createElement('span');
  tag.className = 'dict-tag';
  tag.textContent = CATEGORY_LABEL[phrase.category];
  head.append(text, tag);
  const meaning = document.createElement('p');
  meaning.className = 'dict-hint dict-phrase-meaning';
  meaning.textContent = phrase.note ? `${phrase.meaning} — ${phrase.note}` : phrase.meaning;
  const reads = document.createElement('p');
  reads.className = 'dict-hint';
  reads.textContent = `Type it: ${phrase.keys[0]}`;
  const source = document.createElement('p');
  source.className = 'dict-hint';
  source.textContent = phrase.status === 'owner'
    ? 'Checked by the app owner.'
    : 'Suggested phrase — awaiting native-speaker review.';
  const [actions, feedback] = odiaActions(phrase.odia, `${phrase.meaning}`);
  block.append(head, meaning, reads, source, actions, feedback);
  return block;
}

function onSearch(): void {
  if (!searchInput || !panelBody) return;
  const q = searchInput.value.trim();
  if (q.length === 0) {
    renderCandidates();
    return;
  }
  if (state === 'idle') loadData();
  panelBody.textContent = '';
  const status = document.createElement('p');
  status.className = 'dict-hint';
  status.setAttribute('role', 'status');
  panelBody.appendChild(status);
  let found = 0;
  const add = (title: string, blocks: HTMLElement[]) => {
    if (!blocks.length || !panelBody) return;
    found += blocks.length;
    panelBody.appendChild(groupHeading(title));
    for (const b of blocks) panelBody.appendChild(b);
  };
  if (/^phrases?$/i.test(q)) {
    add('Phrases', phraseSection(q));
  } else if (/[\u0B00-\u0B7F]/.test(q)) {
    const word = canonical(q);
    const blocked = hidden(word);
    const entry = blocked || state !== 'ready' ? null : lookup(word);
    const modern = blocked || state !== 'ready' ? null : lookupModern(word);
    const own = blocked ? undefined : ownerGloss(word);
    const loan = !blocked && LOANS.byOdia.has(word);
    add('Odia word', entry || modern || own || loan ? [withLoanNote(entryBlock(word, null, entry, modern), word)] : []);
    add(`Words starting with \u201c${word}\u201d`, prefixSection(word));
    add('Phrases', phraseSection(q));
  } else {
    // An English word with an exact entry (water, phone) shows its Odia word
    // first; otherwise the spellings of what was typed (kemiti) come first.
    const english = englishSection(q);
    const spelled = spelledSection(q.toLowerCase());
    const englishExact = searchEnglish(ENGLISH, q, hidden).some((r) => r.exact) ||
      english.some((b) => b.classList.contains('dict-loan-entry'));
    if (englishExact) add('English word → Odia', english);
    add(`Odia spellings of "${q}"`, spelled);
    if (!englishExact) add('English word → Odia', english);
    add('Phrases', phraseSection(q));
  }
  const loading = state === 'loading' || state === 'idle';
  status.textContent = found
    ? loading ? 'Results so far. Meanings from the full dictionary are still loading.' : 'Results:'
    : loading ? 'Loading the dictionary\u2026'
      : 'Nothing found. Try another spelling, an English word, or "phrases". This is limited coverage, not a judgment about the word.';
}

function refreshAll(): void {
  if (searchInput && searchInput.value.trim().length > 0) onSearch();
  else renderCandidates();
  reglossInline();
  augmentPicker();
  augmentReadback();
}

/* ------------------------------------------------------------ *
 * DOM augmentation — candidate bar, picker, output words.
 * ------------------------------------------------------------ */

let inlineBox: HTMLElement | null = null;
let augmenting = false;

function reglossInline(): void {
  /* After the data becomes ready, glosses may already be missing from the
   * currently-shown bar; strip our marks and redo. */
  if (!inlineBox) return;
  const old = inlineBox.querySelectorAll('.dict-gloss');
  for (let i = 0; i < old.length; i++) old[i]?.parentNode?.removeChild(old[i] as Element);
  augmentInlineBar();
}

function augmentInlineBar(): void {
  if (!inlineBox || inlineBox.hidden || augmenting) return;
  augmenting = true;
  try {
    const buttons = inlineBox.querySelectorAll('button.inline-candidate');
    const next: { text: string; num: number }[] = [];
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i] as Element;
      // The Latin item (class 'inline-latin', the word kept as typed) has no
      // '.inline-text' and is skipped: it never gets a gloss.
      const textEl = btn.querySelector('.inline-text');
      if (!textEl) continue;
      const word = textEl.textContent || '';
      next.push({ text: word, num: i + 1 });
      if (btn.querySelector('.dict-gloss')) continue;
      // Nothing until the data is ready (refreshAll redoes the bar then), and
      // nothing if it failed: an empty slot, not a wrong "meaning unavailable".
      if (state !== 'ready') continue;
      const g = chipFor(word);
      const span = document.createElement('span');
      span.className = 'dict-gloss' + (g ? '' : ' dict-gloss-none');
      const spoken = fillGloss(span, word, g);
      btn.appendChild(span);
      nameWithGloss(btn, spoken);
    }
    lastCandidates = next;
  } finally {
    augmenting = false;
  }
  if (!searchInput || searchInput.value.trim().length === 0) renderCandidates();
  if (state === 'idle') loadData();
}

/** aria-label = the app's data-label + ", " + the gloss (contract above). */
function nameWithGloss(btn: Element, gloss: string): void {
  const base = btn.getAttribute('data-label');
  if (base) btn.setAttribute('aria-label', base + ', ' + gloss);
}

let pickerAugmenting = false;
function augmentPicker(): void {
  const list = document.getElementById('picker-list');
  if (!list || pickerAugmenting) return;
  pickerAugmenting = true;
  try {
    const rows = list.querySelectorAll('button.candidate');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Element;
      if (row.querySelector('.dict-gloss')) continue;
      const textEl = row.querySelector('.text');
      if (!textEl) continue;
      if (state !== 'ready' || textEl.classList.contains('text-latin')) continue;
      const g = chipFor(textEl.textContent || '');
      const span = document.createElement('span');
      span.className = 'dict-gloss dict-gloss-picker' + (g ? '' : ' dict-gloss-none');
      const spoken = fillGloss(span, textEl.textContent || '', g);
      row.appendChild(span);
      nameWithGloss(row, spoken);
    }
  } finally {
    pickerAugmenting = false;
  }
}

/* Read-back words: the gloss as a tooltip. The button text is the Latin
 * reading, so the Odia word comes from data-odia (contract above). */
let readbackTimer: ReturnType<typeof setTimeout> | null = null;
function augmentReadback(): void {
  if (state !== 'ready') return;
  if (readbackTimer) return;
  readbackTimer = setTimeout(() => {
    readbackTimer = null;
    const line = document.getElementById('readback');
    if (!line) return;
    const words = line.querySelectorAll<HTMLElement>('.rb-word');
    for (let i = 0; i < words.length; i++) {
      const el = words[i] as HTMLElement;
      if (el.getAttribute('data-glossed') === '1') continue;
      el.setAttribute('data-glossed', '1');
      const odia = el.getAttribute('data-odia') || '';
      const g = chipFor(odia);
      if (g) {
        const o = chipOrigin(odia);
        el.title = o ? g + ' \u00b7 ' + o : g;
      } else {
        // Proposal 3.7: a word with no entry gets a dotted underline and
        // the screen-reader text "meaning unavailable".
        el.title = NO_ENTRY;
        el.classList.add('rb-unknown');
        el.setAttribute('aria-label', `${el.getAttribute('aria-label') || el.textContent || ''}, ${NO_ENTRY}`);
      }
    }
  }, 120);
}

/* ------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------ */

function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

function attachInlineBox(): boolean {
  if (inlineBox) return true;
  const box = document.querySelector<HTMLElement>('div.inline-candidates');
  if (!box) return false;
  inlineBox = box;
  new MutationObserver(() => augmentInlineBar()).observe(box, {
    childList: true,
    attributes: true,
    attributeFilter: ['hidden'],
  });
  augmentInlineBar();
  return true;
}

function observe(): void {
  /* The candidate bar is appended to <body> by the app. Depending on call
   * order it may already exist — check now, and also watch <body> in case it
   * appears later. */
  if (!attachInlineBox()) {
    const bodyObserver = new MutationObserver(() => {
      if (attachInlineBox()) bodyObserver.disconnect();
    });
    bodyObserver.observe(document.body, { childList: true });
  }

  const picker = document.getElementById('picker-list');
  if (picker) {
    new MutationObserver(() => augmentPicker()).observe(picker, { childList: true });
  }

  const line = document.getElementById('readback');
  if (line) {
    new MutationObserver(() => augmentReadback()).observe(line, { childList: true, subtree: true });
  }
}

let started = false;

/**
 * Build the panel, start watching the app's DOM, and schedule the data load.
 *
 * `load` is not called here: it runs 400 ms later, or sooner when the panel
 * opens or the candidate bar first appears. Call once, after the app has
 * rendered its shell; later calls are ignored.
 */
export function initDictionary(
  load: DictionaryLoader,
  onStateChange?: (s: DictionaryState) => void,
  hideWord?: (word: string) => boolean,
  insert?: (word: string) => boolean,
  spell?: (roman: string) => string[],
  frequency?: (word: string) => number,
): void {
  if (started) return;
  started = true;
  try {
    loader = load;
    if (hideWord) hidden = hideWord;
    insertWord = insert;
    spellWord = spell;
    wordFrequency = frequency;
    onState = onStateChange ?? null;
    buildPanel();
    observe();
    setTimeout(loadData, 400);
  } catch {
    /* The dictionary must never take the app down. */
  }
}
