// Tests for the assist layer's /api/speak and /api/listen (api/_lib/speech.ts):
// ElevenLabs only (D-15), with its calls replaced by a fake fetch. No network.
import { describe, expect, it } from 'vitest';

import { LISTEN_MAX_BYTES, SPEAK_MAX_CHARS, listen, mediaType, speak } from '../../api/_lib/speech.js';

const ODISHA_PRECOMPOSED = 'ଓଡ଼ିଶା';
const ODISHA = 'ଓଡ଼ିଶା';
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]);
const KEY = { ELEVENLABS_API_KEY: 'el-secret' };

function fakeFetch(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply), { status });
  };
  return { f, calls };
}

function audioFetch(status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(status === 200 ? MP3 : '{}', { status });
  };
  return { f, calls };
}

describe('speak', () => {
  it('without a key: says it is not set up, and calls nothing', async () => {
    const { f, calls } = audioFetch();
    expect(await speak(ODISHA, {}, f)).toMatchObject({ ok: false, status: 503 });
    expect(calls).toHaveLength(0);
  });

  it('refuses empty, too long, and non-Odia text before any call', async () => {
    const { f, calls } = audioFetch();
    expect(await speak('  ', KEY, f)).toMatchObject({ ok: false, status: 400 });
    expect(await speak('hello', KEY, f)).toMatchObject({ ok: false, status: 400 });
    expect(await speak(ODISHA.repeat(SPEAK_MAX_CHARS), KEY, f)).toMatchObject({ ok: false, status: 413 });
    expect(await speak(42, KEY, f)).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('sends canonical Odia to Eleven v4 as "or" with the key in the header, returns the MP3, and caches it', async () => {
    const { f, calls } = audioFetch();
    const env = { ...KEY, ELEVENLABS_VOICE_ID: 'voice1' };
    const r = await speak(` ${ODISHA_PRECOMPOSED}  ${ODISHA} `, env, f);
    expect(r).toMatchObject({ ok: true, type: 'audio/mpeg', cached: false });
    expect(r.ok && Array.from(r.audio)).toEqual(Array.from(MP3));
    expect(calls[0]!.url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice1?output_format=mp3_44100_64');
    expect((calls[0]!.init.headers as Record<string, string>)['xi-api-key']).toBe('el-secret');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ text: `${ODISHA} ${ODISHA}`, model_id: 'eleven_v4', language_code: 'or' });
    expect(await speak(`${ODISHA} ${ODISHA}`, env, f)).toMatchObject({ ok: true, cached: true });
    expect(calls).toHaveLength(1);
  });

  it('the cache keeps voices apart', async () => {
    const { f, calls } = audioFetch();
    await speak('ଘର', { ...KEY, ELEVENLABS_VOICE_ID: 'a' }, f);
    expect(await speak('ଘର', { ...KEY, ELEVENLABS_VOICE_ID: 'b' }, f)).toMatchObject({ ok: true, cached: false });
    expect(calls).toHaveLength(2);
  });

  it('reports a failure by status only', async () => {
    const { f } = audioFetch(401);
    expect(await speak('ନଦୀ', KEY, f)).toEqual({ ok: false, status: 502, error: 'The speech service answered 401.' });
  });
});

describe('listen', () => {
  const audio = new Uint8Array([26, 69, 223, 163, 1, 2, 3]);

  it('reads the media type without its parameters', () => {
    expect(mediaType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(mediaType(null)).toBe('');
  });

  it('refuses a wrong type, an empty or too long recording, and a missing key, before any call', async () => {
    const { f, calls } = fakeFetch({});
    expect(await listen(audio, 'text/plain', KEY, f)).toMatchObject({ ok: false, status: 415 });
    expect(await listen(new Uint8Array(), 'audio/webm', KEY, f)).toMatchObject({ ok: false, status: 400 });
    expect(await listen(new Uint8Array(LISTEN_MAX_BYTES + 1), 'audio/webm', KEY, f)).toMatchObject({ ok: false, status: 413 });
    expect(await listen(audio, 'audio/webm', {}, f)).toMatchObject({ ok: false, status: 503 });
    expect(calls).toHaveLength(0);
  });

  it('sends the recording to Scribe v3 as "ori" without audio-event tags, and gives canonical Odia', async () => {
    const { f, calls } = fakeFetch({ language_code: 'ori', text: ` ${ODISHA_PRECOMPOSED} ` });
    const r = await listen(audio, 'audio/webm;codecs=opus', KEY, f);
    expect(r).toEqual({ ok: true, text: ODISHA, model: 'scribe_v3' });
    expect(calls[0]!.url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect((calls[0]!.init.headers as Record<string, string>)['xi-api-key']).toBe('el-secret');
    const form = calls[0]!.init.body as FormData;
    expect(form.get('model_id')).toBe('scribe_v3');
    expect(form.get('language_code')).toBe('ori');
    expect(form.get('tag_audio_events')).toBe('false');
    const file = form.get('file') as File;
    expect(file.name).toBe('speech.webm');
    expect(file.type).toBe('audio/webm');
    expect(file.size).toBe(audio.byteLength);
    const m4a = fakeFetch({ text: ODISHA });
    await listen(audio, 'audio/mp4', KEY, m4a.f);
    expect(((m4a.calls[0]!.init.body as FormData).get('file') as File).name).toBe('speech.m4a');
  });

  it('says so when no speech was heard, and reports a failure by status only', async () => {
    expect(await listen(audio, 'audio/ogg', KEY, fakeFetch({ text: '' }).f)).toMatchObject({ ok: false, status: 422 });
    expect(await listen(audio, 'audio/ogg', KEY, fakeFetch({ detail: 'x' }, 429).f)).toEqual({ ok: false, status: 502, error: 'The speech service answered 429.' });
  });
});
