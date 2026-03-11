import { redis } from '../config/redis';
import { FullAsset } from '../types';

const ASSET_CACHE_TTL = 300; // 5 minutes
const DEFAULT_TTL = 60;

const KEY_PREFIX = 'opengovern:core-api:';

function makeKey(key: string): string {
  return `${KEY_PREFIX}${key}`;
}

export async function get<T>(key: string): Promise<T | null> {
  try {
    const value = await redis.get(makeKey(key));
    if (value === null) return null;
    return JSON.parse(value) as T;
  } catch (err) {
    console.error('Cache get error:', { key, error: err });
    return null;
  }
}

export async function set(key: string, value: unknown, ttlSeconds: number = DEFAULT_TTL): Promise<void> {
  try {
    await redis.setex(makeKey(key), ttlSeconds, JSON.stringify(value));
  } catch (err) {
    console.error('Cache set error:', { key, error: err });
  }
}

export async function del(key: string): Promise<void> {
  try {
    await redis.del(makeKey(key));
  } catch (err) {
    console.error('Cache del error:', { key, error: err });
  }
}

export async function getAsset(urn: string): Promise<FullAsset | null> {
  return get<FullAsset>(`asset:${urn}`);
}

export async function setAsset(asset: FullAsset): Promise<void> {
  await set(`asset:${asset.urn}`, asset, ASSET_CACHE_TTL);
}

export async function invalidateAsset(urn: string): Promise<void> {
  await del(`asset:${urn}`);
}

export async function invalidatePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(makeKey(pattern));
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.error('Cache invalidatePattern error:', { pattern, error: err });
  }
}
