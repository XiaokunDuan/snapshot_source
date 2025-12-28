import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET: Fetch user's notifications
export async function GET(request: NextRequest) {
    try {
        const authResult = await auth();
        const userId = authResult.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const client = await pool.connect();

        try {
            const userResult = await client.query(
                'SELECT id FROM users WHERE clerk_user_id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }

            const dbUserId = userResult.rows[0].id;

            const notifications = await client.query(
                `SELECT * FROM notifications 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 50`,
                [dbUserId]
            );

            const unreadCount = await client.query(
                `SELECT COUNT(*) as count FROM notifications 
         WHERE user_id = $1 AND is_read = FALSE`,
                [dbUserId]
            );

            return NextResponse.json({
                notifications: notifications.rows,
                unreadCount: parseInt(unreadCount.rows[0].count)
            });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Get notifications error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch notifications' },
            { status: 500 }
        );
    }
}

// POST: Create notification (internal use)
export async function POST(request: NextRequest) {
    try {
        const authResult = await auth();
        const userId = authResult.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { type, title, content, icon } = await request.json();

        const client = await pool.connect();

        try {
            const userResult = await client.query(
                'SELECT id FROM users WHERE clerk_user_id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }

            const dbUserId = userResult.rows[0].id;

            const newNotification = await client.query(
                `INSERT INTO notifications (user_id, type, title, content, icon, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
         RETURNING *`,
                [dbUserId, type, title, content, icon || null]
            );

            return NextResponse.json({
                success: true,
                notification: newNotification.rows[0]
            });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Create notification error:', error);
        return NextResponse.json(
            { error: 'Failed to create notification' },
            { status: 500 }
        );
    }
}

// PATCH: Mark notification(s) as read
export async function PATCH(request: NextRequest) {
    try {
        const authResult = await auth();
        const userId = authResult.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { notificationId, markAllRead } = await request.json();

        const client = await pool.connect();

        try {
            const userResult = await client.query(
                'SELECT id FROM users WHERE clerk_user_id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }

            const dbUserId = userResult.rows[0].id;

            if (markAllRead) {
                // Mark all as read
                await client.query(
                    `UPDATE notifications 
           SET is_read = TRUE 
           WHERE user_id = $1 AND is_read = FALSE`,
                    [dbUserId]
                );
            } else if (notificationId) {
                // Mark specific notification as read
                await client.query(
                    `UPDATE notifications 
           SET is_read = TRUE 
           WHERE id = $1 AND user_id = $2`,
                    [notificationId, dbUserId]
                );
            }

            return NextResponse.json({ success: true });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Update notification error:', error);
        return NextResponse.json(
            { error: 'Failed to update notification' },
            { status: 500 }
        );
    }
}
