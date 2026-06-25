export type VoiceStartErrorCode = 'auth_required' | 'quota_exceeded';

export class VoiceStartError extends Error {
  code: VoiceStartErrorCode;

  constructor(code: VoiceStartErrorCode) {
    super(code === 'auth_required' ? 'Sign in to start voice mode.' : "You've used 15 beta voice games this week.");
    this.name = 'VoiceStartError';
    this.code = code;
  }
}

/**
 * Auth: prefer an ephemeral token from /api/live-token (production); fall back to
 * NEXT_PUBLIC_GEMINI_API_KEY (dev only - never ship a real key in client code).
 */
export async function getVoiceAuthKey(gameId: string): Promise<string> {
  try {
    const res = await fetch('/api/live-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ gameId }),
    });
    if (res.ok) {
      const { token } = (await res.json()) as { token?: string };
      if (token) return token;
    }
    if (res.status === 401) throw new VoiceStartError('auth_required');
    if (res.status === 402) throw new VoiceStartError('quota_exceeded');
  } catch (error) {
    if (error instanceof VoiceStartError) throw error;
    /* no token endpoint configured */
  }

  const devKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (devKey) return devKey;
  throw new Error('No auth available: set GEMINI_API_KEY for /api/live-token, or NEXT_PUBLIC_GEMINI_API_KEY for dev.');
}
