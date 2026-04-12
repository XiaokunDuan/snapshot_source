import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { recordAppStoreNotificationIngestion } from '@/lib/app-store-billing';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json(
        { error: 'App Store notification payload must be a JSON object' },
        { status: 400 }
      );
    }

    try {
      const ingestion = await recordAppStoreNotificationIngestion(payload);

      return NextResponse.json(
        {
          received: true,
          stored: true,
          bridge: 'notification_ingestion',
          ingestion: {
            id: ingestion.id,
            eventKey: ingestion.eventKey,
            bridgeStatus: ingestion.bridgeStatus,
          },
          notification: ingestion.summary,
        },
        { status: 202 }
      );
    } catch (error) {
      Sentry.captureException(error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to store App Store notification' },
        { status: 500 }
      );
    }
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse App Store notification' },
      { status: 400 }
    );
  }
}
