import { parseAnalyticsBatch } from '@/features/analytics';
import { ingestAnalyticsEvents } from '@/features/analytics/server/ingest';
import { getCurrentUser } from '@/features/auth/server/sessions';

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: 'payload_too_large' }, { status: 413 });
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return Response.json({ error: 'payload_too_large' }, { status: 413 });
  }
  const body = (() => {
    try {
      return JSON.parse(text || 'null') as unknown;
    } catch {
      return null;
    }
  })();
  const events = parseAnalyticsBatch(body);
  if (!events) return Response.json({ error: 'invalid_events' }, { status: 400 });

  const user = await getCurrentUser(request);
  await ingestAnalyticsEvents(events, user?.id ?? null);
  return new Response(null, { status: 202 });
}
