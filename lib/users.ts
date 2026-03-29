import { auth, currentUser } from '@clerk/nextjs/server';
import { getPool, type DbClient } from '@/lib/db';

export interface AppUser {
  id: number;
  clerk_user_id: string;
  email: string;
  username: string | null;
  avatar_url: string | null;
  coins: number;
}

async function ensureUsersTable(client: DbClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      clerk_user_id VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(100),
      avatar_url TEXT,
      coins INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_user_id)
  `);
}

export async function getDbUserByClerkId(clerkUserId: string, client?: DbClient): Promise<AppUser | null> {
  const activeClient = client ?? await getPool().connect() as DbClient;

  try {
    await ensureUsersTable(activeClient);
    const result = await activeClient.query(
      'SELECT * FROM users WHERE clerk_user_id = $1',
      [clerkUserId]
    );

    return (result.rows[0] as AppUser | undefined) ?? null;
  } finally {
    if (!client) {
      activeClient.release();
    }
  }
}

export async function ensureDbUserFromClerkId(clerkUserId: string, client?: DbClient): Promise<AppUser> {
  const activeClient = client ?? await getPool().connect() as DbClient;

  try {
    await ensureUsersTable(activeClient);
    const existing = await getDbUserByClerkId(clerkUserId, activeClient);
    if (existing) {
      return existing;
    }

    const user = await currentUser();
    if (!user) {
      throw new Error('Clerk user not found');
    }

    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      throw new Error('Clerk user is missing an email address');
    }

    const created = await activeClient.query(
      `INSERT INTO users (clerk_user_id, email, username, avatar_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (clerk_user_id)
       DO UPDATE SET
         email = EXCLUDED.email,
         username = EXCLUDED.username,
         avatar_url = EXCLUDED.avatar_url,
         updated_at = NOW()
       RETURNING *`,
      [
        clerkUserId,
        email,
        user.username || user.firstName || 'User',
        user.imageUrl || '',
      ]
    );

    return created.rows[0] as AppUser;
  } finally {
    if (!client) {
      activeClient.release();
    }
  }
}

export async function requireDbUser() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error('Unauthorized');
  }

  return ensureDbUserFromClerkId(userId);
}
