import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBillingFoundationStatus, getConfiguredBillingProvider } from '../lib/billing-provider';

describe('billing provider selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to Stripe when no provider is configured', () => {
    vi.stubEnv('APP_BILLING_PROVIDER', '');

    expect(getConfiguredBillingProvider()).toBe('stripe');
    expect(getBillingFoundationStatus()).toMatchObject({
      provider: 'stripe',
      ready: true,
      appStoreConfig: null,
      descriptor: {
        kind: 'stripe',
        deliverySurface: 'web',
      },
    });
  });

  it('selects App Store when requested and reports readiness from config', () => {
    vi.stubEnv('APP_BILLING_PROVIDER', 'app_store');
    vi.stubEnv('APP_STORE_BUNDLE_ID', 'com.example.snapshot');
    vi.stubEnv('APP_STORE_ISSUER_ID', 'issuer-123');
    vi.stubEnv('APP_STORE_KEY_ID', 'key-123');
    vi.stubEnv('APP_STORE_PRIVATE_KEY', 'private-key');
    vi.stubEnv('APP_STORE_APPLE_ID', '1234567890');

    expect(getConfiguredBillingProvider()).toBe('app_store');
    expect(getBillingFoundationStatus()).toMatchObject({
      provider: 'app_store',
      ready: true,
      appStoreConfig: {
        bundleId: 'com.example.snapshot',
        issuerId: 'issuer-123',
        keyId: 'key-123',
        privateKey: 'private-key',
        appAppleId: '1234567890',
        environment: 'Sandbox',
      },
      descriptor: {
        kind: 'app_store',
        deliverySurface: 'native',
      },
    });
  });

  it('marks App Store as not ready when config is missing', () => {
    vi.stubEnv('APP_BILLING_PROVIDER', 'app_store');
    vi.stubEnv('APP_STORE_BUNDLE_ID', '');
    vi.stubEnv('APP_STORE_ISSUER_ID', '');
    vi.stubEnv('APP_STORE_KEY_ID', '');
    vi.stubEnv('APP_STORE_PRIVATE_KEY', '');

    expect(getBillingFoundationStatus()).toMatchObject({
      provider: 'app_store',
      ready: false,
      appStoreConfig: null,
    });
  });
});
