'use client';

import { FormEvent, useState } from 'react';
import { requestSignInLink } from './api';

interface Props {
  onDone?: () => void | Promise<void>;
  onCancel?: () => void;
}

export default function SignInScreen({ onDone, onCancel }: Props) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setDevLink(null);
    setLoading(true);
    try {
      const body = await requestSignInLink(email);
      setSentTo(email.trim());
      if (body.devLink) setDevLink(body.devLink);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send sign-in link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container auth-screen">
      <div className="panel center">
        <h2 className="panel-title">Sign in for voice mode</h2>
        <p className="muted">
          On-screen games stay free. Voice mode needs an account so weekly voice games and upgrades follow you.
        </p>

        {sentTo ? (
          <>
            <p className="note">Check {sentTo} for your magic link.</p>
            {devLink && (
              <a className="dev-link" href={devLink}>
                Open local dev sign-in link
              </a>
            )}
            <button className="btn-primary" onClick={onDone}>
              I opened the link
            </button>
          </>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <input
              className="search"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            {error && <p className="note">{error}</p>}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
        )}

        {onCancel && (
          <button className="btn-ghost" onClick={onCancel}>
            Back
          </button>
        )}
      </div>
    </div>
  );
}
