import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
const getOptionalCloudflareEnv = vi.fn();
const getAnalyticsSummary = vi.fn();

vi.mock('@/features/auth/server/sessions', () => ({ getCurrentUser }));
vi.mock('@/platform/server/cloudflare', () => ({ getOptionalCloudflareEnv }));
vi.mock('@/features/analytics/server/summary', () => ({ getAnalyticsSummary }));
vi.mock('@/features/analytics', () => ({ analyticsRangeDays: (value: string | null) => (value === '30' ? 30 : 7) }));

const { GET } = await import('./route');

beforeEach(() => {
  vi.clearAllMocks();
  getOptionalCloudflareEnv.mockResolvedValue({ ANALYTICS_ADMIN_EMAIL: 'me@therealpablo.com' });
});

describe('GET /api/analytics/summary', () => {
  it('requires authentication', async () => {
    getCurrentUser.mockResolvedValue(null);
    const response = await GET(new Request('https://app.skaterobot.com/api/analytics/summary'));
    expect(response.status).toBe(401);
    expect(getAnalyticsSummary).not.toHaveBeenCalled();
  });

  it('rejects a signed-in non-owner', async () => {
    getCurrentUser.mockResolvedValue({ email: 'someone@example.com' });
    const response = await GET(new Request('https://app.skaterobot.com/api/analytics/summary'));
    expect(response.status).toBe(403);
    expect(getAnalyticsSummary).not.toHaveBeenCalled();
  });

  it('returns an uncached owner summary for the requested range', async () => {
    getCurrentUser.mockResolvedValue({ email: 'ME@THEREALPABLO.COM' });
    getAnalyticsSummary.mockResolvedValue({ rangeDays: 30 });
    const response = await GET(new Request('https://app.skaterobot.com/api/analytics/summary?days=30'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(getAnalyticsSummary).toHaveBeenCalledWith(30);
  });
});
