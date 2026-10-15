/**
 * Reading Odia from an image with Tesseract (tesseract.js, WebAssembly, Odia
 * model `ori` from tessdata_fast; Apache-2.0). No browser-extension API: the
 * extension's OCR page (offscreen.ts) and the Mac lens's page set the file paths.
 *
 * readAt: the text line under a point. The line is found from the pixels
 * (picture.ts findLine, a few milliseconds), then read alone, enlarged to a
 * steady letter size, as one line, which is clearly more accurate on newspaper
 * headlines than reading the whole region (plan/research/lens-v2-ocr.md). When
 * the pixels give no clear line, the region is read first to find it.
 */

import { createWorker, type Worker } from 'tesseract.js';

import { HAS_ODIA, findLine, lineScale, pickLine, type Box, type OcrLine, type OcrWord } from './picture.js';

/** Where the OCR files are: tesseract.js worker, WebAssembly core, folder of `ori.traineddata`. */
export interface OcrPaths {
  workerPath: string;
  corePath: string;
  langPath: string;
}

let paths: OcrPaths | undefined;
let worker: Promise<Worker> | undefined;
/** Pass 1 only finds the line under the pointer: 1.5× is enough for ePaper body text. */
const FIRST_SCALE = 1.5;

export function setOcrPaths(p: OcrPaths): void {
  paths = p;
}

function ocrWorker(): Promise<Worker> {
  if (!paths) return Promise.reject(new Error('odia lens OCR: no file paths set'));
  worker ??= createWorker('ori', 1, { ...paths, gzip: false, workerBlobURL: false, cacheMethod: 'none' });
  return worker;
}

/** A grey copy of part of the image, enlarged; white on dark (a coloured headline bar) is turned to dark on white. */
/* In this hidden page Chrome delays PNG encoding (canvas toBlob, convertToBlob)
 * by about a second. So the image goes to Tesseract as an uncompressed grey
 * PGM (Netpbm), built here from the pixels: no encoding, no delay. */
function pgm(canvas: OffscreenCanvas): Uint8Array {
  const { width, height } = canvas;
  const rgba = (canvas.getContext('2d') as OffscreenCanvasRenderingContext2D).getImageData(0, 0, width, height).data;
  const header = new TextEncoder().encode(`P5\n${width} ${height}\n255\n`);
  const out = new Uint8Array(header.length + width * height);
  out.set(header);
  for (let i = 0, j = header.length; i < rgba.length; i += 4, j++) out[j] = rgba[i] as number; // already grey
  return out;
}

function prepare(image: ImageBitmap, box: Box, scale: number): OffscreenCanvas {
  const w = Math.max(1, Math.round((box.x1 - box.x0) * scale));
  const h = Math.max(1, Math.round((box.y1 - box.y0) * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = 'grayscale(1)';
  ctx.drawImage(image, box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += data[i] as number;
  if (sum / (data.length / 4) < 115) {
    ctx.filter = 'grayscale(1) invert(1)';
    ctx.drawImage(image, box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0, 0, 0, w, h);
  }
  return canvas;
}

interface TesseractLine {
  bbox: Box;
  words: { text: string; confidence: number; bbox: Box }[];
}

/** Lines of a Tesseract result, boxes scaled back by `scale` and shifted by (dx, dy). */
function linesOf(data: { blocks: { paragraphs: { lines: TesseractLine[] }[] }[] | null }, scale: number, dx: number, dy: number): OcrLine[] {
  const back = (b: Box): Box => ({ x0: b.x0 / scale + dx, y0: b.y0 / scale + dy, x1: b.x1 / scale + dx, y1: b.y1 / scale + dy });
  const out: OcrLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const words: OcrWord[] = line.words.map((w) => ({ text: w.text, conf: Math.round(w.confidence), box: back(w.bbox) }));
        out.push({ box: back(line.bbox), words });
      }
    }
  }
  return out;
}

export const timing = { find: 0, pass1: 0, pass2: 0 };

/** Mean confidence of the Odia words read (0 when there are none). */
function meanConf(words: readonly OcrWord[]): number {
  const odia = words.filter((w) => HAS_ODIA.test(w.text));
  return odia.length === 0 ? 0 : odia.reduce((n, w) => n + w.conf, 0) / odia.length;
}

/** The image as grey bytes, one per pixel. */
function greyBytes(image: ImageBitmap): Uint8Array {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(image, 0, 0);
  const rgba = ctx.getImageData(0, 0, image.width, image.height).data;
  const grey = new Uint8Array(image.width * image.height);
  for (let i = 0, j = 0; j < grey.length; i += 4, j++) {
    grey[j] = ((rgba[i] as number) * 299 + (rgba[i + 1] as number) * 587 + (rgba[i + 2] as number) * 114) / 1000;
  }
  return grey;
}

/** Read one line box as a single line, padded and enlarged; words in region pixels. */
async function readLine(ocr: Worker, image: ImageBitmap, line: Box): Promise<OcrWord[]> {
  const h = line.y1 - line.y0;
  const pad = Math.round(h * 0.35);
  const box: Box = {
    x0: Math.max(0, line.x0 - pad),
    y0: Math.max(0, line.y0 - pad),
    x1: Math.min(image.width, line.x1 + pad),
    y1: Math.min(image.height, line.y1 + pad),
  };
  const scale = lineScale(h);
  const image8 = pgm(prepare(image, box, scale));
  const read = async (psm: '7' | '13'): Promise<OcrWord[]> => {
    await ocr.setParameters({ tessedit_pageseg_mode: psm as never });
    const result = await ocr.recognize(image8 as never, {}, { blocks: true, text: false });
    return linesOf(result.data as never, scale, box.x0, box.y0).flatMap((l) => l.words);
  };
  const t = performance.now();
  // Raw-line mode (13) first: with this model it reads ePaper body lines and
  // headlines best (letter errors 4.8% and 8.5%, against 13.7% and 17.9% in
  // single-line mode, which also returns nothing for about one body line in
  // ten). Single-line mode only when raw-line mode finds nothing
  // (plan/research/v43-ocr-model/clean-results.md).
  let words = await read('13');
  if (words.length === 0) words = await read('7');
  timing.pass2 = Math.round(performance.now() - t);
  return words;
}


/** The text line under (x, y) in an image (region pixels): words with boxes, or null. */
export async function readAt(image: ImageBitmap, x: number, y: number): Promise<OcrLine | null> {
  const request = { x, y };
  const ocr = await ocrWorker();
  timing.find = timing.pass1 = timing.pass2 = 0;
  let t = performance.now();
  const found = findLine(greyBytes(image), image.width, image.height, request.x, request.y);
  timing.find = Math.round(performance.now() - t);
  let fromPixels: OcrLine | null = null;
  if (found) {
    const words = await readLine(ocr, image, found);
    fromPixels = { box: found, words };
    if (meanConf(words) >= 60) return fromPixels;
  }
  // No clear line from the pixels (or an unclear reading, often two lines of
  // small print taken as one): read the region to find the line.
  const whole: Box = { x0: 0, y0: 0, x1: image.width, y1: image.height };
  // Pass 1: the region as a block of text, at twice the size (small print).
  await ocr.setParameters({ tessedit_pageseg_mode: '6' as never });
  t = performance.now();
  const first = await ocr.recognize(pgm(prepare(image, whole, FIRST_SCALE)) as never, {}, { blocks: true, text: false });
  timing.pass1 = Math.round(performance.now() - t);
  const line = pickLine(linesOf(first.data as never, FIRST_SCALE, 0, 0), request.x, request.y);
  if (!line) return fromPixels;
  const words = await readLine(ocr, image, line.box);
  const fromRegion = words.length > 0 ? { box: line.box, words } : line;
  return fromPixels && meanConf(fromPixels.words) > meanConf(fromRegion.words) ? fromPixels : fromRegion;
}

/** Frame size limit: lines read one by one (each about 0.1 s). */
export const MAX_FRAME_LINES = 12;

/**
 * All Odia text lines in an image (the frame of the lens), top to bottom: the
 * image is read as a block to find the lines, then each line is read again on
 * its own (single-line mode, steady letter size), keeping the clearer reading.
 */
export async function readBlock(image: ImageBitmap): Promise<OcrLine[]> {
  const ocr = await ocrWorker();
  timing.find = timing.pass1 = timing.pass2 = 0;
  const whole: Box = { x0: 0, y0: 0, x1: image.width, y1: image.height };
  const scale = image.height < 240 ? 2 : 1.5;
  await ocr.setParameters({ tessedit_pageseg_mode: '6' as never });
  const t = performance.now();
  const first = await ocr.recognize(pgm(prepare(image, whole, scale)) as never, {}, { blocks: true, text: false });
  timing.pass1 = Math.round(performance.now() - t);
  const found = linesOf(first.data as never, scale, 0, 0).filter((l) => l.words.some((w) => HAS_ODIA.test(w.text)));
  if (found.length === 0) {
    // A frame around one word or one short line: read it as one line.
    const words = await readLine(ocr, image, whole);
    return words.some((w) => HAS_ODIA.test(w.text)) ? [{ box: whole, words }] : [];
  }
  const out: OcrLine[] = [];
  for (const line of found.slice(0, MAX_FRAME_LINES)) {
    const words = await readLine(ocr, image, line.box);
    out.push({ box: line.box, words: meanConf(words) >= meanConf(line.words) ? words : line.words });
  }
  return out.sort((a, b) => a.box.y0 - b.box.y0);
}


/** Page reading (PDF reader): at most this many unclear lines are read again on their own. */
export const MAX_PAGE_REREADS = 40;

/**
 * A whole page of a book or newspaper (the PDF reader, V4.6): every Odia line,
 * in reading order (Tesseract's page layout finds columns). Lines read unclearly
 * in the page pass are read again alone, enlarged to a steady letter size.
 * `onProgress` hears (lines re-read, lines to re-read).
 */
export async function readPage(image: ImageBitmap, onProgress?: (done: number, total: number) => void): Promise<OcrLine[]> {
  const ocr = await ocrWorker();
  timing.find = timing.pass1 = timing.pass2 = 0;
  const whole: Box = { x0: 0, y0: 0, x1: image.width, y1: image.height };
  await ocr.setParameters({ tessedit_pageseg_mode: '3' as never });
  const t = performance.now();
  const result = await ocr.recognize(pgm(prepare(image, whole, 1)) as never, {}, { blocks: true, text: false });
  timing.pass1 = Math.round(performance.now() - t);
  const lines = linesOf(result.data as never, 1, 0, 0).filter((l) => l.words.some((w) => HAS_ODIA.test(w.text)));
  const unclear = lines.filter((l) => meanConf(l.words) < 70).slice(0, MAX_PAGE_REREADS);
  let done = 0;
  onProgress?.(0, unclear.length);
  for (const line of unclear) {
    const words = await readLine(ocr, image, line.box);
    if (meanConf(words) > meanConf(line.words)) line.words = words;
    onProgress?.(++done, unclear.length);
  }
  // Print in another script (an English quotation) comes out of the Odia model as
  // a line of nonsense Odia at very low confidence: leave such lines out.
  return lines.filter((l) => meanConf(l.words) >= PAGE_MIN_CONF);
}

/** Lines of a page read with less mean confidence than this are not Odia text (picture noise, another script). */
export const PAGE_MIN_CONF = 40;
