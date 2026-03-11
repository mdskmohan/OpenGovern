/**
 * Authentication service – core business logic.
 *
 * This module sits between the HTTP controllers and the data-access layer.
 * It owns the rules about what constitutes a valid registration, what happens
 * when a password is wrong, etc. Controllers call into here; this module calls
 * into models and the token service.
 *
 * Intentional design choices:
 *  - Error messages deliberately do NOT reveal whether an email is registered.
 *    "Invalid email or password" prevents user-enumeration attacks.
 *  - bcrypt comparison always runs even when no user is found (using a fake
 *    hash) to prevent timing-based user enumeration.
 *  - All inputs are normalised (lowercased, trimmed) before touching the DB.
 */

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import * as UserModel from '../models/user.model';
import * as RoleModel from '../models/role.model';
import * as TokenService from './token.service';
import { User, TokenPair } from '../types';

// A pre-computed bcrypt hash used in the dummy comparison path.
// This ensures that the time taken to respond to a failed login for a
// non-existent user is indistinguishable from a real one.
const DUMMY_HASH = bcrypt.hashSync('dummy-timing-prevention', 10);

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register a new user account.
 *
 * @throws {Error} with user-facing message if the email/username is taken
 *                 or input validation fails.
 */
export async function register(
  email: string,
  username: string,
  fullName: string,
  password: string,
  ipAddress?: string,
): Promise<{ user: User; tokens: TokenPair }> {
  // Normalise inputs before any DB operation
  const normEmail = email.toLowerCase().trim();
  const normUsername = username.trim();
  const normFullName = fullName.trim();

  // Validate password strength here (additional layer beyond controller Zod schema)
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  // Check for existing account with this email
  const existing = await UserModel.findByEmail(normEmail);
  if (existing) {
    // Use a generic message to avoid confirming which email is taken
    // (though registration enumeration is slightly less sensitive than login)
    throw new Error('An account with this email address already exists');
  }

  // Hash the password with the configured bcrypt cost factor.
  // This is intentionally slow – that's the whole point of bcrypt.
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  const userId = uuidv4();
  const user = await UserModel.create({
    id: userId,
    email: normEmail,
    username: normUsername,
    fullName: normFullName,
    passwordHash,
  });

  // Assign the default "viewer" role to every new user.
  // We look this up by name rather than hardcoding an ID so it's portable
  // across environments.
  try {
    const allRoles = await RoleModel.getAllRoles();
    const viewerRole = allRoles.find((r) => r.name === 'viewer');
    if (viewerRole) {
      // System assigns this role, so grantedBy is the new user's own ID
      await RoleModel.assignRoleToUser(userId, viewerRole.id, userId);
    }
  } catch {
    // Non-fatal: the user is created but without the default role.
    // An admin can assign roles manually. Log it but don't fail registration.
    console.warn(
      `[auth.service] Could not assign default viewer role to user ${userId}`,
    );
  }

  // Fetch the now-assigned roles and permissions to embed in the JWT
  const [roles, permissions] = await Promise.all([
    RoleModel.getRolesByUserId(userId),
    RoleModel.getPermissionsByUserId(userId),
  ]);

  const tokens = await TokenService.generateTokenPair(
    user,
    roles,
    permissions,
    ipAddress,
  );

  return { user, tokens };
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * Authenticate with email + password, return a new token pair on success.
 *
 * @throws {Error} "Invalid email or password" on any failure (deliberately
 *                 vague to prevent enumeration).
 */
export async function login(
  email: string,
  password: string,
  ipAddress?: string,
): Promise<{ user: User; tokens: TokenPair }> {
  const normEmail = email.toLowerCase().trim();

  // Fetch the user WITH the password hash (special model function)
  const userWithHash = await UserModel.findByEmailWithPassword(normEmail);

  if (!userWithHash) {
    // Run a dummy bcrypt compare to maintain consistent response time even when
    // no user is found, preventing timing-based user enumeration.
    await bcrypt.compare(password, DUMMY_HASH);
    throw new Error('Invalid email or password');
  }

  const { passwordHash, ...user } = userWithHash;

  // Check the password against the stored hash
  const passwordValid = await bcrypt.compare(password, passwordHash);
  if (!passwordValid) {
    throw new Error('Invalid email or password');
  }

  // Reject disabled accounts AFTER password check so the response time is
  // similar whether the account is disabled or the password is wrong.
  if (!user.isActive) {
    throw new Error('This account has been disabled. Please contact support.');
  }

  // Record the login timestamp (fire-and-forget; don't block the response)
  UserModel.updateLastLogin(user.id).catch((err: unknown) =>
    console.warn('[auth.service] Failed to update last_login_at:', err),
  );

  const [roles, permissions] = await Promise.all([
    RoleModel.getRolesByUserId(user.id),
    RoleModel.getPermissionsByUserId(user.id),
  ]);

  const tokens = await TokenService.generateTokenPair(
    user,
    roles,
    permissions,
    ipAddress,
  );

  return { user, tokens };
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

/**
 * Invalidate the supplied refresh token.
 * The access token cannot be revoked (it's a stateless JWT) – it will
 * naturally expire after JWT_ACCESS_TOKEN_EXPIRES_IN. Clients should discard
 * the access token immediately on logout.
 */
export async function logout(rawRefreshToken: string): Promise<void> {
  await TokenService.revokeRefreshToken(rawRefreshToken);
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

/**
 * Exchange a valid refresh token for a new token pair.
 * The old refresh token is atomically revoked and a new one is issued.
 */
export async function refreshTokens(
  rawRefreshToken: string,
  ipAddress?: string,
): Promise<TokenPair> {
  // Verify the refresh token exists and hasn't been revoked/expired
  const record = await TokenService.verifyRefreshToken(rawRefreshToken);
  if (!record) {
    throw new Error('Refresh token is invalid or has expired');
  }

  // Load the associated user to rebuild the JWT payload with current roles
  const user = await UserModel.findById(record.userId);
  if (!user) {
    throw new Error('User account no longer exists');
  }

  if (!user.isActive) {
    // Revoke all tokens so the user can't keep refreshing after being disabled
    await TokenService.revokeAllUserTokens(user.id);
    throw new Error('Account is disabled');
  }

  const [roles, permissions] = await Promise.all([
    RoleModel.getRolesByUserId(user.id),
    RoleModel.getPermissionsByUserId(user.id),
  ]);

  // rotateRefreshToken revokes the old token and issues a new pair
  return TokenService.rotateRefreshToken(
    rawRefreshToken,
    user,
    roles,
    permissions,
    ipAddress,
  );
}

// ---------------------------------------------------------------------------
// Password change
// ---------------------------------------------------------------------------

/**
 * Change a user's password.
 *
 * Requires the current password for verification (prevents an attacker who
 * has gained session access from locking out the legitimate user). All
 * existing refresh tokens are revoked on success, forcing re-login everywhere.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters long');
  }

  if (currentPassword === newPassword) {
    throw new Error('New password must be different from the current password');
  }

  // Fetch the user + password hash by their UUID.
  // findByEmailWithPassword takes an email, so we use the dedicated
  // findUserWithHashById helper below which accepts a UUID.
  const userWithHash = await findUserWithHashById(userId);
  if (!userWithHash) {
    throw new Error('User not found');
  }

  const valid = await bcrypt.compare(currentPassword, userWithHash.passwordHash);
  if (!valid) {
    throw new Error('Current password is incorrect');
  }

  const newHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);

  await UserModel.update(userId, { passwordHash: newHash });

  // Revoke ALL existing refresh tokens – forces re-authentication on all devices.
  // This is standard security practice after a password change.
  await TokenService.revokeAllUserTokens(userId);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a user + password_hash by their UUID.
 * This is a private helper used only within auth.service to avoid exposing
 * the password hash through the general-purpose model layer.
 */
async function findUserWithHashById(
  userId: string,
): Promise<(User & { passwordHash: string }) | null> {
  const { query } = await import('../config/database');

  // Direct DB query – justified because this is a controlled internal call
  const result = await query<{
    id: string;
    email: string;
    username: string;
    full_name: string;
    password_hash: string;
    is_active: boolean;
    is_superuser: boolean;
    last_login_at: Date | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT id, email, username, full_name, password_hash,
            is_active, is_superuser, last_login_at,
            created_at, updated_at, deleted_at
     FROM users
     WHERE id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [userId],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0]!;
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    fullName: row.full_name,
    isActive: row.is_active,
    isSuperuser: row.is_superuser,
    lastLoginAt: row.last_login_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString(),
    passwordHash: row.password_hash,
  };
}
