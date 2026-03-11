/**
 * Redis client configuration for quality-service.
 *
 * Used for caching quality scores (avoid re-computing on every request)
 * and for distributed locking during scheduled quality runs to prevent
 * duplicate concurrent checks for the same asset.
 */

import Redis from 'ioredis';
import { env } from './env';

function reconnectStrategy(retries: number): number | Error {
  const MAX_RETRIES = 10;
  const BASE_DELAY_MS = 500;
  const MAX_DELAY_MS = 30_000;

  if (retries > MAX_RETRIES) {
    const msg = `[redis] Giving up after ${MAX_RETRIES} reconnection attempts.`;
    console.error(msg);
    return new Error(msg);
  }

  const delay = Math.min(BASE_DELAY_MS * 2 ** (retries - 1), MAX_DELAY_MS);
  console.warn(
    `[redis] Reconnection attempt ${retries}/${MAX_RETRIES} in ${delay}ms…`,
  );
  return delay;
}

export const redisClient = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  retryStrategy: reconnectStrategy,
  connectionName: 'opengovern-quality',
  autoResubscribe: true,
  autoResendUnfulfilledCommands: true,
  connectTimeout: 10_000,
  keepAlive: 30_000,
});

redisClient.on('connect', () => console.log('[redis] Connection established'));
redisClient.on('ready', () => console.log('[redis] Client ready'));
redisClient.on('reconnecting', () => console.warn('[redis] Reconnecting…'));
redisClient.on('error', (err: Error) =>
  console.error('[redis] Error:', err.message),
);
redisClient.on('close', () => console.warn('[redis] Connection closed'));

export async function connectRedis(): Promise<void> {
  await redisClient.connect();
  await redisClient.ping();
  console.log('[redis] PING OK – Redis is reachable');
}
