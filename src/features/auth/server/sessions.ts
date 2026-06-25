import { getDb } from '@/platform/server/db';

export type UserTier = 'free' | 'paid';

export interface UserRow {
  id: string;
  email: string;
  tier: UserTier;
  stripe_customer_id: string | null;
  created_at: string;
}

export interface PublicUser {
  email: string;
  tier: UserTier;
}

export interface VoiceQuota {
  used: number;
  limit: number;
  unlimited: boolean;
}

const SESSION_COOKIE = 'skrobot_session';
const SESSION_DAYS = 30;
const FREE_VOICE_LIMIT = 15;

function nowIso(): string {
  return new Date().toISOString();
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (!name || rest.length === 0) continue;
    cookies.set(name, decodeURIComponent(rest.join('=')));
  }
  return cookies;
}

function cookieBase(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `HttpOnly; Path=/; SameSite=Lax${secure}`;
}

function publicUser(user: UserRow): PublicUser {
  return { email: user.email, tier: user.tier };
}

export async function createSessionCookie(request: Request, userId: string): Promise<string> {
  const rawToken = randomToken();
  const tokenHash = await sha256Hex(rawToken);
  const createdAt = nowIso();
  const expiresAt = daysFromNow(SESSION_DAYS);
  const db = await getDb();

  await db
    .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, userId, createdAt, expiresAt)
    .run();

  return `${SESSION_COOKIE}=${encodeURIComponent(rawToken)}; Max-Age=${SESSION_DAYS * 24 * 60 * 60}; ${cookieBase(request)}`;
}

export async function destroySessionCookie(request: Request): Promise<string> {
  const rawToken = parseCookies(request.headers.get('cookie')).get(SESSION_COOKIE);
  if (rawToken) {
    const db = await getDb();
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(rawToken)).run();
  }
  return `${SESSION_COOKIE}=; Max-Age=0; ${cookieBase(request)}`;
}

export async function getCurrentUser(request: Request): Promise<UserRow | null> {
  const rawToken = parseCookies(request.headers.get('cookie')).get(SESSION_COOKIE);
  if (!rawToken) return null;

  const db = await getDb();
  const user = await db
    .prepare(
      `SELECT users.id, users.email, users.tier, users.stripe_customer_id, users.created_at
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.expires_at > ?`,
    )
    .bind(await sha256Hex(rawToken), nowIso())
    .first<UserRow>();

  return user ?? null;
}

export async function getVoiceQuota(user: UserRow): Promise<VoiceQuota> {
  if (user.tier === 'paid') return { used: 0, limit: FREE_VOICE_LIMIT, unlimited: true };

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const db = await getDb();
  const row = await db
    .prepare('SELECT count(*) AS used FROM voice_games WHERE user_id = ? AND created_at > ?')
    .bind(user.id, since)
    .first<{ used: number }>();

  return { used: Number(row?.used ?? 0), limit: FREE_VOICE_LIMIT, unlimited: false };
}

export async function claimVoiceGame(user: UserRow, gameId: string): Promise<'allowed' | 'reconnect' | 'quota_exceeded'> {
  const db = await getDb();
  const existing = await db.prepare('SELECT user_id FROM voice_games WHERE game_id = ?').bind(gameId).first<{ user_id: string }>();

  if (existing?.user_id === user.id) return 'reconnect';
  if (existing) return 'quota_exceeded';

  const quota = await getVoiceQuota(user);
  if (!quota.unlimited && quota.used >= quota.limit) return 'quota_exceeded';

  await db.prepare('INSERT INTO voice_games (game_id, user_id, created_at) VALUES (?, ?, ?)').bind(gameId, user.id, nowIso()).run();
  return 'allowed';
}

export async function getMeResponse(user: UserRow | null) {
  if (!user) return { user: null, voiceQuota: { used: 0, limit: FREE_VOICE_LIMIT, unlimited: false } };
  return { user: publicUser(user), voiceQuota: await getVoiceQuota(user) };
}
