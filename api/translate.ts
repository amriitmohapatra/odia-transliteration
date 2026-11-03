/**
 * POST /api/translate {"text": "<Odia>", "source"?: "ocr" | "typed"} → {"ok": true, "translation": "...", "provider", "model"}
 *
 * The assist layer's first function (V4.5). Called by the Odia Lens only after the
 * reader turns translation on (an optional host permission for this site), and by
 * the web app (source "typed") only after Settings > Translate online is on. See
 * api/_lib/translate.ts for the provider, the limits and the cache.
 */

import { allowedOrigin, textSource, translate } from './_lib/translate.js';

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
    return Response.json({ ok: false, error: 'Only the Odia Lens and the Odia app may call this.' }, { status: 403, headers: headers(null) });
  }
  let body: { text?: unknown; source?: unknown };
  try {
    body = (await request.json()) as { text?: unknown; source?: unknown };
  } catch {
    return Response.json({ ok: false, error: 'Send JSON.' }, { status: 400, headers: headers(origin) });
  }
  const result = await translate(body.text, process.env, fetch, textSource(body.source));
  if (result.ok === false) return Response.json({ ok: false, error: result.error }, { status: result.status, headers: headers(origin) });
  return Response.json(result, { headers: headers(origin) });
}
