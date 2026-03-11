/**
 * Users controller – HTTP handlers for user and role management endpoints.
 *
 * All write operations (update, delete, role assignment) require the caller
 * to have the appropriate RBAC permission, enforced in the router via
 * requirePermission middleware. Controllers themselves only handle HTTP
 * concerns (parsing, responding) and delegate to models.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import * as UserModel from '../models/user.model';
import * as RoleModel from '../models/role.model';
import * as RbacService from '../services/rbac.service';
import { AuthenticatedRequest } from '../types';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const listUsersSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => Math.min(parseInt(v ?? '20', 10), 100))
    .refine((n) => n > 0, 'limit must be positive'),
  offset: z
    .string()
    .optional()
    .transform((v) => parseInt(v ?? '0', 10))
    .refine((n) => n >= 0, 'offset must be non-negative'),
  search: z.string().optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  username: z.string().min(3).max(30).optional(),
  isActive: z.boolean().optional(),
});

const assignRoleSchema = z.object({
  roleId: z.string().uuid('roleId must be a valid UUID'),
});

const createRoleSchema = z.object({
  name: z
    .string()
    .min(2, 'Role name must be at least 2 characters')
    .max(50, 'Role name must not exceed 50 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Role name may only contain letters, numbers, underscores, and hyphens',
    ),
  description: z.string().max(255).optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  description: z.string().max(255).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendNotFound(res: Response, entity: string): void {
  res.status(404).json({ code: 'NOT_FOUND', message: `${entity} not found` });
}

function sendValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    details: error.flatten().fieldErrors,
  });
}

// ---------------------------------------------------------------------------
// User handlers
// ---------------------------------------------------------------------------

/**
 * GET /users
 * List all users with optional search and pagination.
 */
export async function listUsers(req: Request, res: Response): Promise<void> {
  const parsed = listUsersSchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { limit, offset, search } = parsed.data;
  const { users, total } = await UserModel.listUsers({ limit, offset, search });

  res.status(200).json({
    items: users,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + users.length < total,
    },
  });
}

/**
 * GET /users/:id
 * Fetch a single user by UUID.
 */
export async function getUser(req: Request, res: Response): Promise<void> {
  const user = await UserModel.findById(req.params['id'] ?? '');

  if (!user) {
    sendNotFound(res, 'User');
    return;
  }

  // Attach the user's current roles to the response for convenience
  const roles = await RoleModel.getRolesByUserId(user.id);

  res.status(200).json({ ...user, roles });
}

/**
 * PUT /users/:id
 * Update a user's profile fields (not password – use /auth/change-password).
 */
export async function updateUser(req: Request, res: Response): Promise<void> {
  const authedReq = req as AuthenticatedRequest;
  const targetId = req.params['id'] ?? '';

  // A regular user can only update their own profile.
  // An admin (users:admin permission) can update anyone.
  const isSelf = authedReq.user.sub === targetId;
  const isAdmin = await RbacService.hasPermission(
    authedReq.user.sub,
    'users',
    'admin',
  );

  if (!isSelf && !isAdmin) {
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'You can only update your own profile.',
    });
    return;
  }

  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  // Only admins can change isActive (disabling/enabling accounts)
  if (parsed.data.isActive !== undefined && !isAdmin) {
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Only administrators can change account activation status.',
    });
    return;
  }

  try {
    const updated = await UserModel.update(targetId, {
      fullName: parsed.data.fullName,
      username: parsed.data.username,
      isActive: parsed.data.isActive,
    });

    res.status(200).json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    if (message.includes('not found')) {
      sendNotFound(res, 'User');
    } else {
      res.status(400).json({ code: 'BAD_REQUEST', message });
    }
  }
}

/**
 * DELETE /users/:id
 * Soft-delete a user account.
 * Requires: users:delete permission.
 */
export async function deleteUser(req: Request, res: Response): Promise<void> {
  const authedReq = req as AuthenticatedRequest;
  const targetId = req.params['id'] ?? '';

  // Prevent users from deleting their own account to avoid accidental lockouts
  if (authedReq.user.sub === targetId) {
    res.status(400).json({
      code: 'BAD_REQUEST',
      message: 'You cannot delete your own account.',
    });
    return;
  }

  try {
    await UserModel.softDelete(targetId);
    res.status(200).json({ message: 'User account deleted successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    if (message.includes('not found')) {
      sendNotFound(res, 'User');
    } else {
      res.status(400).json({ code: 'BAD_REQUEST', message });
    }
  }
}

/**
 * POST /users/:id/roles
 * Assign a role to a user.
 * Requires: users:admin permission.
 */
export async function assignRole(req: Request, res: Response): Promise<void> {
  const authedReq = req as AuthenticatedRequest;
  const targetUserId = req.params['id'] ?? '';

  const parsed = assignRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  // Verify both the user and role exist before assigning
  const [user, role] = await Promise.all([
    UserModel.findById(targetUserId),
    RoleModel.getRoleById(parsed.data.roleId),
  ]);

  if (!user) {
    sendNotFound(res, 'User');
    return;
  }
  if (!role) {
    sendNotFound(res, 'Role');
    return;
  }

  try {
    await RoleModel.assignRoleToUser(
      targetUserId,
      parsed.data.roleId,
      authedReq.user.sub, // grantedBy
    );

    // Invalidate the permission cache so the change takes effect immediately
    await RbacService.invalidatePermissionCache(targetUserId);

    res.status(200).json({ message: `Role '${role.name}' assigned successfully` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Role assignment failed';
    res.status(400).json({ code: 'BAD_REQUEST', message });
  }
}

/**
 * DELETE /users/:id/roles/:roleId
 * Remove a role from a user.
 * Requires: users:admin permission.
 */
export async function removeRole(req: Request, res: Response): Promise<void> {
  const targetUserId = req.params['id'] ?? '';
  const roleId = req.params['roleId'] ?? '';

  try {
    await RoleModel.removeRoleFromUser(targetUserId, roleId);

    // Invalidate cache so the revocation takes effect at next request
    await RbacService.invalidatePermissionCache(targetUserId);

    res.status(200).json({ message: 'Role removed successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Role removal failed';
    if (message.includes('not currently assigned')) {
      res.status(404).json({ code: 'NOT_FOUND', message });
    } else {
      res.status(400).json({ code: 'BAD_REQUEST', message });
    }
  }
}

// ---------------------------------------------------------------------------
// Role handlers
// ---------------------------------------------------------------------------

/**
 * GET /roles
 * List all roles in the system.
 */
export async function listRoles(_req: Request, res: Response): Promise<void> {
  const roles = await RoleModel.getAllRoles();
  res.status(200).json({
    items: roles,
    pagination: {
      total: roles.length,
      limit: roles.length,
      offset: 0,
      hasMore: false,
    },
  });
}

/**
 * GET /roles/:id
 * Fetch a single role with its associated permissions.
 */
export async function getRole(req: Request, res: Response): Promise<void> {
  const roleId = req.params['id'] ?? '';

  const [role, permissions] = await Promise.all([
    RoleModel.getRoleById(roleId),
    RoleModel.getPermissionsByRoleId(roleId),
  ]);

  if (!role) {
    sendNotFound(res, 'Role');
    return;
  }

  res.status(200).json({ ...role, permissions });
}

/**
 * POST /roles
 * Create a new custom role.
 * Requires: roles:write permission.
 */
export async function createRole(req: Request, res: Response): Promise<void> {
  const parsed = createRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const role = await RoleModel.createRole(
      parsed.data.name,
      parsed.data.description,
      parsed.data.permissionIds,
    );
    res.status(201).json(role);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Role creation failed';
    const status = message.toLowerCase().includes('duplicate') ? 409 : 400;
    res.status(status).json({ code: 'BAD_REQUEST', message });
  }
}

/**
 * PUT /roles/:id
 * Update a role's name and/or description.
 * System roles have their names protected.
 */
export async function updateRole(req: Request, res: Response): Promise<void> {
  const roleId = req.params['id'] ?? '';

  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const existing = await RoleModel.getRoleById(roleId);
  if (!existing) {
    sendNotFound(res, 'Role');
    return;
  }

  if (existing.isSystem && parsed.data.name !== undefined) {
    res.status(400).json({
      code: 'BAD_REQUEST',
      message: 'The name of a system role cannot be changed.',
    });
    return;
  }

  try {
    const updated = await RoleModel.updateRole(roleId, parsed.data);
    res.status(200).json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Role update failed';
    res.status(400).json({ code: 'BAD_REQUEST', message });
  }
}
