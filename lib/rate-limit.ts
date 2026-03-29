import { getPool } from '@/lib/db';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

async function ensureRateLimitTable() {
  const client = await getPool().connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        identifier VARCHAR(255) NOT NULL,
        route VARCHAR(120) NOT NULL,
        window_start TIMESTAMP NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (identifier, route, window_start)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rate_limits_route_window
      ON rate_limits(route, window_start DESC)
    `);
  } finally {
    client.release();
  }
}

export function getRateLimitWindow(nowMs: number, windowSeconds: number) {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(nowMs / windowMs) * windowMs);
  const resetAt = new Date(windowStart.getTime() + windowMs);

  return {
    windowStart,
    resetAt,
  };
}

export async function enforceRateLimit(input: {
  identifier: string;
  route: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  await ensureRateLimitTable();

  const { windowStart, resetAt } = getRateLimitWindow(Date.now(), input.windowSeconds);
  const client = await getPool().connect();

  try {
    const result = await client.query(
      `INSERT INTO rate_limits (identifier, route, window_start, request_count)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (identifier, route, window_start)
       DO UPDATE SET request_count = rate_limits.request_count + 1
       RETURNING request_count`,
      [input.identifier, input.route, windowStart]
    );

    const count = Number((result.rows[0] as { request_count: number }).request_count);
    const remaining = Math.max(input.limit - count, 0);

    return {
      allowed: count <= input.limit,
      limit: input.limit,
      remaining,
      resetAt,
    };
  } finally {
    client.release();
  }
}
