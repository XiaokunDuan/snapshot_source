import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAppStoreBillingConfig,
  summarizeAppStoreServerNotification,
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

  it('summarizes a server notification payload without requiring JWS parsing yet', () => {
    const summary = summarizeAppStoreServerNotification({
      environment: 'Sandbox',
      notificationType: 'DID_RENEW',
      subtype: 'INITIAL_BUY',
      bundleId: 'com.example.snapshot',
      appAppleId: '1234567890',
      signedDate: '2026-04-12T10:00:00.000Z',
      data: {
        signedTransactionInfo: {
          transactionId: 'tx-1',
          originalTransactionId: 'orig-1',
        },
      },
    });

    expect(summary).toMatchObject({
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
});
