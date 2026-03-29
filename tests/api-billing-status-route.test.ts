import { afterEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();
const requireDbUser = vi.fn();
const getBillingStatus = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException,
}));

vi.mock('../lib/users', () => ({
  requireDbUser,
}));

vi.mock('../lib/billing', () => ({
  getBillingStatus,
}));

describe('/api/billing/status', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns billing payload for authenticated users', async () => {
    requireDbUser.mockResolvedValue({ id: 7 });
    getBillingStatus.mockResolvedValue({ subscriptionStatus: 'trialing', hasAccess: true, remaining: 99 });

    const { GET } = await import('../app/api/billing/status/route');
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      billing: { subscriptionStatus: 'trialing', hasAccess: true, remaining: 99 },
    });
  });

  it('maps unauthorized errors to 401 and reports them', async () => {
    requireDbUser.mockRejectedValue(new Error('Unauthorized'));

    const { GET } = await import('../app/api/billing/status/route');
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
