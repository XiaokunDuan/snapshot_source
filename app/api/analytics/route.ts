import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { trackServerEvent } from '@/lib/analytics';

const analyticsSchema = z.object({
  event: z.string().trim().min(1).max(100),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = analyticsSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid analytics payload' }, { status: 400 });
    }

    await trackServerEvent(parsed.data.event, parsed.data.properties ?? {});
    return NextResponse.json({ success: true });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Failed to track event' }, { status: 500 });
  }
}
