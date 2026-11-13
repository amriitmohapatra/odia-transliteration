// Tests for the voice helper's token route (api/_lib/agent.ts), with ElevenLabs
// replaced by a fake fetch. No network.
import { describe, expect, it } from 'vitest';

import { agentReady, conversationToken, voiceStatus } from '../../api/_lib/agent.js';

const AGENT = 'agent_7101k5zvyjhmfg983brhmhkd98n6';

function fakeFetch(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply), { status });
  };
  return { f, calls };
}

describe('voice status', () => {
  it('reports the speech provider and whether Talk can start', () => {
    expect(voiceStatus({})).toEqual({ speech: null, agent: false });
    expect(voiceStatus({ SARVAM_API_KEY: 's' })).toEqual({ speech: 'sarvam', agent: false });
    expect(voiceStatus({ ELEVENLABS_API_KEY: 'e' })).toEqual({ speech: 'elevenlabs', agent: false });
    expect(voiceStatus({ ELEVENLABS_API_KEY: 'e', ELEVENLABS_AGENT_ID: AGENT })).toEqual({ speech: 'elevenlabs', agent: true });
  });

  it('needs a well-formed agent ID', () => {
    expect(agentReady({ ELEVENLABS_API_KEY: 'e', ELEVENLABS_AGENT_ID: 'my agent' })).toBe(false);
    expect(agentReady({ ELEVENLABS_AGENT_ID: AGENT })).toBe(false);
  });
});

describe('conversation token', () => {
  it('without the key or agent: not set up, and calls nothing', async () => {
    const { f, calls } = fakeFetch({});
    expect(await conversationToken({ ELEVENLABS_API_KEY: 'e' }, f)).toMatchObject({ ok: false, status: 503 });
    expect(calls).toHaveLength(0);
  });

  it('asks for a WebRTC token with the key in the header, and passes only the token on', async () => {
    const { f, calls } = fakeFetch({ token: 'tok123', conversation_id: 'conv_1' });
    const r = await conversationToken({ ELEVENLABS_API_KEY: 'el-secret', ELEVENLABS_AGENT_ID: AGENT }, f);
    expect(r).toEqual({ ok: true, token: 'tok123' });
    expect(calls[0]!.url).toBe(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${AGENT}`);
    expect((calls[0]!.init.headers as Record<string, string>)['xi-api-key']).toBe('el-secret');
  });

  it('says "busy" on 429 and gives only the status on other failures', async () => {
    const env = { ELEVENLABS_API_KEY: 'e', ELEVENLABS_AGENT_ID: AGENT };
    expect(await conversationToken(env, fakeFetch({}, 429).f)).toMatchObject({ ok: false, status: 429 });
    expect(await conversationToken(env, fakeFetch({ detail: 'secret detail' }, 401).f)).toEqual({ ok: false, status: 502, error: 'The voice service answered 401.' });
    expect(await conversationToken(env, fakeFetch({}).f)).toMatchObject({ ok: false, status: 502 });
  });
});

describe('agent definition (tools/assist/agent/odia-helper.json)', async () => {
  const { readFileSync } = await import('node:fs');
  // @ts-expect-error plain .mjs script, no types
  const { agentBody, checkCanonical } = await import('./agent/push.mjs');
  const config = JSON.parse(readFileSync(new URL('./agent/odia-helper.json', import.meta.url), 'utf8'));

  it('has only canonical Odia', () => {
    expect(() => checkCanonical(config)).not.toThrow();
    expect(() => checkCanonical({ a: ['ଓଡ଼ିଆ'] })).toThrow(/\$\.a\[0\]/);
  });

  it('defines the five client tools the app answers (Appv2/src/agent-tools.ts)', () => {
    expect(config.tools.map((t: { name: string }) => t.name).sort()).toEqual(['look_up', 'read_text', 'replace_text', 'spell', 'type_odia']);
    for (const t of config.tools) expect(t).toMatchObject({ type: 'client', expects_response: true });
  });

  it('keeps the privacy, auth and cost limits of plan/07-voice-agent.md', () => {
    const body = agentBody(config, ['t1']);
    expect(body.conversation_config.agent.prompt.tool_ids).toEqual(['t1']);
    expect(body.conversation_config.conversation.max_duration_seconds).toBeLessThanOrEqual(300);
    expect(body.platform_settings.auth).toMatchObject({ enable_auth: true, allowlist: [{ hostname: 'odia-transliteration-web.vercel.app' }] });
    expect(body.platform_settings.privacy).toMatchObject({ record_voice: false, retention_days: 0, delete_audio: true, delete_transcript_and_pii: true });
    expect(body.platform_settings.call_limits).toMatchObject({ bursting_enabled: false });
    expect(body.platform_settings.call_limits.daily_limit).toBeLessThanOrEqual(40);
    // The file itself is not changed by agentBody.
    expect(config.agent.conversation_config.agent.prompt.tool_ids).toBeUndefined();
  });
});
