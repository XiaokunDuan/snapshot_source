import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { requireDbUser } from '@/lib/users';
import { getBillingStatus } from '@/lib/billing';

export async function GET() {
  try {
    const user = await requireDbUser();
    const billing = await getBillingStatus(user.id);

    return NextResponse.json({ billing });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch billing status' },
      { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}
