/**
 * The assist layer's speech functions (V3; plan/05-v3-direction.md \u00a77, decisions
 * D-2 and D-3: voice through Sarvam AI):
 *
 *   speak:  Odia text  → MP3 audio  (read-aloud, for a reader who speaks Odia
 *           but cannot read the script; used only when the device has no Odia voice)
 *   listen: recorded speech → Odia text (voice typing, for a person who cannot type)
 *
 * Each is off in the app until the user turns it on in Settings; the engine (core/)
 * never calls the network. Keys stay on the server.
 *
 * Two providers (decision D-15, 2026-11-13: ElevenLabs added for the owner's
 * free month; plan/07-voice-agent.md). speechProvider() picks one:
 * SPEECH_PROVIDER ("elevenlabs" | "sarvam") if set, else ElevenLabs when
 * ELEVENLABS_API_KEY is set, else Sarvam when SARVAM_API_KEY is set.
 *
 *   Sarvam:     SARVAM_API_KEY. Optional SPEAK_MODEL (default bulbul:v3),
 *               SPEAK_SPEAKER (a Sarvam voice name), LISTEN_MODEL (default saaras:v4).
 *   ElevenLabs: ELEVENLABS_API_KEY. Optional ELEVENLABS_VOICE_ID (default: a
 *               premade multilingual voice), ELEVENLABS_TTS_MODEL (default
 *               eleven_v4), ELEVENLABS_STT_MODEL (default scribe_v3).
 *
 * Request formats from Sarvam's API reference, read 2026-10-15:
 * POST https://api.sarvam.ai/text-to-speech (JSON: text, language_code "od-IN",
 * model, speaker, output_audio_codec; answer: {"audios": [base64]}) and
 * POST https://api.sarvam.ai/speech-to-text (multipart: file, language_code, model;
 * answer: {"transcript"}), header api-subscription-key.
 *
 * ElevenLabs API reference, read 2026-11-13:
 * POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=…
 * (JSON: text, model_id, language_code "or"; answer: the audio bytes) and
 * POST https://api.elevenlabs.io/v1/speech-to-text (multipart: model_id, file,
 * language_code "ori", tag_audio_events; answer: {"text"}), header xi-api-key.
 */

import { canonical } from './translate.js';

const SARVAM = 'https://api.sarvam.ai';
const ODIA = 'od-IN';
const ELEVENLABS = 'https://api.elevenlabs.io';
/** ElevenLabs language codes: ISO 639-1 for speech, ISO 639-3 for transcription. */
const EL_ODIA_TTS = 'or';
const EL_ODIA_STT = 'ori';

/** Longest text read aloud (characters): a few sentences. It also caps the cost (D-4: US$20 a month). */
export const SPEAK_MAX_CHARS = 500;
/** Largest recording accepted (bytes): about 30 seconds of compressed speech, Sarvam's limit for one call. */
export const LISTEN_MAX_BYTES = 1_000_000;
/** Recording formats a browser's MediaRecorder makes, all accepted by Sarvam. */
export const LISTEN_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav'];

export const DEFAULT_SPEAK_MODEL = 'bulbul:v3';
export const DEFAULT_LISTEN_MODEL = 'saaras:v4';
/** ElevenLabs defaults: both models list Odia (docs, 2026-11-13). */
export const DEFAULT_EL_TTS_MODEL = 'eleven_v4';
export const DEFAULT_EL_STT_MODEL = 'scribe_v3';
/** The agents platform's default voice (a premade multilingual voice); ELEVENLABS_VOICE_ID picks another. */
export const DEFAULT_EL_VOICE = 'cjVigY5qzO86Huf0OWal';

export interface SpeechEnv {
  SPEECH_PROVIDER?: string;
  SARVAM_API_KEY?: string;
  SPEAK_MODEL?: string;
  SPEAK_SPEAKER?: string;
  LISTEN_MODEL?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
  ELEVENLABS_TTS_MODEL?: string;
  ELEVENLABS_STT_MODEL?: string;
}

export type SpeechProvider = 'elevenlabs' | 'sarvam';

/** The provider that speak() and listen() use, or null when neither is set up. */
export function speechProvider(env: SpeechEnv): SpeechProvider | null {
  const forced = (env.SPEECH_PROVIDER ?? '').trim().toLowerCase();
  if (forced === 'elevenlabs') return env.ELEVENLABS_API_KEY ? 'elevenlabs' : null;
  if (forced === 'sarvam') return env.SARVAM_API_KEY ? 'sarvam' : null;
  if (env.ELEVENLABS_API_KEY) return 'elevenlabs';
  if (env.SARVAM_API_KEY) return 'sarvam';
  return null;
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
  if (!/[\u0b01-\u0b77]/.test(text)) return { ok: false, status: 400, error: 'The text has no Odia letters.' };
  const provider = speechProvider(env);
  const model = provider === 'elevenlabs' ? env.ELEVENLABS_TTS_MODEL || DEFAULT_EL_TTS_MODEL : env.SPEAK_MODEL || DEFAULT_SPEAK_MODEL;
  const speaker = provider === 'elevenlabs' ? env.ELEVENLABS_VOICE_ID || DEFAULT_EL_VOICE : env.SPEAK_SPEAKER || '';
  const key = `${provider}\u0000${model}\u0000${speaker}\u0000${text}`;
  const hit = audioCache.get(key);
  if (hit) return { ok: true, audio: hit, type: 'audio/mpeg', cached: true };
  if (!provider) return { ok: false, status: 503, error: NOT_SET_UP };

  let audio: Uint8Array<ArrayBuffer>;
  if (provider === 'elevenlabs') {
    const response = await fetcher(`${ELEVENLABS}/v1/text-to-speech/${encodeURIComponent(speaker)}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'audio/mpeg', 'xi-api-key': env.ELEVENLABS_API_KEY as string },
      body: JSON.stringify({ text, model_id: model, language_code: EL_ODIA_TTS }),
    });
    if (!response.ok) return { ok: false, status: 502, error: `The speech service answered ${response.status}.` };
    audio = new Uint8Array(await response.arrayBuffer());
    if (audio.byteLength === 0) return { ok: false, status: 502, error: 'The speech service gave no audio.' };
  } else {
    const body: Record<string, unknown> = { text, language_code: ODIA, model, output_audio_codec: 'mp3' };
    if (speaker) body.speaker = speaker;
    const response = await fetcher(`${SARVAM}/text-to-speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'api-subscription-key': env.SARVAM_API_KEY as string },
      body: JSON.stringify(body),
    });
    if (!response.ok) return { ok: false, status: 502, error: `The speech service answered ${response.status}.` };
    const data = (await response.json()) as { audios?: string[] };
    const b64 = (data.audios ?? []).join('');
    if (!b64) return { ok: false, status: 502, error: 'The speech service gave no audio.' };
    try {
      audio = fromBase64(b64);
    } catch {
      return { ok: false, status: 502, error: 'The speech service gave broken audio.' };
    }
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
  const provider = speechProvider(env);
  if (!provider) return { ok: false, status: 503, error: NOT_SET_UP };

  const ext = type.split('/')[1]!.replace('x-', '').replace('mpeg', 'mp3').replace('mp4', 'm4a');
  const form = new FormData();
  form.append('file', new Blob([audio], { type }), `speech.${ext}`);
  let model: string;
  let response: Response;
  if (provider === 'elevenlabs') {
    model = env.ELEVENLABS_STT_MODEL || DEFAULT_EL_STT_MODEL;
    form.append('model_id', model);
    form.append('language_code', EL_ODIA_STT);
    form.append('tag_audio_events', 'false');
    response = await fetcher(`${ELEVENLABS}/v1/speech-to-text`, {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY as string },
      body: form,
    });
  } else {
    model = env.LISTEN_MODEL || DEFAULT_LISTEN_MODEL;
    form.append('language_code', ODIA);
    form.append('model', model);
    response = await fetcher(`${SARVAM}/speech-to-text`, {
      method: 'POST',
      headers: { 'api-subscription-key': env.SARVAM_API_KEY as string },
      body: form,
    });
  }
  if (!response.ok) return { ok: false, status: 502, error: `The speech service answered ${response.status}.` };
  const data = (await response.json()) as { transcript?: string; text?: string };
  const text = canonical(data.transcript ?? data.text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, status: 422, error: 'No speech was heard. Try again, closer to the microphone.' };
  return { ok: true, text, model };
}
