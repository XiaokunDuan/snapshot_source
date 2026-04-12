import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { requireDbUser } from '@/lib/users';
import { enforceRateLimit } from '@/lib/rate-limit';
import { buildFallbackVariants } from '@/lib/language-content';
import { generateLanguageVariants } from '@/lib/text-generation';
import { trackServerEvent } from '@/lib/analytics';

const enrichSchema = z.object({
  sourceObject: z.string().trim().min(1).max(200),
  sourceLabelEn: z.string().trim().min(1).max(200),
  word: z.string().trim().min(1).max(100),
  phonetic: z.string().trim().max(100).optional().default(''),
  meaning: z.string().trim().min(1).max(1000),
  sentence: z.string().trim().max(2000).optional().default(''),
  sentence_cn: z.string().trim().max(2000).optional().default(''),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireDbUser(req);
    const identifier = `user:${user.id}:enrich`;
    const rateLimit = await enforceRateLimit({
      identifier,
      route: '/api/analyze/enrich',
      limit: 20,
      windowSeconds: 600,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    const parsed = enrichSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 }
      );
    }

    const input = parsed.data;

    let languagePack;
    try {
      languagePack = await generateLanguageVariants({
        sourceObject: input.sourceObject,
        sourceLabelEn: input.sourceLabelEn,
        word: input.word,
        phonetic: input.phonetic,
        meaning: input.meaning,
        sentence: input.sentence,
        sentenceCn: input.sentence_cn,
      });
    } catch (error) {
      console.error('[Analyze Enrich] Falling back to base variants:', error);
      languagePack = buildFallbackVariants({
        sourceObject: input.sourceObject,
        sourceLabelEn: input.sourceLabelEn,
        word: input.word,
        phonetic: input.phonetic,
        meaning: input.meaning,
        sentence: input.sentence,
        sentenceCn: input.sentence_cn,
      });
    }

    await trackServerEvent('analyze_enriched', {
      word: input.word,
      sourceObject: input.sourceObject,
    }).catch(() => undefined);

    return NextResponse.json({
      success: true,
      sourceObject: languagePack.sourceObject,
      sourceLabelEn: languagePack.sourceLabelEn,
      availableLanguages: languagePack.availableLanguages,
      variants: languagePack.variants,
      enhancementPending: false,
    });
  } catch (error) {
    console.error('[Analyze Enrich] Error:', error);
    Sentry.captureException(error);
    await trackServerEvent('analyze_enrich_failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    }).catch(() => undefined);

    return NextResponse.json(
      {
        error: 'Language enrichment failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
