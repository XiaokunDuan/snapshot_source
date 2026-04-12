import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireDbUser } from '@/lib/users';

// GET: Fetch user's challenge data
export async function GET(request: NextRequest) {
    try {
        const user = await requireDbUser(request);
        const client = await getPool().connect();

        try {
            const challengeResult = await client.query(
                `SELECT * FROM learning_challenges 
         WHERE user_id = $1 AND status = 'active' 
         ORDER BY started_at DESC LIMIT 1`,
                [user.id]
            );

            if (challengeResult.rows.length === 0) {
                const newChallenge = await client.query(
                    `INSERT INTO learning_challenges 
           (user_id, challenge_type, target_days, current_streak, max_streak, shield_cards, status, started_at)
           VALUES ($1, 'streak', 30, 0, 0, 0, 'active', NOW())
           RETURNING *`,
                    [user.id]
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
            { error: error instanceof Error ? error.message : 'Failed to fetch challenge data' },
            { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}

// PATCH: Update challenge progress (for check-in)
export async function PATCH(request: NextRequest) {
    try {
        const user = await requireDbUser(request);
        const { incrementStreak } = await request.json();
        const client = await getPool().connect();

        try {
            const challengeResult = await client.query(
                `SELECT * FROM learning_challenges 
         WHERE user_id = $1 AND status = 'active' 
         ORDER BY started_at DESC LIMIT 1`,
                [user.id]
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
            { error: error instanceof Error ? error.message : 'Failed to update challenge' },
            { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}
