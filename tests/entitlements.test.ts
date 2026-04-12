import { describe, expect, it } from 'vitest';
import {
  buildEntitlementStatus,
  buildFreeEntitlementStatus,
  ENTITLEMENT_SOURCES,
} from '../lib/entitlements';

describe('entitlements', () => {
  it('builds a stripe entitlement status from a subscription row', () => {
    const status = buildEntitlementStatus({
      source: 'stripe',
      status: 'active',
      trial_ends_at: '2026-04-01T06:10:25.000Z',
      current_period_start: '2026-03-29T06:10:25.000Z',
      current_period_end: '2026-04-29T06:10:25.000Z',
      cancel_at_period_end: false,
      monthly_limit: 100,
      analyze_count: 3,
    });

    expect(status).toMatchObject({
      source: 'stripe',
      subscriptionStatus: 'active',
      hasAccess: true,
      monthlyLimit: 100,
      usageCount: 3,
      remaining: 97,
    });
  });

  it('builds a free entitlement status with the free source', () => {
    expect(buildFreeEntitlementStatus(2)).toMatchObject({
      source: 'free',
      subscriptionStatus: 'free',
      hasAccess: true,
      monthlyLimit: 20,
      usageCount: 2,
      remaining: 18,
    });
  });

  it('describes both billing sources for future routing', () => {
    expect(ENTITLEMENT_SOURCES).toMatchObject({
      stripe: {
        kind: 'stripe',
        deliverySurface: 'web',
        supportsServerNotifications: true,
      },
      app_store: {
        kind: 'app_store',
        deliverySurface: 'native',
        supportsServerNotifications: true,
      },
    });
  });
});
