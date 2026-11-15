/**
 * The voice helper, browser side (Talk, V3.6; plan/07-voice-agent.md).
 *
 * Only after the user turns on Settings > "Voice helper": the page asks
 * /api/agent for a one-conversation token, then loads the ElevenLabs SDK (its
 * own chunk, so the app does not load it otherwise) and talks to the agent over
 * WebRTC. The agent's client tools (agent-tools.ts) run here.
 *
 * Not unit-tested (needs a microphone and the service): browser check
 * Appv2/eval/browser/talk-check.mjs replaces the SDK with a stand-in through
 * globalThis.__ODIA_TALK_SDK__, which nothing else sets.
 */

import type { ClientTool } from './agent-tools.js';

export type TalkMode = 'connecting' | 'listening' | 'speaking';

/** The subset of @elevenlabs/client used here, so a stand-in can replace it. */
export interface TalkSdk {
  Conversation: {
    startSession(options: {
      conversationToken: string;
      connectionType: 'webrtc';
      clientTools: Record<string, ClientTool>;
      onModeChange?: (p: { mode: 'speaking' | 'listening' }) => void;
      onMessage?: (p: { message: string; role?: string; source?: string }) => void;
      onDisconnect?: (details?: unknown) => void;
      onError?: (message: string) => void;
    }): Promise<{ endSession(): Promise<void> }>;
  };
}

async function sdk(): Promise<TalkSdk> {
  const stub = (globalThis as { __ODIA_TALK_SDK__?: TalkSdk }).__ODIA_TALK_SDK__;
  if (stub) return stub;
  return (await import('@elevenlabs/client')) as unknown as TalkSdk;
}

let session: { endSession(): Promise<void> } | null = null;
let ending = false;

export function talking(): boolean {
  return session !== null;
}

export interface TalkCallbacks {
  onMode(mode: TalkMode): void;
  /** A line the agent said (shown under the box so the user can read the Odia). */
  onAgentLine(text: string): void;
  /** The conversation ended: `error` is a message for the user, or null. */
  onEnd(error: string | null): void;
}

/** Start a conversation. Rejects with a message for the user. */
export async function startTalk(tools: Record<string, ClientTool>, cb: TalkCallbacks, endpoint = '/api/agent'): Promise<void> {
  if (session) return;
  cb.onMode('connecting');
  // Ask for the microphone first, so a refusal gets a clear message (and costs nothing).
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
  } catch {
    throw new Error('Talk needs the microphone. Allow it for this site, then press Talk again.');
  }
  let token: string;
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const data = (await response.json()) as { ok?: boolean; token?: string; error?: string };
    if (!response.ok || !data.token) throw new Error(data.error || `Talk could not start (${response.status}).`);
    token = data.token;
  } catch (error) {
    throw error instanceof Error && !(error instanceof TypeError) ? error : new Error('Talk could not reach the server. Check the connection.');
  }
  const { Conversation } = await sdk();
  ending = false;
  session = await Conversation.startSession({
    conversationToken: token,
    connectionType: 'webrtc',
    clientTools: tools,
    onModeChange: ({ mode }) => cb.onMode(mode),
    onMessage: ({ message, role, source }) => {
      if ((role ?? source) !== 'user' && message.trim()) cb.onAgentLine(message.trim());
    },
    onDisconnect: () => {
      session = null;
      cb.onEnd(null);
    },
    onError: (message) => {
      if (ending) return;
      session = null;
      cb.onEnd(message ? `Talk stopped: ${message}` : 'Talk stopped.');
    },
  });
}

/** End the conversation (the Talk button again, the switch off, or leaving the page). */
export async function stopTalk(): Promise<void> {
  const current = session;
  if (!current) return;
  ending = true;
  session = null;
  try {
    await current.endSession();
  } catch {
    /* already closed */
  }
}
