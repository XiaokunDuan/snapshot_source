import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireDbUser } from '@/lib/users';

// GET: Fetch all word books for user
export async function GET(request: NextRequest) {
    try {
        const user = await requireDbUser(request);
        const client = await getPool().connect();

        try {
            const wordBooks = await client.query(
                `SELECT wb.*, 
                COUNT(sw.id) as word_count
         FROM word_books wb
         LEFT JOIN saved_words sw ON wb.id = sw.word_book_id
         WHERE wb.user_id = $1
         GROUP BY wb.id
         ORDER BY wb.is_default DESC, wb.created_at DESC`,
                [user.id]
            );

            return NextResponse.json({
                wordBooks: wordBooks.rows
            });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Get word books error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch word books' },
            { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}

// POST: Create new word book
export async function POST(request: NextRequest) {
    try {
        const user = await requireDbUser(request);
        const { name, description } = await request.json();

        if (!name || name.trim().length === 0) {
            return NextResponse.json(
                { error: 'Word book name is required' },
                { status: 400 }
            );
        }

        const client = await getPool().connect();

        try {
            const newWordBook = await client.query(
                `INSERT INTO word_books (user_id, name, description, is_default, created_at)
         VALUES ($1, $2, $3, FALSE, NOW())
         RETURNING *`,
                [user.id, name.trim(), description || '']
            );

            return NextResponse.json({
                success: true,
                wordBook: newWordBook.rows[0]
            });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Create word book error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create word book' },
            { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}

// DELETE: Remove word book
export async function DELETE(request: NextRequest) {
    try {
        const user = await requireDbUser(request);
        const { searchParams } = new URL(request.url);
        const bookId = searchParams.get('id');

        if (!bookId) {
            return NextResponse.json(
                { error: 'Word book ID is required' },
                { status: 400 }
            );
        }

        const client = await getPool().connect();

        try {
            const bookCheck = await client.query(
                'SELECT * FROM word_books WHERE id = $1 AND user_id = $2',
                [bookId, user.id]
            );

            if (bookCheck.rows.length === 0) {
                return NextResponse.json(
                    { error: 'Word book not found or access denied' },
                    { status: 404 }
                );
            }

            if (bookCheck.rows[0].is_default) {
                return NextResponse.json(
                    { error: 'Cannot delete default word book' },
                    { status: 400 }
                );
            }

            await client.query(
                'DELETE FROM word_books WHERE id = $1',
                [bookId]
            );

            return NextResponse.json({ success: true });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Delete word book error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete word book' },
            { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}
