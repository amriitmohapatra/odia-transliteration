/**
 * Dictionary overlay: an English gloss under each suggestion, plus a side panel
 * with the full entries.
 *
 * Glosses come from the Purnnachandra Odia Bhashakosha (G. C. Praharaj,
 * 1931-40) and an optional modern layer (loanwords, community MT glosses, CLDR
 * names). Sources, licences and checksums: Odia_Sanskrit_Appv2/PROVENANCE.md
 * (praharaj.bin / modern.bin are the base64-decoded payloads recorded there).
 *
 * It is layered on top of the app by watching the DOM the app renders (the
 * caret candidate bar, the alternatives picker, the output words), so the app
 * modules do not need to know it exists. Everything is defensive: if any of
 * this fails, the app underneath keeps working exactly as before.
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

import { inflate } from './pako-inflate.js';
import './overlay.css';

/** Raw gzip payloads. `modern` is optional: null when it could not be loaded. */
export interface DictionaryBytes {
  praharaj: Uint8Array;
  modern: Uint8Array | null;
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
let state: LoadState = 'idle';
let loader: DictionaryLoader | null = null;

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

function loadData(): void {
  if (state !== 'idle' || loader === null) return;
  state = 'loading';
  panelStatus('Unpacking dictionaries…');
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
      state = 'ready';
      lookupCache = Object.create(null) as Record<string, Entry | null>;
      modernCache = Object.create(null) as Record<string, ModernEntry | null>;
      panelStatus('');
      refreshAll();
    })
    .catch(() => {
      state = 'failed';
      panelStatus('Dictionary failed to unpack — the app itself is unaffected.');
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
  return dict.defs.slice(start, start + (dict.lens[i] as number));
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

/* The chip line for a word: modern gloss first (today's usage), the
 * Praharaj gloss after it, separated by a middle dot. Either may be
 * missing; approximate matches carry a leading ≈. */
function chipFor(word: string): string | null {
  const entry = lookup(word);
  const mo = lookupModern(word);
  const parts: string[] = [];
  const m = modernChip(mo);
  if (m) parts.push(m);
  const g = entry ? prefixed(entry, shortGloss(entry)) : null;
  if (g) parts.push(g);
  if (!parts.length) return null;
  let chip = parts.join('  ·  ');
  if (chip.length > 72) chip = chip.slice(0, 72).replace(/\s+\S*$/, '') + '\u2026';
  return chip;
}

function prefixed(entry: Entry, gloss: string | null): string | null {
  if (!gloss) return null;
  return (entry.how !== 'exact' ? '≈ ' : '') + gloss;
}

function modernChip(mo: ModernEntry | null): string | null {
  if (!mo || !mo.lines.length) return null;
  const line = mo.lines[0] as ModernLine;
  let g = line.tag === 'loan' ? 'English: ' + line.gloss : (line.gloss.split(';')[0] as string);
  if (g.length > 44) g = g.slice(0, 44).replace(/\s+\S*$/, '') + '\u2026';
  return (mo.how !== 'exact' ? '≈ ' : '') + g;
}

/* Short English gloss for the inline chip.
 *
 * Entries open "<headword> — Translit …", so the FIRST Latin run is the
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
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close dictionary panel');
  close.addEventListener('click', () => setPanelOpen(false));
  head.appendChild(title);
  head.appendChild(close);

  const sub = document.createElement('p');
  sub.className = 'dict-sub';
  sub.textContent = 'Pur\u1e47\u1e47achandra O\u1e0di\u0101 Bh\u0101shakosha — G. C. Praharaj (1931–40)';

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'dict-search odia';
  search.placeholder = '\u0b16\u0b4b\u0b1c\u0b28\u0b4d\u0b24\u0b41…  (search any Odia word)';
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
  panel.appendChild(search);
  panel.appendChild(stateEl);
  panel.appendChild(body);
  document.body.appendChild(panel);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.id = 'dict-toggle';
  const bOdia = document.createElement('span');
  bOdia.className = 'odia';
  bOdia.textContent = '\u0b05'; /* the letter a */
  toggleBtn.appendChild(bOdia);
  toggleBtn.appendChild(document.createTextNode('→A'));
  toggleBtn.setAttribute('aria-label', 'Toggle dictionary panel');
  toggleBtn.addEventListener('click', () => {
    setPanelOpen(!document.body.classList.contains('dict-open'));
  });
  document.body.appendChild(toggleBtn);

  setPanelOpen(window.innerWidth >= 1100);
  renderEmpty();
}

function setPanelOpen(open: boolean): void {
  document.body.classList.toggle('dict-open', open);
  if (open && state === 'idle') loadData();
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
    'Type in the roman box — meanings for each suggestion appear here as you go. Suggestions the dictionary does not know are marked, so you can still judge them by ear.';
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
  w.textContent = word;
  h.appendChild(w);

  const tag = document.createElement('span');
  tag.className = 'dict-tag';
  if (!entry && !modern) {
    tag.textContent = 'no entry';
    tag.classList.add('dict-tag-none');
  } else if (entry && entry.how === 'stem') {
    tag.textContent = '≈ stem';
  } else if (entry && entry.how === 'prefix') {
    tag.textContent = '≈ begins with';
  }
  if (tag.textContent) h.appendChild(tag);
  block.appendChild(h);

  if (modern && modern.lines.length) {
    const mbox = document.createElement('div');
    mbox.className = 'dict-modern';
    for (const line of modern.lines) {
      const row = document.createElement('div');
      row.className = 'dict-modern-row';
      const lab = document.createElement('span');
      lab.className = 'dict-modern-tag dict-modern-tag-' + line.tag;
      lab.textContent = line.tag === 'loan' ? 'loan' : line.tag === 'cldr' ? 'name' : 'modern';
      lab.title = MODERN_LABEL[line.tag] || line.tag;
      const val = document.createElement('span');
      val.className = 'dict-modern-gloss';
      val.textContent = (modern.how !== 'exact' ? '≈ ' : '') + line.gloss;
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
    panelBody.appendChild(entryBlock(c.text, c.num, lookup(c.text), lookupModern(c.text)));
  }
}

function onSearch(): void {
  if (!searchInput || !panelBody) return;
  const q = searchInput.value.trim();
  if (state !== 'ready') {
    loadData();
    return;
  }
  if (q.length === 0) {
    renderCandidates();
    return;
  }
  panelBody.textContent = '';
  const entry = lookup(q);
  const modern = lookupModern(q);
  const label = document.createElement('p');
  label.className = 'dict-hint';
  label.textContent = entry || modern ? 'Search result:' : 'Nothing found for that spelling.';
  panelBody.appendChild(label);
  if (entry || modern) panelBody.appendChild(entryBlock(q, null, entry, modern));
}

function refreshAll(): void {
  if (searchInput && searchInput.value.trim().length > 0) onSearch();
  else renderCandidates();
  reglossInline();
  augmentPicker();
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
      const g = state === 'ready' ? chipFor(word) : null;
      const span = document.createElement('span');
      span.className = 'dict-gloss' + (g ? '' : ' dict-gloss-none');
      span.textContent = g ? g : '·';
      btn.appendChild(span);
    }
    lastCandidates = next;
  } finally {
    augmenting = false;
  }
  if (!searchInput || searchInput.value.trim().length === 0) renderCandidates();
  if (state === 'idle') loadData();
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
      const g = state === 'ready' ? chipFor(textEl.textContent || '') : null;
      if (!g) continue;
      const span = document.createElement('span');
      span.className = 'dict-gloss dict-gloss-picker';
      span.textContent = g;
      row.appendChild(span);
    }
  } finally {
    pickerAugmenting = false;
  }
}

let outputTimer: ReturnType<typeof setTimeout> | null = null;
function augmentOutput(): void {
  if (state !== 'ready') return;
  if (outputTimer) return;
  outputTimer = setTimeout(() => {
    outputTimer = null;
    const out = document.getElementById('output');
    if (!out) return;
    const words = out.querySelectorAll<HTMLElement>('.word');
    for (let i = 0; i < words.length; i++) {
      const el = words[i] as HTMLElement;
      if (el.getAttribute('data-glossed') === '1') continue;
      el.setAttribute('data-glossed', '1');
      const g = chipFor(el.textContent || '');
      if (g) el.title = g;
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

  const out = document.getElementById('output');
  if (out) {
    new MutationObserver(() => augmentOutput()).observe(out, { childList: true, subtree: true });
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
export function initDictionary(load: DictionaryLoader): void {
  if (started) return;
  started = true;
  try {
    loader = load;
    buildPanel();
    observe();
    setTimeout(loadData, 400);
  } catch {
    /* The dictionary must never take the app down. */
  }
}
