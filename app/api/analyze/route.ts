import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getEnrichedWordData } from '@/lib/mcp/tools';
import { fetchWithKeyRotation } from '@/lib/gemini';
import { enforceRateLimit } from '@/lib/rate-limit';
import { consumeAnalyzeCredit, getBillingStatus } from '@/lib/billing';
import { requireDbUser } from '@/lib/users';
import { trackServerEvent } from '@/lib/analytics';
import { buildFallbackVariants, normalizeLanguageCode, type AnalyzeVariants, type LanguageCode } from '@/lib/language-content';
import { generateLanguageVariants } from '@/lib/text-generation';

const analyzeSchema = z.object({
    imageUrl: z.string().min(1, 'imageUrl is required'),
});

interface WordResult {
    sourceObject: string;
    sourceLabelEn: string;
    word: string;
    phonetic: string;
    meaning: string;
    sentence: string;
    sentence_cn: string;
}

export async function POST(req: NextRequest) {
    try {
        const user = await requireDbUser();
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

        // 构建 Gemini API 请求
        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        // 系统提示词
        const systemPrompt = `你是一个专业的视觉语言识别助手。用户会发给你一张图片。请先识别图片中的核心物体或主题，再给出一个最适合作为学习锚点的英文词条。

你必须返回以下 JSON 格式，不要包含任何其他文字：
{
  "sourceObject": "对该物体/主题的中文或通用描述",
  "sourceLabelEn": "该物体/主题的英文标签",
  "word": "英文单词",
  "phonetic": "/音标/",
  "meaning": "中文释义",
  "sentence": "英文例句",
  "sentence_cn": "例句的中文翻译"
}`;

        // 处理 base64 或 URL
        let imageData: string;
        let mimeType = 'image/jpeg';
        if (imageUrl.startsWith('data:')) {
            mimeType = getMimeTypeFromDataUrl(imageUrl);
            // 提取 base64 数据（去掉 "data:image/...;base64," 前缀）
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

        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: systemPrompt },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: imageData,
                            },
                        },
                    ],
                },
            ],
            generationConfig: {
                temperature: 0.4,
                topK: 32,
                topP: 1,
                maxOutputTokens: 1024,
                responseMimeType: 'application/json',
            },
        };

        // 调用 Gemini API via utility (handles key rotation)
        const { data } = await fetchWithKeyRotation(endpoint, {
            method: 'POST',
            body: requestBody,
        });

        // 提取生成的文本
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!generatedText) {
            console.error('[Analyze] No text generated:', data);
            return NextResponse.json(
                { error: 'No response from Gemini' },
                { status: 500 }
            );
        }

        // 解析 JSON 响应
        let result: WordResult;
        try {
            const parsedResult = JSON.parse(generatedText);
            result = Array.isArray(parsedResult) ? parsedResult[0] : parsedResult;
        } catch {
            console.error('[Analyze] Failed to parse JSON:', generatedText);
            return NextResponse.json(
                { error: 'Invalid JSON response from AI', raw: generatedText },
                { status: 500 }
            );
        }

        const validationError = validateWordResult(result);
        if (validationError) {
            return NextResponse.json(
                { error: validationError, raw: result },
                { status: 500 }
            );
        }

        console.log(`[Analyze] Successfully analyzed: ${result.word}`);
        await consumeAnalyzeCredit(user.id);

        let languagePack: AnalyzeVariants;
        try {
            languagePack = await generateLanguageVariants({
                sourceObject: result.sourceObject,
                sourceLabelEn: result.sourceLabelEn,
                word: result.word,
                phonetic: result.phonetic,
                meaning: result.meaning,
                sentence: result.sentence,
                sentenceCn: result.sentence_cn,
            });
        } catch (languageError) {
            console.error('[Analyze] Language generation fallback:', languageError);
            languagePack = buildFallbackVariants({
                sourceObject: result.sourceObject,
                sourceLabelEn: result.sourceLabelEn,
                word: result.word,
                phonetic: result.phonetic,
                meaning: result.meaning,
                sentence: result.sentence,
                sentenceCn: result.sentence_cn,
            });
        }

        // 使用 MCP 获取富化数据
        const enrichedData = await getEnrichedWordData(result.word);
        await trackServerEvent('analyze_succeeded', {
            word: result.word,
            subscriptionStatus: billingStatus.subscriptionStatus,
        });

        return NextResponse.json({
            success: true,
            ...result,
            sourceObject: languagePack.sourceObject,
            sourceLabelEn: languagePack.sourceLabelEn,
            primaryLanguage: normalizeLanguageCode('en') satisfies LanguageCode,
            availableLanguages: languagePack.availableLanguages,
            variants: languagePack.variants,
            mcp: enrichedData
        });

    } catch (error) {
        console.error('[Analyze] Error:', error);
        Sentry.captureException(error);
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

function validateWordResult(result: Partial<WordResult>) {
    const requiredFields: (keyof WordResult)[] = ['sourceObject', 'sourceLabelEn', 'word', 'phonetic', 'meaning', 'sentence', 'sentence_cn'];

    for (const field of requiredFields) {
        const value = result[field];
        if (typeof value !== 'string' || !value.trim()) {
            return `AI response is missing required field: ${field}`;
        }
    }

    return null;
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
