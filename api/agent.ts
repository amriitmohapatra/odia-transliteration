/**
 * POST /api/agent → {"ok": true, "token": "…"} (the voice helper "Talk"; V3.6)
 *
 * Called by the Odia app's Talk button only after the user turns on "Voice
 * helper" in Settings. Only the adult site may call (the kids edition has no
 * online features). See api/_lib/agent.ts.
 */

import { conversationToken } from './_lib/agent.js';

const SITE = 'https://odia-transliteration-web.vercel.app';

function headers(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', vary: 'Origin' };
  if (origin === SITE) {
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
  if (origin !== SITE) {
    return Response.json({ ok: false, error: 'Only the Odia app may call this.' }, { status: 403, headers: headers(null) });
  }
  const result = await conversationToken(process.env);
  if (result.ok === false) return Response.json({ ok: false, error: result.error }, { status: result.status, headers: headers(origin) });
  return Response.json(result, { headers: headers(origin) });
}
