import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    if (times > 10) {
      console.error('Redis: too many reconnection attempts, giving up');
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
  console.log('Redis connected');
});

redis.on('error', (err) => {
  console.error('Redis error:', err.message);
});

redis.on('reconnecting', (delay: number) => {
  console.log(`Redis reconnecting in ${delay}ms`);
});
