import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { requireDbUser } from '@/lib/users';
import { createTrialSubscription } from '@/lib/billing';
import { trackServerEvent } from '@/lib/analytics';

export async function POST() {
  try {
    const user = await requireDbUser();
    const checkout = await createTrialSubscription(user);

    await trackServerEvent('billing_checkout_started', {
      subscriptionId: checkout.subscriptionId,
    });

    return NextResponse.json(checkout);
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start checkout' },
      { status: 400 }
    );
  }
}
