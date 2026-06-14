import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getCurrentUser } from '@/features/auth/server/sessions';
import { createCheckoutSession } from '@/features/billing/server/stripe';

async function billingEnabled(): Promise<boolean> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env.ENABLE_BILLING === 'true';
  } catch {
    return process.env.ENABLE_BILLING === 'true';
  }
}

export async function POST(request: Request) {
  if (!(await billingEnabled())) {
    return Response.json({ error: 'billing_disabled' }, { status: 404 });
  }

  const user = await getCurrentUser(request);
  if (!user) return Response.json({ error: 'auth_required' }, { status: 401 });

  try {
    return Response.json({ url: await createCheckoutSession(request, user) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not start checkout' }, { status: 500 });
  }
}
