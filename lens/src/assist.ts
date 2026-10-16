/**
 * The online part of the lens (V4.5): translation through the Odia app's own
 * server (the assist layer, api/translate.ts on Vercel). Off until the reader
 * turns it on in the lens's settings, which grants the optional host permission
 * for this one site; with it off, the lens sends nothing anywhere.
 */

/** The Odia app's site; the only place the lens may send text, and only for translation. */
export const ASSIST_ORIGIN = 'https://odia-transliteration-web.vercel.app';
export const ASSIST_PERMISSION = { origins: [`${ASSIST_ORIGIN}/*`] };

/** What the reader is told before turning translation on (settings page and the frame panel). */
export const TRANSLATE_NOTICE =
  'Translation is online. When you press Translate, the Odia text read inside the frame goes to the Odia app’s server ' +
  '(odia-transliteration-web.vercel.app), which asks a translation service (now Anthropic’s Claude) for an English ' +
  'translation. Nothing is sent before you press Translate, and nothing at all while translation is off. ' +
  'The translation is a machine translation and can be wrong.';
