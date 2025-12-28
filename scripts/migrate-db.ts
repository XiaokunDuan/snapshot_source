// Database migration script for Baicizhan-style features
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Set the WebSocket constructor to enable local Node.js execution
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
    const client = await pool.connect();

    try {
        console.log('Starting database migration...');

        // 1. Create users table
        await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        clerk_user_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100),
        avatar_url TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
        console.log('✓ Users table created');

        // 2. Create learning_challenges table
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
        console.log('✓ Learning challenges table created');

        // 3. Create check_ins table
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
        console.log('✓ Check-ins table created');

        // 4. Create word_books table
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
        console.log('✓ Word books table created');

        // 5. Create saved_words table
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
        console.log('✓ Saved words table created');

        // 6. Create notifications table
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
        console.log('✓ Notifications table created');

        // 7. Update history_records table to add user_id
        try {
            await client.query(`
        ALTER TABLE history_records 
        ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      `);
            await client.query(`
        ALTER TABLE history_records 
        ADD COLUMN IF NOT EXISTS mastered BOOLEAN DEFAULT FALSE;
      `);
            console.log('✓ History records table updated');
        } catch (error) {
            console.log('⚠ History records table may already have these columns');
        }

        // Create indexes for better performance
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_user_id);
      CREATE INDEX IF NOT EXISTS idx_check_ins_user_date ON check_ins(user_id, check_in_date);
      CREATE INDEX IF NOT EXISTS idx_saved_words_user_book ON saved_words(user_id, word_book_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
    `);
        console.log('✓ Indexes created');

        console.log('\n✅ Migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run migration
migrate().catch(console.error);
