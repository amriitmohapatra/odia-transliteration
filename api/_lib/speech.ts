/**
 * The assist layer's speech functions (V3; plan/05-v3-direction.md §7,
 * plan/07-voice-agent.md). Provider: ElevenLabs only (owner, D-15, 2026-11-13:
 * "We are not going to use Sarvam AI at all").
 *
 *   speak:  Odia text  → MP3 audio  (read-aloud, for a reader who speaks Odia
 *           but cannot read the script; used only when the device has no Odia voice)
 *   listen: recorded speech → Odia text (voice typing, for a person who cannot type)
 *
 * Each is off in the app until the user turns it on in Settings; the engine (core/)
 * never calls the network. The key stays on the server: ELEVENLABS_API_KEY.
 * Optional: ELEVENLABS_VOICE_ID (default: a premade multilingual voice),
 * ELEVENLABS_TTS_MODEL (default eleven_v4), ELEVENLABS_STT_MODEL (default scribe_v3).
 *
 * ElevenLabs API reference, read 2026-11-13:
 * POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=…
 * (JSON: text, model_id, language_code "or"; answer: the audio bytes) and
 * POST https://api.elevenlabs.io/v1/speech-to-text (multipart: model_id, file,
 * language_code "ori", tag_audio_events; answer: {"text"}), header xi-api-key.
 */

import { canonical } from './translate.js';

const ELEVENLABS = 'https://api.elevenlabs.io';
/** ElevenLabs language codes: ISO 639-1 for speech, ISO 639-3 for transcription. */
const ODIA_TTS = 'or';
const ODIA_STT = 'ori';

/** Longest text read aloud (characters): a few sentences. It also caps the cost. */
export const SPEAK_MAX_CHARS = 500;
/** Largest recording accepted (bytes): about 30 seconds of compressed speech. */
export const LISTEN_MAX_BYTES = 1_000_000;
/** Recording formats a browser's MediaRecorder makes. */
export const LISTEN_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav'];

/** Both models list Odia (docs, 2026-11-13). */
export const DEFAULT_TTS_MODEL = 'eleven_v4';
export const DEFAULT_STT_MODEL = 'scribe_v3';
/** The agents platform's default voice (a premade multilingual voice); ELEVENLABS_VOICE_ID picks another. */
export const DEFAULT_VOICE = 'cjVigY5qzO86Huf0OWal';

export interface SpeechEnv {
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
  ELEVENLABS_TTS_MODEL?: string;
  ELEVENLABS_STT_MODEL?: string;
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

/** Odia text (with spaces, punctuation, Latin words and numbers if any) to MP3 speech. */
export async function speak(raw: unknown, env: SpeechEnv, fetcher: Fetch = fetch): Promise<SpeakResult> {
  if (typeof raw !== 'string') return { ok: false, status: 400, error: 'Send {"text": "..."} with Odia text.' };
  const text = canonical(raw).replace(/\s+/g, ' ').trim();
  if (text.length === 0) return { ok: false, status: 400, error: 'The text is empty.' };
  if (text.length > SPEAK_MAX_CHARS) return { ok: false, status: 413, error: `The text is longer than ${SPEAK_MAX_CHARS} characters.` };
  if (!/[ଁ-୷]/.test(text)) return { ok: false, status: 400, error: 'The text has no Odia letters.' };
  const model = env.ELEVENLABS_TTS_MODEL || DEFAULT_TTS_MODEL;
  const voice = env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const key = `${model}\u0000${voice}\u0000${text}`;
  const hit = audioCache.get(key);
  if (hit) return { ok: true, audio: hit, type: 'audio/mpeg', cached: true };
  if (!env.ELEVENLABS_API_KEY) return { ok: false, status: 503, error: NOT_SET_UP };

  const response = await fetcher(`${ELEVENLABS}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'audio/mpeg', 'xi-api-key': env.ELEVENLABS_API_KEY },
    body: JSON.stringify({ text, model_id: model, language_code: ODIA_TTS }),
  });
  if (!response.ok) return { ok: false, status: 502, error: `The speech service answered ${response.status}.` };
  const audio = new Uint8Array(await response.arrayBuffer());
  if (audio.byteLength === 0) return { ok: false, status: 502, error: 'The speech service gave no audio.' };
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
  if (!env.ELEVENLABS_API_KEY) return { ok: false, status: 503, error: NOT_SET_UP };

  const model = env.ELEVENLABS_STT_MODEL || DEFAULT_STT_MODEL;
  const ext = type.split('/')[1]!.replace('x-', '').replace('mpeg', 'mp3').replace('mp4', 'm4a');
  const form = new FormData();
  form.append('file', new Blob([audio], { type }), `speech.${ext}`);
  form.append('model_id', model);
  form.append('language_code', ODIA_STT);
  form.append('tag_audio_events', 'false');
  const response = await fetcher(`${ELEVENLABS}/v1/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
    body: form,
  });
  if (!response.ok) return { ok: false, status: 502, error: `The speech service answered ${response.status}.` };
  const data = (await response.json()) as { text?: string };
  const text = canonical(data.text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, status: 422, error: 'No speech was heard. Try again, closer to the microphone.' };
  return { ok: true, text, model };
}
