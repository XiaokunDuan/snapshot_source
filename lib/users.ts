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

function buildDisplayName(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) {
    return 'User';
  }

  return user.username || user.firstName || user.lastName || 'User';
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
    const displayName = buildDisplayName(user);
    const avatarUrl = user.imageUrl || '';

    const byEmail = await activeClient.query(
      'SELECT * FROM users WHERE email = $1 LIMIT 1',
      [email]
    );

    if (byEmail.rows[0]) {
      const rebound = await activeClient.query(
        `UPDATE users
         SET clerk_user_id = $1,
             username = $2,
             avatar_url = $3,
             updated_at = NOW()
         WHERE email = $4
         RETURNING *`,
        [clerkUserId, displayName, avatarUrl, email]
      );

      return rebound.rows[0] as AppUser;
    }

    const created = await activeClient.query(
      `INSERT INTO users (clerk_user_id, email, username, avatar_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [clerkUserId, email, displayName, avatarUrl]
    );

    return created.rows[0] as AppUser;
  } finally {
    if (!client) {
      activeClient.release();
    }
  }
}

export async function ensureUserScaffolding(userId: number, client?: DbClient) {
  const activeClient = client ?? await getPool().connect() as DbClient;

  try {
    const wordBookResult = await activeClient.query(
      'SELECT id FROM word_books WHERE user_id = $1 AND is_default = TRUE LIMIT 1',
      [userId]
    );

    if (!wordBookResult.rows[0]) {
      await activeClient.query(
        `INSERT INTO word_books (user_id, name, description, is_default, created_at)
         VALUES ($1, $2, $3, TRUE, NOW())`,
        [userId, '我的收藏', '默认单词本']
      );
    }

    const challengeResult = await activeClient.query(
      "SELECT id FROM learning_challenges WHERE user_id = $1 AND status = 'active' LIMIT 1",
      [userId]
    );

    if (!challengeResult.rows[0]) {
      await activeClient.query(
        `INSERT INTO learning_challenges (user_id, challenge_type, target_days, current_streak, max_streak, shield_cards, status, started_at)
         VALUES ($1, 'streak', 30, 0, 0, 0, 'active', NOW())`,
        [userId]
      );
    }
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
