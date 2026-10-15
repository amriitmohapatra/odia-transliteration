// Tests for the assist layer's /api/speak and /api/listen (api/_lib/speech.ts),
// with the Sarvam calls replaced by a fake fetch. No network.
import { describe, expect, it } from 'vitest';

import { LISTEN_MAX_BYTES, SPEAK_MAX_CHARS, listen, mediaType, speak } from '../../api/_lib/speech.js';

const ODISHA_PRECOMPOSED = 'ଓଡ଼ିଶା';
const ODISHA = 'ଓଡ଼ିଶା';
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]);
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));

function fakeFetch(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply), { status });
  };
  return { f, calls };
}

describe('speak', () => {
  it('without a key: says it is not set up, and calls nothing', async () => {
    const { f, calls } = fakeFetch({});
    const r = await speak(ODISHA, {}, f);
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(calls).toHaveLength(0);
  });

  it('refuses empty, too long, and non-Odia text before any call', async () => {
    const { f, calls } = fakeFetch({});
    const env = { SARVAM_API_KEY: 'k' };
    expect(await speak('  ', env, f)).toMatchObject({ ok: false, status: 400 });
    expect(await speak('hello', env, f)).toMatchObject({ ok: false, status: 400 });
    expect(await speak(ODISHA.repeat(SPEAK_MAX_CHARS), env, f)).toMatchObject({ ok: false, status: 413 });
    expect(await speak(42, env, f)).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('sends canonical Odia as od-IN MP3 with the key in the header, and caches the audio', async () => {
    const { f, calls } = fakeFetch({ request_id: 'x', audios: [b64(MP3)] });
    const env = { SARVAM_API_KEY: 'secret', SPEAK_SPEAKER: 'ritu' };
    const r = await speak(` ${ODISHA_PRECOMPOSED}  ${ODISHA} `, env, f);
    expect(r).toMatchObject({ ok: true, type: 'audio/mpeg', cached: false });
    expect(r.ok && Array.from(r.audio)).toEqual(Array.from(MP3));
    expect(calls[0]!.url).toBe('https://api.sarvam.ai/text-to-speech');
    expect((calls[0]!.init.headers as Record<string, string>)['api-subscription-key']).toBe('secret');
    const sent = JSON.parse(String(calls[0]!.init.body));
    expect(sent).toEqual({ text: `${ODISHA} ${ODISHA}`, language_code: 'od-IN', model: 'bulbul:v3', output_audio_codec: 'mp3', speaker: 'ritu' });
    const again = await speak(`${ODISHA} ${ODISHA}`, env, f);
    expect(again).toMatchObject({ ok: true, cached: true });
    expect(calls).toHaveLength(1);
  });

  it('reports a provider failure without the provider text', async () => {
    const { f } = fakeFetch({ error: { message: 'quota' } }, 429);
    expect(await speak('ଭଲ', { SARVAM_API_KEY: 'k' }, f)).toEqual({ ok: false, status: 502, error: 'The speech service answered 429.' });
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
    const env = { SARVAM_API_KEY: 'k' };
    expect(await listen(audio, 'text/plain', env, f)).toMatchObject({ ok: false, status: 415 });
    expect(await listen(new Uint8Array(), 'audio/webm', env, f)).toMatchObject({ ok: false, status: 400 });
    expect(await listen(new Uint8Array(LISTEN_MAX_BYTES + 1), 'audio/webm', env, f)).toMatchObject({ ok: false, status: 413 });
    expect(await listen(audio, 'audio/webm', {}, f)).toMatchObject({ ok: false, status: 503 });
    expect(calls).toHaveLength(0);
  });

  it('sends the recording as od-IN and gives canonical Odia text', async () => {
    const { f, calls } = fakeFetch({ request_id: 'x', transcript: ` ${ODISHA_PRECOMPOSED} `, language_code: 'od-IN' });
    const r = await listen(audio, 'audio/webm;codecs=opus', { SARVAM_API_KEY: 'k' }, f);
    expect(r).toEqual({ ok: true, text: ODISHA, model: 'saaras:v4' });
    expect(calls[0]!.url).toBe('https://api.sarvam.ai/speech-to-text');
    const form = calls[0]!.init.body as FormData;
    expect(form.get('language_code')).toBe('od-IN');
    expect(form.get('model')).toBe('saaras:v4');
    const file = form.get('file') as File;
    expect(file.name).toBe('speech.webm');
    expect(file.type).toBe('audio/webm');
    expect(file.size).toBe(audio.byteLength);
  });

  it('says so when no speech was heard', async () => {
    const { f } = fakeFetch({ transcript: '' });
    expect(await listen(audio, 'audio/ogg', { SARVAM_API_KEY: 'k' }, f)).toMatchObject({ ok: false, status: 422 });
  });
});
