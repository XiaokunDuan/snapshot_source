import Stripe from 'stripe';
import { getPool, type DbClient } from '@/lib/db';
import { getDbUserByClerkId, type AppUser } from '@/lib/users';
import { getStripe, getStripePriceId } from '@/lib/stripe';
import { sendPaymentFailedEmail, sendTrialStartedEmail } from '@/lib/resend';

const MONTHLY_ANALYZE_LIMIT = 100;
const FREE_ANALYZE_LIMIT = 20;
const ENTITLED_STATUSES = new Set(['trialing', 'active']);

export interface BillingStatus {
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

async function ensureBillingTables(client: DbClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS billing_customers (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id VARCHAR(255) NOT NULL,
      stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
      stripe_price_id VARCHAR(255),
      status VARCHAR(50) NOT NULL,
      trial_ends_at TIMESTAMP,
      current_period_start TIMESTAMP,
      current_period_end TIMESTAMP,
      cancel_at_period_end BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS usage_counters (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      monthly_limit INTEGER NOT NULL DEFAULT 100,
      analyze_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (user_id, period_start)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS billing_events (
      stripe_event_id VARCHAR(255) PRIMARY KEY,
      event_type VARCHAR(120) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function ensureCustomer(client: DbClient, user: AppUser) {
  await ensureBillingTables(client);

  const existing = await client.query(
    'SELECT stripe_customer_id FROM billing_customers WHERE user_id = $1',
    [user.id]
  );

  if (existing.rows.length > 0) {
    return String((existing.rows[0] as { stripe_customer_id: string }).stripe_customer_id);
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.username || undefined,
    metadata: {
      userId: String(user.id),
      clerkUserId: user.clerk_user_id,
    },
  });

  await client.query(
    `INSERT INTO billing_customers (user_id, stripe_customer_id, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id, updated_at = NOW()`,
    [user.id, customer.id]
  );

  return customer.id;
}

function normalizeTimestamp(value: number | null | undefined) {
  return value ? new Date(value * 1000) : null;
}

export function getSubscriptionPeriod(subscription: Stripe.Subscription) {
  const firstItem = subscription.items.data[0] as (Stripe.SubscriptionItem & {
    current_period_start?: number;
    current_period_end?: number;
  }) | undefined;

  const currentPeriodStart = normalizeTimestamp(
    firstItem?.current_period_start
      ?? (subscription as Stripe.Subscription & { current_period_start?: number }).current_period_start
      ?? subscription.trial_start
      ?? subscription.start_date
  );

  const currentPeriodEnd = normalizeTimestamp(
    firstItem?.current_period_end
      ?? (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end
      ?? subscription.trial_end
      ?? subscription.billing_cycle_anchor
  );

  return {
    currentPeriodStart,
    currentPeriodEnd,
  };
}

type BillingStatusRow = {
  status: string;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  monthly_limit: number | null;
  analyze_count: number | null;
};

export function buildBillingStatus(row: BillingStatusRow | null): BillingStatus {
  if (!row) {
    return {
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
  const hasAccess = ENTITLED_STATUSES.has(row.status) && usageCount < monthlyLimit;

  return {
    subscriptionStatus: row.status,
    hasAccess,
    monthlyLimit,
    usageCount,
    remaining: Math.max(monthlyLimit - usageCount, 0),
    trialEndsAt: row.trial_ends_at,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
  };
}

function buildFreeBillingStatus(usageCount: number): BillingStatus {
  return {
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

export async function upsertSubscriptionFromStripe(subscription: Stripe.Subscription, client?: DbClient) {
  const activeClient = client ?? await getPool().connect() as DbClient;

  try {
    await ensureBillingTables(activeClient);

    const clerkUserId = subscription.metadata.clerkUserId;
    const metadataUserId = subscription.metadata.userId ? Number(subscription.metadata.userId) : null;
    const dbUser = clerkUserId ? await getDbUserByClerkId(clerkUserId, activeClient) : null;
    const userId = dbUser?.id ?? metadataUserId;

    if (!userId) {
      throw new Error(`Could not resolve user for subscription ${subscription.id}`);
    }

    const priceId = subscription.items.data[0]?.price?.id ?? null;
    const trialEndsAt = normalizeTimestamp(subscription.trial_end);
    const { currentPeriodStart, currentPeriodEnd } = getSubscriptionPeriod(subscription);

    await activeClient.query(
      `INSERT INTO subscriptions (
        user_id,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_price_id,
        status,
        trial_ends_at,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        stripe_price_id = EXCLUDED.stripe_price_id,
        status = EXCLUDED.status,
        trial_ends_at = EXCLUDED.trial_ends_at,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        updated_at = NOW()`,
      [
        userId,
        String(subscription.customer),
        subscription.id,
        priceId,
        subscription.status,
        trialEndsAt,
        currentPeriodStart,
        currentPeriodEnd,
        subscription.cancel_at_period_end,
      ]
    );

    if (currentPeriodStart && currentPeriodEnd) {
      await activeClient.query(
        `INSERT INTO usage_counters (user_id, period_start, period_end, monthly_limit, analyze_count, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 0, NOW(), NOW())
         ON CONFLICT (user_id, period_start)
         DO UPDATE SET period_end = EXCLUDED.period_end, monthly_limit = EXCLUDED.monthly_limit, updated_at = NOW()`,
        [
          userId,
          currentPeriodStart.toISOString().slice(0, 10),
          currentPeriodEnd.toISOString().slice(0, 10),
          MONTHLY_ANALYZE_LIMIT,
        ]
      );
    }

    if (dbUser?.email && subscription.status === 'trialing') {
      await sendTrialStartedEmail(dbUser.email, trialEndsAt?.toISOString() ?? null);
    }
  } finally {
    if (!client) {
      activeClient.release();
    }
  }
}

export async function markStripeEventProcessed(eventId: string, eventType: string) {
  const client = await getPool().connect() as DbClient;

  try {
    await ensureBillingTables(client);
    const result = await client.query(
      `INSERT INTO billing_events (stripe_event_id, event_type)
       VALUES ($1, $2)
       ON CONFLICT (stripe_event_id) DO NOTHING
       RETURNING stripe_event_id`,
      [eventId, eventType]
    );

    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

export async function createTrialSubscription(user: AppUser) {
  const client = await getPool().connect() as DbClient;

  try {
    await ensureBillingTables(client);
    const status = await getBillingStatus(user.id, client);

    if (!['inactive', 'free'].includes(status.subscriptionStatus)) {
      throw new Error('An existing subscription already exists');
    }

    const stripeCustomerId = await ensureCustomer(client, user);
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: getStripePriceId() }],
      trial_period_days: 3,
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      metadata: {
        userId: String(user.id),
        clerkUserId: user.clerk_user_id,
      },
      expand: ['pending_setup_intent'],
    });

    await upsertSubscriptionFromStripe(subscription, client);

    const setupIntent = subscription.pending_setup_intent as Stripe.SetupIntent | null;
    if (!setupIntent?.client_secret) {
      throw new Error('Stripe did not return a setup intent client secret');
    }

    return {
      subscriptionId: subscription.id,
      customerId: stripeCustomerId,
      clientSecret: setupIntent.client_secret,
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
    };
  } finally {
    client.release();
  }
}

export async function getBillingStatus(userId: number, client?: DbClient): Promise<BillingStatus> {
  const activeClient = client ?? await getPool().connect() as DbClient;

  try {
    await ensureBillingTables(activeClient);
    const result = await activeClient.query(
      `SELECT
         s.status,
         s.trial_ends_at,
         s.current_period_start,
         s.current_period_end,
         s.cancel_at_period_end,
         u.monthly_limit,
         u.analyze_count
       FROM subscriptions s
       LEFT JOIN usage_counters u
         ON u.user_id = s.user_id
        AND u.period_start = COALESCE(s.current_period_start::date, u.period_start)
       WHERE s.user_id = $1`,
      [userId]
    );

    const row = (result.rows[0] as {
      status: string;
      trial_ends_at: string | null;
      current_period_start: string | null;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
      monthly_limit: number | null;
      analyze_count: number | null;
    } | undefined) ?? null;

    if (!row) {
      const freeUsageResult = await activeClient.query(
        'SELECT COUNT(*)::int AS usage_count FROM vocabulary_history WHERE user_id = $1',
        [userId]
      );
      const usageCount = Number((freeUsageResult.rows[0] as { usage_count?: number } | undefined)?.usage_count ?? 0);
      return buildFreeBillingStatus(usageCount);
    }

    return buildBillingStatus(row);
  } finally {
    if (!client) {
      activeClient.release();
    }
  }
}

export async function consumeAnalyzeCredit(userId: number) {
  const client = await getPool().connect() as DbClient;

  try {
    await ensureBillingTables(client);
    const status = await getBillingStatus(userId, client);

    if (status.subscriptionStatus === 'free') {
      if (status.remaining <= 0) {
        throw new Error('Free analyze limit reached');
      }

      return {
        analyze_count: status.usageCount + 1,
        monthly_limit: status.monthlyLimit,
      };
    }

    if (!ENTITLED_STATUSES.has(status.subscriptionStatus)) {
      throw new Error('Subscription required');
    }

    if (!status.currentPeriodStart || !status.currentPeriodEnd) {
      throw new Error('Subscription period is not available');
    }

    if (status.remaining <= 0) {
      throw new Error('Monthly analyze limit reached');
    }

    const periodStart = status.currentPeriodStart.slice(0, 10);
    const periodEnd = status.currentPeriodEnd.slice(0, 10);

    const updated = await client.query(
      `INSERT INTO usage_counters (user_id, period_start, period_end, monthly_limit, analyze_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 1, NOW(), NOW())
       ON CONFLICT (user_id, period_start)
       DO UPDATE SET
         analyze_count = usage_counters.analyze_count + 1,
         period_end = EXCLUDED.period_end,
         monthly_limit = EXCLUDED.monthly_limit,
         updated_at = NOW()
       WHERE usage_counters.analyze_count < usage_counters.monthly_limit
       RETURNING analyze_count, monthly_limit`,
      [userId, periodStart, periodEnd, status.monthlyLimit || MONTHLY_ANALYZE_LIMIT]
    );

    if (updated.rows.length === 0) {
      throw new Error('Monthly analyze limit reached');
    }

    return updated.rows[0] as { analyze_count: number; monthly_limit: number };
  } finally {
    client.release();
  }
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) {
    return;
  }

  const client = await getPool().connect() as DbClient;

  try {
    await ensureBillingTables(client);
    const result = await client.query(
      `SELECT u.email
       FROM billing_customers bc
       JOIN users u ON u.id = bc.user_id
       WHERE bc.stripe_customer_id = $1`,
      [customerId]
    );

    const email = (result.rows[0] as { email?: string } | undefined)?.email;
    if (email) {
      await sendPaymentFailedEmail(email);
    }
  } finally {
    client.release();
  }
}
