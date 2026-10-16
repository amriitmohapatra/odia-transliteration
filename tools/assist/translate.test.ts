// Tests for the assist layer's /api/translate (api/_lib/translate.ts), with the
// provider calls replaced by a fake fetch. No network.
import { describe, expect, it } from 'vitest';

import { canonical as coreCanonical } from '../../core/src/normalize.js';
import { MAX_CHARS, allowedOrigin, canonical, translate } from '../../api/_lib/translate.js';

const ODISHA_PRECOMPOSED = '\u0b13\u0b5c\u0b3f\u0b36\u0b3e';
const ODISHA = '\u0b13\u0b21\u0b3c\u0b3f\u0b36\u0b3e';

function fakeFetch(reply: unknown, status = 200) {
  const calls: { url: string; body: any; headers: any }[] = [];
  const f = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers });
    return new Response(JSON.stringify(reply), { status });
  };
  return { f, calls };
}

describe('canonical (repeated in the function)', () => {
  it('matches core canonical() on the nukta vectors', () => {
    for (const s of [ODISHA_PRECOMPOSED, ODISHA, '\u0b22\u0b3c', '\u0b5d', '\u0b47\u0b3e', '\u0b5f', 'abc']) {
      expect(canonical(s)).toBe(coreCanonical(s));
    }
  });
});

describe('allowedOrigin', () => {
  it('lets the extension and the site in, nothing else', () => {
    expect(allowedOrigin('chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'https://x.app')).toBe(true);
    expect(allowedOrigin('https://x.app', 'https://x.app')).toBe(true);
    expect(allowedOrigin('https://evil.example', 'https://x.app')).toBe(false);
    expect(allowedOrigin(null, 'https://x.app')).toBe(false);
  });
});

describe('translate', () => {
  it('without a key: says it is not set up, and calls nothing', async () => {
    const { f, calls } = fakeFetch({});
    const r = await translate(ODISHA, {}, f);
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(calls).toHaveLength(0);
  });

  it('Claude: sends canonical text with the key, returns the text, caches the answer', async () => {
    const { f, calls } = fakeFetch({ content: [{ type: 'text', text: 'Odisha' }] });
    const env = { ANTHROPIC_API_KEY: 'k1' };
    const r = await translate(`  ${ODISHA_PRECOMPOSED} `, env, f);
    expect(r).toMatchObject({ ok: true, translation: 'Odisha', provider: 'claude', model: 'claude-haiku-5-5', cached: false });
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0]?.headers['x-api-key']).toBe('k1');
    expect(calls[0]?.body.messages[0].content).toBe(ODISHA);
    const again = await translate(ODISHA, env, f);
    expect(again).toMatchObject({ ok: true, cached: true });
    expect(calls).toHaveLength(1);
  });

  it('Google when chosen', async () => {
    const { f, calls } = fakeFetch({ data: { translations: [{ translatedText: 'state' }] } });
    const r = await translate('\u0b30\u0b3e\u0b1c\u0b4d\u0b5f', { TRANSLATE_PROVIDER: 'google', GOOGLE_TRANSLATE_KEY: 'g' }, f);
    expect(r).toMatchObject({ ok: true, translation: 'state', provider: 'google' });
    expect(calls[0]?.body).toMatchObject({ source: 'or', target: 'en' });
  });

  it('refuses empty, too long, non-Odia and non-text input', async () => {
    const { f, calls } = fakeFetch({});
    const env = { ANTHROPIC_API_KEY: 'k' };
    expect(await translate('', env, f)).toMatchObject({ ok: false, status: 400 });
    expect(await translate('hello', env, f)).toMatchObject({ ok: false, status: 400 });
    expect(await translate(42, env, f)).toMatchObject({ ok: false, status: 400 });
    expect(await translate('\u0b15'.repeat(MAX_CHARS + 1), env, f)).toMatchObject({ ok: false, status: 413 });
    expect(calls).toHaveLength(0);
  });

  it('a provider error is reported, not cached', async () => {
    const { f } = fakeFetch({}, 529);
    expect(await translate('\u0b2c\u0b3e\u0b1c\u0b3e\u0b30', { ANTHROPIC_API_KEY: 'k' }, f)).toMatchObject({ ok: false, status: 502 });
  });
});
