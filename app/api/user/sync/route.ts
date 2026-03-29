import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getPool } from '@/lib/db';
import { getBillingStatus } from '@/lib/billing';

const pool = getPool();

export async function GET(_request: NextRequest) {
    try {
        const authResult = await auth();
        const userId = authResult.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await currentUser();
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const client = await pool.connect();

        try {
            // Check if user exists in database
            const existingUser = await client.query(
                'SELECT * FROM users WHERE clerk_user_id = $1',
                [userId]
            );

            let dbUser;

            if (existingUser.rows.length === 0) {
                // Create new user
                const result = await client.query(
                    `INSERT INTO users (clerk_user_id, email, username, avatar_url, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           RETURNING *`,
                    [
                        userId,
                        user.emailAddresses[0]?.emailAddress || '',
                        user.username || user.firstName || 'User',
                        user.imageUrl || ''
                    ]
                );
                dbUser = result.rows[0];

                // Create default word book for new user
                await client.query(
                    `INSERT INTO word_books (user_id, name, description, is_default, created_at)
           VALUES ($1, $2, $3, TRUE, NOW())`,
                    [dbUser.id, '我的收藏', '默认单词本']
                );

                // Create initial challenge for new user
                await client.query(
                    `INSERT INTO learning_challenges (user_id, challenge_type, target_days, current_streak, max_streak, shield_cards, status, started_at)
           VALUES ($1, 'streak', 30, 0, 0, 0, 'active', NOW())`,
                    [dbUser.id]
                );
            } else {
                // Update existing user
                const result = await client.query(
                    `UPDATE users 
           SET email = $1, username = $2, avatar_url = $3, updated_at = NOW()
           WHERE clerk_user_id = $4
           RETURNING *`,
                    [
                        user.emailAddresses[0]?.emailAddress || '',
                        user.username || user.firstName || 'User',
                        user.imageUrl || '',
                        userId
                    ]
                );
                dbUser = result.rows[0];
            }

            return NextResponse.json({
                success: true,
                user: {
                    id: dbUser.id,
                    username: dbUser.username,
                    avatar_url: dbUser.avatar_url,
                    coins: dbUser.coins || 0
                },
                billing: await getBillingStatus(dbUser.id),
            });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('User sync error:', error);
        Sentry.captureException(error);
        return NextResponse.json(
            { error: 'Failed to sync user data' },
            { status: 500 }
        );
    }
}
