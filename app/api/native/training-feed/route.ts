import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getHistoryOverview } from '@/lib/history-store';
import { buildNativeTrainingFeed } from '@/lib/native-api';
import { requireDbUser } from '@/lib/users';

export const runtime = 'nodejs';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(12),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireDbUser(request);
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request query' },
        { status: 400 }
      );
    }

    const history = await getHistoryOverview(user.id, parsed.data.limit);
    const cards = buildNativeTrainingFeed(history.recent);

    return NextResponse.json({
      cards,
      totalCount: history.totalCount,
      returnedCount: cards.length,
      hasMore: history.totalCount > cards.length,
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch native training feed' },
      { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}
