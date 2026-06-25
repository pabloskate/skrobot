'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchMe, logoutSession, SIGNED_OUT, type MeResponse } from './api';

export type { AuthTier, AuthUser, VoiceQuota } from './api';

export function useAuth() {
  const [data, setData] = useState<MeResponse>(SIGNED_OUT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<MeResponse> => {
    setLoading(true);
    try {
      const next = await fetchMe();
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
    await logoutSession();
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
