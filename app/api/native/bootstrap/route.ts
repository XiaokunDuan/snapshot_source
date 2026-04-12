import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getBillingStatus } from '@/lib/billing';
import { getHistoryOverview } from '@/lib/history-store';
import { buildNativeBootstrapPayload } from '@/lib/native-api';
import { requireDbUser } from '@/lib/users';

export const runtime = 'nodejs';

const querySchema = z.object({
  historyLimit: z.coerce.number().int().min(1).max(20).default(5),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireDbUser(request);
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      historyLimit: searchParams.get('historyLimit') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request query' },
        { status: 400 }
      );
    }

    const [billing, history] = await Promise.all([
      getBillingStatus(user.id),
      getHistoryOverview(user.id, parsed.data.historyLimit),
    ]);

    return NextResponse.json(buildNativeBootstrapPayload(user, billing, history));
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch native bootstrap payload' },
      { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}
