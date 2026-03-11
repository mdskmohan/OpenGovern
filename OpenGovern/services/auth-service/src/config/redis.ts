/**
 * Redis client configuration.
 *
 * We use ioredis because it has first-class TypeScript support, a robust
 * reconnect strategy, and built-in support for cluster and sentinel modes
 * (useful if the deployment later moves to Redis Cluster).
 *
 * The client is a singleton: all parts of the application share the same
 * connection, which avoids exhausting the Redis max-clients limit.
 */

import Redis from 'ioredis';
import { env } from './env';

// ---------------------------------------------------------------------------
// Reconnect strategy
// ---------------------------------------------------------------------------

/**
 * Called by ioredis when a connection attempt fails.
 *
 * Returning a number tells ioredis to retry after that many milliseconds.
 * Returning an Error (or throwing) tells ioredis to stop retrying.
 *
 * We implement exponential back-off capped at 30 s and give up after 10
 * consecutive failures so the process can surface the problem rather than
 * hanging indefinitely in a reconnect loop.
 */
function reconnectStrategy(retries: number): number | Error {
  const MAX_RETRIES = 10;
  const BASE_DELAY_MS = 500;
  const MAX_DELAY_MS = 30_000;

  if (retries > MAX_RETRIES) {
    const msg = `[redis] Giving up after ${MAX_RETRIES} reconnection attempts.`;
    console.error(msg);
    // Returning an Error causes ioredis to emit an 'error' event and stop.
    return new Error(msg);
  }

  // Exponential back-off: 500 ms, 1 s, 2 s, 4 s … capped at 30 s
  const delay = Math.min(BASE_DELAY_MS * 2 ** (retries - 1), MAX_DELAY_MS);
  console.warn(
    `[redis] Reconnection attempt ${retries}/${MAX_RETRIES} in ${delay} ms…`,
  );
  return delay;
}

// ---------------------------------------------------------------------------
// Client creation
// ---------------------------------------------------------------------------

/**
 * Singleton ioredis client.
 *
 * lazyConnect: true means ioredis does not attempt to connect immediately on
 * construction. We call client.connect() explicitly in the startup sequence
 * so errors are caught in one place.
 *
 * enableOfflineQueue: true (default) – commands issued while the connection
 * is temporarily down are queued and replayed once it recovers. This is safe
 * for our caching use-case (worst case we get a slightly stale permission set).
 */
export const redisClient = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  retryStrategy: reconnectStrategy,
  // ioredis option to name the connection in Redis CLIENT LIST output
  connectionName: 'opengovern-auth',
  // Automatically re-subscribe to channels after a reconnect (not used here
  // but good practice to have enabled for future pub/sub use).
  autoResubscribe: true,
  // Re-execute buffered commands after a reconnect
  autoResendUnfulfilledCommands: true,
  // Max time to wait for a connection before throwing
  connectTimeout: 10_000,
  // Keep the TCP connection alive; avoids NAT/firewall idle-timeout drops
  keepAlive: 30_000,
});

// Surface connection events in logs so operators can monitor connectivity.
redisClient.on('connect', () => {
  console.log('[redis] Connection established');
});

redisClient.on('ready', () => {
  console.log('[redis] Client ready');
});

redisClient.on('reconnecting', () => {
  console.warn('[redis] Reconnecting…');
});

redisClient.on('error', (err: Error) => {
  // ioredis emits errors continuously while disconnected; we log at warn
  // level to avoid spam but keep visibility.
  console.error('[redis] Error:', err.message);
});

redisClient.on('close', () => {
  console.warn('[redis] Connection closed');
});

// ---------------------------------------------------------------------------
// Startup helper
// ---------------------------------------------------------------------------

/**
 * Explicitly open the Redis connection.
 * Called once during application bootstrap so startup errors surface cleanly.
 */
export async function connectRedis(): Promise<void> {
  await redisClient.connect();
  // PING verifies the connection is actually functional, not just established.
  await redisClient.ping();
  console.log('[redis] PING OK – Redis is reachable');
}
