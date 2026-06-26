import { beforeEach, describe, expect, it, vi } from 'vitest';

const first = vi.fn();
const run = vi.fn();
const bind = vi.fn(() => ({ first, run }));
const prepare = vi.fn(() => ({ bind }));

vi.mock('@/platform/server/db', () => ({
  getDb: vi.fn(async () => ({ prepare })),
}));

vi.mock('@/platform/server/cloudflare', () => ({
  getOptionalCloudflareEnv: vi.fn(async () => undefined),
}));

describe('magic link requests', () => {
  beforeEach(() => {
    prepare.mockClear();
    bind.mockClear();
    first.mockReset();
    run.mockReset();
    first.mockResolvedValue(null);
    run.mockResolvedValue({ success: true });
  });

  it('returns a same-origin callback link for normal web sign-in', async () => {
    const { requestLink } = await import('./magicLink');

    const result = await requestLink(new Request('https://skaterobot.example/api/auth/request-link'), 'pablo@example.com');

    expect(result.devLink).toMatch(/^https:\/\/skaterobot\.example\/api\/auth\/callback\?token=/);
    expect(result.devLink).not.toContain('skrobot://');
  });

  it('returns an HTTPS handoff link for WebView sign-in emails', async () => {
    const { requestLink } = await import('./magicLink');

    const result = await requestLink(new Request('https://skaterobot.example/api/auth/request-link'), 'pablo@example.com', {
      nativeApp: true,
    });

    expect(result.devLink).toMatch(/^https:\/\/skaterobot\.example\/api\/auth\/callback\?token=/);
    expect(result.devLink).toContain('&native=1');
    expect(result.devLink).not.toContain('skrobot://');
  });

  it('builds native callback links for the HTTPS handoff route', async () => {
    const { nativeCallbackLink } = await import('./magicLink');

    expect(nativeCallbackLink('a+b/c=')).toBe('skrobot://auth/callback?token=a%2Bb%2Fc%3D');
  });
});
