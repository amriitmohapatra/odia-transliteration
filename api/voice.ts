/**
 * GET /api/voice → {"speech": "elevenlabs" | "sarvam" | null, "agent": boolean}
 *
 * Says which voice provider the server has set up (D-15), so the app names the
 * right company under the page and shows Talk only when it can start. The app
 * asks only after the user turns on a voice switch. Holds no user data.
 */

import { voiceStatus } from './_lib/agent.js';

export function GET(): Response {
  return Response.json(voiceStatus(process.env), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60' },
  });
}
