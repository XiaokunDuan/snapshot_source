import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { auth } from '@clerk/nextjs/server';
import {
    createHistoryRecord,
    deleteHistoryRecord,
    listHistory,
    updateHistoryRecord,
} from '@/lib/history-store';
import { historyCreateSchema, historyUpdateSchema, parseHistoryId } from '@/lib/history-validation';
import { ensureDbUserFromClerkId } from '@/lib/users';

export const runtime = 'nodejs';

async function requireHistoryUser() {
    const { userId } = await auth();

    if (!userId) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    const dbUser = await ensureDbUserFromClerkId(userId);

    return { dbUserId: dbUser.id };
}

// GET - 获取学习历史
export async function GET() {
    try {
        const user = await requireHistoryUser();
        if (user.error) {
            return user.error;
        }

        const history = await listHistory(user.dbUserId);

        return NextResponse.json(history);
    } catch (error) {
        console.error('[History] GET error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch history', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// POST - 保存新单词
export async function POST(req: NextRequest) {
    try {
        const user = await requireHistoryUser();
        if (user.error) {
            return user.error;
        }

        const parsed = historyCreateSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || 'Invalid request body' },
                { status: 400 }
            );
        }

        const { word, phonetic, meaning, sentence, sentence_cn, imageUrl, sourceObject, sourceLabelEn, primaryLanguage, targetLanguages, variantsJson } = parsed.data;
        const result = await createHistoryRecord(user.dbUserId, {
            word,
            phonetic,
            meaning,
            sentence,
            sentence_cn,
            imageUrl,
            sourceObject,
            sourceLabelEn,
            primaryLanguage,
            targetLanguages,
            variantsJson,
        });

        console.log('[History] Saved word:', word);

        return NextResponse.json(result);
    } catch (error) {
        console.error('[History] POST error:', error);
        Sentry.captureException(error);
        return NextResponse.json(
            { error: 'Failed to save word', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// DELETE - 删除单词
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        const parsedId = parseHistoryId(id);

        if (!parsedId) {
            return NextResponse.json(
                { error: 'A numeric id is required' },
                { status: 400 }
            );
        }

        const user = await requireHistoryUser();
        if (user.error) {
            return user.error;
        }

        await deleteHistoryRecord(user.dbUserId, parsedId);

        console.log('[History] Deleted word:', id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[History] DELETE error:', error);
        Sentry.captureException(error);
        return NextResponse.json(
            { error: 'Failed to delete word', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// PUT - 更新单词
export async function PUT(req: NextRequest) {
    try {
        const user = await requireHistoryUser();
        if (user.error) {
            return user.error;
        }

        const parsed = historyUpdateSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || 'Invalid request body' },
                { status: 400 }
            );
        }

        const { id, word, phonetic, meaning, sentence, sentence_cn, primaryLanguage, variantsJson } = parsed.data;
        const result = await updateHistoryRecord(user.dbUserId, {
            id,
            word,
            phonetic,
            meaning,
            sentence,
            sentence_cn,
            primaryLanguage,
            variantsJson,
        });

        console.log('[History] Updated word:', id);

        return NextResponse.json(result);
    } catch (error) {
        console.error('[History] PUT error:', error);
        Sentry.captureException(error);
        return NextResponse.json(
            { error: 'Failed to update word', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
