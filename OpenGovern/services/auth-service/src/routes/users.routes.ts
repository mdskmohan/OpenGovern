/**
 * User and role management routes.
 *
 * Mounted at /api/v1 in index.ts
 *
 * All endpoints require a valid access token (requireAuth is applied at the
 * router level). Write operations additionally require specific RBAC
 * permissions enforced by requirePermission middleware.
 *
 * User endpoints:
 *   GET    /users              – list users (users:read)
 *   GET    /users/:id          – get single user (users:read)
 *   PUT    /users/:id          – update user (users:write, or own profile)
 *   DELETE /users/:id          – soft-delete user (users:delete)
 *   POST   /users/:id/roles    – assign role to user (users:admin)
 *   DELETE /users/:id/roles/:roleId – remove role from user (users:admin)
 *
 * Role endpoints:
 *   GET    /roles              – list all roles (roles:read)
 *   POST   /roles              – create role (roles:write)
 *   GET    /roles/:id          – get role with permissions (roles:read)
 *   PUT    /roles/:id          – update role (roles:write)
 */

import { Router } from 'express';
import * as UsersController from '../controllers/users.controller';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { apiLimiter } from '../middleware/rateLimiter';

const router = Router();

// Apply the general API rate limiter to every route in this router
router.use(apiLimiter);

// ---------------------------------------------------------------------------
// User routes
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/users
 * Query params: ?limit=20&offset=0&search=john
 * Returns: PaginatedResponse<User>
 */
router.get(
  '/users',
  requirePermission('users', 'read'),
  UsersController.listUsers,
);

/**
 * GET /api/v1/users/:id
 * Returns: User & { roles: Role[] }
 */
router.get(
  '/users/:id',
  requirePermission('users', 'read'),
  UsersController.getUser,
);

/**
 * PUT /api/v1/users/:id
 * Body: { fullName?, username?, isActive? }
 * Returns: User
 *
 * Note: requireAuth only (not requirePermission) – the controller itself
 * checks whether the caller is the user or an admin.
 */
router.put('/users/:id', requireAuth, UsersController.updateUser);

/**
 * DELETE /api/v1/users/:id
 * Returns: { message }
 */
router.delete(
  '/users/:id',
  requirePermission('users', 'delete'),
  UsersController.deleteUser,
);

/**
 * POST /api/v1/users/:id/roles
 * Body: { roleId }
 * Returns: { message }
 */
router.post(
  '/users/:id/roles',
  requirePermission('users', 'admin'),
  UsersController.assignRole,
);

/**
 * DELETE /api/v1/users/:id/roles/:roleId
 * Returns: { message }
 */
router.delete(
  '/users/:id/roles/:roleId',
  requirePermission('users', 'admin'),
  UsersController.removeRole,
);

// ---------------------------------------------------------------------------
// Role routes
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/roles
 * Returns: PaginatedResponse<Role>
 */
router.get(
  '/roles',
  requirePermission('roles', 'read'),
  UsersController.listRoles,
);

/**
 * POST /api/v1/roles
 * Body: { name, description?, permissionIds? }
 * Returns: Role
 */
router.post(
  '/roles',
  requirePermission('roles', 'write'),
  UsersController.createRole,
);

/**
 * GET /api/v1/roles/:id
 * Returns: Role & { permissions: Permission[] }
 */
router.get(
  '/roles/:id',
  requirePermission('roles', 'read'),
  UsersController.getRole,
);

/**
 * PUT /api/v1/roles/:id
 * Body: { name?, description? }
 * Returns: Role
 */
router.put(
  '/roles/:id',
  requirePermission('roles', 'write'),
  UsersController.updateRole,
);

export default router;
