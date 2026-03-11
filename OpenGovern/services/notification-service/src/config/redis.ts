import Redis from 'ioredis';
import { env } from './env';

function reconnectStrategy(retries: number): number | Error {
  const MAX = 10;
  if (retries > MAX) return new Error(`[redis] Giving up after ${MAX} retries`);
  const delay = Math.min(500 * 2 ** (retries - 1), 30_000);
  console.warn(`[redis] Reconnecting attempt ${retries}/${MAX} in ${delay}ms`);
  return delay;
}

export const redisClient = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  retryStrategy: reconnectStrategy,
  connectionName: 'opengovern-notification',
  connectTimeout: 10_000,
  keepAlive: 30_000,
});

redisClient.on('connect', () => console.log('[redis] Connected'));
redisClient.on('error', (err: Error) => console.error('[redis] Error:', err.message));

export async function connectRedis(): Promise<void> {
  await redisClient.connect();
  await redisClient.ping();
  console.log('[redis] PING OK');
}
