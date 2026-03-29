import { Pool } from '@neondatabase/serverless';

export interface HistoryRecord {
  id: number;
  user_id: number;
  word: string;
  phonetic: string | null;
  meaning: string;
  sentence: string | null;
  sentence_cn: string | null;
  image_url: string | null;
  source_object: string | null;
  source_label_en: string | null;
  primary_language: string | null;
  target_languages: string[] | null;
  variants_json: unknown;
  created_at: string;
}

let pool: Pool | null = null;
type HistoryClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  release: () => void;
};

function getPool() {
  if (pool) {
    return pool;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not configured');
  }

  pool = new Pool({ connectionString: databaseUrl });
  return pool;
}

async function ensureHistoryTable(client: HistoryClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS vocabulary_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      word VARCHAR(100) NOT NULL,
      phonetic VARCHAR(100),
      meaning TEXT NOT NULL,
      sentence TEXT,
      sentence_cn TEXT,
      image_url TEXT,
      source_object TEXT,
      source_label_en TEXT,
      primary_language VARCHAR(10),
      target_languages JSONB DEFAULT '[]'::jsonb,
      variants_json JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`
    ALTER TABLE vocabulary_history
    ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
  `);

  await client.query(`
    ALTER TABLE vocabulary_history
    ADD COLUMN IF NOT EXISTS source_object TEXT
  `);

  await client.query(`
    ALTER TABLE vocabulary_history
    ADD COLUMN IF NOT EXISTS source_label_en TEXT
  `);

  await client.query(`
    ALTER TABLE vocabulary_history
    ADD COLUMN IF NOT EXISTS primary_language VARCHAR(10)
  `);

  await client.query(`
    ALTER TABLE vocabulary_history
    ADD COLUMN IF NOT EXISTS target_languages JSONB DEFAULT '[]'::jsonb
  `);

  await client.query(`
    ALTER TABLE vocabulary_history
    ADD COLUMN IF NOT EXISTS variants_json JSONB DEFAULT '{}'::jsonb
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_vocabulary_history_user_created_at
    ON vocabulary_history(user_id, created_at DESC)
  `);
}

export async function resolveHistoryUserId(clerkUserId: string) {
  const client = await getPool().connect() as HistoryClient;

  try {
    await ensureHistoryTable(client);
    const result = await client.query(
      'SELECT id FROM users WHERE clerk_user_id = $1',
      [clerkUserId]
    );

    return (result.rows[0] as { id?: number } | undefined)?.id ?? null;
  } finally {
    client.release();
  }
}

export async function listHistory(userId: number, limit = 50): Promise<HistoryRecord[]> {
  const client = await getPool().connect() as HistoryClient;

  try {
    await ensureHistoryTable(client);
    const rows = await client.query(
      `SELECT *
       FROM vocabulary_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return rows.rows as HistoryRecord[];
  } finally {
    client.release();
  }
}

export async function createHistoryRecord(
  userId: number,
  input: {
    word: string;
    phonetic?: string;
    meaning: string;
    sentence?: string;
    sentence_cn?: string;
    imageUrl?: string;
    sourceObject?: string;
    sourceLabelEn?: string;
    primaryLanguage?: string;
    targetLanguages?: string[];
    variantsJson?: unknown;
  }
): Promise<HistoryRecord> {
  const client = await getPool().connect() as HistoryClient;

  try {
    await ensureHistoryTable(client);
    const result = await client.query(
      `INSERT INTO vocabulary_history
      (user_id, word, phonetic, meaning, sentence, sentence_cn, image_url, source_object, source_label_en, primary_language, target_languages, variants_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
      RETURNING *`,
      [
        userId,
        input.word,
        input.phonetic || '',
        input.meaning,
        input.sentence || '',
        input.sentence_cn || '',
        input.imageUrl || '',
        input.sourceObject || '',
        input.sourceLabelEn || '',
        input.primaryLanguage || '',
        JSON.stringify(input.targetLanguages || []),
        JSON.stringify(input.variantsJson || {}),
      ]
    );

    return result.rows[0] as HistoryRecord;
  } finally {
    client.release();
  }
}

export async function deleteHistoryRecord(userId: number, id: number) {
  const client = await getPool().connect() as HistoryClient;

  try {
    await ensureHistoryTable(client);
    await client.query(
      'DELETE FROM vocabulary_history WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
  } finally {
    client.release();
  }
}

export async function updateHistoryRecord(
  userId: number,
  input: {
    id: number;
    word: string;
    phonetic?: string;
    meaning: string;
    sentence?: string;
    sentence_cn?: string;
    primaryLanguage?: string;
    variantsJson?: unknown;
  }
): Promise<HistoryRecord | null> {
  const client = await getPool().connect() as HistoryClient;

  try {
    await ensureHistoryTable(client);
    const result = await client.query(
      `UPDATE vocabulary_history
       SET
         word = $1,
         phonetic = $2,
         meaning = $3,
         sentence = $4,
         sentence_cn = $5,
         primary_language = COALESCE(NULLIF($6, ''), primary_language),
         variants_json = CASE
           WHEN $7::jsonb = '{}'::jsonb THEN variants_json
           ELSE $7::jsonb
         END
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
      [
        input.word,
        input.phonetic || '',
        input.meaning,
        input.sentence || '',
        input.sentence_cn || '',
        input.primaryLanguage || '',
        JSON.stringify(input.variantsJson || {}),
        input.id,
        userId,
      ]
    );

    return (result.rows[0] as HistoryRecord | undefined) ?? null;
  } finally {
    client.release();
  }
}
