/**
 * Read-aloud and voice typing (V3; plan/05-v3-direction.md §7).
 *
 * Read-aloud uses the device's own Odia voice when it has one (no network). If it
 * has none, and only after the user turns on "Read aloud online" in Settings,
 * the text goes to /api/speak (Sarvam AI, decision D-3). Voice typing records up
 * to 30 seconds and sends the recording to /api/listen, again only after the user
 * turns it on. Nothing is sent while the switches are off (decision D-2).
 */

/** Longest text read in one go: the server's limit (api/_lib/speech.ts SPEAK_MAX_CHARS). */
export const SPEAK_MAX_CHARS = 500;
/** Longest recording: the server's limit is about 30 seconds. */
export const LISTEN_MAX_MS = 30_000;

/** A voice for Odia: language "or" (ISO 639-1), "ory" or "od" (Sarvam's code), any region. */
export function pickOdiaVoice(voices: readonly Pick<SpeechSynthesisVoice, 'lang'>[]): number {
  return voices.findIndex((v) => /^(or|ory|od)([-_]|$)/i.test(v.lang));
}

export type SpeakRoute = 'device' | 'online' | 'none';

/** Where speech comes from: the device first (free, offline), then the online service if switched on. */
export function speakRoute(hasDeviceVoice: boolean, onlineOn: boolean): SpeakRoute {
  if (hasDeviceVoice) return 'device';
  return onlineOn ? 'online' : 'none';
}

/** The text to read: at most SPEAK_MAX_CHARS, cut at a space; `cut` says whether some was left out. */
export function speakable(text: string): { text: string; cut: boolean } {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= SPEAK_MAX_CHARS) return { text: t, cut: false };
  const head = t.slice(0, SPEAK_MAX_CHARS);
  const space = head.lastIndexOf(' ');
  return { text: (space > SPEAK_MAX_CHARS / 2 ? head.slice(0, space) : head).trim(), cut: true };
}

/** Recording formats in the order tried; Safari makes audio/mp4, Chrome and Firefox audio/webm or audio/ogg. */
const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

export function recordingType(supported: (type: string) => boolean): string | null {
  return RECORDING_TYPES.find((t) => supported(t)) ?? null;
}

/* ------------------------------------------------------------------ *
 * Browser side (not unit-tested; Appv2/eval/browser/speech-check.mjs)
 * ------------------------------------------------------------------ */

function deviceVoices(): SpeechSynthesisVoice[] {
  return typeof speechSynthesis === 'undefined' ? [] : speechSynthesis.getVoices();
}

export function hasDeviceVoice(): boolean {
  return pickOdiaVoice(deviceVoices()) >= 0;
}

let playing: HTMLAudioElement | null = null;

/** Stop anything being read aloud. */
export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  if (playing) {
    playing.pause();
    playing = null;
  }
}

/** Read `text` aloud by `route`. Resolves when it starts; rejects with a message for the user. */
export async function speak(text: string, route: SpeakRoute, endpoint = '/api/speak'): Promise<void> {
  stopSpeaking();
  if (route === 'device') {
    const voices = deviceVoices();
    const i = pickOdiaVoice(voices);
    const u = new SpeechSynthesisUtterance(text);
    if (i >= 0) {
      u.voice = voices[i] as SpeechSynthesisVoice;
      u.lang = u.voice.lang;
    }
    speechSynthesis.speak(u);
    return;
  }
  if (route !== 'online') throw new Error('No Odia voice on this device.');
  let response: Response;
  try {
    response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
  } catch {
    throw new Error('Read-aloud needs the internet. Check the connection and try again.');
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Read-aloud failed (${response.status}).`);
  }
  const url = URL.createObjectURL(await response.blob());
  const audio = new Audio(url);
  audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
  playing = audio;
  await audio.play();
}

export interface Recording {
  /** Stop and send; resolves with the Odia text. */
  finish(): Promise<string>;
  /** Stop and send nothing. */
  cancel(): void;
}

/** Start recording from the microphone (the browser asks the user first). Stops by itself after LISTEN_MAX_MS. */
export async function record(onAutoStop: () => void, endpoint = '/api/listen'): Promise<Recording> {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot record. Try Chrome, Edge or Safari.');
  }
  const type = recordingType((t) => MediaRecorder.isTypeSupported(t));
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new Error('The microphone is blocked. Allow it for this site, then try again.');
  }
  const recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  });
  const stopped = new Promise<void>((resolve) => recorder.addEventListener('stop', () => resolve(), { once: true }));
  const release = (): void => stream.getTracks().forEach((t) => t.stop());
  recorder.start();
  const timer = setTimeout(() => {
    if (recorder.state === 'recording') {
      recorder.stop();
      onAutoStop();
    }
  }, LISTEN_MAX_MS);

  return {
    async finish(): Promise<string> {
      clearTimeout(timer);
      if (recorder.state === 'recording') recorder.stop();
      await stopped;
      release();
      const blob = new Blob(chunks, { type: (recorder.mimeType || type || 'audio/webm').split(';')[0] });
      let response: Response;
      try {
        response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
      } catch {
        throw new Error('Voice typing needs the internet. Check the connection and try again.');
      }
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; text?: string; error?: string };
      if (!response.ok || !data.ok || !data.text) throw new Error(data.error ?? `Voice typing failed (${response.status}).`);
      return data.text;
    },
    cancel(): void {
      clearTimeout(timer);
      if (recorder.state === 'recording') recorder.stop();
      release();
    },
  };
}
