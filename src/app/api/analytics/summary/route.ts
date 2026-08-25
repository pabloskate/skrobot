import { analyticsRangeDays } from '@/features/analytics';
import { getAnalyticsSummary } from '@/features/analytics/server/summary';
import { getCurrentUser } from '@/features/auth/server/sessions';
import { getOptionalCloudflareEnv } from '@/platform/server/cloudflare';

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return json({ error: 'auth_required' }, 401);

  const env = await getOptionalCloudflareEnv();
  const adminEmail = env?.ANALYTICS_ADMIN_EMAIL ?? process.env.ANALYTICS_ADMIN_EMAIL;
  if (!adminEmail) return json({ error: 'admin_not_configured' }, 503);
  if (user.email.toLowerCase() !== adminEmail.trim().toLowerCase()) {
    return json({ error: 'forbidden' }, 403);
  }

  const days = analyticsRangeDays(new URL(request.url).searchParams.get('days'));
  return json(await getAnalyticsSummary(days));
}
