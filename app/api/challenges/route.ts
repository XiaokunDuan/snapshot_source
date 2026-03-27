import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET: Fetch user's challenge data
export async function GET(request: NextRequest) {
    try {
        const authResult = await auth();
        const userId = authResult.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const client = await pool.connect();

        try {
            // Get user from database
            const userResult = await client.query(
                'SELECT id FROM users WHERE clerk_user_id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }

            const dbUserId = userResult.rows[0].id;

            // Get active challenge
            const challengeResult = await client.query(
                `SELECT * FROM learning_challenges 
         WHERE user_id = $1 AND status = 'active' 
         ORDER BY started_at DESC LIMIT 1`,
                [dbUserId]
            );

            if (challengeResult.rows.length === 0) {
                // Create default challenge if none exists
                const newChallenge = await client.query(
                    `INSERT INTO learning_challenges 
           (user_id, challenge_type, target_days, current_streak, max_streak, shield_cards, status, started_at)
           VALUES ($1, 'streak', 30, 0, 0, 0, 'active', NOW())
           RETURNING *`,
                    [dbUserId]
                );
                return NextResponse.json({ challenge: newChallenge.rows[0] });
            }

            return NextResponse.json({ challenge: challengeResult.rows[0] });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Get challenge error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch challenge data' },
            { status: 500 }
        );
    }
}

// PATCH: Update challenge progress (for check-in)
export async function PATCH(request: NextRequest) {
    try {
        const authResult = await auth();
        const userId = authResult.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { incrementStreak } = await request.json();

        const client = await pool.connect();

        try {
            // Get user
            const userResult = await client.query(
                'SELECT id FROM users WHERE clerk_user_id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }

            const dbUserId = userResult.rows[0].id;

            // Get active challenge
            const challengeResult = await client.query(
                `SELECT * FROM learning_challenges 
         WHERE user_id = $1 AND status = 'active' 
         ORDER BY started_at DESC LIMIT 1`,
                [dbUserId]
            );

            if (challengeResult.rows.length === 0) {
                return NextResponse.json({ error: 'No active challenge found' }, { status: 404 });
            }

            const challenge = challengeResult.rows[0];

            if (incrementStreak) {
                const newStreak = challenge.current_streak + 1;
                const newMaxStreak = Math.max(newStreak, challenge.max_streak);

                const updated = await client.query(
                    `UPDATE learning_challenges 
           SET current_streak = $1, max_streak = $2, updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
                    [newStreak, newMaxStreak, challenge.id]
                );

                return NextResponse.json({
                    success: true,
                    challenge: updated.rows[0]
                });
            }

            return NextResponse.json({ challenge });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Update challenge error:', error);
        return NextResponse.json(
            { error: 'Failed to update challenge' },
            { status: 500 }
        );
    }
}
