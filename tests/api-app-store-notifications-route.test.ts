import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const captureException = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException,
}));

describe('/api/app-store/notifications', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns a placeholder acknowledgement for notification payloads', async () => {
    const { POST } = await import('../app/api/app-store/notifications/route');
    const response = await POST(
      new NextRequest('http://localhost/api/app-store/notifications', {
        method: 'POST',
        body: JSON.stringify({
          notificationType: 'DID_RENEW',
          bundleId: 'com.example.snapshot',
        }),
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      received: true,
      handled: false,
      notification: {
        notificationType: 'DID_RENEW',
        bundleId: 'com.example.snapshot',
        handled: 'placeholder',
      },
    });
  });

  it('returns 400 for invalid JSON payloads', async () => {
    const { POST } = await import('../app/api/app-store/notifications/route');
    const response = await POST(
      new NextRequest('http://localhost/api/app-store/notifications', {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(response.status).toBe(400);
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
