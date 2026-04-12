import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { requireDbUser } from '@/lib/users';
import { activateTrialSubscription } from '@/lib/billing';
import { trackServerEvent } from '@/lib/analytics';

const activateSchema = z.object({
  setupIntentId: z.string().trim().min(1, 'setupIntentId is required'),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireDbUser(req);
    const parsed = activateSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 }
      );
    }

    const activated = await activateTrialSubscription(user, parsed.data.setupIntentId);

    await trackServerEvent('billing_trial_started', {
      subscriptionId: activated.subscriptionId,
      customerId: activated.customerId,
    });

    return NextResponse.json({ success: true, ...activated });
  } catch (error) {
    Sentry.captureException(error);
    const message = error instanceof Error ? error.message : 'Failed to activate membership';

    return NextResponse.json(
      {
        error: message === 'An existing subscription already exists'
          ? 'An active membership is already available on this account.'
          : message,
      },
      { status: message === 'An existing subscription already exists' ? 409 : 400 }
    );
  }
}
