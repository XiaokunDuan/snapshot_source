import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAppStoreBillingConfig,
  normalizeAppStoreServerNotification,
} from '../lib/app-store-billing';

describe('app store billing helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when the App Store config is incomplete', () => {
    vi.stubEnv('APP_STORE_BUNDLE_ID', '');
    vi.stubEnv('APP_STORE_ISSUER_ID', '');
    vi.stubEnv('APP_STORE_KEY_ID', '');
    vi.stubEnv('APP_STORE_PRIVATE_KEY', '');

    expect(getAppStoreBillingConfig()).toBeNull();
  });

  it('reads the App Store config when all required values are present', () => {
    vi.stubEnv('APP_STORE_BUNDLE_ID', 'com.example.snapshot');
    vi.stubEnv('APP_STORE_ISSUER_ID', 'issuer-123');
    vi.stubEnv('APP_STORE_KEY_ID', 'key-123');
    vi.stubEnv('APP_STORE_PRIVATE_KEY', 'private-key');
    vi.stubEnv('APP_STORE_APPLE_ID', '1234567890');
    vi.stubEnv('APP_STORE_ENVIRONMENT', 'Production');

    expect(getAppStoreBillingConfig()).toEqual({
      bundleId: 'com.example.snapshot',
      issuerId: 'issuer-123',
      keyId: 'key-123',
      privateKey: 'private-key',
      appAppleId: '1234567890',
      environment: 'Production',
    });
  });

  it('normalizes wrapped App Store notification payloads for storage', () => {
    const summary = normalizeAppStoreServerNotification({
      signedPayload: 'opaque-jws',
      notification: {
        environment: 'Sandbox',
        notificationType: 'DID_RENEW',
        subtype: 'INITIAL_BUY',
        bundleId: 'com.example.snapshot',
        appAppleId: '1234567890',
        notificationUUID: 'notif-1',
        signedDate: '2026-04-12T10:00:00.000Z',
        data: {
          signedTransactionInfo: {
            transactionId: 'tx-1',
            originalTransactionId: 'orig-1',
          },
        },
      },
    });

    expect(summary).toMatchObject({
      eventKey: 'notif-1',
      notificationUuid: 'notif-1',
      environment: 'Sandbox',
      notificationType: 'DID_RENEW',
      subtype: 'INITIAL_BUY',
      bundleId: 'com.example.snapshot',
      appAppleId: '1234567890',
      transactionId: 'tx-1',
      originalTransactionId: 'orig-1',
      signedDate: '2026-04-12T10:00:00.000Z',
      handled: 'placeholder',
    });
  });

  it('falls back to a deterministic event key when notificationUUID is absent', () => {
    const summary = normalizeAppStoreServerNotification({
      environment: 'Production',
      notificationType: 'DID_CHANGE_RENEWAL_STATUS',
      data: {
        signedTransactionInfo: {
          transactionId: 'tx-2',
          originalTransactionId: 'orig-2',
        },
      },
    });

    expect(summary.eventKey).toBe('Production:DID_CHANGE_RENEWAL_STATUS:tx-2:orig-2:unknown');
  });
});
