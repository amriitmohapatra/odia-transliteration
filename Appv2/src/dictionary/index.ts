/**
 * Dictionary overlay entry point: the overlay plus its default data loader.
 *
 * The two payloads are gzip files shipped as separate build assets (named
 * .bin, not .gz, so no server or CDN transparently decompresses them or adds
 * Content-Encoding). In the normal build they are fetched from ./assets/ and
 * precached by the service worker; in the SINGLE_FILE build vite.config.ts
 * inlines them as data: URIs, which fetch() reads from a file:// page too.
 *
 * Inflating happens in the overlay with the vendored pako, not
 * DecompressionStream: the browser floor is Safari 13.
 */

import { initDictionary, type DictionaryBytes, type DictionaryState } from './overlay.js';
export { meaningsOpen, setMeaningsOpen } from './overlay.js';
import modernUrl from './modern.bin?url';
import praharajUrl from './praharaj.bin?url';

export { initDictionary };
export type { DictionaryBytes, DictionaryLoader, DictionaryState } from './overlay.js';

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`dictionary fetch failed: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Fetch both payloads in parallel. The modern layer is optional: if it fails,
 * it resolves to null and the Praharaj glosses still work, as before.
 */
export function loadDictionaryBytes(): Promise<DictionaryBytes> {
  const modern = fetchBytes(modernUrl).catch(() => null);
  return fetchBytes(praharajUrl).then((praharaj) => modern.then((m) => ({ praharaj, modern: m })));
}

/**
 * Start the overlay with the bundled data. Data loads lazily, after start-up.
 * `onState` hears 'loading' / 'ready' / 'failed' (V1 loading and failure lines).
 */
export function startDictionary(onState?: (s: DictionaryState) => void): void {
  initDictionary(loadDictionaryBytes, onState);
}
