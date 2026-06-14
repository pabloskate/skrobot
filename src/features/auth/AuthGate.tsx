'use client';

import type { ReactNode } from 'react';
import SignInScreen from './SignInScreen';
import { useAuth } from './useAuth';

interface Props {
  children: ReactNode;
}

export default function AuthGate({ children }: Props) {
  const auth = useAuth();
  if (auth.loading) return <p className="muted center">Checking account…</p>;
  if (!auth.user) return <SignInScreen onDone={async () => void (await auth.refresh())} />;
  return children;
}
