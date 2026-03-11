/**
 * User model – database query layer for the `users` table.
 *
 * All functions in this module issue parameterised queries through the shared
 * pool helper. No raw string interpolation of user-supplied values is ever
 * used, which prevents SQL injection by design.
 *
 * This layer knows about the database schema (column names, table names) but
 * has no business logic. Business rules (password hashing, duplicate checks,
 * etc.) live in the service layer.
 */

import { query } from '../config/database';
import { User } from '../types';
import { UserRow } from '../types';

// ---------------------------------------------------------------------------
// Row-to-domain mapper
// ---------------------------------------------------------------------------

/**
 * Convert a raw PostgreSQL row to the application-level User type.
 *
 * We map snake_case column names → camelCase fields and convert Date objects
 * to ISO-8601 strings so the shape is consistent regardless of what the pg
 * driver does with timezone-aware columns.
 */
function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    fullName: row.full_name,
    isActive: row.is_active,
    isSuperuser: row.is_superuser,
    lastLoginAt: row.last_login_at
      ? row.last_login_at.toISOString()
      : undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : undefined,
  };
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Find a user by their email address.
 *
 * We include deleted_at IS NULL in the WHERE clause so soft-deleted accounts
 * cannot be used to log in. Returns null if no matching live account exists.
 */
export async function findByEmail(email: string): Promise<User | null> {
  const result = await query<UserRow>(
    `SELECT id, email, username, full_name, password_hash,
            is_active, is_superuser, last_login_at,
            created_at, updated_at, deleted_at
     FROM users
     WHERE email = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [email.toLowerCase().trim()],
  );
  return result.rows.length > 0 ? rowToUser(result.rows[0]!) : null;
}

/**
 * Find a user by primary key (UUID).
 * Returns null for deleted accounts.
 */
export async function findById(id: string): Promise<User | null> {
  const result = await query<UserRow>(
    `SELECT id, email, username, full_name, password_hash,
            is_active, is_superuser, last_login_at,
            created_at, updated_at, deleted_at
     FROM users
     WHERE id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [id],
  );
  return result.rows.length > 0 ? rowToUser(result.rows[0]!) : null;
}

/**
 * Like findByEmail but also returns the password_hash column.
 * Used ONLY by the auth service's login flow; all other callers should use
 * findByEmail which omits the hash.
 */
export async function findByEmailWithPassword(
  email: string,
): Promise<(User & { passwordHash: string }) | null> {
  const result = await query<UserRow>(
    `SELECT id, email, username, full_name, password_hash,
            is_active, is_superuser, last_login_at,
            created_at, updated_at, deleted_at
     FROM users
     WHERE email = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [email.toLowerCase().trim()],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0]!;
  return { ...rowToUser(row), passwordHash: row.password_hash };
}

/**
 * Insert a new user row.
 *
 * The caller (auth.service) is responsible for hashing the password before
 * passing it here. We store only the hash, never the plaintext.
 */
export async function create(data: {
  id: string;
  email: string;
  username: string;
  fullName: string;
  passwordHash: string;
  isActive?: boolean;
  isSuperuser?: boolean;
}): Promise<User> {
  const result = await query<UserRow>(
    `INSERT INTO users
       (id, email, username, full_name, password_hash, is_active, is_superuser,
        created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     RETURNING id, email, username, full_name, password_hash,
               is_active, is_superuser, last_login_at,
               created_at, updated_at, deleted_at`,
    [
      data.id,
      data.email.toLowerCase().trim(),
      data.username.trim(),
      data.fullName.trim(),
      data.passwordHash,
      data.isActive ?? true,
      data.isSuperuser ?? false,
    ],
  );

  // RETURNING guarantees exactly one row; the non-null assertion is safe.
  return rowToUser(result.rows[0]!);
}

/**
 * Partially update a user row.
 *
 * Only the fields present in `data` are updated; we build the SET clause
 * dynamically rather than always updating every column. This avoids overwriting
 * fields the caller didn't intend to change.
 */
export async function update(
  id: string,
  data: Partial<{
    email: string;
    username: string;
    fullName: string;
    passwordHash: string;
    isActive: boolean;
  }>,
): Promise<User> {
  // Build the SET clause from whatever fields were supplied.
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.email !== undefined) {
    setClauses.push(`email = $${paramIndex++}`);
    values.push(data.email.toLowerCase().trim());
  }
  if (data.username !== undefined) {
    setClauses.push(`username = $${paramIndex++}`);
    values.push(data.username.trim());
  }
  if (data.fullName !== undefined) {
    setClauses.push(`full_name = $${paramIndex++}`);
    values.push(data.fullName.trim());
  }
  if (data.passwordHash !== undefined) {
    setClauses.push(`password_hash = $${paramIndex++}`);
    values.push(data.passwordHash);
  }
  if (data.isActive !== undefined) {
    setClauses.push(`is_active = $${paramIndex++}`);
    values.push(data.isActive);
  }

  if (setClauses.length === 0) {
    throw new Error('update() called with no fields to update');
  }

  // Always bump updated_at so audit trails are accurate.
  setClauses.push('updated_at = NOW()');

  values.push(id);

  const result = await query<UserRow>(
    `UPDATE users
     SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex}
       AND deleted_at IS NULL
     RETURNING id, email, username, full_name, password_hash,
               is_active, is_superuser, last_login_at,
               created_at, updated_at, deleted_at`,
    values,
  );

  if (result.rows.length === 0) {
    throw new Error(`User ${id} not found or already deleted`);
  }

  return rowToUser(result.rows[0]!);
}

/**
 * Soft-delete a user by setting deleted_at to NOW().
 *
 * We never hard-delete user rows: doing so would break foreign keys in audit
 * logs, activity history, and governance records. Soft deletion keeps the
 * data intact while preventing the account from being used.
 */
export async function softDelete(id: string): Promise<void> {
  const result = await query(
    `UPDATE users
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1
       AND deleted_at IS NULL`,
    [id],
  );

  if (result.rowCount === 0) {
    throw new Error(`User ${id} not found or already deleted`);
  }
}

/**
 * Record that a user successfully logged in.
 * Kept separate from update() because it's a high-frequency write and we
 * want the call-site to be explicit about what's happening.
 */
export async function updateLastLogin(id: string): Promise<void> {
  await query(
    `UPDATE users
     SET last_login_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [id],
  );
}

/**
 * Return a paginated list of users (excludes soft-deleted accounts).
 * Used by the admin users management endpoints.
 */
export async function listUsers(options: {
  limit: number;
  offset: number;
  search?: string;
}): Promise<{ users: User[]; total: number }> {
  const { limit, offset, search } = options;
  const params: unknown[] = [limit, offset];
  let whereClause = 'deleted_at IS NULL';

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const idx = params.length;
    whereClause += ` AND (LOWER(email) LIKE $${idx} OR LOWER(username) LIKE $${idx} OR LOWER(full_name) LIKE $${idx})`;
  }

  const [dataResult, countResult] = await Promise.all([
    query<UserRow>(
      `SELECT id, email, username, full_name, password_hash,
              is_active, is_superuser, last_login_at,
              created_at, updated_at, deleted_at
       FROM users
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      params,
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE ${whereClause}`,
      params.slice(2), // exclude limit/offset from count query
    ),
  ]);

  return {
    users: dataResult.rows.map(rowToUser),
    total: parseInt(countResult.rows[0]?.count ?? '0', 10),
  };
}
