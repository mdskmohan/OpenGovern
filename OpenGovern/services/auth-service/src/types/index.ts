/**
 * Auth-service-specific TypeScript types.
 *
 * These types extend or supplement the shared @opengovern/types package with
 * auth-service concerns that don't belong in the shared layer (e.g. Express
 * request extensions, internal DB row shapes, request/response bodies).
 */

import { Request } from 'express';
// Inline types from shared package to avoid cross-directory rootDir issues in Docker build
export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
  roles: string[];
  permissions: string[];
  iat?: number;
  exp?: number;
}
export interface User { id: string; email: string; username: string; fullName: string; roles: string[]; isActive: boolean; }
export interface Role { id: string; name: string; description?: string; isSystem: boolean; }
export interface Permission { id: string; resource: string; action: string; }

// ---------------------------------------------------------------------------
// Express request extension
// ---------------------------------------------------------------------------

/**
 * An authenticated Express request.
 *
 * After the `requireAuth` middleware runs, `req.user` is guaranteed to be
 * populated with the decoded JWT payload. Downstream handlers can use this
 * without null-checking.
 *
 * We extend Request rather than augment the global Express namespace so the
 * type is explicit at call-sites (e.g. `req: AuthenticatedRequest`).
 */
export interface AuthenticatedRequest extends Request {
  /**
   * The decoded and verified JWT payload attached by the auth middleware.
   * Includes the user's id, email, roles, and flattened permissions.
   */
  user: JwtPayload;
  /**
   * Unique request ID injected by the request-id middleware (if present).
   * Useful for correlating log lines across services.
   */
  requestId?: string;
}

// ---------------------------------------------------------------------------
// Token shapes
// ---------------------------------------------------------------------------

/**
 * The pair of tokens returned on successful login or token refresh.
 *
 * Access tokens are short-lived JWTs sent with every API request via the
 * Authorization: Bearer header. Refresh tokens are long-lived opaque strings
 * stored securely by the client and exchanged for a new token pair.
 */
export interface TokenPair {
  /** Signed JWT, expires in JWT_ACCESS_TOKEN_EXPIRES_IN */
  accessToken: string;
  /** Opaque random string, expires in JWT_REFRESH_TOKEN_EXPIRES_IN */
  refreshToken: string;
  /** Unix timestamp (seconds) when the access token expires */
  accessTokenExpiresAt: number;
  /** Unix timestamp (seconds) when the refresh token expires */
  refreshTokenExpiresAt: number;
}

/**
 * Refresh token record stored in the database.
 * We store the SHA-256 hash of the token, not the token itself, so a DB
 * breach doesn't leak usable tokens.
 */
export interface RefreshTokenRecord {
  id: string;
  userId: string;
  /** SHA-256 hex digest of the raw refresh token value */
  tokenHash: string;
  /** ISO-8601 */
  expiresAt: string;
  /** ISO-8601 */
  createdAt: string;
  /** Whether this token has been revoked before its natural expiry */
  revoked: boolean;
  /** ISO-8601, null if not yet revoked */
  revokedAt?: string;
  /** IP address from which the token was issued (for audit) */
  issuedFromIp?: string;
}

// ---------------------------------------------------------------------------
// Request body schemas (mirrored as types; Zod schemas live in controllers)
// ---------------------------------------------------------------------------

/** POST /auth/login */
export interface LoginRequest {
  email: string;
  password: string;
}

/** POST /auth/register */
export interface RegisterRequest {
  email: string;
  username: string;
  fullName: string;
  password: string;
}

/** POST /auth/refresh */
export interface RefreshRequest {
  refreshToken: string;
}

/** POST /auth/change-password */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ---------------------------------------------------------------------------
// Database row types
// ---------------------------------------------------------------------------

/**
 * Raw user row as returned by PostgreSQL.
 * Includes the hashed password (never sent over the wire).
 */
export interface UserRow {
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
}

/**
 * Raw role row as returned by PostgreSQL.
 */
export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Raw permission row as returned by PostgreSQL.
 */
export interface PermissionRow {
  id: string;
  resource: string;
  action: string;
  description: string | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Re-exports (convenience – callers can import everything from this module)
// ---------------------------------------------------------------------------

// (types defined inline above)
