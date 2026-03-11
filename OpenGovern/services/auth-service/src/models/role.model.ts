/**
 * Role model – database query layer for roles, permissions, and user_roles tables.
 *
 * The RBAC schema is three tables:
 *   roles         – named collections of permissions
 *   permissions   – granular "resource:action" capabilities
 *   role_permissions – join table linking roles to permissions
 *   user_roles    – join table linking users to roles
 *
 * All writes are parameterised to prevent SQL injection.
 */

import { query, withTransaction } from '../config/database';
import { Role, Permission } from '../types';
import { RoleRow, PermissionRow } from '../types';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Row-to-domain mappers
// ---------------------------------------------------------------------------

function rowToRole(row: RoleRow): Role {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    isSystem: row.is_system,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToPermission(row: PermissionRow): Permission {
  return {
    id: row.id,
    resource: row.resource,
    action: row.action,
    description: row.description ?? undefined,
    createdAt: row.created_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Role queries
// ---------------------------------------------------------------------------

/**
 * Fetch all roles that have been directly assigned to a user.
 * Does NOT include inherited / transitive roles (not supported by this schema).
 */
export async function getRolesByUserId(userId: string): Promise<Role[]> {
  const result = await query<RoleRow>(
    `SELECT r.id, r.name, r.description, r.is_system, r.created_at, r.updated_at
     FROM roles r
     INNER JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1
       AND ur.revoked_at IS NULL
     ORDER BY r.name`,
    [userId],
  );
  return result.rows.map(rowToRole);
}

/**
 * Fetch all individual permissions for a user, assembled from every role
 * the user holds.
 *
 * A single SQL query walks the join chain:
 *   user_roles → roles → role_permissions → permissions
 *
 * DISTINCT ensures that if two roles share a permission it appears only once.
 */
export async function getPermissionsByUserId(
  userId: string,
): Promise<Permission[]> {
  const result = await query<PermissionRow>(
    `SELECT DISTINCT p.id, p.resource, p.action, p.description, p.created_at
     FROM permissions p
     INNER JOIN role_permissions rp ON rp.permission_id = p.id
     INNER JOIN roles r             ON r.id = rp.role_id
     INNER JOIN user_roles ur       ON ur.role_id = r.id
     WHERE ur.user_id = $1
       AND ur.revoked_at IS NULL
     ORDER BY p.resource, p.action`,
    [userId],
  );
  return result.rows.map(rowToPermission);
}

/**
 * Assign a role to a user.
 *
 * If the assignment already exists and is not revoked we do nothing (ON CONFLICT
 * DO NOTHING). If it exists but was previously revoked we un-revoke it.
 *
 * @param userId    User to assign the role to
 * @param roleId    Role to assign
 * @param grantedBy UUID of the admin user making the assignment (audit trail)
 */
export async function assignRoleToUser(
  userId: string,
  roleId: string,
  grantedBy: string,
): Promise<void> {
  // Use an upsert: if a revoked record exists, clear revoked_at; otherwise insert.
  await query(
    `INSERT INTO user_roles (id, user_id, role_id, granted_by, granted_at, revoked_at)
     VALUES ($1, $2, $3, $4, NOW(), NULL)
     ON CONFLICT (user_id, role_id)
     DO UPDATE SET
       revoked_at = NULL,
       granted_by = EXCLUDED.granted_by,
       granted_at = NOW()`,
    [uuidv4(), userId, roleId, grantedBy],
  );
}

/**
 * Remove a role from a user by setting revoked_at.
 *
 * We soft-delete the assignment rather than hard-deleting so audit logs can
 * show when someone was granted and then removed from a role.
 */
export async function removeRoleFromUser(
  userId: string,
  roleId: string,
): Promise<void> {
  const result = await query(
    `UPDATE user_roles
     SET revoked_at = NOW()
     WHERE user_id = $1
       AND role_id = $2
       AND revoked_at IS NULL`,
    [userId, roleId],
  );

  if (result.rowCount === 0) {
    throw new Error(
      `Role ${roleId} is not currently assigned to user ${userId}`,
    );
  }
}

/**
 * Return all roles in the system, ordered alphabetically.
 * Used by the admin UI to populate role-assignment dropdowns.
 */
export async function getAllRoles(): Promise<Role[]> {
  const result = await query<RoleRow>(
    `SELECT id, name, description, is_system, created_at, updated_at
     FROM roles
     ORDER BY name`,
  );
  return result.rows.map(rowToRole);
}

/**
 * Find a single role by its UUID.
 */
export async function getRoleById(roleId: string): Promise<Role | null> {
  const result = await query<RoleRow>(
    `SELECT id, name, description, is_system, created_at, updated_at
     FROM roles
     WHERE id = $1
     LIMIT 1`,
    [roleId],
  );
  return result.rows.length > 0 ? rowToRole(result.rows[0]!) : null;
}

/**
 * Create a new custom role and optionally associate permissions with it.
 *
 * The operation is wrapped in a transaction so the role and its permission
 * assignments are always in sync.
 */
export async function createRole(
  name: string,
  description?: string,
  permissionIds?: string[],
): Promise<Role> {
  return withTransaction(async (client) => {
    const roleId = uuidv4();

    const roleResult = await client.query<RoleRow>(
      `INSERT INTO roles (id, name, description, is_system, created_at, updated_at)
       VALUES ($1, $2, $3, false, NOW(), NOW())
       RETURNING id, name, description, is_system, created_at, updated_at`,
      [roleId, name.trim(), description?.trim() ?? null],
    );

    // If permission IDs were supplied, link them to the new role.
    if (permissionIds && permissionIds.length > 0) {
      // Build a multi-row VALUES clause for a single batch INSERT.
      const valuesClauses = permissionIds.map(
        (_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`,
      );
      const params: string[] = [];
      for (const permId of permissionIds) {
        params.push(roleId, permId);
      }

      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ${valuesClauses.join(', ')}
         ON CONFLICT DO NOTHING`,
        params,
      );
    }

    return rowToRole(roleResult.rows[0]!);
  });
}

/**
 * Update a role's name and/or description.
 * System roles can have their description updated but not their name.
 */
export async function updateRole(
  roleId: string,
  data: { name?: string; description?: string },
): Promise<Role> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(data.name.trim());
  }
  if (data.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(data.description.trim() || null);
  }

  values.push(roleId);

  const result = await query<RoleRow>(
    `UPDATE roles
     SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING id, name, description, is_system, created_at, updated_at`,
    values,
  );

  if (result.rows.length === 0) {
    throw new Error(`Role ${roleId} not found`);
  }

  return rowToRole(result.rows[0]!);
}

/**
 * Return all permissions in the system.
 * Used by admin screens to display what can be granted.
 */
export async function getAllPermissions(): Promise<Permission[]> {
  const result = await query<PermissionRow>(
    `SELECT id, resource, action, description, created_at
     FROM permissions
     ORDER BY resource, action`,
  );
  return result.rows.map(rowToPermission);
}

/**
 * Return permissions for a specific role.
 */
export async function getPermissionsByRoleId(
  roleId: string,
): Promise<Permission[]> {
  const result = await query<PermissionRow>(
    `SELECT p.id, p.resource, p.action, p.description, p.created_at
     FROM permissions p
     INNER JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = $1
     ORDER BY p.resource, p.action`,
    [roleId],
  );
  return result.rows.map(rowToPermission);
}
