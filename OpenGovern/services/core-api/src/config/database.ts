import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from './env';

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

export async function connectWithRetry(): Promise<void> {
  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('PostgreSQL connected successfully');
      return;
    } catch (err) {
      const delay = RETRY_DELAYS[attempt];
      console.error(`PostgreSQL connection attempt ${attempt + 1} failed:`, err);
      if (attempt < RETRY_DELAYS.length - 1) {
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error('Failed to connect to PostgreSQL after multiple retries');
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn('Slow query detected', { text: text.substring(0, 100), duration, rows: result.rowCount });
    }
    return result;
  } catch (err) {
    console.error('Database query error:', { text: text.substring(0, 100), error: err });
    throw err;
  }
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
