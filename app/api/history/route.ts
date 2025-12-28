import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const runtime = 'edge';

// GET - 获取学习历史
export async function GET() {
    try {
        const databaseUrl = process.env.DATABASE_URL;

        if (!databaseUrl) {
            return NextResponse.json(
                { error: 'DATABASE_URL not configured' },
                { status: 500 }
            );
        }

        const sql = neon(databaseUrl);

        // 自动创建表（如果不存在）
        await sql`
      CREATE TABLE IF NOT EXISTS vocabulary_history (
        id SERIAL PRIMARY KEY,
        word VARCHAR(100) NOT NULL,
        phonetic VARCHAR(100),
        meaning TEXT NOT NULL,
        sentence TEXT,
        sentence_cn TEXT,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

        // 获取最近 50 条记录
        const history = await sql`
      SELECT * FROM vocabulary_history 
      ORDER BY created_at DESC 
      LIMIT 50
    `;

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
        const databaseUrl = process.env.DATABASE_URL;

        if (!databaseUrl) {
            return NextResponse.json(
                { error: 'DATABASE_URL not configured' },
                { status: 500 }
            );
        }

        const body = await req.json();
        const { word, phonetic, meaning, sentence, sentence_cn, imageUrl } = body;

        if (!word || !meaning) {
            return NextResponse.json(
                { error: 'word and meaning are required' },
                { status: 400 }
            );
        }

        const sql = neon(databaseUrl);

        // 确保表存在
        await sql`
      CREATE TABLE IF NOT EXISTS vocabulary_history (
        id SERIAL PRIMARY KEY,
        word VARCHAR(100) NOT NULL,
        phonetic VARCHAR(100),
        meaning TEXT NOT NULL,
        sentence TEXT,
        sentence_cn TEXT,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

        // 插入新记录
        const result = await sql`
      INSERT INTO vocabulary_history 
      (word, phonetic, meaning, sentence, sentence_cn, image_url)
      VALUES (${word}, ${phonetic || ''}, ${meaning}, ${sentence || ''}, ${sentence_cn || ''}, ${imageUrl || ''})
      RETURNING *
    `;

        console.log('[History] Saved word:', word);

        return NextResponse.json(result[0]);
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
        const databaseUrl = process.env.DATABASE_URL;

        if (!databaseUrl) {
            return NextResponse.json(
                { error: 'DATABASE_URL not configured' },
                { status: 500 }
            );
        }

        const id = req.nextUrl.searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'id is required' },
                { status: 400 }
            );
        }

        const sql = neon(databaseUrl);

        await sql`DELETE FROM vocabulary_history WHERE id = ${parseInt(id)}`;

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
