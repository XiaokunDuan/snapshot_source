import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const captureException = vi.fn();
const requireDbUser = vi.fn();
const enforceRateLimit = vi.fn();
const getBillingStatus = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException,
}));

vi.mock('../lib/users', () => ({
  requireDbUser,
}));

vi.mock('../lib/rate-limit', () => ({
  enforceRateLimit,
}));

vi.mock('../lib/billing', () => ({
  getBillingStatus,
  consumeAnalyzeCredit: vi.fn(),
}));

vi.mock('../lib/analytics', () => ({
  trackServerEvent: vi.fn(),
}));

vi.mock('../lib/mcp/tools', () => ({
  getEnrichedWordData: vi.fn(),
}));

vi.mock('../lib/gemini', () => ({
  fetchWithKeyRotation: vi.fn(),
}));

describe('/api/analyze', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects requests when rate limit is exceeded', async () => {
    requireDbUser.mockResolvedValue({ id: 7 });
    enforceRateLimit.mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: new Date(),
    });

    const { POST } = await import('../app/api/analyze/route');
    const request = new NextRequest('http://localhost/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ imageUrl: 'data:image/png;base64,abc' }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await POST(request);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: 'Rate limit exceeded. Please try again later.',
    });
  });

  it('returns 402 when subscription access is inactive', async () => {
    requireDbUser.mockResolvedValue({ id: 7 });
    enforceRateLimit.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: new Date(),
    });
    getBillingStatus.mockResolvedValue({
      subscriptionStatus: 'inactive',
      hasAccess: false,
      monthlyLimit: 0,
      usageCount: 0,
      remaining: 0,
      trialEndsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    const { POST } = await import('../app/api/analyze/route');
    const request = new NextRequest('http://localhost/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ imageUrl: 'data:image/png;base64,abc' }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await POST(request);

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      error: 'An active subscription or trial is required',
      billingStatus: {
        subscriptionStatus: 'inactive',
        hasAccess: false,
      },
    });
  });
});
