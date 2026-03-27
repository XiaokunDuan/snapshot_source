import { neon } from '@neondatabase/serverless';

export interface HistoryRecord {
  id: number;
  word: string;
  phonetic: string | null;
  meaning: string;
  sentence: string | null;
  sentence_cn: string | null;
  image_url: string | null;
  created_at: string;
}

function getHistorySql() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL not configured');
  }

  return neon(databaseUrl);
}

export async function ensureHistoryTable() {
  const sql = getHistorySql();

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

  return sql;
}

export async function listHistory(limit = 50): Promise<HistoryRecord[]> {
  const sql = await ensureHistoryTable();

  const rows = await sql`
    SELECT * FROM vocabulary_history
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return rows as HistoryRecord[];
}

export async function createHistoryRecord(input: {
  word: string;
  phonetic?: string;
  meaning: string;
  sentence?: string;
  sentence_cn?: string;
  imageUrl?: string;
}): Promise<HistoryRecord> {
  const sql = await ensureHistoryTable();

  const result = await sql`
    INSERT INTO vocabulary_history
    (word, phonetic, meaning, sentence, sentence_cn, image_url)
    VALUES (
      ${input.word},
      ${input.phonetic || ''},
      ${input.meaning},
      ${input.sentence || ''},
      ${input.sentence_cn || ''},
      ${input.imageUrl || ''}
    )
    RETURNING *
  `;

  return result[0] as HistoryRecord;
}

export async function deleteHistoryRecord(id: number) {
  const sql = await ensureHistoryTable();
  await sql`DELETE FROM vocabulary_history WHERE id = ${id}`;
}

export async function updateHistoryRecord(input: {
  id: number;
  word: string;
  phonetic?: string;
  meaning: string;
  sentence?: string;
  sentence_cn?: string;
}): Promise<HistoryRecord | null> {
  const sql = await ensureHistoryTable();

  const result = await sql`
    UPDATE vocabulary_history
    SET
      word = ${input.word},
      phonetic = ${input.phonetic || ''},
      meaning = ${input.meaning},
      sentence = ${input.sentence || ''},
      sentence_cn = ${input.sentence_cn || ''}
    WHERE id = ${input.id}
    RETURNING *
  `;

  return (result[0] as HistoryRecord | undefined) ?? null;
}
