import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getPool } from '@/lib/db';
import { getBillingStatus } from '@/lib/billing';
import { requireDbUser, ensureUserScaffolding } from '@/lib/users';

export async function GET(_request: NextRequest) {
    try {
        const dbUser = await requireDbUser(_request);
        const client = await getPool().connect();

        try {
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
