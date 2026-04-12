export type EntitlementSourceKind = 'stripe' | 'app_store' | 'free';

export const MONTHLY_ANALYZE_LIMIT = 100;
export const FREE_ANALYZE_LIMIT = 20;

export const ENTITLED_STATUSES = new Set(['trialing', 'active', 'grace_period']);

export interface EntitlementStatus {
  source: EntitlementSourceKind;
  subscriptionStatus: string;
  hasAccess: boolean;
  monthlyLimit: number;
  usageCount: number;
  remaining: number;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface EntitlementStatusRow {
  source?: Exclude<EntitlementSourceKind, 'free'>;
  status: string;
  trial_ends_at: string | Date | null;
  current_period_start: string | Date | null;
  current_period_end: string | Date | null;
  cancel_at_period_end: boolean;
  monthly_limit: number | null;
  analyze_count: number | null;
}

export interface EntitlementSourceDescriptor {
  kind: Exclude<EntitlementSourceKind, 'free'>;
  label: string;
  deliverySurface: 'web' | 'native';
  supportsServerNotifications: boolean;
}

export const ENTITLEMENT_SOURCES: Record<Exclude<EntitlementSourceKind, 'free'>, EntitlementSourceDescriptor> = {
  stripe: {
    kind: 'stripe',
    label: 'Stripe',
    deliverySurface: 'web',
    supportsServerNotifications: true,
  },
  app_store: {
    kind: 'app_store',
    label: 'App Store',
    deliverySurface: 'native',
    supportsServerNotifications: true,
  },
};

export function isEntitledStatus(status: string) {
  return ENTITLED_STATUSES.has(status);
}

export function normalizeEntitlementTimestamp(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    const normalized = new Date(value);
    if (!Number.isNaN(normalized.getTime())) {
      return normalized.toISOString();
    }
  }

  return value;
}

export function toEntitlementPeriodDate(value: string | Date | null | undefined) {
  const iso = normalizeEntitlementTimestamp(value);
  if (!iso) {
    return null;
  }

  return iso.slice(0, 10);
}

export function buildEntitlementStatus(row: EntitlementStatusRow | null): EntitlementStatus {
  if (!row) {
    return {
      source: 'free',
      subscriptionStatus: 'inactive',
      hasAccess: false,
      monthlyLimit: 0,
      usageCount: 0,
      remaining: 0,
      trialEndsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  const monthlyLimit = row.monthly_limit ?? MONTHLY_ANALYZE_LIMIT;
  const usageCount = row.analyze_count ?? 0;
  const source = row.source ?? 'stripe';
  const hasAccess = isEntitledStatus(row.status) && usageCount < monthlyLimit;

  return {
    source,
    subscriptionStatus: row.status,
    hasAccess,
    monthlyLimit,
    usageCount,
    remaining: Math.max(monthlyLimit - usageCount, 0),
    trialEndsAt: normalizeEntitlementTimestamp(row.trial_ends_at),
    currentPeriodStart: normalizeEntitlementTimestamp(row.current_period_start),
    currentPeriodEnd: normalizeEntitlementTimestamp(row.current_period_end),
    cancelAtPeriodEnd: row.cancel_at_period_end,
  };
}

export function buildFreeEntitlementStatus(usageCount: number): EntitlementStatus {
  return {
    source: 'free',
    subscriptionStatus: 'free',
    hasAccess: usageCount < FREE_ANALYZE_LIMIT,
    monthlyLimit: FREE_ANALYZE_LIMIT,
    usageCount,
    remaining: Math.max(FREE_ANALYZE_LIMIT - usageCount, 0),
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };
}
