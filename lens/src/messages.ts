/** Messages between the content script, the background worker and the OCR page. */

import type { LensCard } from './describe.js';
import type { OcrLine, OcrWord } from './picture.js';

export const LOOKUP = 'odia-lens/lookup';
/** Content → background: read the picture at a point (picture mode, V4.2). */
export const PICTURE = 'odia-lens/picture';
/** Content → background: look up a word already read from a picture (a cached line). */
export const READ_WORD = 'odia-lens/read-word';
/** Background → offscreen document: OCR a screen region. */
export const OCR = 'odia-lens/ocr';
/** Content → background: read everything inside the lens frame. */
export const FRAME = 'odia-lens/frame';

/** The manifest's command name for the keyboard shortcut. */
export const TOGGLE_COMMAND = 'toggle-lens';
/** The manifest's command name for opening or closing the frame. */
export const FRAME_COMMAND = 'toggle-frame';

export interface LookupRequest {
  type: typeof LOOKUP;
  word: string;
  /** The Odia word just before it on the page (one space apart), or ''. */
  previous?: string;
}

export type LookupResponse = { ok: true; card: LensCard | null } | { ok: false; error: string };

/** How the lens read a word from a picture. */
export interface Reading {
  /** The word as OCR read it (canonical). */
  readAs: string;
  /** The dictionary word it was corrected to, when different. */
  corrected: string | null;
  /** OCR confidence, 0–100. */
  conf: number;
  /** The longer token as read, when this word is a piece the lens split off it. */
  partOf: string | null;
}

export interface PictureRequest {
  type: typeof PICTURE;
  /** Pointer, CSS pixels in the viewport. */
  x: number;
  y: number;
  /** window.innerWidth: the screenshot's width over this is the device pixel ratio. */
  viewportWidth: number;
}

export type PictureResponse =
  | {
      ok: true;
      /** The words of the line under the pointer, boxes in CSS pixels of the viewport. */
      words: OcrWord[];
      /** The word under the pointer, or -1. */
      index: number;
      card: LensCard | null;
      reading: Reading | null;
      ms: number;
      /** OCR steps in milliseconds (line finding, region read, line read), for the browser check. */
      timing?: Record<string, number>;
    }
  | { ok: false; error: string };

export interface ReadWordRequest {
  type: typeof READ_WORD;
  text: string;
  conf: number;
  whole?: string;
}

export type ReadWordResponse = { ok: true; card: LensCard | null; reading: Reading } | { ok: false; error: string };

export interface OcrRequest {
  type: typeof OCR;
  target: 'offscreen';
  /** PNG data URL of the region around the pointer, or of the frame. */
  image: string;
  /** 'at': the line under the pointer (x, y, region pixels); 'block': every line (the frame). */
  mode: 'at' | 'block';
  x: number;
  y: number;
}

export type OcrResponse =
  | { ok: true; line: OcrLine | null; lines?: OcrLine[]; timing?: Record<string, number> }
  | { ok: false; error: string };

export interface FrameRequest {
  type: typeof FRAME;
  /** The inside of the frame, CSS pixels in the viewport. */
  box: { x0: number; y0: number; x1: number; y1: number };
  viewportWidth: number;
}

/** A word read in the frame, with its card. */
export interface FrameWord {
  text: string;
  conf: number;
  box: { x0: number; y0: number; x1: number; y1: number };
  card: LensCard | null;
  reading: Reading | null;
}

/** A line read in the frame: the text exactly as OCR read it, then its words. */
export interface FrameLine {
  read: string;
  words: FrameWord[];
}

export type FrameResponse = { ok: true; lines: FrameLine[]; ms: number } | { ok: false; error: string };
