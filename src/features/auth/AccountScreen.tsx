'use client';

import { useAuth } from './useAuth';

interface Props {
  onSignIn: () => void;
}

/** Account screen: shows email, voice quota, and sign-out when signed in. */
export default function AccountScreen({ onSignIn }: Props) {
  const { user, voiceQuota, logout, loading } = useAuth();

  if (loading) {
    return (
      <div className="container account-screen">
        <p className="muted center">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container account-screen">
        <div className="panel center">
          <h2 className="panel-title">Account</h2>
          <p className="muted">
            Sign in to track voice games and sync your quota across devices. On-screen games are always free.
          </p>
          <button className="btn-primary" onClick={onSignIn}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  const used = voiceQuota.unlimited ? 0 : voiceQuota.used;
  const limit = voiceQuota.unlimited ? 1 : voiceQuota.limit;
  const pct = Math.min(100, (used / limit) * 100);

  return (
    <div className="container account-screen">
      <div className="panel center">
        <h2 className="panel-title">Account</h2>
        <p className="account-email">{user.email}</p>
        {voiceQuota.unlimited ? (
          <p className="muted small">Unlimited voice games</p>
        ) : (
          <div className="account-quota">
            <div className="account-quota-label">
              <span>Voice games</span>
              <span>
                {used} / {limit}
              </span>
            </div>
            <div className="account-quota-bar">
              <span className="account-quota-fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="muted small">Rolling 7-day window · resets as sessions age out</p>
          </div>
        )}
        <div className="account-actions">
          <button className="btn-danger" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
