/**
 * POST /api/speak {"text": "<Odia>"} → audio/mpeg (read-aloud; V3)
 *
 * Called by the Odia app's "Listen" button only after the user turns on "Read
 * aloud online" in Settings, and only when the device has no Odia voice of its
 * own. See api/_lib/speech.ts for the provider, the limits and the cache.
 */

import { speak } from './_lib/speech.js';
import { allowedOrigin } from './_lib/translate.js';

const SITE = 'https://odia-transliteration-web.vercel.app';

function headers(origin: string | null, type = 'application/json; charset=utf-8'): Record<string, string> {
  const h: Record<string, string> = { 'content-type': type, 'cache-control': 'no-store', vary: 'Origin' };
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
    return Response.json({ ok: false, error: 'Only the Odia app and the Odia Lens may call this.' }, { status: 403, headers: headers(null) });
  }
  let body: { text?: unknown };
  try {
    body = (await request.json()) as { text?: unknown };
  } catch {
    return Response.json({ ok: false, error: 'Send JSON.' }, { status: 400, headers: headers(origin) });
  }
  const result = await speak(body.text, process.env);
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status, headers: headers(origin) });
  return new Response(result.audio, { headers: headers(origin, result.type) });
}
