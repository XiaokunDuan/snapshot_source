import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { enforceRateLimit } from '@/lib/rate-limit';
import { consumeAnalyzeCredit, getBillingStatus } from '@/lib/billing';
import { requireDbUser } from '@/lib/users';
import { trackServerEvent } from '@/lib/analytics';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGE_CODES, normalizeLanguageCode, type LanguageCode } from '@/lib/language-content';
import { generateLanguageCardsWithGemini } from '@/lib/gemini-multilingual';

const analyzeSchema = z.object({
    imageUrl: z.string().min(1, 'imageUrl is required'),
    primaryLanguage: z.enum(SUPPORTED_LANGUAGE_CODES).optional().default(DEFAULT_LANGUAGE),
    targetLanguages: z.array(z.enum(SUPPORTED_LANGUAGE_CODES)).max(5).optional(),
});

export async function POST(req: NextRequest) {
    let userId: number | null = null;
    let requestImageKind: 'data-url' | 'remote-url' | 'unknown' = 'unknown';
    let requestMimeType = 'unknown';
    try {
        const user = await requireDbUser(req);
        userId = user.id;
        const identifier = `user:${user.id}`;
        const rateLimit = await enforceRateLimit({
            identifier,
            route: '/api/analyze',
            limit: 10,
            windowSeconds: 600,
        });

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429 }
            );
        }

        const parsed = analyzeSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || 'Invalid request body' },
                { status: 400 }
            );
        }

        const billingStatus = await getBillingStatus(user.id);
        if (!billingStatus.hasAccess) {
            return NextResponse.json(
                {
                    error: billingStatus.subscriptionStatus === 'free'
                        ? 'You have used all 20 free analyses'
                        : billingStatus.subscriptionStatus === 'inactive'
                            ? 'An active subscription or trial is required'
                            : 'Your monthly analyze limit has been reached',
                    billingStatus,
                },
                { status: 402 }
            );
        }

        const { imageUrl } = parsed.data;
        const targetLanguages = Array.from(new Set(parsed.data.targetLanguages?.length
            ? parsed.data.targetLanguages
            : [parsed.data.primaryLanguage])) as LanguageCode[];
        const primaryLanguage = targetLanguages.includes(parsed.data.primaryLanguage)
            ? parsed.data.primaryLanguage
            : targetLanguages[0];
        requestImageKind = imageUrl.startsWith('data:') ? 'data-url' : 'remote-url';

        let imageData: string;
        let mimeType = 'image/jpeg';
        if (imageUrl.startsWith('data:')) {
            mimeType = getMimeTypeFromDataUrl(imageUrl);
            imageData = imageUrl.split(',')[1];
        } else {
            const remoteUrl = validateRemoteImageUrl(imageUrl);
            if (!remoteUrl.allowed) {
                return NextResponse.json(
                    { error: remoteUrl.reason },
                    { status: 400 }
                );
            }

            // 从 URL 获取图片
            const fetchedImage = await fetchImageAsBase64(imageUrl);
            imageData = fetchedImage.data;
            mimeType = fetchedImage.mimeType;
        }
        requestMimeType = mimeType;

        const languagePack = await generateLanguageCardsWithGemini({
            imageData,
            mimeType,
            primaryLanguage,
            targetLanguages,
        });

        const displayLanguage = languagePack.availableLanguages.includes(primaryLanguage)
            ? primaryLanguage
            : languagePack.availableLanguages[0];
        const displayVariant = languagePack.variants[displayLanguage];

        console.log(`[Analyze] Successfully analyzed: ${displayVariant.term}`);
        await consumeAnalyzeCredit(user.id);

        await trackServerEvent('analyze_succeeded', {
            word: displayVariant.term,
            subscriptionStatus: billingStatus.subscriptionStatus,
            languageCount: languagePack.availableLanguages.length,
        });

        return NextResponse.json({
            success: true,
            sourceObject: languagePack.sourceObject,
            sourceLabelEn: languagePack.sourceLabelEn,
            word: displayVariant.term,
            phonetic: displayVariant.phonetic,
            meaning: displayVariant.meaning,
            sentence: displayVariant.example,
            sentence_cn: displayVariant.exampleTranslation,
            primaryLanguage: normalizeLanguageCode(displayLanguage) satisfies LanguageCode,
            availableLanguages: languagePack.availableLanguages,
            variants: languagePack.variants,
        });

    } catch (error) {
        console.error('[Analyze] Error:', error);
        Sentry.withScope((scope) => {
            scope.setTag('route', '/api/analyze');
            scope.setTag('image_kind', requestImageKind);
            scope.setTag('mime_type', requestMimeType);
            if (userId) {
                scope.setUser({ id: String(userId) });
            }
            scope.setContext('analyze_request', {
                imageKind: requestImageKind,
                mimeType: requestMimeType,
                userId,
                model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
            });
            Sentry.captureException(error);
        });
        await trackServerEvent('analyze_failed', {
            message: error instanceof Error ? error.message : 'Unknown error',
        }).catch(() => undefined);
        return NextResponse.json(
            {
                error: 'Analysis failed',
                details: error instanceof Error ? error.message : JSON.stringify(error),
            },
            { status: 500 }
        );
    }
}

function validateRemoteImageUrl(imageUrl: string) {
    try {
        const parsed = new URL(imageUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { allowed: false, reason: 'Only http(s) image URLs are supported' };
        }

        const allowedHosts = new Set<string>();
        const cdnBase = process.env.CDN_PUBLIC_BASE_URL;

        if (cdnBase) {
            try {
                allowedHosts.add(new URL(cdnBase).host);
            } catch {
                console.warn('[Analyze] Invalid CDN_PUBLIC_BASE_URL:', cdnBase);
            }
        }

        if (allowedHosts.size > 0 && !allowedHosts.has(parsed.host)) {
            return { allowed: false, reason: 'Remote image URL is not from an allowed host' };
        }

        return { allowed: true as const };
    } catch {
        return { allowed: false, reason: 'Invalid image URL' };
    }
}

// 辅助函数：将图片 URL 转换为 Base64
async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string }> {
    const response = await fetch(imageUrl);
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
        data: buffer.toString('base64'),
        mimeType,
    };
}

function getMimeTypeFromDataUrl(dataUrl: string) {
    const match = dataUrl.match(/^data:([^;]+);base64,/);
    return match?.[1] || 'image/jpeg';
}
