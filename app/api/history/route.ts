import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
    createHistoryRecord,
    deleteHistoryRecord,
    listHistory,
    resolveHistoryUserId,
    updateHistoryRecord,
} from '@/lib/history-store';

export const runtime = 'nodejs';

async function requireHistoryUser() {
    const { userId } = await auth();

    if (!userId) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    const dbUserId = await resolveHistoryUserId(userId);
    if (!dbUserId) {
        return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
    }

    return { dbUserId };
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

        const body = await req.json();
        const { word, phonetic, meaning, sentence, sentence_cn, imageUrl } = body;

        if (!word || !meaning) {
            return NextResponse.json(
                { error: 'word and meaning are required' },
                { status: 400 }
            );
        }

        const result = await createHistoryRecord(user.dbUserId, {
            word,
            phonetic,
            meaning,
            sentence,
            sentence_cn,
            imageUrl,
        });

        console.log('[History] Saved word:', word);

        return NextResponse.json(result);
    } catch (error) {
        console.error('[History] POST error:', error);
        return NextResponse.json(
            { error: 'Failed to save word', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// DELETE - 删除单词
export async function DELETE(req: NextRequest) {
    try {
        const user = await requireHistoryUser();
        if (user.error) {
            return user.error;
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'id is required' },
                { status: 400 }
            );
        }

        await deleteHistoryRecord(user.dbUserId, parseInt(id, 10));

        console.log('[History] Deleted word:', id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[History] DELETE error:', error);
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

        const body = await req.json();
        const { id, word, phonetic, meaning, sentence, sentence_cn } = body;

        if (!id) {
            return NextResponse.json(
                { error: 'id is required' },
                { status: 400 }
            );
        }

        const result = await updateHistoryRecord(user.dbUserId, {
            id,
            word,
            phonetic,
            meaning,
            sentence,
            sentence_cn,
        });

        console.log('[History] Updated word:', id);

        return NextResponse.json(result);
    } catch (error) {
        console.error('[History] PUT error:', error);
        return NextResponse.json(
            { error: 'Failed to update word', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
