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

import { parseGlosses } from '@odia/core';
import { canonical } from '@odia/core/normalize';

import { findEntry, foldKey, parsePayload, type Dict } from '../../Appv2/src/dictionary/lookup.js';
import { cleanDefinition } from '../../Appv2/src/dictionary/clean.js';
import { parseOrigin } from '../../Appv2/src/dictionary/origin.js';
import { parseLoans } from '../../Appv2/src/dictionary/loans.js';
import { inflate } from '../../Appv2/src/dictionary/pako-inflate.js';
import glossesTsv from '../../core/data/glosses.tsv';
import loansTsv from '../../Appv2/src/dictionary/loans.tsv';

import { describeWord, type LensCard, type LensData } from './describe.js';
import { LOOKUP, TOGGLE_COMMAND, type LookupRequest, type LookupResponse } from './messages.js';

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
    return { modern, origin, owner: parseGlosses(glossesTsv, 'core/data/glosses.tsv'), loans: parseLoans(loansTsv) };
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

async function lookup(word: string): Promise<LensCard | null> {
  const odia = canonical(word);
  const key = foldKey(odia);
  if (key.length === 0) return null;
  const [{ keys: k }, data] = await Promise.all([loadKeys(), loadExtras()]);
  const entry = findEntry(k, key);
  const def = entry ? await definition(entry.index) : null;
  return describeWord(odia, key, entry, def, data);
}

chrome.runtime.onMessage.addListener((message: LookupRequest, sender, sendResponse: (r: LookupResponse) => void) => {
  if (message?.type !== LOOKUP || sender.id !== chrome.runtime.id) return false;
  lookup(message.word).then(
    (card) => sendResponse({ ok: true, card }),
    (error: unknown) => sendResponse({ ok: false, error: String(error) }),
  );
  return true; // the answer comes asynchronously
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
    await chrome.action.setBadgeText({ tabId, text: '✕' }).catch(() => undefined);
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

// For the browser check (lens/eval/lens-check.mjs): toggle a tab without a click.
(self as unknown as { odiaLensToggle: typeof toggle }).odiaLensToggle = toggle;
