/**
 * POST /api/live-token — mints an ephemeral Gemini Live token so the browser
 * never sees the real key. Thin shell: the logic lives in the voice feature.
 *
 * GEMINI_API_KEY comes from (in order): the Cloudflare worker env (production
 * secret / .dev.vars in `npm run preview`) or process.env (.env.local in `next dev`).
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { mintLiveToken } from '@/features/voice/server/live-token';

export async function POST() {
  let apiKey: string | undefined;
  try {
    const { env } = await getCloudflareContext({ async: true });
    apiKey = env.GEMINI_API_KEY;
  } catch {
    /* not running under the Cloudflare adapter (e.g. plain next dev) */
  }
  apiKey ??= process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  const token = await mintLiveToken(apiKey);
  return Response.json({ token });
}
