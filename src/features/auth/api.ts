export type AuthTier = 'free' | 'paid';

export interface AuthUser {
  email: string;
  tier: AuthTier;
}

export interface VoiceQuota {
  used: number;
  limit: number;
  unlimited: boolean;
}

export interface MeResponse {
  user: AuthUser | null;
  voiceQuota: VoiceQuota;
}

export interface RequestLinkResponse {
  ok: true;
  devLink?: string;
}

declare global {
  interface Window {
    ReactNativeWebView?: unknown;
    __SKROBOT_NATIVE_APP?: true;
  }
}

export const SIGNED_OUT: MeResponse = {
  user: null,
  voiceQuota: { used: 0, limit: 15, unlimited: false },
};

export async function fetchMe(): Promise<MeResponse> {
  const res = await fetch('/api/me', { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Could not load account');
  return (await res.json()) as MeResponse;
}

export async function logoutSession(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
}

export async function requestSignInLink(email: string): Promise<RequestLinkResponse> {
  const nativeApp =
    typeof window !== 'undefined' &&
    (window.__SKROBOT_NATIVE_APP === true || typeof window.ReactNativeWebView !== 'undefined');
  const res = await fetch('/api/auth/request-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email, nativeApp }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<RequestLinkResponse> & { error?: string };
  if (!res.ok) throw new Error(body.error ?? 'Could not send sign-in link');
  return body as RequestLinkResponse;
}
