import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function setupDatabase() {
  const client = await pool.connect();

  try {
    console.log('Starting database setup...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        clerk_user_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100),
        avatar_url TEXT,
        coins INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS learning_challenges (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        challenge_type VARCHAR(50) DEFAULT 'streak',
        target_days INTEGER DEFAULT 30,
        current_streak INTEGER DEFAULT 0,
        max_streak INTEGER DEFAULT 0,
        shield_cards INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS check_ins (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        check_in_date DATE NOT NULL,
        words_learned INTEGER DEFAULT 0,
        time_spent INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, check_in_date)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS word_books (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS saved_words (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        word_book_id INTEGER REFERENCES word_books(id) ON DELETE CASCADE,
        word VARCHAR(100) NOT NULL,
        phonetic VARCHAR(100),
        meaning TEXT,
        sentence TEXT,
        sentence_cn TEXT,
        image_url TEXT,
        mastery_level INTEGER DEFAULT 0,
        last_reviewed TIMESTAMP,
        review_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        content TEXT,
        icon VARCHAR(50),
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

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
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE vocabulary_history
      ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_user_id);
      CREATE INDEX IF NOT EXISTS idx_check_ins_user_date ON check_ins(user_id, check_in_date);
      CREATE INDEX IF NOT EXISTS idx_saved_words_user_book ON saved_words(user_id, word_book_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
      CREATE INDEX IF NOT EXISTS idx_vocabulary_history_created_at ON vocabulary_history(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_vocabulary_history_user_created_at ON vocabulary_history(user_id, created_at DESC);
    `);

    console.log('Database setup completed successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase().catch((error) => {
  console.error('Database setup failed:', error);
  process.exit(1);
});
