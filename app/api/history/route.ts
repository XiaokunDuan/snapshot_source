import { NextRequest, NextResponse } from 'next/server';
import {
    createHistoryRecord,
    deleteHistoryRecord,
    listHistory,
    updateHistoryRecord,
} from '@/lib/history-store';

export const runtime = 'edge';

// GET - 获取学习历史
export async function GET() {
    try {
        const history = await listHistory();

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
        const body = await req.json();
        const { word, phonetic, meaning, sentence, sentence_cn, imageUrl } = body;

        if (!word || !meaning) {
            return NextResponse.json(
                { error: 'word and meaning are required' },
                { status: 400 }
            );
        }

        const result = await createHistoryRecord({
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
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'id is required' },
                { status: 400 }
            );
        }

        await deleteHistoryRecord(parseInt(id, 10));

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
        const body = await req.json();
        const { id, word, phonetic, meaning, sentence, sentence_cn } = body;

        if (!id) {
            return NextResponse.json(
                { error: 'id is required' },
                { status: 400 }
            );
        }

        const result = await updateHistoryRecord({
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
