import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireDbUser } from '@/lib/users';

// GET: Fetch words in a specific word book
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireDbUser(request);
        const { id } = await params;
        const client = await getPool().connect();

        try {
            const bookCheck = await client.query(
                'SELECT * FROM word_books WHERE id = $1 AND user_id = $2',
                [id, user.id]
            );

            if (bookCheck.rows.length === 0) {
                return NextResponse.json(
                    { error: 'Word book not found or access denied' },
                    { status: 404 }
                );
            }

            const words = await client.query(
                `SELECT * FROM saved_words 
         WHERE word_book_id = $1 AND user_id = $2
         ORDER BY created_at DESC`,
                [id, user.id]
            );

            return NextResponse.json({
                wordBook: bookCheck.rows[0],
                words: words.rows
            });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Get words error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch words' },
            { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}

// POST: Add word to word book
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireDbUser(request);
        const { id } = await params;
        const { word, phonetic, meaning, sentence, sentence_cn, image_url } = await request.json();

        if (!word) {
            return NextResponse.json(
                { error: 'Word is required' },
                { status: 400 }
            );
        }

        const client = await getPool().connect();

        try {
            const bookCheck = await client.query(
                'SELECT * FROM word_books WHERE id = $1 AND user_id = $2',
                [id, user.id]
            );

            if (bookCheck.rows.length === 0) {
                return NextResponse.json(
                    { error: 'Word book not found or access denied' },
                    { status: 404 }
                );
            }

            const existing = await client.query(
                `SELECT * FROM saved_words 
         WHERE word_book_id = $1 AND user_id = $2 AND word = $3`,
                [id, user.id, word]
            );

            if (existing.rows.length > 0) {
                return NextResponse.json(
                    { error: 'Word already exists in this book' },
                    { status: 400 }
                );
            }

            const newWord = await client.query(
                `INSERT INTO saved_words 
         (user_id, word_book_id, word, phonetic, meaning, sentence, sentence_cn, image_url, mastery_level, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, NOW())
         RETURNING *`,
                [user.id, id, word, phonetic, meaning, sentence, sentence_cn, image_url]
            );

            return NextResponse.json({
                success: true,
                word: newWord.rows[0]
            });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Add word error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to add word' },
            { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}

// DELETE: Remove word from word book
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireDbUser(request);
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const wordId = searchParams.get('wordId');

        if (!wordId) {
            return NextResponse.json(
                { error: 'Word ID is required' },
                { status: 400 }
            );
        }

        const client = await getPool().connect();

        try {
            await client.query(
                `DELETE FROM saved_words 
         WHERE id = $1 AND word_book_id = $2 AND user_id = $3`,
                [wordId, id, user.id]
            );

            return NextResponse.json({ success: true });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Delete word error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete word' },
            { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}
