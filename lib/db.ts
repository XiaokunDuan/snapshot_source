import { Pool } from '@neondatabase/serverless';

declare global {
  var __snapshotPool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL not configured');
  }

  return new Pool({ connectionString });
}

export function getPool() {
  if (!global.__snapshotPool) {
    global.__snapshotPool = createPool();
  }

  return global.__snapshotPool;
}

export interface DbClient {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  release: () => void;
}
