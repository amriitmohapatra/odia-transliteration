// In English (V3, src/translate.ts): what is sent, how it is cut, how errors read.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TRANSLATE_MAX_CHARS, providerName, translatable, translateOnline } from '../src/translate.js';

const BHALA = 'ଭଲ'; // good
const DANDA = '।';

describe('translatable', () => {
  it('folds spaces and keeps line breaks', () => {
    expect(translatable(`  ${BHALA}   ${BHALA} \n\n  ${BHALA} `)).toEqual({ text: `${BHALA} ${BHALA}\n${BHALA}`, cut: false });
  });

  it('cuts a long text after the last sentence end in the second half', () => {
    const sentence = `${`${BHALA} `.repeat(40).trim()}${DANDA} `;
    const long = sentence.repeat(40);
    const { text, cut } = translatable(long);
    expect(cut).toBe(true);
    expect(text.length).toBeLessThanOrEqual(TRANSLATE_MAX_CHARS);
    expect(text.endsWith(DANDA)).toBe(true);
  });

  it('without a sentence end, cuts at a space', () => {
    const { text, cut } = translatable(`${BHALA} `.repeat(1500));
    expect(cut).toBe(true);
    expect(text.length).toBeLessThanOrEqual(TRANSLATE_MAX_CHARS);
    expect(text.endsWith(BHALA)).toBe(true);
  });
});

describe('providerName', () => {
  it('names the service for the note under the English', () => {
    expect(providerName('claude')).toBe('Claude (Anthropic)');
    expect(providerName('google')).toBe('Google Translate');
    expect(providerName(undefined)).toBe('an online service');
  });
});

describe('translateOnline', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the text as typed text and returns the English and the provider', async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ ok: true, translation: 'good', provider: 'claude' }), { status: 200 });
    });
    await expect(translateOnline(BHALA)).resolves.toEqual({ english: 'good', provider: 'claude' });
    expect(calls).toEqual([{ url: '/api/translate', body: { text: BHALA, source: 'typed' } }]);
  });

  it("passes on the server's message", async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: false, error: 'Translation is not set up on the server yet.' }), { status: 503 }));
    await expect(translateOnline(BHALA)).rejects.toThrow('not set up');
  });

  it('says it needs the internet when the request cannot go out', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(translateOnline(BHALA)).rejects.toThrow('needs the internet');
  });
});
