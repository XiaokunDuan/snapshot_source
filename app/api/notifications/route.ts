import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireDbUser } from '@/lib/users';

// GET: Fetch user's notifications
export async function GET(request: NextRequest) {
    try {
        const user = await requireDbUser(request);
        const client = await getPool().connect();

        try {
            const notifications = await client.query(
                `SELECT * FROM notifications 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 50`,
                [user.id]
            );

            const unreadCount = await client.query(
                `SELECT COUNT(*) as count FROM notifications 
         WHERE user_id = $1 AND is_read = FALSE`,
                [user.id]
            );

            return NextResponse.json({
                notifications: notifications.rows,
                unreadCount: parseInt(String(unreadCount.rows[0].count), 10)
            });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Get notifications error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch notifications' },
            { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}

// POST: Create notification (internal use)
export async function POST(request: NextRequest) {
    try {
        const user = await requireDbUser(request);
        const { type, title, content, icon } = await request.json();
        const client = await getPool().connect();

        try {
            const newNotification = await client.query(
                `INSERT INTO notifications (user_id, type, title, content, icon, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
         RETURNING *`,
                [user.id, type, title, content, icon || null]
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
            { error: error instanceof Error ? error.message : 'Failed to create notification' },
            { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}

// PATCH: Mark notification(s) as read
export async function PATCH(request: NextRequest) {
    try {
        const user = await requireDbUser(request);
        const { notificationId, markAllRead } = await request.json();
        const client = await getPool().connect();

        try {
            if (markAllRead) {
                await client.query(
                    `UPDATE notifications 
           SET is_read = TRUE 
           WHERE user_id = $1 AND is_read = FALSE`,
                    [user.id]
                );
            } else if (notificationId) {
                await client.query(
                    `UPDATE notifications 
           SET is_read = TRUE 
           WHERE id = $1 AND user_id = $2`,
                    [notificationId, user.id]
                );
            }

            return NextResponse.json({ success: true });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Update notification error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to update notification' },
            { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}
