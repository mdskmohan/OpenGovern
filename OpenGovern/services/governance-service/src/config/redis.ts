import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    if (times > 10) {
      console.error('[GovernanceRedis] Too many reconnection attempts, giving up');
      return null;
    }
    return Math.min(times * 100, 3000);
  },
  reconnectOnError(err: Error) {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some((e) => err.message.includes(e));
  },
  lazyConnect: false,
  enableReadyCheck: true,
});

redis.on('connect', () => {
  console.log('[GovernanceRedis] Connected');
});

redis.on('error', (err) => {
  console.error('[GovernanceRedis] Error:', err.message);
});

redis.on('reconnecting', (delay: number) => {
  console.log(`[GovernanceRedis] Reconnecting in ${delay}ms`);
});
