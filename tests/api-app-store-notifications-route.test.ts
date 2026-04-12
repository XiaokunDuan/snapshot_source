import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const captureException = vi.fn();
const recordAppStoreNotificationIngestion = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException,
}));

vi.mock('../lib/app-store-billing', () => ({
  recordAppStoreNotificationIngestion,
}));

describe('/api/app-store/notifications', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('stores a normalized notification ingestion and returns an acknowledgement', async () => {
    recordAppStoreNotificationIngestion.mockResolvedValue({
      id: 17,
      eventKey: 'notif-17',
      bridgeStatus: 'stored',
      summary: {
        receivedAt: '2026-04-12T10:00:00.000Z',
        eventKey: 'notif-17',
        notificationUuid: 'notif-17',
        environment: 'Sandbox',
        notificationType: 'DID_RENEW',
        subtype: 'INITIAL_BUY',
        bundleId: 'com.example.snapshot',
        appAppleId: '1234567890',
        transactionId: 'tx-1',
        originalTransactionId: 'orig-1',
        signedDate: '2026-04-12T10:00:00.000Z',
        handled: 'stored',
      },
    });

    const { POST } = await import('../app/api/app-store/notifications/route');
    const response = await POST(
      new NextRequest('http://localhost/api/app-store/notifications', {
        method: 'POST',
        body: JSON.stringify({
          signedPayload: 'opaque-jws',
          notification: {
            notificationUUID: 'notif-17',
            notificationType: 'DID_RENEW',
            bundleId: 'com.example.snapshot',
          },
        }),
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      received: true,
      stored: true,
      bridge: 'notification_ingestion',
      ingestion: {
        id: 17,
        eventKey: 'notif-17',
        bridgeStatus: 'stored',
      },
      notification: {
        eventKey: 'notif-17',
        notificationUuid: 'notif-17',
        notificationType: 'DID_RENEW',
        bundleId: 'com.example.snapshot',
        handled: 'stored',
      },
    });
    expect(recordAppStoreNotificationIngestion).toHaveBeenCalledTimes(1);
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

  it('rejects non-object payloads before persistence', async () => {
    const { POST } = await import('../app/api/app-store/notifications/route');
    const response = await POST(
      new NextRequest('http://localhost/api/app-store/notifications', {
        method: 'POST',
        body: JSON.stringify('nope'),
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'App Store notification payload must be a JSON object',
    });
    expect(recordAppStoreNotificationIngestion).not.toHaveBeenCalled();
  });
});
