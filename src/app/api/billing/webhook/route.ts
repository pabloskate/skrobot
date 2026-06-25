import { getOptionalCloudflareEnv } from '@/platform/server/cloudflare';
import { handleWebhook } from '@/features/billing/server/stripe';

async function billingEnabled(): Promise<boolean> {
  const env = await getOptionalCloudflareEnv();
  return (env?.ENABLE_BILLING ?? process.env.ENABLE_BILLING) === 'true';
}

export async function POST(request: Request) {
  if (!(await billingEnabled())) {
    return Response.json({ error: 'billing_disabled' }, { status: 404 });
  }

  try {
    await handleWebhook(request);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Webhook failed' }, { status: 400 });
  }
}
