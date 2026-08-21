'use client';

import type { ReactNode } from 'react';
import { useAuth } from './useAuth';

interface Props {
  onSignIn: () => void;
  voiceVisible?: boolean;
  children?: ReactNode;
}

/** Settings screen: local preferences plus optional signed-in account controls. */
export default function SettingsScreen({ onSignIn, voiceVisible = true, children }: Props) {
  const { user, voiceQuota, logout, loading } = useAuth();

  const accountContent = (() => {
    if (loading) return <p className="muted">Loading account…</p>;

    if (!user) {
      return (
        <>
          <p className="muted">
            Sign in to track voice games and sync your quota across devices. On-screen games are
            always free.
          </p>
          <button className="btn-primary" onClick={onSignIn}>Sign in</button>
        </>
      );
    }

    const used = voiceQuota.unlimited ? 0 : voiceQuota.used;
    const limit = voiceQuota.unlimited ? 1 : voiceQuota.limit;
    const pct = Math.min(100, (used / limit) * 100);
    return (
      <>
        <p className="account-email">{user.email}</p>
        {voiceQuota.unlimited ? (
          <p className="muted small">Unlimited voice games</p>
        ) : (
          <div className="account-quota">
            <div className="account-quota-label">
              <span>Voice games</span>
              <span>{used} / {limit}</span>
            </div>
            <div className="account-quota-bar">
              <span className="account-quota-fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="muted small">Rolling 7-day window · resets as sessions age out</p>
          </div>
        )}
        <div className="account-actions">
          <button className="btn-danger" onClick={() => void logout()}>Sign out</button>
        </div>
      </>
    );
  })();

  return (
    <div className="container settings-screen">
      <header className="settings-header">
        <p className="settings-eyebrow">Skate Robot</p>
        <h1>Settings</h1>
      </header>
      {children}
      {voiceVisible && (
        <section className="settings-section" aria-labelledby="account-title">
          <div className="settings-section-heading">
            <h2 id="account-title">Account</h2>
          </div>
          <div className="settings-account">{accountContent}</div>
        </section>
      )}
    </div>
  );
}
