/**
 * RBAC (Role-Based Access Control) service.
 *
 * This module answers the question: "Is user X allowed to perform action Y
 * on resource Z?" It loads the user's effective permissions from the database
 * and caches them in Redis to avoid hammering the DB on every API request.
 *
 * Cache strategy:
 *  - Key: `perms:{userId}`
 *  - TTL: 5 minutes (300 seconds)
 *  - Invalidation: explicit delete on role assignment/removal
 *
 * A 5-minute TTL means a role change takes effect within 5 minutes at most
 * without requiring a cache-busting distributed lock. For most governance
 * workflows this latency is acceptable. If near-instant propagation is needed,
 * call invalidatePermissionCache() explicitly after role mutations.
 */

import { redisClient } from '../config/redis';
import * as RoleModel from '../models/role.model';

const CACHE_TTL_SECONDS = 300; // 5 minutes
const CACHE_KEY_PREFIX = 'perms:';

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function cacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

/**
 * Load cached permissions for a user from Redis.
 * Returns null on a cache miss.
 */
async function getCachedPermissions(userId: string): Promise<Set<string> | null> {
  try {
    const raw = await redisClient.get(cacheKey(userId));
    if (!raw) return null;
    const parsed: string[] = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch (err) {
    // A Redis error must not block the request.  Log it and fall through to
    // loading from the DB.
    console.warn(
      '[rbac.service] Redis get failed, falling back to DB:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Store a user's permissions in Redis with the configured TTL.
 */
async function setCachedPermissions(
  userId: string,
  permissions: Set<string>,
): Promise<void> {
  try {
    const value = JSON.stringify(Array.from(permissions));
    await redisClient.set(cacheKey(userId), value, 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    // Failure to cache is non-fatal; the next request will just hit the DB again.
    console.warn(
      '[rbac.service] Redis set failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the complete set of permissions for a user as "resource:action" strings.
 *
 * Results are served from the Redis cache when available. On a cache miss the
 * permissions are loaded from the DB and cached for subsequent requests.
 *
 * @example
 * const perms = await getUserPermissions(userId);
 * perms.has('assets:read'); // true / false
 */
export async function getUserPermissions(userId: string): Promise<Set<string>> {
  // Try cache first
  const cached = await getCachedPermissions(userId);
  if (cached !== null) {
    return cached;
  }

  // Cache miss: load from DB
  const permissions = await RoleModel.getPermissionsByUserId(userId);
  const permSet = new Set(permissions.map((p) => `${p.resource}:${p.action}`));

  // Write-through to cache
  await setCachedPermissions(userId, permSet);

  return permSet;
}

/**
 * Check whether a user has a specific resource:action permission.
 *
 * @param userId   Target user
 * @param resource Resource name, e.g. "assets", "policies"
 * @param action   Action name, e.g. "read", "write", "delete", "admin"
 * @returns        true if the user's effective permissions include the
 *                 requested resource:action combination
 */
export async function hasPermission(
  userId: string,
  resource: string,
  action: string,
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);

  // An "admin" permission on a resource implies all other actions on it.
  // e.g. "assets:admin" covers "assets:read", "assets:write", "assets:delete".
  return (
    permissions.has(`${resource}:${action}`) ||
    permissions.has(`${resource}:admin`) ||
    permissions.has('*:admin') // superuser wildcard
  );
}

/**
 * Check whether a user has at least one of the supplied permissions.
 *
 * @param userId       Target user
 * @param permissions  Array of "resource:action" strings
 * @returns            true if the user holds any one of them
 */
export async function hasAnyPermission(
  userId: string,
  permissions: string[],
): Promise<boolean> {
  const userPerms = await getUserPermissions(userId);

  return permissions.some((perm) => {
    const [resource, action] = perm.split(':') as [string, string];
    return (
      userPerms.has(perm) ||
      userPerms.has(`${resource}:admin`) ||
      userPerms.has('*:admin')
    );
  });
}

/**
 * Check whether a user has ALL of the supplied permissions.
 *
 * @param userId       Target user
 * @param permissions  Array of "resource:action" strings
 * @returns            true only if the user holds every one of them
 */
export async function hasAllPermissions(
  userId: string,
  permissions: string[],
): Promise<boolean> {
  const userPerms = await getUserPermissions(userId);

  // Superuser wildcard short-circuits the check
  if (userPerms.has('*:admin')) return true;

  return permissions.every((perm) => {
    const [resource] = perm.split(':') as [string, string];
    return userPerms.has(perm) || userPerms.has(`${resource}:admin`);
  });
}

/**
 * Invalidate the permission cache for a user.
 *
 * MUST be called after any role assignment or removal so the next request
 * picks up the updated permission set rather than serving stale data.
 *
 * @param userId  The user whose cache entry should be deleted
 */
export async function invalidatePermissionCache(userId: string): Promise<void> {
  try {
    await redisClient.del(cacheKey(userId));
  } catch (err) {
    // Non-fatal: the cache will expire naturally within TTL seconds.
    console.warn(
      '[rbac.service] Failed to invalidate permission cache for user',
      userId,
      ':',
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Warm the permission cache for a set of users.
 * Useful to call after bulk role changes to pre-populate the cache rather
 * than letting the first request for each user incur a DB round-trip.
 */
export async function warmPermissionCaches(userIds: string[]): Promise<void> {
  await Promise.allSettled(
    userIds.map((id) => getUserPermissions(id)),
  );
}
