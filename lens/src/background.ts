/**
 * Odia Lens background worker (Manifest V3).
 *
 * 1. A click on the toolbar icon (or the keyboard shortcut) turns the lens on
 *    or off for that tab. The extension asks for no host permissions: the
 *    click grants `activeTab`, and the content script is injected only then.
 * 2. It answers the content script's lookups from the dictionary files packed
 *    in the extension. Nothing goes over the network.
 *
 * The dictionary is split at build time (build.mjs): the Praharaj keys in one
 * file, the definitions in chunks of `chunk` entries, so a worker that the
 * browser stopped after 30 s idle restarts in milliseconds, not the second it
 * takes to unpack the whole 24 MB text.
 */

import { parseGlosses, parseMeanings, parseVerbEndings } from '@odia/core';
import { canonical } from '@odia/core/normalize';

import { findEntry, foldKey, meaningFinder, parsePayload, type Dict } from '../../Appv2/src/dictionary/lookup.js';
import { cleanDefinition } from '../../Appv2/src/dictionary/clean.js';
import { parseOrigin } from '../../Appv2/src/dictionary/origin.js';
import { parseLoans } from '../../Appv2/src/dictionary/loans.js';
import { inflate } from '../../Appv2/src/dictionary/pako-inflate.js';
import glossesTsv from '../../core/data/glosses.tsv';
import meaningsTsv from '../../core/data/meanings.tsv';
import verbEndingsTsv from '../../core/data/verb-endings.tsv';
import loansTsv from '../../Appv2/src/dictionary/loans.tsv';

import { parseWordList, separate, type WordList } from './correct.js';
import { describeWord, type LensCard, type LensData } from './describe.js';
import {
  LOOKUP,
  OCR,
  PICTURE,
  READ_WORD,
  TOGGLE_COMMAND,
  type LookupRequest,
  type LookupResponse,
  type OcrRequest,
  type OcrResponse,
  type PictureRequest,
  type PictureResponse,
  type Reading,
  type ReadWordRequest,
  type ReadWordResponse,
} from './messages.js';
import { cleanRead, mapBox, pickWord, regionAround } from './picture.js';

interface ChunkIndex {
  count: number;
  chunk: number;
  files: number;
}

let keys: Promise<{ keys: string[]; index: ChunkIndex }> | undefined;
let extras: Promise<LensData> | undefined;
/** Recently used definition chunks; a few are enough for one page. */
const chunks = new Map<number, Promise<string[]>>();
const CHUNKS_KEPT = 12;

async function bytes(path: string): Promise<Uint8Array> {
  const response = await fetch(chrome.runtime.getURL(path));
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

const text = async (path: string): Promise<string> => new TextDecoder('utf-8').decode(inflate(await bytes(path)));

function loadKeys(): Promise<{ keys: string[]; index: ChunkIndex }> {
  keys ??= Promise.all([text('dict/praharaj-keys.bin'), bytes('dict/index.json')]).then(([k, i]) => ({
    keys: k.split('\n'),
    index: JSON.parse(new TextDecoder('utf-8').decode(i)) as ChunkIndex,
  }));
  return keys;
}

function loadExtras(): Promise<LensData> {
  extras ??= (async (): Promise<LensData> => {
    const { keys: k } = await loadKeys();
    let modern: Dict | null = null;
    try {
      modern = parsePayload(await bytes('dict/modern.bin'));
    } catch {
      modern = null; // optional, as in the app
    }
    let origin: string[] | null = null;
    try {
      origin = parseOrigin(await text('dict/origin.bin'), k);
    } catch {
      origin = null;
    }
    let ai: LensData['ai'] = null;
    try {
      ai = meaningFinder(parseMeanings(meaningsTsv, 'core/data/meanings.tsv'));
    } catch {
      ai = null; // a broken file must not take the lens down; the unit tests catch it
    }
    let verbs: LensData['verbs'] = null;
    try {
      verbs = parseVerbEndings(verbEndingsTsv, 'core/data/verb-endings.tsv');
    } catch {
      verbs = null;
    }
    return { modern, origin, owner: parseGlosses(glossesTsv, 'core/data/glosses.tsv'), loans: parseLoans(loansTsv), ai, verbs };
  })();
  return extras;
}

async function definition(i: number): Promise<string> {
  const { index } = await loadKeys();
  const n = Math.floor(i / index.chunk);
  let chunk = chunks.get(n);
  if (chunk === undefined) {
    chunk = text(`dict/praharaj-${String(n).padStart(3, '0')}.bin`).then((t) => JSON.parse(t) as string[]);
    chunks.set(n, chunk);
    if (chunks.size > CHUNKS_KEPT) chunks.delete(chunks.keys().next().value as number);
  }
  return cleanDefinition((await chunk)[i - n * index.chunk] ?? '');
}

async function lookup(word: string, previous: string): Promise<LensCard | null> {
  const odia = canonical(word);
  const key = foldKey(odia);
  if (key.length === 0) return null;
  const [{ keys: k }, data] = await Promise.all([loadKeys(), loadExtras()]);
  const entry = findEntry(k, key);
  const def = entry ? await definition(entry.index) : null;
  return describeWord(odia, key, entry, def, data, previous);
}

/* ------------------------------------------------------------ *
 * Picture mode (V4.2): Odia in images, read by OCR
 * ------------------------------------------------------------ */

let words: Promise<WordList> | undefined;
const loadWords = (): Promise<WordList> => (words ??= text('dict/words.bin').then(parseWordList));

/** A word read by OCR: canonical, corrected to a known word when it is not one, then the usual card. */
async function readWord(raw: string, conf: number, whole?: string): Promise<{ card: LensCard | null; reading: Reading } | null> {
  const odia = canonical(cleanRead(raw));
  if (odia.length === 0) return null;
  const [{ keys: k }, data, list] = await Promise.all([loadKeys(), loadExtras(), loadWords()]);
  // A word the list knows takes the list's spelling (OCR mixes up ya and yya);
  // a word the dictionaries know stays; any other word is corrected.
  const fromList = /[\u0b66-\u0b6f]/.test(odia) ? { word: odia, distance: 0 } : list.correct(odia);
  // A word the dictionary can already explain stays as read (barana-ru, "from
  // the ban", is right; the list's karana-ru is only more common).
  const entry = findEntry(k, foldKey(odia));
  const known =
    fromList.distance === 0 ||
    data.owner.get(odia) !== undefined ||
    data.ai?.word(odia) !== undefined ||
    entry?.how === 'exact' ||
    (entry?.how === 'stem' && conf >= 50);
  const corrected = fromList.distance === 0 ? fromList.word : known ? odia : fromList.word;
  const card = await lookup(corrected, '');
  const partOf = whole ? canonical(cleanRead(whole)) : '';
  return { card, reading: { readAs: odia, corrected: corrected === odia ? null : corrected, conf, partOf: partOf && partOf !== odia ? partOf : null } };
}

/** Explainable as a whole word: the list, the owner, the AI layer, or Praharaj (headword or stem) knows it. */
async function explainer(): Promise<(text: string) => boolean> {
  const [{ keys: k }, data, list] = await Promise.all([loadKeys(), loadExtras(), loadWords()]);
  return (text) => {
    const odia = canonical(cleanRead(text));
    if (odia.length === 0) return false;
    const how = findEntry(k, foldKey(odia))?.how;
    return list.has(odia) || data.owner.get(odia) !== undefined || data.ai?.word(odia) !== undefined || how === 'exact' || how === 'stem';
  };
}

/* Chrome allows about two screenshots a second per extension. */
let lastCapture = 0;
async function capture(windowId: number | undefined): Promise<string> {
  const wait = lastCapture + 550 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCapture = Date.now();
  return chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
}

let offscreen: Promise<void> | undefined;
function ensureOffscreen(): Promise<void> {
  offscreen ??= chrome.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Reads Odia text in pictures with the OCR engine packed in the extension.',
    })
    .catch((error: unknown) => {
      if (/single offscreen/i.test(String(error))) return; // already open
      offscreen = undefined;
      throw error;
    });
  return offscreen;
}

async function ocr(request: OcrRequest): Promise<OcrResponse> {
  for (let attempt = 0; ; attempt++) {
    await ensureOffscreen();
    try {
      const answer = await new Promise<OcrResponse | undefined>((resolve) => chrome.runtime.sendMessage(request, resolve));
      if (answer) return answer;
      throw new Error(chrome.runtime.lastError?.message ?? 'no answer from the OCR page');
    } catch (error) {
      // The browser may have closed the OCR page: open it again once.
      offscreen = undefined;
      if (attempt > 0) throw error;
    }
  }
}

function dataUrl(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(binary)}`;
}

async function readPicture(request: PictureRequest, windowId: number | undefined): Promise<PictureResponse> {
  const t0 = Date.now();
  const shot = await createImageBitmap(await (await fetch(await capture(windowId))).blob());
  const ratio = shot.width / Math.max(1, request.viewportWidth);
  const region = regionAround(request.x, request.y, ratio, shot.width, shot.height);
  const canvas = new OffscreenCanvas(region.x1 - region.x0, region.y1 - region.y0);
  (canvas.getContext('2d') as OffscreenCanvasRenderingContext2D).drawImage(shot, -region.x0, -region.y0);
  const png = await canvas.convertToBlob({ type: 'image/png' });
  const answer = await ocr({
    type: OCR,
    target: 'offscreen',
    image: dataUrl(await png.arrayBuffer()),
    x: request.x * ratio - region.x0,
    y: request.y * ratio - region.y0,
  });
  if (!answer.ok) return answer;
  const [list, explainable] = await Promise.all([loadWords(), explainer()]);
  const line = separate(
    (answer.line?.words ?? []).map((w) => ({ ...w, box: mapBox(w.box, 1 / ratio, region.x0, region.y0) })),
    list,
    (t) => canonical(cleanRead(t)),
    explainable,
  );
  const index = pickWord(line, request.x, request.y);
  const hit = index >= 0 ? line[index] : undefined;
  const found = hit ? await readWord(hit.text, hit.conf, hit.whole) : null;
  return { ok: true, words: line, index, card: found?.card ?? null, reading: found?.reading ?? null, ms: Date.now() - t0, timing: answer.timing };
}

type Request = LookupRequest | PictureRequest | ReadWordRequest;

chrome.runtime.onMessage.addListener((message: Request, sender, sendResponse: (r: LookupResponse | PictureResponse | ReadWordResponse) => void) => {
  if (sender.id !== chrome.runtime.id) return false;
  const fail = (error: unknown): void => sendResponse({ ok: false, error: String(error) });
  if (message?.type === LOOKUP) {
    lookup(message.word, message.previous ?? '').then((card) => sendResponse({ ok: true, card }), fail);
    return true; // the answer comes asynchronously
  }
  if (message?.type === PICTURE) {
    readPicture(message, sender.tab?.windowId).then(sendResponse, fail);
    return true;
  }
  if (message?.type === READ_WORD) {
    readWord(message.text, message.conf, message.whole).then(
      (found) => sendResponse(found ? { ok: true, ...found } : { ok: false, error: 'not an Odia word' }),
      fail,
    );
    return true;
  }
  return false;
});

/** Turn the lens on or off in a tab; the badge says which. */
async function toggle(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (window as unknown as { __odiaLens?: { toggle(): boolean } }).__odiaLens?.toggle() ?? false,
    });
    await chrome.action.setBadgeText({ tabId, text: result?.result === true ? 'ON' : '' });
  } catch {
    // Pages the browser protects (the Chrome Web Store, chrome:// pages) refuse
    // scripts. Say so on the badge rather than failing silently.
    await chrome.action.setBadgeText({ tabId, text: '\u2715' }).catch(() => undefined);
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) void toggle(tab.id);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === TOGGLE_COMMAND && tab?.id !== undefined) void toggle(tab.id);
});

// A new page in the tab has no lens: clear the badge.
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading') void chrome.action.setBadgeText({ tabId, text: '' }).catch(() => undefined);
});

// For the browser check (lens/eval/lens-check.mjs): toggle a tab without a click,
// and read a picture point directly.
(self as unknown as { odiaLensToggle: typeof toggle; odiaLensReadPicture: typeof readPicture }).odiaLensToggle = toggle;
(self as unknown as { odiaLensReadPicture: typeof readPicture }).odiaLensReadPicture = readPicture;
