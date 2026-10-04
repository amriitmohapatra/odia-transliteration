/**
 * Word origin (PLAN.md V2.4): "from Persian", "from Sanskrit (tatsama)", ...
 *
 * Data: origin.bin = gzip(text), built by
 * Odia_Sanskrit_Appv2/build/build_origin_map.py from Praharaj's own origin
 * marks (method, tag table and counts there; checksum in
 * Odia_Sanskrit_Appv2/PROVENANCE.md).
 *
 *   line 1: "odia-origin 1" TAB <key count> TAB <FNV-1a 32 of keys.join("\n")>
 *   then one line per praharaj.bin key, in key order: a code, or "".
 *
 * Codes: S Sanskrit (tatsama), T native Odia from Sanskrit (tadbhava),
 * D native Odia (deshaja), P Persian, A Arabic, E English, H Hindi,
 * B Bengali, K Turkish, G Portuguese, F foreign (language not given).
 * Several letters = a hybrid ("AP", Arabic + Persian); "/" separates
 * homograph entries that disagree ("S/D").
 *
 * Pure functions, no DOM: overlay.ts does the inflating and the rendering,
 * Appv2/test/origin.test.ts checks these against the shipped files.
 */

export const ORIGIN_FORMAT = 'odia-origin 1';

/** FNV-1a 32 over UTF-16 code units, as 8 hex digits; mirrors fnv1a() in build_origin_map.py. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/**
 * Origin codes aligned with `keys` (praharaj.bin's sorted key list), or null
 * when the file was built for another praharaj.bin: then the app shows no
 * origins rather than wrong ones.
 */
export function parseOrigin(text: string, keys: readonly string[]): string[] | null {
  const lines = text.split('\n');
  const head = (lines[0] as string).split('\t');
  const count = keys.length;
  if (head[0] !== ORIGIN_FORMAT || +(head[1] as string) !== count) return null;
  if (head[2] !== fnv1a(keys.join('\n'))) return null;
  if (lines.length < count + 1) return null;
  return lines.slice(1, count + 1);
}

const LANG_NAME: Record<string, string> = {
  S: 'Sanskrit',
  D: 'Odia',
  P: 'Persian',
  A: 'Arabic',
  E: 'English',
  H: 'Hindi',
  B: 'Bengali',
  K: 'Turkish',
  G: 'Portuguese',
};

/** Label for one entry's code ("S", "T", "P", "AP", ...); null for an unknown letter. */
export function originPhrase(code: string): string | null {
  if (code === 'S') return 'from Sanskrit (tatsama)';
  if (code === 'T') return 'native Odia (tadbhava, from Sanskrit)';
  if (code === 'D') return 'native Odia (deshaja)';
  if (code === 'F') return 'from another language';
  const names: string[] = [];
  for (let i = 0; i < code.length; i += 1) {
    const n = LANG_NAME[code.charAt(i)];
    if (!n) return null; // say nothing rather than guess
    names.push(n);
  }
  return names.length ? 'from ' + names.join(' + ') : null;
}

/** Panel label: "from Persian", or "from Sanskrit (tatsama) or native Odia (deshaja)". */
export function originLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const parts: string[] = [];
  for (const c of code.split('/')) {
    const phrase = originPhrase(c);
    if (!phrase) return null;
    parts.push(phrase);
  }
  return parts.join(' or ');
}

/**
 * Suffix for a suggestion's meaning chip: only for a borrowed word, and only
 * when Praharaj's entries agree. Native and Sanskrit words get none, so the
 * suffix stays rare enough to notice.
 */
export function originChipLabel(code: string | null | undefined): string | null {
  if (!code || code.indexOf('/') >= 0 || !/[PAEHBKGF]/.test(code)) return null;
  return originPhrase(code);
}
