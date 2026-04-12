import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireDbUser } from '@/lib/users';

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

// GET: Fetch user's check-in records
export async function GET(request: NextRequest) {
    try {
        const user = await requireDbUser(request);
        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month');

        if (month && !MONTH_PATTERN.test(month)) {
            return NextResponse.json({ error: 'month must be in YYYY-MM format' }, { status: 400 });
        }

        const client = await getPool().connect();

        try {
            let query = 'SELECT * FROM check_ins WHERE user_id = $1';
            const params: Array<number | string> = [user.id];

            if (month) {
                query += ' AND check_in_date >= $2 AND check_in_date < $3';
                const startDate = new Date(`${month}-01`);
                const endDate = new Date(startDate);
                endDate.setMonth(endDate.getMonth() + 1);
                params.push(startDate.toISOString().split('T')[0]);
                params.push(endDate.toISOString().split('T')[0]);
            }

            query += ' ORDER BY check_in_date DESC';

            const checkInsResult = await client.query(query, params);

            return NextResponse.json({
                checkIns: checkInsResult.rows.map((row) => ({
                    date: row.check_in_date,
                    wordsLearned: row.words_learned,
                    timeSpent: row.time_spent
                }))
            });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Get check-ins error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch check-ins' },
            { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}

// POST: Create today's check-in
export async function POST(request: NextRequest) {
    try {
        const user = await requireDbUser(request);
        const { wordsLearned = 1, timeSpent = 0 } = await request.json();
        const client = await getPool().connect();

        try {
            await client.query('BEGIN');

            const today = new Date().toISOString().split('T')[0];

            let checkIn;
            const createdCheckIn = await client.query(
                `INSERT INTO check_ins (user_id, check_in_date, words_learned, time_spent, created_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 ON CONFLICT (user_id, check_in_date) DO NOTHING
                 RETURNING *`,
                [user.id, today, wordsLearned, timeSpent]
            );

            if (createdCheckIn.rows.length > 0) {
                checkIn = createdCheckIn;
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayDate = yesterday.toISOString().split('T')[0];

                const yesterdayCheckIn = await client.query(
                    'SELECT * FROM check_ins WHERE user_id = $1 AND check_in_date = $2',
                    [user.id, yesterdayDate]
                );

                if (yesterdayCheckIn.rows.length > 0) {
                    await client.query(
                        `UPDATE learning_challenges 
             SET current_streak = current_streak + 1,
                 max_streak = GREATEST(max_streak, current_streak + 1)
             WHERE user_id = $1 AND status = 'active'`,
                        [user.id]
                    );
                } else {
                    await client.query(
                        `UPDATE learning_challenges 
             SET current_streak = 1,
                 max_streak = GREATEST(max_streak, 1)
             WHERE user_id = $1 AND status = 'active'`,
                        [user.id]
                    );
                }
            } else {
                checkIn = await client.query(
                    `UPDATE check_ins
                     SET words_learned = words_learned + $1,
                         time_spent = time_spent + $2
                     WHERE user_id = $3 AND check_in_date = $4
                     RETURNING *`,
                    [wordsLearned, timeSpent, user.id, today]
                );
            }

            await client.query('COMMIT');

            return NextResponse.json({
                success: true,
                checkIn: checkIn.rows[0]
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Create check-in error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create check-in' },
            { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}
