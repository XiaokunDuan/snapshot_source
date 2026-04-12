import { getAppStoreBillingConfig } from '@/lib/app-store-billing';

export type BillingProviderKind = 'stripe' | 'app_store';

export interface BillingProviderDescriptor {
  kind: BillingProviderKind;
  label: string;
  deliverySurface: 'web' | 'native';
  supportsServerNotifications: boolean;
}

export const BILLING_PROVIDERS: Record<BillingProviderKind, BillingProviderDescriptor> = {
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

export function getConfiguredBillingProvider(): BillingProviderKind {
  return process.env.APP_BILLING_PROVIDER === 'app_store' ? 'app_store' : 'stripe';
}

export function getBillingProviderDescriptor(kind: BillingProviderKind) {
  return BILLING_PROVIDERS[kind];
}

export function getBillingFoundationStatus() {
  const provider = getConfiguredBillingProvider();
  return {
    provider,
    descriptor: BILLING_PROVIDERS[provider],
    appStoreConfig: provider === 'app_store' ? getAppStoreBillingConfig() : null,
  };
}
