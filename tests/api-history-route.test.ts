import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const captureException = vi.fn();
const auth = vi.fn();
const resolveHistoryUserId = vi.fn();
const deleteHistoryRecord = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException,
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth,
}));

vi.mock('../lib/history-store', () => ({
  createHistoryRecord: vi.fn(),
  deleteHistoryRecord,
  listHistory: vi.fn(),
  resolveHistoryUserId,
  updateHistoryRecord: vi.fn(),
}));

describe('/api/history', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects delete requests without a numeric id', async () => {
    auth.mockResolvedValue({ userId: 'clerk_123' });
    resolveHistoryUserId.mockResolvedValue(7);

    const { DELETE } = await import('../app/api/history/route');
    const request = new NextRequest('http://localhost/api/history?id=abc', {
      method: 'DELETE',
    });
    const response = await DELETE(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'A numeric id is required' });
    expect(deleteHistoryRecord).not.toHaveBeenCalled();
  });

  it('returns 401 when the request is unauthenticated', async () => {
    auth.mockResolvedValue({ userId: null });

    const { GET } = await import('../app/api/history/route');
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});
