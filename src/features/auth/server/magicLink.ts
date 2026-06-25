import { getDb } from '@/platform/server/db';
import { getOptionalCloudflareEnv } from '@/platform/server/cloudflare';
import { createSessionCookie, randomToken, sha256Hex, type UserRow } from './sessions';

const TOKEN_TTL_MINUTES = 15;

export interface RequestLinkResult {
  ok: true;
  devLink?: string;
}

export interface RequestLinkOptions {
  nativeApp?: boolean;
}

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

function addMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function ensureUser(email: string): Promise<UserRow> {
  const db = await getDb();
  const existing = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (existing) return existing;

  const user: UserRow = {
    id: crypto.randomUUID(),
    email,
    tier: 'free',
    stripe_customer_id: null,
    created_at: new Date().toISOString(),
  };

  await db
    .prepare('INSERT INTO users (id, email, tier, stripe_customer_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(user.id, user.email, user.tier, user.stripe_customer_id, user.created_at)
    .run();
  return user;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export async function requestLink(
  request: Request,
  emailInput: unknown,
  options: RequestLinkOptions = {},
): Promise<RequestLinkResult> {
  const email = normalizeEmail(emailInput);
  if (!email) throw new Error('invalid_email');

  await ensureUser(email);

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = addMinutes(TOKEN_TTL_MINUTES);
  const db = await getDb();

  await db
    .prepare('INSERT INTO login_tokens (token_hash, email, expires_at, used) VALUES (?, ?, ?, 0)')
    .bind(tokenHash, email, expiresAt)
    .run();

  const origin = new URL(request.url).origin;
  const link = options.nativeApp
    ? `skrobot://auth/callback?token=${encodeURIComponent(token)}`
    : `${origin}/api/auth/callback?token=${encodeURIComponent(token)}`;
  const env = await getOptionalCloudflareEnv();

  if (env?.EMAIL) {
    if (!env.MAGIC_LINK_FROM) throw new Error('missing_magic_link_from');
    await env.EMAIL.send({
      to: email,
      from: { email: env.MAGIC_LINK_FROM, name: 'Skate Robot' },
      subject: 'Your Skate Robot sign-in link',
      html: `<h1>Sign in to Skate Robot</h1><p>Use this secure link to start voice mode:</p><p><a href="${escapeHtml(link)}">Sign in</a></p><p>This link expires in ${TOKEN_TTL_MINUTES} minutes.</p>`,
      text: `Sign in to Skate Robot: ${link}\n\nThis link expires in ${TOKEN_TTL_MINUTES} minutes.`,
    });
    return { ok: true };
  }

  return { ok: true, devLink: link };
}

export async function consumeLink(request: Request, token: string | null): Promise<string> {
  if (!token) throw new Error('invalid_token');

  const tokenHash = await sha256Hex(token);
  const db = await getDb();
  const row = await db
    .prepare('SELECT token_hash, email, expires_at, used FROM login_tokens WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{ token_hash: string; email: string; expires_at: string; used: number }>();

  if (!row || row.used || row.expires_at <= new Date().toISOString()) throw new Error('invalid_token');

  await db.prepare('UPDATE login_tokens SET used = 1 WHERE token_hash = ?').bind(tokenHash).run();
  const user = await ensureUser(row.email);
  return createSessionCookie(request, user.id);
}
