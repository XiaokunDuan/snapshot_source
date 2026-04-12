import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const captureException = vi.fn();
const requireDbUser = vi.fn();
const getHistoryOverview = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException,
}));

vi.mock('../lib/users', () => ({
  requireDbUser,
}));

vi.mock('../lib/history-store', () => ({
  getHistoryOverview,
}));

describe('/api/native/training-feed', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns a compact training deck from recent history', async () => {
    requireDbUser.mockResolvedValue({ id: 7 });
    getHistoryOverview.mockResolvedValue({
      totalCount: 3,
      recent: [
        {
          id: 21,
          user_id: 7,
          word: 'orchard',
          phonetic: '/ˈɔːrtʃərd/',
          meaning: '果园',
          sentence: 'We toured the orchard.',
          sentence_cn: '我们参观了果园。',
          image_url: 'https://cdn.example.com/orchard.png',
          source_object: 'orchard',
          source_label_en: 'Orchard',
          primary_language: 'en',
          target_languages: ['en', 'zh-CN'],
          variants_json: {},
          created_at: '2026-04-12T09:00:00.000Z',
        },
        {
          id: 20,
          user_id: 7,
          word: 'peach',
          phonetic: '/piːtʃ/',
          meaning: '桃子',
          sentence: 'The peach is ripe.',
          sentence_cn: '桃子熟了。',
          image_url: null,
          source_object: 'peach',
          source_label_en: 'Peach',
          primary_language: 'en',
          target_languages: ['en', 'zh-CN'],
          variants_json: {},
          created_at: '2026-04-11T09:00:00.000Z',
        },
      ],
    });

    const { GET } = await import('../app/api/native/training-feed/route');
    const response = await GET(new NextRequest('http://localhost/api/native/training-feed?limit=2'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      cards: [
        {
          id: 21,
          word: 'orchard',
          meaning: '果园',
          prompt: 'Orchard',
          answer: '果园',
        },
        {
          id: 20,
          word: 'peach',
          meaning: '桃子',
          prompt: 'Peach',
          answer: '桃子',
        },
      ],
      totalCount: 3,
      returnedCount: 2,
      hasMore: true,
    });

    expect(getHistoryOverview).toHaveBeenCalledWith(7, 2);
  });

  it('rejects invalid limit values', async () => {
    requireDbUser.mockResolvedValue({ id: 7 });

    const { GET } = await import('../app/api/native/training-feed/route');
    const response = await GET(new NextRequest('http://localhost/api/native/training-feed?limit=0'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Too small: expected number to be >=1',
    });
    expect(getHistoryOverview).not.toHaveBeenCalled();
  });
});
