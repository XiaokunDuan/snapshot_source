import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

// GET: Fetch user's check-in records
export async function GET(request: NextRequest) {
    try {
        const authResult = await auth();
        const userId = authResult.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month'); // Format: YYYY-MM

        if (month && !MONTH_PATTERN.test(month)) {
            return NextResponse.json({ error: 'month must be in YYYY-MM format' }, { status: 400 });
        }

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

            // Build query based on month filter
            let query = 'SELECT * FROM check_ins WHERE user_id = $1';
            const params: Array<number | string> = [dbUserId];

            if (month) {
                query += ` AND check_in_date >= $2 AND check_in_date < $3`;
                const startDate = new Date(`${month}-01`);
                const endDate = new Date(startDate);
                endDate.setMonth(endDate.getMonth() + 1);
                params.push(startDate.toISOString().split('T')[0]);
                params.push(endDate.toISOString().split('T')[0]);
            }

            query += ' ORDER BY check_in_date DESC';

            const checkInsResult = await client.query(query, params);

            return NextResponse.json({
                checkIns: checkInsResult.rows.map(row => ({
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
            { error: 'Failed to fetch check-ins' },
            { status: 500 }
        );
    }
}

// POST: Create today's check-in
export async function POST(request: NextRequest) {
    try {
        const authResult = await auth();
        const userId = authResult.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { wordsLearned = 1, timeSpent = 0 } = await request.json();

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
            await client.query('BEGIN');

            // Get today's date
            const today = new Date().toISOString().split('T')[0];

            let checkIn;
            const createdCheckIn = await client.query(
                `INSERT INTO check_ins (user_id, check_in_date, words_learned, time_spent, created_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 ON CONFLICT (user_id, check_in_date) DO NOTHING
                 RETURNING *`,
                [dbUserId, today, wordsLearned, timeSpent]
            );

            if (createdCheckIn.rows.length > 0) {
                checkIn = createdCheckIn;
                // Calculate streak
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayDate = yesterday.toISOString().split('T')[0];

                const yesterdayCheckIn = await client.query(
                    'SELECT * FROM check_ins WHERE user_id = $1 AND check_in_date = $2',
                    [dbUserId, yesterdayDate]
                );

                // Update challenge streak
                if (yesterdayCheckIn.rows.length > 0) {
                    // Continuous streak - increment
                    await client.query(
                        `UPDATE learning_challenges 
             SET current_streak = current_streak + 1,
                 max_streak = GREATEST(max_streak, current_streak + 1)
             WHERE user_id = $1 AND status = 'active'`,
                        [dbUserId]
                    );
                } else {
                    // Streak broken - reset to 1
                    await client.query(
                        `UPDATE learning_challenges 
             SET current_streak = 1,
                 max_streak = GREATEST(max_streak, 1)
             WHERE user_id = $1 AND status = 'active'`,
                        [dbUserId]
                    );
                }
            } else {
                checkIn = await client.query(
                    `UPDATE check_ins
                     SET words_learned = words_learned + $1,
                         time_spent = time_spent + $2
                     WHERE user_id = $3 AND check_in_date = $4
                     RETURNING *`,
                    [wordsLearned, timeSpent, dbUserId, today]
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
            { error: 'Failed to create check-in' },
            { status: 500 }
        );
    }
}
