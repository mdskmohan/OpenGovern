/**
 * PostgreSQL connection pool and query helpers for quality-service.
 *
 * Singleton pool shared across all request handlers. Retries the initial
 * connection at startup to tolerate transient DB unavailability (e.g. Docker
 * Compose boot ordering).
 */

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
const RETRY_DELAY_MS = 3_000;

export async function connectWithRetry(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      await client.query('SELECT 1');
      console.log('[database] Connected to PostgreSQL');
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[database] Connection attempt ${attempt}/${MAX_RETRIES} failed: ${message}`,
      );

      if (attempt === MAX_RETRIES) {
        throw new Error(
          `[database] Could not connect to PostgreSQL after ${MAX_RETRIES} attempts. Last error: ${message}`,
        );
      }

      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAY_MS * attempt),
      );
    } finally {
      client?.release();
    }
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    if (env.NODE_ENV === 'development' && duration > 200) {
      console.warn(`[database] Slow query (${duration}ms): ${text}`);
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[database] Query error: ${message}\nSQL: ${text}`);
    throw err;
  }
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
