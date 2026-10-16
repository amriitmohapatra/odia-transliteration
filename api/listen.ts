/**
 * POST /api/listen, body: the recording (Content-Type audio/webm, audio/ogg,
 * audio/mp4 …) → {"ok": true, "text": "<Odia>"} (voice typing; V3)
 *
 * Called by the Odia app's microphone button only after the user turns on
 * "Voice typing" in Settings. See api/_lib/speech.ts for the provider and the limits.
 */

import { LISTEN_MAX_BYTES, listen } from './_lib/speech.js';
import { allowedOrigin } from './_lib/translate.js';

const SITE = 'https://odia-transliteration-web.vercel.app';

function headers(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', vary: 'Origin' };
  if (origin && allowedOrigin(origin, SITE)) {
    h['access-control-allow-origin'] = origin;
    h['access-control-allow-methods'] = 'POST, OPTIONS';
    h['access-control-allow-headers'] = 'content-type';
  }
  return h;
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: headers(request.headers.get('origin')) });
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (!allowedOrigin(origin, SITE)) {
    return Response.json({ ok: false, error: 'Only the Odia app may call this.' }, { status: 403, headers: headers(null) });
  }
  // Refuse a long recording before reading it.
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > LISTEN_MAX_BYTES) {
    return Response.json({ ok: false, error: 'The recording is too long. Speak for 30 seconds or less.' }, { status: 413, headers: headers(origin) });
  }
  const audio = new Uint8Array(await request.arrayBuffer());
  const result = await listen(audio, request.headers.get('content-type'), process.env);
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status, headers: headers(origin) });
  return Response.json(result, { headers: headers(origin) });
}
