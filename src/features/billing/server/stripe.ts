import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/shared/db';

interface CheckoutUser {
  id: string;
  email: string;
  stripe_customer_id: string | null;
}

interface StripeCheckoutSession {
  id: string;
  url?: string;
  customer?: string;
  client_reference_id?: string;
  metadata?: { user_id?: string };
}

interface StripeSubscription {
  customer?: string;
  status?: string;
}

async function getEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}

function requireEnv(env: CloudflareEnv, key: keyof CloudflareEnv): string {
  const value = env[key];
  if (typeof value !== 'string' || !value) throw new Error(`${key} is not configured`);
  return value;
}

function baseUrl(request: Request): string {
  return new URL(request.url).origin;
}

export async function createCheckoutSession(request: Request, user: CheckoutUser): Promise<string> {
  const env = await getEnv();
  const secretKey = requireEnv(env, 'STRIPE_SECRET_KEY');
  const priceId = requireEnv(env, 'STRIPE_PRICE_ID');
  const origin = baseUrl(request);

  const form = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: `${origin}/?billing=success`,
    cancel_url: `${origin}/?billing=cancelled`,
    client_reference_id: user.id,
    'metadata[user_id]': user.id,
    'subscription_data[metadata][user_id]': user.id,
  });

  if (user.stripe_customer_id) form.set('customer', user.stripe_customer_id);
  else form.set('customer_email', user.email);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });

  const body = (await res.json()) as StripeCheckoutSession & { error?: { message?: string } };
  if (!res.ok || !body.url) throw new Error(body.error?.message ?? 'Could not create Stripe checkout session');
  return body.url;
}

function parseStripeSignature(header: string | null): { timestamp: string; signatures: string[] } {
  const parts = new Map<string, string[]>();
  for (const item of header?.split(',') ?? []) {
    const [key, value] = item.split('=');
    if (!key || !value) continue;
    parts.set(key, [...(parts.get(key) ?? []), value]);
  }
  return { timestamp: parts.get('t')?.[0] ?? '', signatures: parts.get('v1') ?? [] };
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyWebhook(request: Request, payload: string): Promise<void> {
  const env = await getEnv();
  const secret = requireEnv(env, 'STRIPE_WEBHOOK_SECRET');
  const parsed = parseStripeSignature(request.headers.get('stripe-signature'));
  const timestamp = Number(parsed.timestamp);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 5 * 60) throw new Error('Invalid Stripe signature timestamp');

  const expected = await hmacHex(secret, `${parsed.timestamp}.${payload}`);
  if (!parsed.signatures.some((signature) => constantTimeEqual(signature, expected))) throw new Error('Invalid Stripe signature');
}

async function setTierByUserId(userId: string, tier: 'free' | 'paid', customerId?: string): Promise<void> {
  const db = await getDb();
  if (customerId) {
    await db.prepare('UPDATE users SET tier = ?, stripe_customer_id = ? WHERE id = ?').bind(tier, customerId, userId).run();
  } else {
    await db.prepare('UPDATE users SET tier = ? WHERE id = ?').bind(tier, userId).run();
  }
}

async function setTierByCustomer(customerId: string, tier: 'free' | 'paid'): Promise<void> {
  const db = await getDb();
  await db.prepare('UPDATE users SET tier = ? WHERE stripe_customer_id = ?').bind(tier, customerId).run();
}

export async function handleWebhook(request: Request): Promise<void> {
  const payload = await request.text();
  await verifyWebhook(request, payload);

  const event = JSON.parse(payload) as { type?: string; data?: { object?: unknown } };
  const object = event.data?.object;

  if (event.type === 'checkout.session.completed') {
    const session = object as StripeCheckoutSession;
    const userId = session.metadata?.user_id ?? session.client_reference_id;
    if (userId) await setTierByUserId(userId, 'paid', typeof session.customer === 'string' ? session.customer : undefined);
    return;
  }

  if (event.type?.startsWith('customer.subscription.')) {
    const subscription = object as StripeSubscription;
    if (!subscription.customer) return;
    const paid = subscription.status === 'active' || subscription.status === 'trialing';
    await setTierByCustomer(subscription.customer, paid ? 'paid' : 'free');
  }
}
