/**
 * Picture mode (V4.2): the pure parts. Which word box is under the pointer,
 * which text line to read, how much to enlarge it, and boxes between the
 * screenshot's device pixels and the page's CSS pixels.
 *
 * The capture, the OCR and the card live in background.ts, offscreen.ts and
 * content.ts; everything here is plain arithmetic, so it is unit-tested.
 */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  /** As OCR read it (before canonical() and correction). */
  text: string;
  /** Tesseract's confidence, 0–100. */
  conf: number;
  box: Box;
}

export interface OcrLine {
  box: Box;
  words: OcrWord[];
}

/** Odia letters or digits: a word worth looking up. */
export const HAS_ODIA = /[\u0b01-\u0b63\u0b66-\u0b77]/;

/** Half the size of the screen area read around the pointer, in CSS pixels. */
export const REGION = { halfWidth: 320, halfHeight: 70 };

/** The text height (pixels) the line is enlarged to before the second, single-line OCR pass. */
export const TARGET_LINE_HEIGHT = 64;

export const lineScale = (height: number): number => Math.min(4, Math.max(1, TARGET_LINE_HEIGHT / Math.max(1, height)));

const inside = (b: Box, x: number, y: number, slack = 0): boolean =>
  x >= b.x0 - slack && x <= b.x1 + slack && y >= b.y0 - slack && y <= b.y1 + slack;

/** Distance from a point to a box (0 inside). */
export function distanceTo(b: Box, x: number, y: number): number {
  const dx = x < b.x0 ? b.x0 - x : x > b.x1 ? x - b.x1 : 0;
  const dy = y < b.y0 ? b.y0 - y : y > b.y1 ? y - b.y1 : 0;
  return Math.hypot(dx, dy);
}

/**
 * The line under the point: one whose box holds it, else the nearest within
 * half a line height (the pointer is often in the gap between two lines).
 */
export function pickLine(lines: readonly OcrLine[], x: number, y: number): OcrLine | null {
  let best: { line: OcrLine; d: number } | null = null;
  for (const line of lines) {
    if (!line.words.some((w) => HAS_ODIA.test(w.text))) continue;
    const d = distanceTo(line.box, x, y);
    const slack = (line.box.y1 - line.box.y0) / 2;
    if (d > slack) continue;
    if (!best || d < best.d) best = { line, d };
  }
  return best?.line ?? null;
}

/** The Odia word under the point, or the nearest one on its line within a small gap. */
export function pickWord(words: readonly OcrWord[], x: number, y: number, slack = 6): number {
  let best = -1;
  let bestD = Infinity;
  words.forEach((w, i) => {
    if (!HAS_ODIA.test(w.text)) return;
    if (inside(w.box, x, y)) {
      if (bestD > 0) {
        best = i;
        bestD = 0;
      }
      return;
    }
    const d = distanceTo(w.box, x, y);
    if (d <= slack && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Scale a box (device pixels → CSS pixels: divide by the device pixel ratio) and shift it. */
export const mapBox = (b: Box, scale: number, dx = 0, dy = 0): Box => ({
  x0: (b.x0 + dx) * scale,
  y0: (b.y0 + dy) * scale,
  x1: (b.x1 + dx) * scale,
  y1: (b.y1 + dy) * scale,
});

/** The screen area read around a point, in device pixels, kept inside the screenshot. */
export function regionAround(x: number, y: number, ratio: number, width: number, height: number): Box {
  const x0 = Math.max(0, Math.round((x - REGION.halfWidth) * ratio));
  const y0 = Math.max(0, Math.round((y - REGION.halfHeight) * ratio));
  const x1 = Math.min(width, Math.round((x + REGION.halfWidth) * ratio));
  const y1 = Math.min(height, Math.round((y + REGION.halfHeight) * ratio));
  return { x0, y0, x1, y1 };
}

/** OCR text as a word to look up: canonical Odia letters and digits only (punctuation off the ends). */
export function cleanRead(text: string): string {
  return text.replace(/[\u200c\u200d]/g, '').replace(/^[^\u0b01-\u0b77]+|[^\u0b01-\u0b77]+$/g, '');
}

/**
 * The text line under a point, found from the pixels alone (no OCR): a few
 * milliseconds instead of a second for a first OCR pass over the region.
 *
 * `gray` is one byte per pixel (0 black … 255 white), `width` × `height`. Ink is
 * whatever differs from the background around the point (dark print on light
 * paper, or light print on a coloured bar). Rows with ink near the point make
 * the line; small gaps are bridged (the \u0b3f loop above a letter, the \u0b41 below it
 * are often apart from the letter). Then the line is followed left and right
 * while the gaps are word spaces, not a column gutter. Null when there is no
 * ink near the point.
 */
export function findLine(gray: Uint8Array | Uint8ClampedArray, width: number, height: number, px: number, py: number): Box | null {
  const x = Math.round(px);
  const y = Math.round(py);
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  // Background and ink threshold from a window around the point (Otsu).
  const wx0 = Math.max(0, x - 60);
  const wx1 = Math.min(width, x + 60);
  const wy0 = Math.max(0, y - 40);
  const wy1 = Math.min(height, y + 40);
  const hist = new Array<number>(256).fill(0);
  for (let r = wy0; r < wy1; r++) for (let c = wx0; c < wx1; c++) hist[gray[r * width + c] as number]++;
  const total = (wx1 - wx0) * (wy1 - wy0);
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * (hist[i] as number);
  let sumB = 0;
  let wB = 0;
  let best = -1;
  let threshold = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i] as number;
    if (wB === 0 || wB === total) continue;
    sumB += i * (hist[i] as number);
    const mB = sumB / wB;
    const mF = (sum - sumB) / (total - wB);
    const between = wB * (total - wB) * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  // The background is the larger side; ink is the other one.
  let dark = 0;
  for (let i = 0; i <= threshold; i++) dark += hist[i] as number;
  const darkInk = dark < total / 2;
  const ink = (r: number, c: number): boolean => {
    const v = gray[r * width + c] as number;
    return darkInk ? v <= threshold : v > threshold;
  };
  const rowInk = (r: number, c0: number, c1: number): number => {
    let n = 0;
    for (let c = c0; c < c1; c++) if (ink(r, c)) n++;
    return n;
  };
  // Rows with ink in a narrow strip around the pointer (one or two letters wide).
  const sx0 = Math.max(0, x - 25);
  const sx1 = Math.min(width, x + 25);
  let start = -1;
  for (let d = 0; d <= 10 && start < 0; d++) {
    if (y - d >= 0 && rowInk(y - d, sx0, sx1) > 0) start = y - d;
    else if (y + d < height && rowInk(y + d, sx0, sx1) > 0) start = y + d;
  }
  if (start < 0) return null;
  let top = start;
  let bottom = start;
  const grow = (dir: -1 | 1): void => {
    let gap = 0;
    for (let r = (dir < 0 ? top : bottom) + dir; r >= 0 && r < height; r += dir) {
      const allowed = Math.max(2, Math.round((bottom - top + 1) * 0.2));
      if (rowInk(r, sx0, sx1) > 0) {
        gap = 0;
        if (dir < 0) top = r;
        else bottom = r;
      } else if (++gap > allowed) break;
    }
  };
  grow(-1);
  grow(1);
  const lineHeight = bottom - top + 1;
  if (lineHeight < 4 || lineHeight > height * 0.9) return null;
  // Follow the line sideways while the gaps are word spaces (under ~1.2 line heights).
  const colInk = (c: number): boolean => {
    for (let r = top; r <= bottom; r++) if (ink(r, c)) return true;
    return false;
  };
  const maxGap = Math.max(4, Math.round(lineHeight * 1.2));
  let left = x;
  let right = x;
  for (let c = x, gap = 0; c >= 0; c--) {
    if (colInk(c)) {
      left = c;
      gap = 0;
    } else if (++gap > maxGap) break;
  }
  for (let c = x, gap = 0; c < width; c++) {
    if (colInk(c)) {
      right = c;
      gap = 0;
    } else if (++gap > maxGap) break;
  }
  return { x0: left, y0: top, x1: right + 1, y1: bottom + 1 };
}
