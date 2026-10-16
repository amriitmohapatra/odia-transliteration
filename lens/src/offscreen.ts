/**
 * The OCR page of the extension (picture mode, V4.2): an offscreen document,
 * because a service worker cannot run the OCR's WebAssembly worker. All the
 * reading is in ocr.ts; the files are inside the extension (lens/build.mjs
 * copies them to ocr/), so nothing is fetched from the network.
 */

import { OCR, type OcrRequest, type OcrResponse } from './messages.js';
import { readAt, readBlock, setOcrPaths, timing } from './ocr.js';

setOcrPaths({
  workerPath: chrome.runtime.getURL('ocr/worker.min.js'),
  corePath: chrome.runtime.getURL('ocr/tesseract-core-simd-lstm.wasm.js'),
  langPath: chrome.runtime.getURL('ocr/'),
});

async function read(request: OcrRequest): Promise<OcrResponse> {
  const image = await createImageBitmap(await (await fetch(request.image)).blob());
  if (request.mode === 'block') return { ok: true, line: null, lines: await readBlock(image), timing: { ...timing } };
  return { ok: true, line: await readAt(image, request.x, request.y), timing: { ...timing } };
}

chrome.runtime.onMessage.addListener((message: OcrRequest, _sender, sendResponse: (r: OcrResponse) => void) => {
  if (message?.type !== OCR || message.target !== 'offscreen') return false;
  read(message).then(
    (answer) => sendResponse(answer),
    (error: unknown) => sendResponse({ ok: false, error: String(error) }),
  );
  return true;
});
