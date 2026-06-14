'use client';

import { useCallback, useEffect, useState } from 'react';

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

interface MeResponse {
  user: AuthUser | null;
  voiceQuota: VoiceQuota;
}

const SIGNED_OUT: MeResponse = {
  user: null,
  voiceQuota: { used: 0, limit: 15, unlimited: false },
};

export function useAuth() {
  const [data, setData] = useState<MeResponse>(SIGNED_OUT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<MeResponse> => {
    setLoading(true);
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Could not load account');
      const next = (await res.json()) as MeResponse;
      setData(next);
      return next;
    } catch {
      setData(SIGNED_OUT);
      return SIGNED_OUT;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    await refresh();
  }, [refresh]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void refresh();
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  return { ...data, loading, refresh, logout };
}
