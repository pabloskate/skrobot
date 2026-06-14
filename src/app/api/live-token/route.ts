/**
 * POST /api/live-token — mints an ephemeral Gemini Live token so the browser
 * never sees the real key. Thin shell: the logic lives in the voice feature.
 *
 * GEMINI_API_KEY comes from (in order): the Cloudflare worker env (production
 * secret / .dev.vars in `npm run preview`) or process.env (.env.local in `next dev`).
 *
 * Abuse guards (the token itself can't be origin-restricted, so the mint is):
 * - same-origin check: browsers always send Origin on cross-site POSTs, so this
 *   stops other sites burning our quota. curl can spoof it, hence also:
 * - per-IP rate limit via the LIVE_TOKEN_RATE_LIMIT binding (wrangler.jsonc).
 *   Absent outside the Cloudflare runtime, so plain `next dev` skips it.
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { claimVoiceGame, getCurrentUser } from '@/features/auth/server/sessions';
import { mintLiveToken } from '@/features/voice/server/live-token';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  let env: CloudflareEnv | undefined;
  try {
    ({ env } = await getCloudflareContext({ async: true }));
  } catch {
    /* not running under the Cloudflare adapter (e.g. plain next dev) */
  }

  if (env?.LIVE_TOKEN_RATE_LIMIT) {
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await env.LIVE_TOKEN_RATE_LIMIT.limit({ key: ip });
    if (!success) {
      return Response.json({ error: 'Too many requests' }, { status: 429 });
    }
  }

  const apiKey = env?.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  const user = await getCurrentUser(request);
  if (!user) {
    return Response.json({ error: 'auth_required' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { gameId?: unknown };
  if (typeof body.gameId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(body.gameId)) {
    return Response.json({ error: 'invalid_game_id' }, { status: 400 });
  }

  const claim = await claimVoiceGame(user, body.gameId);
  if (claim === 'quota_exceeded') {
    return Response.json({ error: 'quota_exceeded' }, { status: 402 });
  }

  const token = await mintLiveToken(apiKey);
  return Response.json({ token });
}
