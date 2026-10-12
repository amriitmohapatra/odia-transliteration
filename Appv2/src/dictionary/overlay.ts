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
import { originChipLabel, originLabel, parseOrigin } from './origin.js';
import { parseEnglishEntries, searchEnglish, type EnglishEntry } from './english.js';
import englishTsv from './english.tsv?raw';
import { cleanDefinition } from './clean.js';
import { CATEGORY_LABEL, parsePhrases, searchPhrases, type Phrase } from './phrases.js';
import phrasesTsv from '../../../core/data/phrases.tsv?raw';
import { DOCK_QUERY } from '../inline.js';
import './overlay.css';

const ENGLISH = parseEnglishEntries(englishTsv);
/** The phrase table. A broken file shows no phrases rather than breaking the panel. */
const PHRASES: Phrase[] = (() => {
  try {
    return parsePhrases(phrasesTsv, 'core/data/phrases.tsv');
  } catch (error) {
    console.error(error);
    return [];
  }
})();
const PHRASES_SUBTITLE = `${PHRASES.length} phrases: greetings, wishes, festivals, the three words for "you". Most await native-speaker review.`;

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

/** Field separator inside an inflated payload (U+0002). */
const SEP = '\u0002';

/* ------------------------------------------------------------ *
 * Normalisation: canonical() from core, plus the 1930s-orthography
 * fold used when the payload was built.
 * ------------------------------------------------------------ */

/* U+0B5F -> U+0B2F, U+0B71 -> U+0B2C, U+0B35 -> U+0B2C : Praharaj-era spellings. */
function fold(w: string): string {
  return w
    .split('\u0b5f').join('\u0b2f')
    .split('\u0b71').join('\u0b2c')
    .split('\u0b35').join('\u0b2c');
}

/* Inflectional suffixes tried (longest first) when the exact form is not a
 * headword. Kept in sync with the payload builder; folded forms. */
const SUFFIXES: readonly string[] = [
  '\u0b2e\u0b3e\u0b28\u0b19\u0b4d\u0b15\u0b30', /* -maananjkara */
  '\u0b2e\u0b3e\u0b28\u0b19\u0b4d\u0b15\u0b41', /* -maananjku */
  '\u0b17\u0b41\u0b21\u0b3c\u0b3f\u0b15\u0b41', /* -gudiku */
  '\u0b17\u0b41\u0b21\u0b3c\u0b3f\u0b15\u0b30', /* -gudikara */
  '\u0b2e\u0b3e\u0b28\u0b19\u0b4d\u0b15', /* -maananjka */
  '\u0b17\u0b41\u0b21\u0b3c\u0b3f\u0b15', /* -gudika */
  '\u0b17\u0b41\u0b21\u0b3c\u0b3e\u0b0f', /* -gudaae */
  '\u0b2e\u0b3e\u0b28\u0b47', /* -maane */
  '\u0b19\u0b4d\u0b15\u0b30', /* -njkara */
  '\u0b19\u0b4d\u0b15\u0b41', /* -njku */
  '\u0b1f\u0b3f\u0b15\u0b41', /* -tiku */
  '\u0b1f\u0b3f\u0b30\u0b47', /* -tire */
  '\u0b19\u0b4d\u0b15', /* -njka */
  '\u0b1f\u0b3f\u0b30', /* -tira */
  '\u0b30\u0b47', /* -re */
  '\u0b30\u0b41', /* -ru */
  '\u0b15\u0b41', /* -ku */
  '\u0b1f\u0b3f', /* -ti */
  '\u0b1f\u0b3e', /* -taa */
  '\u0b30', /* -ra */
  '\u0b01', /* candrabindu */
  '\u0b02', /* anusvara */
  '\u0b03', /* visarga */
];

/* ------------------------------------------------------------ *
 * Data: gzip(payload), inflated lazily.
 * payload = N SEP keys(\n-joined, sorted) SEP lens(,-joined) SEP defs(concat)
 * ------------------------------------------------------------ */

interface Dict {
  keys: string[];
  offsets: Float64Array;
  lens: Uint32Array;
  defs: string;
}

type How = 'exact' | 'stem' | 'prefix';

interface Entry {
  how: How;
  head: string;
  index: number;
}

interface ModernLine {
  tag: string;
  gloss: string;
}

interface ModernEntry {
  how: 'exact' | 'stem';
  lines: ModernLine[];
}

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

function parsePayload(gz: Uint8Array): Dict {
  const inflated = inflate(gz);
  const text = new TextDecoder('utf-8').decode(inflated);
  const a = text.indexOf(SEP);
  const b = text.indexOf(SEP, a + 1);
  const c = text.indexOf(SEP, b + 1);
  const count = parseInt(text.slice(0, a), 10);
  const keys = text.slice(a + 1, b).split('\n');
  const lenParts = text.slice(b + 1, c).split(',');
  const lens = new Uint32Array(count);
  const offsets = new Float64Array(count);
  let off = 0;
  for (let i = 0; i < count; i++) {
    lens[i] = +(lenParts[i] as string);
    offsets[i] = off;
    off += lens[i] as number;
  }
  if (keys.length !== count) throw new Error('key count mismatch');
  return { keys, offsets, lens, defs: text.slice(c + 1) };
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

function bsearch(dict: Dict | null, key: string): number {
  if (!dict) return -1;
  const keys = dict.keys;
  let lo = 0;
  let hi = keys.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const k = keys[mid] as string;
    if (k === key) return mid;
    if (k < key) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

function defAt(dict: Dict, i: number): string {
  const start = dict.offsets[i] as number;
  return cleanDefinition(dict.defs.slice(start, start + (dict.lens[i] as number)));
}

let lookupCache = Object.create(null) as Record<string, Entry | null>;
let modernCache = Object.create(null) as Record<string, ModernEntry | null>;

/*
 * Praharaj lookup with fallbacks:
 *   exact / stem (one suffix removed) / prefix (longest headword the word
 *   begins with, for sandhi compounds) — each marked in the UI.
 */
function lookup(word: string): Entry | null {
  const q = fold(canonical(word));
  if (q.length === 0) return null;
  const hit = lookupCache[q];
  if (hit !== undefined) return hit;
  let res: Entry | null = null;
  const i = bsearch(P, q);
  if (i >= 0 && P) {
    res = { how: 'exact', head: P.keys[i] as string, index: i };
  } else if (P) {
    for (let s = 0; s < SUFFIXES.length && !res; s++) {
      const suf = SUFFIXES[s] as string;
      if (q.length - suf.length >= 2 && q.slice(-suf.length) === suf) {
        const j = bsearch(P, q.slice(0, q.length - suf.length));
        if (j >= 0) res = { how: 'stem', head: P.keys[j] as string, index: j };
      }
    }
    if (!res) {
      let lo = 0;
      let hi = P.keys.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((P.keys[mid] as string) < q) lo = mid + 1;
        else hi = mid;
      }
      let best = -1;
      let bestLen = 2;
      for (let back = lo - 1; back >= 0 && back > lo - 400; back--) {
        const k = P.keys[back] as string;
        if (k.length > bestLen && q.length > k.length && q.lastIndexOf(k, 0) === 0) {
          best = back;
          bestLen = k.length;
        }
        if (k.charAt(0) !== q.charAt(0)) break;
      }
      if (best >= 0) res = { how: 'prefix', head: P.keys[best] as string, index: best };
    }
  }
  lookupCache[q] = res;
  return res;
}

/*
 * Modern-layer lookup (loanwords, community MT glosses, CLDR names).
 * Exact and stem only — a prefix fallback on this data would invent loans.
 */
function lookupModern(word: string): ModernEntry | null {
  if (!M) return null;
  const q = fold(canonical(word));
  if (q.length === 0) return null;
  const hit = modernCache[q];
  if (hit !== undefined) return hit;
  let res: ModernEntry | null = null;
  let i = bsearch(M, q);
  let how: 'exact' | 'stem' = 'exact';
  if (i < 0) {
    for (let s = 0; s < SUFFIXES.length && i < 0; s++) {
      const suf = SUFFIXES[s] as string;
      if (q.length - suf.length >= 2 && q.slice(-suf.length) === suf) {
        i = bsearch(M, q.slice(0, q.length - suf.length));
      }
    }
    how = 'stem';
  }
  if (i >= 0) {
    const lines = defAt(M, i)
      .split('\n')
      .map((line) => {
        const t = line.indexOf('\t');
        return { tag: line.slice(0, t), gloss: line.slice(t + 1) };
      });
    res = { how, lines };
  }
  modernCache[q] = res;
  return res;
}

const MODERN_LABEL: Record<string, string> = {
  loan: 'English loan (auto-detected)',
  mt: 'modern usage — community translation data, approximate',
  cldr: 'standard modern name (CLDR)',
};

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

function modernChip(mo: ModernEntry | null): string | null {
  if (!mo) return null;
  const line = mo.lines.find((l) => l.tag !== 'loan');
  return line ? tidyGloss(line.gloss, mo.how !== 'exact') : null;
}

function tidyGloss(gloss: string, approximate: boolean): string | null {
  let g = (gloss.split(';')[0] as string).replace(/\s+/g, ' ').trim().replace(/[\s.,:]+$/, '');
  if (g.length < 2) return null;
  if (g.length > 56) g = g.slice(0, 56).replace(/\s+\S*$/, '') + '\u2026';
  return (approximate ? 'maybe: ' : '') + g;
}

/** Shown where a suggestion has no dictionary entry (was a faint dot). */
const NO_ENTRY = 'meaning unavailable';

/* Short English gloss for the inline chip.
 *
 * Entries open "<headword> — Translit \u2026", so the FIRST Latin run is the
 * romanisation, not the meaning. Skip that, then prefer the English text of
 * sense 1 ("1. Trouble; distress"), then any Latin run after a dash. */
const glossCache = Object.create(null) as Record<string, string | null>;
function shortGloss(entry: Entry): string | null {
  if (!P) return null;
  const cached = glossCache[entry.head];
  if (cached !== undefined) return cached;
  const def = defAt(P, entry.index).slice(0, 4000);
  /* drop "head — Translit" prefix (translit = Latin with diacritics) */
  const body = def.replace(/^[^\u2014\u2013\n]{0,50}[\u2014\u2013]\s*[A-Za-z\u0100-\u02af\u1e00-\u1eff']+[.,]?\s*/, '');
  let g: string | null = null;
  let m = body.match(/\b\d\.\s*([A-Za-z][^\u0964\u0965\n]{2,90})/);
  if (!m) m = body.match(/[\u2014\u2013]\s*(?:\d+\s*)?([A-Z][a-z][^\u0964\u0965\n]{2,90})/);
  if (!m) m = body.match(/\b([A-Z][a-z][^\u0964\u0965\n]{2,90})/);
  if (m) {
    g = m[1] as string;
    /* chip is English-only: stop at the first Odia character, the next
     * numbered sense, or an opening bracket of a commentary note */
    g = g.split(/[\u0b00-\u0b7f]/)[0] as string;
    g = g.split(/\s\d\.?\s|\s*[\u2014\u2013]\s*\d|\s*\[/)[0] as string;
    g = g.replace(/\s+/g, ' ').replace(/[\s;,([\u2014\u2013-]+$/, '').trim();
    if (g.length > 56) g = g.slice(0, 56).replace(/\s+\S*$/, '') + '\u2026';
    if (g.length < 2) g = null;
  }
  glossCache[entry.head] = g;
  return g;
}

/* ------------------------------------------------------------ *
 * Panel
 * ------------------------------------------------------------ */

let panelBody: HTMLDivElement | null = null;
let panelState: HTMLParagraphElement | null = null;
let searchInput: HTMLInputElement | null = null;
let searchDirection: HTMLSelectElement | null = null;
let panelSubtitle: HTMLParagraphElement | null = null;
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
  panelSubtitle = sub;
  sub.textContent = 'Pur\u1e47\u1e47achandra O\u1e0di\u0101 Bh\u0101shakosha — G. C. Praharaj (1931–40)';

  const direction = document.createElement('select');
  direction.className = 'dict-direction';
  direction.setAttribute('aria-label', 'Dictionary direction');
  for (const [value, text] of [['odia', 'Odia → English'], ['english', 'English → Odia'], ['phrases', 'Phrases']]) {
    const option = document.createElement('option');
    option.value = value as string;
    option.textContent = text as string;
    direction.appendChild(option);
  }
  searchDirection = direction;
  direction.addEventListener('change', () => {
    if (!searchInput || !panelSubtitle) return;
    const english = direction.value === 'english';
    const phrases = direction.value === 'phrases';
    searchInput.value = '';
    // The selected direction owns the body even while Odia payloads are
    // loading or unavailable; never leave English results under Odia mode.
    if (panelBody) panelBody.textContent = '';
    searchInput.placeholder = phrases ? 'Search, e.g. birthday, festival, you'
      : english ? 'Search English, e.g. water, meeting' : 'Search an Odia word';
    panelSubtitle.textContent = phrases ? PHRASES_SUBTITLE : english
      ? `${ENGLISH.length} entries for ${new Set(ENGLISH.map((entry) => entry.english)).size} English terms. Starter dictionary; most entries await native-speaker review. Translations and loan spellings are separate.`
      : 'Pur\u1e47\u1e47achandra O\u1e0di\u0101 Bh\u0101shakosha — G. C. Praharaj (1931–40)';
    onSearch();
  });

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'dict-search odia';
  search.placeholder = '\u0b16\u0b4b\u0b1c\u0b28\u0b4d\u0b24\u0b41\u2026  (search any Odia word)';
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
  tools.append(direction, search);
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
    'Type in the roman box — meanings for each suggestion appear here as you go. A missing meaning does not mean a spelling is wrong. Choose English → Odia to look up a word by its English meaning.';
  panelBody.appendChild(p);
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
  if (searchDirection?.value === 'english') {
    renderEnglishSearch();
    return;
  }
  if (searchDirection?.value === 'phrases') {
    renderPhraseSearch();
    return;
  }
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

/** English results are small bundled data and do not depend on historical payloads. */
function renderEnglishSearch(): void {
  if (!panelBody || !searchInput) return;
  panelBody.textContent = '';
  const query = searchInput.value.trim();
  const results = searchEnglish(ENGLISH, query, hidden);
  const hint = document.createElement('p');
  hint.className = 'dict-hint';
  hint.setAttribute('role', 'status');
  hint.textContent = !query
    ? 'Look up an English word or short phrase, then insert or copy the Odia result. Try water, phone, or meeting. This does not translate sentences or change typing suggestions.'
    : results.length
      ? phoneLayout()
        ? 'Choose an entry to insert or copy.'
        : 'English lookup results. “Related headword” means a prefix match, not a translation of your exact input.'
      : 'No entry in this starter dictionary. Try another word. This is limited coverage, not a judgment about the word.';
  panelBody.appendChild(hint);
  for (const { entry, exact } of results) panelBody.appendChild(englishBlock(entry, exact));
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
function renderPhraseSearch(): void {
  if (!panelBody || !searchInput) return;
  panelBody.textContent = '';
  const query = searchInput.value.trim();
  const results = searchPhrases(PHRASES, query, hidden);
  const hint = document.createElement('p');
  hint.className = 'dict-hint';
  hint.setAttribute('role', 'status');
  hint.textContent = !query
    ? 'All phrases, group by group. Search by meaning (birthday), by how you type it (shubha), or by group (festival, you).'
    : results.length
      ? 'Phrases for your search. Insert puts the Odia where you were typing.'
      : 'No phrase found. Try another word, or a group: greeting, wish, festival, you, family, everyday.';
  panelBody.appendChild(hint);
  let group = '';
  for (const { phrase } of results) {
    if (!query && phrase.category !== group) {
      group = phrase.category;
      const heading = document.createElement('h3');
      heading.className = 'dict-group';
      heading.textContent = CATEGORY_LABEL[phrase.category];
      panelBody.appendChild(heading);
    }
    panelBody.appendChild(phraseBlock(phrase));
  }
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
  if (searchDirection?.value === 'english') {
    renderEnglishSearch();
    return;
  }
  if (searchDirection?.value === 'phrases') {
    renderPhraseSearch();
    return;
  }
  if (state !== 'ready') {
    loadData();
    return;
  }
  if (q.length === 0) {
    renderCandidates();
    return;
  }
  panelBody.textContent = '';
  const blocked = hidden(canonical(q));
  const entry = blocked ? null : lookup(q);
  const modern = blocked ? null : lookupModern(q);
  const own = blocked ? undefined : ownerGloss(q);
  const label = document.createElement('p');
  label.className = 'dict-hint';
  label.textContent = entry || modern || own ? 'Search result:' : 'Nothing found for that spelling.';
  panelBody.appendChild(label);
  if (entry || modern || own) panelBody.appendChild(entryBlock(q, null, entry, modern));
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
): void {
  if (started) return;
  started = true;
  try {
    loader = load;
    if (hideWord) hidden = hideWord;
    insertWord = insert;
    onState = onStateChange ?? null;
    buildPanel();
    observe();
    setTimeout(loadData, 400);
  } catch {
    /* The dictionary must never take the app down. */
  }
}
