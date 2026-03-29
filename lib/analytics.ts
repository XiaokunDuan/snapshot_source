import { auth } from '@clerk/nextjs/server';
import { getPool } from '@/lib/db';
import { getDbUserByClerkId } from '@/lib/users';

async function ensureAnalyticsTable() {
  const client = await getPool().connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        clerk_user_id VARCHAR(255),
        event_name VARCHAR(100) NOT NULL,
        properties JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created_at
      ON analytics_events(event_name, created_at DESC)
    `);
  } finally {
    client.release();
  }
}

export async function trackServerEvent(eventName: string, properties: Record<string, unknown> = {}) {
  await ensureAnalyticsTable();

  const { userId: clerkUserId } = await auth();
  const dbUser = clerkUserId ? await getDbUserByClerkId(clerkUserId) : null;
  const client = await getPool().connect();

  try {
    await client.query(
      `INSERT INTO analytics_events (user_id, clerk_user_id, event_name, properties)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [dbUser?.id ?? null, clerkUserId ?? null, eventName, JSON.stringify(properties)]
    );
  } finally {
    client.release();
  }
}
