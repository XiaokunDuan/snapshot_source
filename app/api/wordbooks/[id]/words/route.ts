import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET: Fetch words in a specific word book
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const authResult = await auth();
        const userId = authResult.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const bookId = params.id;
        const client = await pool.connect();

        try {
            const userResult = await client.query(
                'SELECT id FROM users WHERE clerk_user_id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }

            const dbUserId = userResult.rows[0].id;

            // Verify ownership
            const bookCheck = await client.query(
                'SELECT * FROM word_books WHERE id = $1 AND user_id = $2',
                [bookId, dbUserId]
            );

            if (bookCheck.rows.length === 0) {
                return NextResponse.json(
                    { error: 'Word book not found or access denied' },
                    { status: 404 }
                );
            }

            // Get all words in the book
            const words = await client.query(
                `SELECT * FROM saved_words 
         WHERE word_book_id = $1 AND user_id = $2
         ORDER BY created_at DESC`,
                [bookId, dbUserId]
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
            { error: 'Failed to fetch words' },
            { status: 500 }
        );
    }
}

// POST: Add word to word book
export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const authResult = await auth();
        const userId = authResult.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const bookId = params.id;
        const { word, phonetic, meaning, sentence, sentence_cn, image_url } = await request.json();

        if (!word) {
            return NextResponse.json(
                { error: 'Word is required' },
                { status: 400 }
            );
        }

        const client = await pool.connect();

        try {
            const userResult = await client.query(
                'SELECT id FROM users WHERE clerk_user_id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }

            const dbUserId = userResult.rows[0].id;

            // Verify ownership
            const bookCheck = await client.query(
                'SELECT * FROM word_books WHERE id = $1 AND user_id = $2',
                [bookId, dbUserId]
            );

            if (bookCheck.rows.length === 0) {
                return NextResponse.json(
                    { error: 'Word book not found or access denied' },
                    { status: 404 }
                );
            }

            // Check if word already exists in this book
            const existing = await client.query(
                `SELECT * FROM saved_words 
         WHERE word_book_id = $1 AND user_id = $2 AND word = $3`,
                [bookId, dbUserId, word]
            );

            if (existing.rows.length > 0) {
                return NextResponse.json(
                    { error: 'Word already exists in this book' },
                    { status: 400 }
                );
            }

            // Add word
            const newWord = await client.query(
                `INSERT INTO saved_words 
         (user_id, word_book_id, word, phonetic, meaning, sentence, sentence_cn, image_url, mastery_level, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, NOW())
         RETURNING *`,
                [dbUserId, bookId, word, phonetic, meaning, sentence, sentence_cn, image_url]
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
            { error: 'Failed to add word' },
            { status: 500 }
        );
    }
}

// DELETE: Remove word from word book
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const authResult = await auth();
        const userId = authResult.userId;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const bookId = params.id;
        const { searchParams } = new URL(request.url);
        const wordId = searchParams.get('wordId');

        if (!wordId) {
            return NextResponse.json(
                { error: 'Word ID is required' },
                { status: 400 }
            );
        }

        const client = await pool.connect();

        try {
            const userResult = await client.query(
                'SELECT id FROM users WHERE clerk_user_id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }

            const dbUserId = userResult.rows[0].id;

            // Delete word
            await client.query(
                `DELETE FROM saved_words 
         WHERE id = $1 AND word_book_id = $2 AND user_id = $3`,
                [wordId, bookId, dbUserId]
            );

            return NextResponse.json({ success: true });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Delete word error:', error);
        return NextResponse.json(
            { error: 'Failed to delete word' },
            { status: 500 }
        );
    }
}
