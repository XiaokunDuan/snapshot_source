import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const captureException = vi.fn();
const requireDbUser = vi.fn();
const getBillingStatus = vi.fn();
const getHistoryOverview = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException,
}));

vi.mock('../lib/users', () => ({
  requireDbUser,
}));

vi.mock('../lib/billing', () => ({
  getBillingStatus,
}));

vi.mock('../lib/history-store', () => ({
  getHistoryOverview,
}));

describe('/api/native/bootstrap', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns a compact bootstrap payload for native clients', async () => {
    requireDbUser.mockResolvedValue({
      id: 7,
      email: 'user@example.com',
      username: 'Snapshot',
      avatar_url: 'https://cdn.example.com/avatar.png',
      coins: 12,
      auth_provider: 'apple',
    });
    getBillingStatus.mockResolvedValue({
      subscriptionStatus: 'trialing',
      hasAccess: true,
      monthlyLimit: 100,
      usageCount: 4,
      remaining: 96,
      trialEndsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    getHistoryOverview.mockResolvedValue({
      totalCount: 2,
      recent: [
        {
          id: 11,
          user_id: 7,
          word: 'apple',
          phonetic: '/ˈæpəl/',
          meaning: '苹果',
          sentence: 'This apple is crisp.',
          sentence_cn: '这个苹果很脆。',
          image_url: 'https://cdn.example.com/apple.png',
          source_object: 'apple',
          source_label_en: 'Apple',
          primary_language: 'en',
          target_languages: ['en', 'zh-CN'],
          variants_json: {},
          created_at: '2026-04-12T10:00:00.000Z',
        },
      ],
    });

    const { GET } = await import('../app/api/native/bootstrap/route');
    const response = await GET(new NextRequest('http://localhost/api/native/bootstrap?historyLimit=1'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: {
        id: 7,
        email: 'user@example.com',
        username: 'Snapshot',
        avatarUrl: 'https://cdn.example.com/avatar.png',
        coins: 12,
        authProvider: 'apple',
      },
      billing: {
        subscriptionStatus: 'trialing',
        hasAccess: true,
      },
      history: {
        totalCount: 2,
        recentCount: 1,
        latestAt: '2026-04-12T10:00:00.000Z',
        recent: [
          {
            id: 11,
            word: 'apple',
            meaning: '苹果',
            sourceLabelEn: 'Apple',
            sourceObject: 'apple',
          },
        ],
      },
    });

    expect(getHistoryOverview).toHaveBeenCalledWith(7, 1);
  });

  it('maps unauthorized users to 401', async () => {
    requireDbUser.mockRejectedValue(new Error('Unauthorized'));

    const { GET } = await import('../app/api/native/bootstrap/route');
    const response = await GET(new NextRequest('http://localhost/api/native/bootstrap'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
