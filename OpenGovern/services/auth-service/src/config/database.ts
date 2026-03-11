/**
 * PostgreSQL connection pool and query helper.
 *
 * We use a singleton Pool so that all requests share a bounded set of
 * connections rather than opening a new TCP connection per query.
 *
 * Connection retry logic: some orchestrators (e.g. Docker Compose) start
 * Postgres and the app container nearly simultaneously. The app can start
 * before Postgres is ready to accept connections. We retry the initial
 * connection test up to MAX_RETRIES times before giving up.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from './env';

// ---------------------------------------------------------------------------
// Pool creation
// ---------------------------------------------------------------------------

/**
 * Shared connection pool. Exported so tests can close it explicitly.
 *
 * Pool sizing guidance:
 *  - max: keep well below PostgreSQL's max_connections to leave room for
 *    other services and admin tools.
 *  - idleTimeoutMillis: release idle connections quickly; connections held
 *    open cost memory on the DB server.
 *  - connectionTimeoutMillis: fail fast rather than queuing indefinitely if
 *    the DB is overwhelmed.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // ssl is intentionally omitted here; pass ?sslmode=require in DATABASE_URL
  // if your deployment requires TLS to Postgres.
});

// Log pool-level errors so they surface even if no individual query handler
// catches them (e.g. unexpected server-initiated disconnections).
pool.on('error', (err) => {
  console.error('[database] Unexpected pool error:', err.message);
});

// ---------------------------------------------------------------------------
// Connection health-check with retry
// ---------------------------------------------------------------------------

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 3_000;

/**
 * Attempt to acquire a connection from the pool to verify that Postgres is
 * reachable. Retries up to MAX_RETRIES times with an exponential back-off.
 *
 * Called once at application startup; throws if the DB never becomes
 * available so the process exits cleanly rather than silently degraded.
 */
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

      // Wait before retrying; increase the delay slightly each attempt.
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAY_MS * attempt),
      );
    } finally {
      // Always release the test connection back to the pool
      client?.release();
    }
  }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Execute a parameterised SQL query using a pooled connection.
 *
 * This wrapper exists so callers don't have to acquire/release a connection
 * manually for simple one-off queries. For multi-statement transactions use
 * the `withTransaction` helper below.
 *
 * @param text  Parameterised SQL string, e.g. "SELECT * FROM users WHERE id = $1"
 * @param params  Parameter values corresponding to $1, $2, … placeholders
 * @returns     pg QueryResult
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    // Log slow queries in development to help spot N+1s and missing indexes.
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

/**
 * Execute a set of queries within a single database transaction.
 *
 * If `fn` throws, the transaction is rolled back automatically. Otherwise it
 * is committed. The PoolClient is always released back to the pool.
 *
 * @example
 * await withTransaction(async (client) => {
 *   await client.query('INSERT INTO users ...', [...]);
 *   await client.query('INSERT INTO user_roles ...', [...]);
 * });
 */
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
