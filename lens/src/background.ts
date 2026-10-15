/**
 * Odia Lens background worker (Manifest V3).
 *
 * 1. A click on the toolbar icon (or the keyboard shortcut) turns the lens on
 *    or off for that tab. The extension asks for no host permissions: the
 *    click grants `activeTab`, and the content script is injected only then.
 * 2. It answers the content script's lookups from the dictionary files packed
 *    in the extension (engine.ts). Nothing goes over the network.
 * 3. Picture mode: it takes the screenshot and asks the OCR page (offscreen.ts).
 */

import { canonical } from '@odia/core/normalize';

import { separate } from './correct.js';
import { explainer, fetchLoader, loadWords, lookup, readWord, setLoader } from './engine.js';
import {
  FRAME,
  LOOKUP,
  OCR,
  PICTURE,
  READ_WORD,
  TOGGLE_COMMAND,
  FRAME_COMMAND,
  type FrameLine,
  type FrameRequest,
  type FrameResponse,
  type FrameWord,
  type LookupRequest,
  type LookupResponse,
  type OcrRequest,
  type OcrResponse,
  type PictureRequest,
  type PictureResponse,
  type ReadWordRequest,
  type ReadWordResponse,
} from './messages.js';
import { HAS_ODIA, cleanRead, lineText, mapBox, pickWord, regionAround } from './picture.js';

setLoader(fetchLoader((path) => chrome.runtime.getURL(path)));

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
    mode: 'at',
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

/** Everything inside the lens frame: every line, every word with its card (frame mode). */
async function readFrame(request: FrameRequest, windowId: number | undefined): Promise<FrameResponse> {
  const t0 = Date.now();
  const shot = await createImageBitmap(await (await fetch(await capture(windowId))).blob());
  const ratio = shot.width / Math.max(1, request.viewportWidth);
  const box = {
    x0: Math.max(0, Math.round(request.box.x0 * ratio)),
    y0: Math.max(0, Math.round(request.box.y0 * ratio)),
    x1: Math.min(shot.width, Math.round(request.box.x1 * ratio)),
    y1: Math.min(shot.height, Math.round(request.box.y1 * ratio)),
  };
  if (box.x1 - box.x0 < 8 || box.y1 - box.y0 < 8) return { ok: true, lines: [], ms: Date.now() - t0 };
  const canvas = new OffscreenCanvas(box.x1 - box.x0, box.y1 - box.y0);
  (canvas.getContext('2d') as OffscreenCanvasRenderingContext2D).drawImage(shot, -box.x0, -box.y0);
  const png = await canvas.convertToBlob({ type: 'image/png' });
  const answer = await ocr({ type: OCR, target: 'offscreen', image: dataUrl(await png.arrayBuffer()), mode: 'block', x: 0, y: 0 });
  if (!answer.ok) return answer;
  const [list, explainable] = await Promise.all([loadWords(), explainer()]);
  const lines: FrameLine[] = [];
  for (const line of answer.lines ?? []) {
    const pieces = separate(
      line.words.map((w) => ({ ...w, box: mapBox(w.box, 1 / ratio, box.x0, box.y0) })),
      list,
      (t) => canonical(cleanRead(t)),
      explainable,
    );
    const words: FrameWord[] = [];
    let previous = '';
    for (const w of pieces) {
      if (!HAS_ODIA.test(w.text)) continue;
      const found = await readWord(w.text, w.conf, w.whole, previous);
      if (!found) continue;
      words.push({ text: w.text, conf: w.conf, box: w.box, card: found.card, reading: found.reading });
      previous = found.reading.corrected ?? found.reading.readAs;
    }
    lines.push({ read: canonical(lineText(line.words.map((w) => w.text))), words });
  }
  return { ok: true, lines, ms: Date.now() - t0 };
}

type Request = LookupRequest | PictureRequest | ReadWordRequest | FrameRequest;

chrome.runtime.onMessage.addListener((message: Request, sender, sendResponse: (r: LookupResponse | PictureResponse | ReadWordResponse | FrameResponse) => void) => {
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
  if (message?.type === FRAME) {
    readFrame(message, sender.tab?.windowId).then(sendResponse, fail);
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

/** Turn the lens on or off in a tab (or open / close its frame); the badge says whether it is on. */
async function toggle(tabId: number, what: 'lens' | 'frame' = 'lens'): Promise<void> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: what === 'frame'
        ? () => {
            (window as unknown as { __odiaLens?: { frame(): boolean } }).__odiaLens?.frame();
            return true; // the frame turns the lens on
          }
        : () => (window as unknown as { __odiaLens?: { toggle(): boolean } }).__odiaLens?.toggle() ?? false,
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
  if (tab?.id === undefined) return;
  if (command === TOGGLE_COMMAND) void toggle(tab.id);
  if (command === FRAME_COMMAND) void toggle(tab.id, 'frame');
});

// A new page in the tab has no lens: clear the badge.
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading') void chrome.action.setBadgeText({ tabId, text: '' }).catch(() => undefined);
});

// For the browser check (lens/eval/lens-check.mjs): toggle a tab without a click,
// and read a picture point directly.
(self as unknown as { odiaLensToggle: typeof toggle; odiaLensReadPicture: typeof readPicture }).odiaLensToggle = toggle;
(self as unknown as { odiaLensReadPicture: typeof readPicture }).odiaLensReadPicture = readPicture;
(self as unknown as { odiaLensReadFrame: typeof readFrame }).odiaLensReadFrame = readFrame;
