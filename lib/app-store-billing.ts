import { getPool, type DbClient } from '@/lib/db';

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
  eventKey: string;
  notificationUuid: string | null;
  environment: string | null;
  notificationType: string | null;
  subtype: string | null;
  bundleId: string | null;
  appAppleId: string | null;
  transactionId: string | null;
  originalTransactionId: string | null;
  signedDate: string | null;
  handled: 'placeholder' | 'stored';
}

export interface AppStoreNotificationIngestionRecord {
  id: number;
  eventKey: string;
  bridgeStatus: 'stored';
  summary: AppStoreServerNotificationSummary;
}

type AppStoreNotificationRow = {
  id: number;
  event_key: string;
  bridge_status: 'stored' | null;
};

function readEnv(name: string) {
  const value = process.env[name];
  return value?.trim() || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(source: Record<string, unknown> | null, ...keys: string[]) {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function readNestedRecord(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  return isRecord(value) ? value : null;
}

function buildEventKey(summary: Pick<AppStoreServerNotificationSummary, 'notificationUuid' | 'environment' | 'notificationType' | 'transactionId' | 'originalTransactionId' | 'signedDate'>) {
  return summary.notificationUuid
    ?? [
      summary.environment || 'unknown',
      summary.notificationType || 'unknown',
      summary.transactionId || 'unknown',
      summary.originalTransactionId || 'unknown',
      summary.signedDate || 'unknown',
    ].join(':');
}

function buildSummary(source: Record<string, unknown> | null): AppStoreServerNotificationSummary {
  const notification = readNestedRecord(source, 'notification') ?? source;
  const data = readNestedRecord(notification, 'data');
  const signedTransactionInfo = readNestedRecord(data, 'signedTransactionInfo');

  const notificationUuid = readString(notification, 'notificationUUID', 'notificationUuid');
  const environment = readString(notification, 'environment');
  const notificationType = readString(notification, 'notificationType');
  const subtype = readString(notification, 'subtype');
  const bundleId = readString(notification, 'bundleId');
  const appAppleId = readString(notification, 'appAppleId');
  const transactionId = readString(signedTransactionInfo, 'transactionId');
  const originalTransactionId = readString(signedTransactionInfo, 'originalTransactionId');
  const signedDate = readString(notification, 'signedDate');

  const summary: Omit<AppStoreServerNotificationSummary, 'eventKey'> = {
    receivedAt: new Date().toISOString(),
    notificationUuid,
    environment,
    notificationType,
    subtype,
    bundleId,
    appAppleId,
    transactionId,
    originalTransactionId,
    signedDate,
    handled: 'placeholder',
  };

  return {
    ...summary,
    eventKey: buildEventKey(summary),
  };
}

async function ensureAppStoreNotificationIngestionTable(client: DbClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_store_notification_ingestions (
      id SERIAL PRIMARY KEY,
      event_key VARCHAR(255) UNIQUE NOT NULL,
      notification_uuid VARCHAR(255),
      environment VARCHAR(32),
      notification_type VARCHAR(120),
      subtype VARCHAR(120),
      bundle_id VARCHAR(255),
      app_apple_id VARCHAR(64),
      transaction_id VARCHAR(255),
      original_transaction_id VARCHAR(255),
      signed_date TIMESTAMP,
      bridge_status VARCHAR(32) NOT NULL DEFAULT 'stored',
      raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`ALTER TABLE app_store_notification_ingestions ADD COLUMN IF NOT EXISTS event_key VARCHAR(255)`);
  await client.query(`ALTER TABLE app_store_notification_ingestions ADD COLUMN IF NOT EXISTS notification_uuid VARCHAR(255)`);
  await client.query(`ALTER TABLE app_store_notification_ingestions ADD COLUMN IF NOT EXISTS environment VARCHAR(32)`);
  await client.query(`ALTER TABLE app_store_notification_ingestions ADD COLUMN IF NOT EXISTS notification_type VARCHAR(120)`);
  await client.query(`ALTER TABLE app_store_notification_ingestions ADD COLUMN IF NOT EXISTS subtype VARCHAR(120)`);
  await client.query(`ALTER TABLE app_store_notification_ingestions ADD COLUMN IF NOT EXISTS bundle_id VARCHAR(255)`);
  await client.query(`ALTER TABLE app_store_notification_ingestions ADD COLUMN IF NOT EXISTS app_apple_id VARCHAR(64)`);
  await client.query(`ALTER TABLE app_store_notification_ingestions ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255)`);
  await client.query(`ALTER TABLE app_store_notification_ingestions ADD COLUMN IF NOT EXISTS original_transaction_id VARCHAR(255)`);
  await client.query(`ALTER TABLE app_store_notification_ingestions ADD COLUMN IF NOT EXISTS signed_date TIMESTAMP`);
  await client.query(`ALTER TABLE app_store_notification_ingestions ADD COLUMN IF NOT EXISTS bridge_status VARCHAR(32)`);
  await client.query(`ALTER TABLE app_store_notification_ingestions ADD COLUMN IF NOT EXISTS raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await client.query(`ALTER TABLE app_store_notification_ingestions ADD COLUMN IF NOT EXISTS normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb`);
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

export function normalizeAppStoreServerNotification(payload: unknown): AppStoreServerNotificationSummary {
  if (!isRecord(payload)) {
    return buildSummary(null);
  }

  return buildSummary(payload);
}

export function summarizeAppStoreServerNotification(payload: unknown): AppStoreServerNotificationSummary {
  return normalizeAppStoreServerNotification(payload);
}

export async function recordAppStoreNotificationIngestion(
  payload: unknown,
  client?: DbClient
): Promise<AppStoreNotificationIngestionRecord> {
  const summary = normalizeAppStoreServerNotification(payload);
  const activeClient = client ?? await getPool().connect() as DbClient;

  try {
    await ensureAppStoreNotificationIngestionTable(activeClient);
    const result = await activeClient.query(
      `INSERT INTO app_store_notification_ingestions (
        event_key,
        notification_uuid,
        environment,
        notification_type,
        subtype,
        bundle_id,
        app_apple_id,
        transaction_id,
        original_transaction_id,
        signed_date,
        bridge_status,
        raw_payload,
        normalized_payload,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'stored', $11::jsonb, $12::jsonb, NOW(), NOW())
      ON CONFLICT (event_key)
      DO UPDATE SET
        notification_uuid = EXCLUDED.notification_uuid,
        environment = EXCLUDED.environment,
        notification_type = EXCLUDED.notification_type,
        subtype = EXCLUDED.subtype,
        bundle_id = EXCLUDED.bundle_id,
        app_apple_id = EXCLUDED.app_apple_id,
        transaction_id = EXCLUDED.transaction_id,
        original_transaction_id = EXCLUDED.original_transaction_id,
        signed_date = EXCLUDED.signed_date,
        bridge_status = EXCLUDED.bridge_status,
        raw_payload = EXCLUDED.raw_payload,
        normalized_payload = EXCLUDED.normalized_payload,
        updated_at = NOW()
      RETURNING id, event_key, bridge_status`,
      [
        summary.eventKey,
        summary.notificationUuid,
        summary.environment,
        summary.notificationType,
        summary.subtype,
        summary.bundleId,
        summary.appAppleId,
        summary.transactionId,
        summary.originalTransactionId,
        summary.signedDate ? new Date(summary.signedDate) : null,
        JSON.stringify(payload ?? null),
        JSON.stringify(summary),
      ]
    );

    const row = result.rows[0] as AppStoreNotificationRow | undefined;
    if (!row) {
      throw new Error('Failed to store App Store notification ingestion');
    }

    return {
      id: Number(row.id),
      eventKey: row.event_key,
      bridgeStatus: row.bridge_status ?? 'stored',
      summary: {
        ...summary,
        handled: 'stored',
      },
    };
  } finally {
    if (!client) {
      activeClient.release();
    }
  }
}
