import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from './env';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[database] Unexpected pool error:', err.message);
});

const MAX_RETRIES = 10;
const RETRY_DELAY_BASE_MS = 3_000;

export async function connectWithRetry(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      await client.query('SELECT 1');
      console.log('[database] Connected to PostgreSQL');
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[database] Attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);
      if (attempt === MAX_RETRIES) {
        throw new Error(`[database] Could not connect after ${MAX_RETRIES} attempts: ${msg}`);
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAY_BASE_MS * attempt));
    } finally {
      client?.release();
    }
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
