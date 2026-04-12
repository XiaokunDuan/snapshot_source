import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { summarizeAppStoreServerNotification } from '@/lib/app-store-billing';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const notification = summarizeAppStoreServerNotification(payload);

    return NextResponse.json(
      {
        received: true,
        handled: false,
        notification,
      },
      { status: 202 }
    );
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse App Store notification' },
      { status: 400 }
    );
  }
}
