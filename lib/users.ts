import { auth, currentUser } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { getPool, type DbClient } from '@/lib/db';
import { verifyAppSessionToken, type AppSessionProvider } from '@/lib/app-session';

export interface AppUser {
  id: number;
  auth_provider: AppSessionProvider | null;
  auth_subject: string | null;
  apple_user_id: string | null;
  clerk_user_id: string | null;
  email: string;
  username: string | null;
  avatar_url: string | null;
  coins: number;
}

export interface AuthIdentity {
  provider: AppSessionProvider;
  subject: string;
  email: string;
  username?: string | null;
  avatarUrl?: string | null;
}

function buildDisplayName(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) {
    return 'User';
  }

  return user.username || user.firstName || user.lastName || 'User';
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  return header.slice('Bearer '.length).trim() || null;
}

async function ensureUsersTable(client: DbClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      clerk_user_id VARCHAR(255) UNIQUE,
      apple_user_id VARCHAR(255) UNIQUE,
      auth_provider VARCHAR(32),
      auth_subject VARCHAR(255),
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(100),
      avatar_url TEXT,
      coins INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(255)`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_user_id VARCHAR(255)`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(32)`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_subject VARCHAR(255)`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INTEGER DEFAULT 0`);
  await client.query(`ALTER TABLE users ALTER COLUMN clerk_user_id DROP NOT NULL`);

  await client.query(`
    UPDATE users
    SET auth_provider = COALESCE(auth_provider, 'clerk'),
        auth_subject = COALESCE(auth_subject, clerk_user_id)
    WHERE clerk_user_id IS NOT NULL
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_identity
    ON users(auth_provider, auth_subject)
    WHERE auth_provider IS NOT NULL AND auth_subject IS NOT NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_users_clerk_id
    ON users(clerk_user_id)
    WHERE clerk_user_id IS NOT NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_users_apple_id
    ON users(apple_user_id)
    WHERE apple_user_id IS NOT NULL
  `);
}

async function getDbUserByIdentity(provider: AppSessionProvider, subject: string, client?: DbClient): Promise<AppUser | null> {
  const activeClient = client ?? await getPool().connect() as DbClient;

  try {
    await ensureUsersTable(activeClient);
    const result = await activeClient.query(
      'SELECT * FROM users WHERE auth_provider = $1 AND auth_subject = $2 LIMIT 1',
      [provider, subject]
    );
    return (result.rows[0] as AppUser | undefined) ?? null;
  } finally {
    if (!client) {
      activeClient.release();
    }
  }
}

export async function getDbUserByClerkId(clerkUserId: string, client?: DbClient): Promise<AppUser | null> {
  return getDbUserByIdentity('clerk', clerkUserId, client);
}

export async function ensureDbUserFromIdentity(identity: AuthIdentity, client?: DbClient): Promise<AppUser> {
  const activeClient = client ?? await getPool().connect() as DbClient;

  try {
    await ensureUsersTable(activeClient);
    const existing = await getDbUserByIdentity(identity.provider, identity.subject, activeClient);
    if (existing) {
      const updated = await activeClient.query(
        `UPDATE users
         SET email = COALESCE($3, email),
             username = COALESCE($4, username),
             avatar_url = COALESCE($5, avatar_url),
             apple_user_id = CASE WHEN $1 = 'apple' THEN $2 ELSE apple_user_id END,
             clerk_user_id = CASE WHEN $1 = 'clerk' THEN $2 ELSE clerk_user_id END,
             updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [identity.provider, identity.subject, identity.email, identity.username ?? null, identity.avatarUrl ?? null, existing.id]
      );
      return updated.rows[0] as AppUser;
    }

    const byEmail = await activeClient.query(
      'SELECT * FROM users WHERE email = $1 LIMIT 1',
      [identity.email]
    );

    if (byEmail.rows[0]) {
      const rebound = await activeClient.query(
        `UPDATE users
         SET auth_provider = $1,
             auth_subject = $2,
             username = COALESCE($3, username),
             avatar_url = COALESCE($4, avatar_url),
             apple_user_id = CASE WHEN $1 = 'apple' THEN $2 ELSE apple_user_id END,
             clerk_user_id = CASE WHEN $1 = 'clerk' THEN $2 ELSE clerk_user_id END,
             updated_at = NOW()
         WHERE email = $5
         RETURNING *`,
        [identity.provider, identity.subject, identity.username ?? null, identity.avatarUrl ?? null, identity.email]
      );

      return rebound.rows[0] as AppUser;
    }

    const created = await activeClient.query(
      `INSERT INTO users (
        auth_provider,
        auth_subject,
        apple_user_id,
        clerk_user_id,
        email,
        username,
        avatar_url,
        created_at,
        updated_at
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [
        identity.provider,
        identity.subject,
        identity.provider === 'apple' ? identity.subject : null,
        identity.provider === 'clerk' ? identity.subject : null,
        identity.email,
        identity.username ?? null,
        identity.avatarUrl ?? null,
      ]
    );

    return created.rows[0] as AppUser;
  } finally {
    if (!client) {
      activeClient.release();
    }
  }
}

export async function ensureDbUserFromClerkId(clerkUserId: string, client?: DbClient): Promise<AppUser> {
  const user = await currentUser();
  if (!user) {
    throw new Error('Clerk user not found');
  }

  const email = user.emailAddresses[0]?.emailAddress;
  if (!email) {
    throw new Error('Clerk user is missing an email address');
  }

  return ensureDbUserFromIdentity({
    provider: 'clerk',
    subject: clerkUserId,
    email,
    username: buildDisplayName(user),
    avatarUrl: user.imageUrl || null,
  }, client);
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

async function resolveRequestIdentity(request?: NextRequest): Promise<AuthIdentity | null> {
  if (request) {
    const bearerToken = getBearerToken(request);
    if (bearerToken) {
      const claims = verifyAppSessionToken(bearerToken);
      if (claims?.email) {
        return {
          provider: claims.provider,
          subject: claims.subject,
          email: claims.email,
          username: claims.name ?? null,
          avatarUrl: claims.avatarUrl ?? null,
        };
      }
    }
  }

  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const user = await currentUser();
  if (!user) {
    return null;
  }

  const email = user.emailAddresses[0]?.emailAddress;
  if (!email) {
    throw new Error('Clerk user is missing an email address');
  }

  return {
    provider: 'clerk',
    subject: userId,
    email,
    username: buildDisplayName(user),
    avatarUrl: user.imageUrl || null,
  };
}

export async function requireDbUser(request?: NextRequest) {
  const identity = await resolveRequestIdentity(request);
  if (!identity) {
    throw new Error('Unauthorized');
  }

  return ensureDbUserFromIdentity(identity);
}
