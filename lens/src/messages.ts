/** Messages between the content script and the background worker. */

import type { LensCard } from './describe.js';

export const LOOKUP = 'odia-lens/lookup';

/** The manifest's command name for the keyboard shortcut. */
export const TOGGLE_COMMAND = 'toggle-lens';

export interface LookupRequest {
  type: typeof LOOKUP;
  word: string;
  /** The Odia word just before it on the page (one space apart), or ''. */
  previous?: string;
}

export type LookupResponse = { ok: true; card: LensCard | null } | { ok: false; error: string };
