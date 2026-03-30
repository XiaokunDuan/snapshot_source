import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { enforceRateLimit } from '@/lib/rate-limit';
import { requireDbUser } from '@/lib/users';
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/language-content';
import { getOrCreateTtsAudio } from '@/lib/tts';
import { trackServerEvent } from '@/lib/analytics';

export const runtime = 'nodejs';

const ttsSchema = z.object({
  language: z.enum(SUPPORTED_LANGUAGE_CODES),
  term: z.string().trim().min(1).max(120),
});

export async function POST(req: NextRequest) {
  let userId: number | null = null;
  let language = 'unknown';

  try {
    const user = await requireDbUser();
    userId = user.id;

    const rateLimit = await enforceRateLimit({
      identifier: `user:${user.id}`,
      route: '/api/tts',
      limit: 40,
      windowSeconds: 600,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'TTS rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    const parsed = ttsSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid TTS request' },
        { status: 400 }
      );
    }

    language = parsed.data.language;
    const audio = await getOrCreateTtsAudio(parsed.data);

    await trackServerEvent('tts_generated', {
      language: parsed.data.language,
      cached: audio.cached,
    }).catch(() => undefined);

    return NextResponse.json(audio);
  } catch (error) {
    Sentry.withScope((scope) => {
      scope.setTag('route', '/api/tts');
      scope.setTag('language', language);
      if (userId) {
        scope.setUser({ id: String(userId) });
      }
      Sentry.captureException(error);
    });

    return NextResponse.json(
      {
        error: 'TTS generation failed',
        details: error instanceof Error ? error.message : 'Unknown TTS error',
      },
      { status: 500 }
    );
  }
}
