/**
 * The voice helper ("Talk", V3.6; plan/07-voice-agent.md, decision D-15): an
 * ElevenLabs agent that talks with the user in Odia and English, and types into
 * the app's text box through client tools that run in the page.
 *
 * The browser never sees the key. It asks /api/agent for a conversation token
 * (valid 15 minutes, one conversation), then talks to ElevenLabs directly over
 * WebRTC. The agent itself is defined in tools/assist/agent/odia-helper.json and
 * pushed by tools/assist/agent/push.mjs; it requires a token (auth.enable_auth).
 *
 * Environment: ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID. Without either,
 * Talk reports "not set up" and nothing is called.
 *
 * API reference, read 2026-11-13: GET https://api.elevenlabs.io/v1/convai/
 * conversation/token?agent_id=… with header xi-api-key; answer {"token", "conversation_id"}.
 */

import { speechProvider, type SpeechEnv, type SpeechProvider } from './speech.js';

const ELEVENLABS = 'https://api.elevenlabs.io';

export interface AgentEnv extends SpeechEnv {
  ELEVENLABS_AGENT_ID?: string;
}

export type TokenResult = { ok: true; token: string } | { ok: false; status: number; error: string };

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** What the server has set up: shown to the user so the line under the page names the right company. */
export interface VoiceStatus {
  /** The provider behind Listen and Speak, or null. */
  speech: SpeechProvider | null;
  /** True when Talk can start. */
  agent: boolean;
}

export function voiceStatus(env: AgentEnv): VoiceStatus {
  return { speech: speechProvider(env), agent: agentReady(env) };
}

/** An agent ID as ElevenLabs writes it (agent_…), so a typo fails here, not as a vague 4xx later. */
export function agentReady(env: AgentEnv): boolean {
  return Boolean(env.ELEVENLABS_API_KEY) && /^agent_[A-Za-z0-9]{8,64}$/.test(env.ELEVENLABS_AGENT_ID ?? '');
}

/** A one-conversation WebRTC token for the agent. */
export async function conversationToken(env: AgentEnv, fetcher: Fetch = fetch): Promise<TokenResult> {
  if (!agentReady(env)) return { ok: false, status: 503, error: 'Talk is not set up on the server yet.' };
  const url = `${ELEVENLABS}/v1/convai/conversation/token?agent_id=${encodeURIComponent(env.ELEVENLABS_AGENT_ID as string)}`;
  const response = await fetcher(url, { method: 'GET', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY as string } });
  if (response.status === 429) return { ok: false, status: 429, error: 'Talk is busy or has reached today’s limit. Try again later.' };
  if (!response.ok) return { ok: false, status: 502, error: `The voice service answered ${response.status}.` };
  const data = (await response.json()) as { token?: unknown };
  if (typeof data.token !== 'string' || data.token.length === 0) return { ok: false, status: 502, error: 'The voice service gave no token.' };
  return { ok: true, token: data.token };
}
