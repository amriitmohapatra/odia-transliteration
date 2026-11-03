/**
 * "In English" (V3 assist layer; plan/05-v3-direction.md §4 and §9, decision D-2).
 *
 * Sends the Odia in the text box to /api/translate (the same route the Odia Lens
 * uses; the server picks Claude or Google, decision D-3) and returns the English.
 * Only after the user turns on Settings > Translate online; nothing is sent while
 * it is off. The request says `source: "typed"`, so the server reads the text as
 * phonetic typing rather than OCR (api/_lib/translate.ts TYPED_PROMPT).
 */

/** Longest text sent in one go: the server's limit (api/_lib/translate.ts MAX_CHARS). */
export const TRANSLATE_MAX_CHARS = 2000;

/** Who made the translation, for the line under it ("by Claude (Anthropic)"). */
export function providerName(provider: string | undefined): string {
  if (provider === 'claude') return 'Claude (Anthropic)';
  if (provider === 'google') return 'Google Translate';
  return 'an online service';
}

/**
 * The text to send: spaces folded, at most TRANSLATE_MAX_CHARS, cut after the last
 * sentence end (। . ? ! or a line break) if one is in the second half, else at a
 * space. `cut` says whether some was left out.
 */
export function translatable(text: string): { text: string; cut: boolean } {
  const t = text.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  if (t.length <= TRANSLATE_MAX_CHARS) return { text: t, cut: false };
  const head = t.slice(0, TRANSLATE_MAX_CHARS);
  const sentence = Math.max(...['।', '.', '?', '!', '\n'].map((m) => head.lastIndexOf(m)));
  if (sentence > TRANSLATE_MAX_CHARS / 2) return { text: head.slice(0, sentence + 1).trim(), cut: true };
  const space = head.lastIndexOf(' ');
  return { text: (space > TRANSLATE_MAX_CHARS / 2 ? head.slice(0, space) : head).trim(), cut: true };
}

export interface Translation {
  english: string;
  provider: string | undefined;
}

/** Ask the server for the English. Rejects with a message for the user. */
export async function translateOnline(text: string, endpoint = '/api/translate'): Promise<Translation> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, source: 'typed' }),
    });
  } catch {
    throw new Error('Translation needs the internet. Check the connection and try again.');
  }
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; translation?: string; provider?: string; error?: string };
  if (!response.ok || !data.ok || !data.translation) throw new Error(data.error ?? `Translation failed (${response.status}).`);
  return { english: data.translation, provider: data.provider };
}
