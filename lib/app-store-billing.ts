export interface AppStoreBillingConfig {
  bundleId: string;
  issuerId: string;
  keyId: string;
  privateKey: string;
  appAppleId: string | null;
  environment: 'Sandbox' | 'Production';
}

export interface AppStoreServerNotificationSummary {
  receivedAt: string;
  environment: string | null;
  notificationType: string | null;
  subtype: string | null;
  bundleId: string | null;
  appAppleId: string | null;
  transactionId: string | null;
  originalTransactionId: string | null;
  signedDate: string | null;
  handled: 'placeholder';
}

function readEnv(name: string) {
  const value = process.env[name];
  return value?.trim() || null;
}

export function getAppStoreBillingConfig(): AppStoreBillingConfig | null {
  const bundleId = readEnv('APP_STORE_BUNDLE_ID') ?? readEnv('APPLE_BUNDLE_ID');
  const issuerId = readEnv('APP_STORE_ISSUER_ID');
  const keyId = readEnv('APP_STORE_KEY_ID');
  const privateKey = readEnv('APP_STORE_PRIVATE_KEY');

  if (!bundleId || !issuerId || !keyId || !privateKey) {
    return null;
  }

  return {
    bundleId,
    issuerId,
    keyId,
    privateKey,
    appAppleId: readEnv('APP_STORE_APPLE_ID'),
    environment: readEnv('APP_STORE_ENVIRONMENT') === 'Production' ? 'Production' : 'Sandbox',
  };
}

export function requireAppStoreBillingConfig() {
  const config = getAppStoreBillingConfig();
  if (!config) {
    throw new Error('App Store billing config is not configured');
  }

  return config;
}

export function summarizeAppStoreServerNotification(payload: unknown): AppStoreServerNotificationSummary {
  if (!payload || typeof payload !== 'object') {
    return {
      receivedAt: new Date().toISOString(),
      environment: null,
      notificationType: null,
      subtype: null,
      bundleId: null,
      appAppleId: null,
      transactionId: null,
      originalTransactionId: null,
      signedDate: null,
      handled: 'placeholder',
    };
  }

  const notification = payload as Record<string, unknown>;
  const data = (notification.data && typeof notification.data === 'object'
    ? notification.data as Record<string, unknown>
    : null);
  const signedTransactionInfo = data?.signedTransactionInfo && typeof data.signedTransactionInfo === 'object'
    ? data.signedTransactionInfo as Record<string, unknown>
    : null;

  return {
    receivedAt: new Date().toISOString(),
    environment: typeof notification.environment === 'string' ? notification.environment : null,
    notificationType: typeof notification.notificationType === 'string' ? notification.notificationType : null,
    subtype: typeof notification.subtype === 'string' ? notification.subtype : null,
    bundleId: typeof notification.bundleId === 'string' ? notification.bundleId : null,
    appAppleId: typeof notification.appAppleId === 'string' ? notification.appAppleId : null,
    transactionId: typeof signedTransactionInfo?.transactionId === 'string' ? signedTransactionInfo.transactionId : null,
    originalTransactionId: typeof signedTransactionInfo?.originalTransactionId === 'string'
      ? signedTransactionInfo.originalTransactionId
      : null,
    signedDate: typeof notification.signedDate === 'string' ? notification.signedDate : null,
    handled: 'placeholder',
  };
}
