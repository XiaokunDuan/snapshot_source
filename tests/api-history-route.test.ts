import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const captureException = vi.fn();
const requireDbUser = vi.fn();
const deleteHistoryRecord = vi.fn();
const listHistory = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException,
}));

vi.mock('../lib/history-store', () => ({
  createHistoryRecord: vi.fn(),
  deleteHistoryRecord,
  listHistory,
  updateHistoryRecord: vi.fn(),
}));

vi.mock('../lib/users', () => ({
  requireDbUser,
}));

describe('/api/history', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects delete requests without a numeric id', async () => {
    requireDbUser.mockResolvedValue({ id: 7 });

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
    requireDbUser.mockRejectedValue(new Error('Unauthorized'));
    listHistory.mockResolvedValue([]);

    const { GET } = await import('../app/api/history/route');
    const response = await GET(new NextRequest('http://localhost/api/history'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});
