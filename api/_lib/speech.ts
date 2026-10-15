/**
 * The assist layer's speech functions (V3; plan/05-v3-direction.md §7, decisions
 * D-2 and D-3: voice through Sarvam AI):
 *
 *   speak:  Odia text  → MP3 audio  (read-aloud, for a reader who speaks Odia
 *           but cannot read the script; used only when the device has no Odia voice)
 *   listen: recorded speech → Odia text (voice typing, for a person who cannot type)
 *
 * Each is off in the app until the user turns it on in Settings; the engine (core/)
 * never calls the network. The key stays on the server: SARVAM_API_KEY. Optional:
 * SPEAK_MODEL (default bulbul:v3), SPEAK_SPEAKER (a Sarvam voice name; default:
 * Sarvam's own), LISTEN_MODEL (default saaras:v4).
 *
 * Request formats from Sarvam's API reference, read 2026-10-15:
 * POST https://api.sarvam.ai/text-to-speech (JSON: text, language_code "od-IN",
 * model, speaker, output_audio_codec; answer: {"audios": [base64]}) and
 * POST https://api.sarvam.ai/speech-to-text (multipart: file, language_code, model;
 * answer: {"transcript"}), header api-subscription-key.
 */

import { canonical } from './translate.js';

const SARVAM = 'https://api.sarvam.ai';
const ODIA = 'od-IN';

/** Longest text read aloud (characters): a few sentences. It also caps the cost (D-4: US$20 a month). */
export const SPEAK_MAX_CHARS = 500;
/** Largest recording accepted (bytes): about 30 seconds of compressed speech, Sarvam's limit for one call. */
export const LISTEN_MAX_BYTES = 1_000_000;
/** Recording formats a browser's MediaRecorder makes, all accepted by Sarvam. */
export const LISTEN_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav'];

export const DEFAULT_SPEAK_MODEL = 'bulbul:v3';
export const DEFAULT_LISTEN_MODEL = 'saaras:v4';

export interface SpeechEnv {
  SARVAM_API_KEY?: string;
  SPEAK_MODEL?: string;
  SPEAK_SPEAKER?: string;
  LISTEN_MODEL?: string;
}

export type SpeakResult =
  | { ok: true; audio: Uint8Array<ArrayBuffer>; type: 'audio/mpeg'; cached: boolean }
  | { ok: false; status: number; error: string };

export type ListenResult = { ok: true; text: string; model: string } | { ok: false; status: number; error: string };

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const NOT_SET_UP = 'Speech is not set up on the server yet.';

/** Recently made audio by text: the same word read twice costs once. About 30 KB each. */
const audioCache = new Map<string, Uint8Array<ArrayBuffer>>();
const AUDIO_CACHE_SIZE = 200;

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Odia text (with spaces, punctuation, Latin words and numbers if any) to MP3 speech. */
export async function speak(raw: unknown, env: SpeechEnv, fetcher: Fetch = fetch): Promise<SpeakResult> {
  if (typeof raw !== 'string') return { ok: false, status: 400, error: 'Send {"text": "..."} with Odia text.' };
  const text = canonical(raw).replace(/\s+/g, ' ').trim();
  if (text.length === 0) return { ok: false, status: 400, error: 'The text is empty.' };
  if (text.length > SPEAK_MAX_CHARS) return { ok: false, status: 413, error: `The text is longer than ${SPEAK_MAX_CHARS} characters.` };
  if (!/[ଁ-୷]/.test(text)) return { ok: false, status: 400, error: 'The text has no Odia letters.' };
  const model = env.SPEAK_MODEL || DEFAULT_SPEAK_MODEL;
  const speaker = env.SPEAK_SPEAKER || '';
  const key = `${model}\u0000${speaker}\u0000${text}`;
  const hit = audioCache.get(key);
  if (hit) return { ok: true, audio: hit, type: 'audio/mpeg', cached: true };
  if (!env.SARVAM_API_KEY) return { ok: false, status: 503, error: NOT_SET_UP };

  const body: Record<string, unknown> = { text, language_code: ODIA, model, output_audio_codec: 'mp3' };
  if (speaker) body.speaker = speaker;
  const response = await fetcher(`${SARVAM}/text-to-speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-subscription-key': env.SARVAM_API_KEY },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { ok: false, status: 502, error: `The speech service answered ${response.status}.` };
  const data = (await response.json()) as { audios?: string[] };
  const b64 = (data.audios ?? []).join('');
  if (!b64) return { ok: false, status: 502, error: 'The speech service gave no audio.' };
  let audio: Uint8Array<ArrayBuffer>;
  try {
    audio = fromBase64(b64);
  } catch {
    return { ok: false, status: 502, error: 'The speech service gave broken audio.' };
  }
  audioCache.set(key, audio);
  if (audioCache.size > AUDIO_CACHE_SIZE) audioCache.delete(audioCache.keys().next().value as string);
  return { ok: true, audio, type: 'audio/mpeg', cached: false };
}

/** The base media type of a Content-Type header ("audio/webm;codecs=opus" → "audio/webm"). */
export function mediaType(header: string | null): string {
  return (header ?? '').split(';')[0]!.trim().toLowerCase();
}

/** Recorded Odia speech to Odia text (canonical). */
export async function listen(audio: Uint8Array<ArrayBuffer>, contentType: string | null, env: SpeechEnv, fetcher: Fetch = fetch): Promise<ListenResult> {
  const type = mediaType(contentType);
  if (!LISTEN_TYPES.includes(type)) return { ok: false, status: 415, error: `Send a recording (${LISTEN_TYPES.join(', ')}).` };
  if (audio.byteLength === 0) return { ok: false, status: 400, error: 'The recording is empty.' };
  if (audio.byteLength > LISTEN_MAX_BYTES) return { ok: false, status: 413, error: 'The recording is too long. Speak for 30 seconds or less.' };
  if (!env.SARVAM_API_KEY) return { ok: false, status: 503, error: NOT_SET_UP };

  const model = env.LISTEN_MODEL || DEFAULT_LISTEN_MODEL;
  const ext = type.split('/')[1]!.replace('x-', '').replace('mpeg', 'mp3').replace('mp4', 'm4a');
  const form = new FormData();
  form.append('file', new Blob([audio], { type }), `speech.${ext}`);
  form.append('language_code', ODIA);
  form.append('model', model);
  const response = await fetcher(`${SARVAM}/speech-to-text`, {
    method: 'POST',
    headers: { 'api-subscription-key': env.SARVAM_API_KEY },
    body: form,
  });
  if (!response.ok) return { ok: false, status: 502, error: `The speech service answered ${response.status}.` };
  const data = (await response.json()) as { transcript?: string };
  const text = canonical(data.transcript ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, status: 422, error: 'No speech was heard. Try again, closer to the microphone.' };
  return { ok: true, text, model };
}
