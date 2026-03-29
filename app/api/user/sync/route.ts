import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getPool } from '@/lib/db';
import { getBillingStatus } from '@/lib/billing';
import { ensureDbUserFromClerkId, ensureUserScaffolding } from '@/lib/users';

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

        const client = await getPool().connect();

        try {
            const dbUser = await ensureDbUserFromClerkId(userId, client);
            await ensureUserScaffolding(dbUser.id, client);

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
