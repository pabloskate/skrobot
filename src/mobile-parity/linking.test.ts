import { describe, expect, it } from 'vitest';
import { isShellInternalWebUrl, normalizeUrl, sameOrigin, webUrlFromDeepLink } from '../../apps/mobile/linking';

const APP_URL = 'https://skaterobot.example/';

describe('mobile WebView linking', () => {
  it('normalizes invalid app URLs to the platform fallback', () => {
    expect(normalizeUrl('not a url', 'http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('routes native auth callbacks into the app origin callback route', () => {
    expect(webUrlFromDeepLink('skrobot://auth/callback?token=abc_123', APP_URL)).toBe(
      'https://skaterobot.example/api/auth/callback?token=abc_123',
    );
  });

  it('preserves token characters safely when routing callbacks', () => {
    expect(webUrlFromDeepLink('skrobot://auth/callback?token=a+b/c=', APP_URL)).toBe(
      'https://skaterobot.example/api/auth/callback?token=a%20b%2Fc%3D',
    );
  });

  it('rejects callback links without a token', () => {
    expect(webUrlFromDeepLink('skrobot://auth/callback', APP_URL)).toBeNull();
  });

  it('allows same-origin open links', () => {
    expect(webUrlFromDeepLink('skrobot://open?url=https%3A%2F%2Fskaterobot.example%2Fapi%2Fme', APP_URL)).toBe(
      'https://skaterobot.example/api/me',
    );
  });

  it('rejects cross-origin open links', () => {
    expect(webUrlFromDeepLink('skrobot://open?url=https%3A%2F%2Fevil.example%2F', APP_URL)).toBeNull();
  });

  it('allows same-origin web links as normal WebView navigation', () => {
    expect(sameOrigin('https://skaterobot.example/api/auth/callback?token=x', APP_URL)).toBe(true);
    expect(isShellInternalWebUrl('https://skaterobot.example/api/auth/callback?token=x', APP_URL)).toBe(true);
    expect(webUrlFromDeepLink('https://skaterobot.example/api/auth/callback?token=x', APP_URL)).toBeNull();
  });

  it('keeps cross-origin web links outside the shell', () => {
    expect(isShellInternalWebUrl('https://evil.example/api/auth/callback?token=x', APP_URL)).toBe(false);
  });
});
