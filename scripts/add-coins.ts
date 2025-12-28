import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });


neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function addCoinsColumn() {
    const client = await pool.connect();
    try {
        console.log('Adding coins column to users table...');

        await client.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS coins INTEGER DEFAULT 0;
        `);

        console.log('✓ Coins column added successfully');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

addCoinsColumn().catch(console.error);
