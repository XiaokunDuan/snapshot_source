import { describe, expect, it } from 'vitest';
import { buildBillingStatus, getSubscriptionPeriod } from '../lib/billing';

describe('billing helpers', () => {
  it('prefers subscription item period timestamps', () => {
    const period = getSubscriptionPeriod({
      items: {
        data: [
          {
            current_period_start: 1700000000,
            current_period_end: 1700086400,
          },
        ],
      },
      trial_start: null,
      trial_end: null,
      start_date: 1690000000,
      billing_cycle_anchor: 1690086400,
    } as never);

    expect(period.currentPeriodStart?.toISOString()).toBe('2023-11-14T22:13:20.000Z');
    expect(period.currentPeriodEnd?.toISOString()).toBe('2023-11-15T22:13:20.000Z');
  });

  it('falls back to trial dates when usage row is missing', () => {
    const status = buildBillingStatus({
      status: 'trialing',
      trial_ends_at: '2026-04-01T06:10:25.000Z',
      current_period_start: '2026-03-29T06:10:25.000Z',
      current_period_end: '2026-04-01T06:10:25.000Z',
      cancel_at_period_end: false,
      monthly_limit: null,
      analyze_count: null,
    });

    expect(status.hasAccess).toBe(true);
    expect(status.monthlyLimit).toBe(100);
    expect(status.remaining).toBe(100);
  });

  it('returns inactive defaults when no row exists', () => {
    expect(buildBillingStatus(null)).toEqual({
      subscriptionStatus: 'inactive',
      hasAccess: false,
      monthlyLimit: 0,
      usageCount: 0,
      remaining: 0,
      trialEndsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  });
});
