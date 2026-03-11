/**
 * JWT token service.
 *
 * Uses RS256 (RSA + SHA-256) asymmetric signing:
 *   - The private key (kept secret) signs tokens.
 *   - The public key (distributed freely) verifies tokens.
 *
 * This matters for a microservices architecture: other services can verify
 * tokens locally using only the public key without ever touching the private
 * key or calling back to the auth service for every request.
 *
 * Refresh tokens are opaque random strings. We store a SHA-256 hash of the
 * raw value in the database; even if the DB is compromised the attacker
 * cannot use the hashes directly.
 *
 * Token rotation: every time a refresh token is used to get a new access
 * token, the old refresh token is revoked and a new one is issued. This
 * limits the damage from a stolen refresh token: it can only be used once.
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { query } from '../config/database';
import { User, JwtPayload, Role, Permission } from '../types';
import { TokenPair, RefreshTokenRecord } from '../types';

// ---------------------------------------------------------------------------
// Key loading
// ---------------------------------------------------------------------------

// Keys are loaded once at module initialisation time. If the files are missing
// or unreadable the service will crash immediately (fail-fast).
let privateKey: string;
let publicKey: string;

try {
  privateKey = fs.readFileSync(env.JWT_PRIVATE_KEY_PATH, 'utf8');
  publicKey = fs.readFileSync(env.JWT_PUBLIC_KEY_PATH, 'utf8');
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[token.service] Failed to load JWT keys: ${message}`);
  console.error(
    `  Private key path: ${env.JWT_PRIVATE_KEY_PATH}`,
    `\n  Public key path: ${env.JWT_PUBLIC_KEY_PATH}`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the SHA-256 hex digest of a string.
 * Used to hash refresh tokens before storing them.
 */
function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Generate a cryptographically secure random token string.
 * 48 bytes → 64 hex characters; well above the 128-bit security target.
 */
function generateOpaqueToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

/**
 * Parse an expiry string like "15m", "7d", "1h" into seconds.
 * jsonwebtoken accepts strings directly, but we need the numeric value to
 * store expiresAt timestamps in the DB.
 */
function parseExpiryToSeconds(expiry: string): number {
  const match = expiry.match(/^(\d+)(s|m|h|d)$/);
  if (!match) throw new Error(`Invalid expiry format: "${expiry}"`);
  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return value * (multipliers[unit] ?? 1);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Issue a new access + refresh token pair for the given user.
 *
 * @param user        The authenticated user
 * @param roles       The user's current roles (for embedding in the JWT)
 * @param permissions The user's flattened permissions (for embedding in the JWT)
 * @param ipAddress   Client IP, stored in the refresh token record for audit
 */
export async function generateTokenPair(
  user: User,
  roles: Role[],
  permissions: Permission[],
  ipAddress?: string,
): Promise<TokenPair> {
  const now = Math.floor(Date.now() / 1000);
  const accessExpiresIn = parseExpiryToSeconds(env.JWT_ACCESS_TOKEN_EXPIRES_IN);
  const refreshExpiresIn = parseExpiryToSeconds(
    env.JWT_REFRESH_TOKEN_EXPIRES_IN,
  );

  // Build the JWT payload. Keep it lean: only data needed by downstream
  // services to make access-control decisions without a DB round-trip.
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    username: user.username,
    roles: roles.map((r) => r.name),
    permissions: permissions.map((p) => `${p.resource}:${p.action}`),
    iss: env.JWT_ISSUER,
    aud: env.JWT_AUDIENCE,
  };

  // Sign with the RSA private key using RS256
  const accessToken = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: env.JWT_ACCESS_TOKEN_EXPIRES_IN,
  });

  // Generate and store the refresh token
  const rawRefreshToken = generateOpaqueToken();
  const tokenHash = sha256(rawRefreshToken);
  const refreshExpiresAt = new Date((now + refreshExpiresIn) * 1000);

  await query(
    `INSERT INTO refresh_tokens
       (id, user_id, token_hash, expires_at, created_at, revoked, issued_from_ip)
     VALUES ($1, $2, $3, $4, NOW(), false, $5)`,
    [uuidv4(), user.id, tokenHash, refreshExpiresAt, ipAddress ?? null],
  );

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    accessTokenExpiresAt: now + accessExpiresIn,
    refreshTokenExpiresAt: now + refreshExpiresIn,
  };
}

/**
 * Verify an access token and return its decoded payload.
 * Throws a JsonWebTokenError if the token is invalid or expired.
 */
export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      publicKey,
      { algorithms: ['RS256'] },
      (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded as JwtPayload);
      },
    );
  });
}

/**
 * Look up a refresh token record by the SHA-256 hash of the raw token value.
 * Returns null if the token doesn't exist, is revoked, or has expired.
 */
export async function verifyRefreshToken(
  rawToken: string,
): Promise<RefreshTokenRecord | null> {
  const tokenHash = sha256(rawToken);

  const result = await query<{
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: Date;
    created_at: Date;
    revoked: boolean;
    revoked_at: Date | null;
    issued_from_ip: string | null;
  }>(
    `SELECT id, user_id, token_hash, expires_at, created_at,
            revoked, revoked_at, issued_from_ip
     FROM refresh_tokens
     WHERE token_hash = $1
       AND revoked = false
       AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0]!;
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    revoked: row.revoked,
    revokedAt: row.revoked_at?.toISOString(),
    issuedFromIp: row.issued_from_ip ?? undefined,
  };
}

/**
 * Rotate a refresh token: revoke the old one and issue a brand-new pair.
 *
 * Token rotation (RFC 6749 §10.4) ensures that if an attacker steals a
 * refresh token, they can only use it once before it becomes invalid.
 * The legitimate client will present the same token and find it revoked,
 * signalling a possible replay attack.
 */
export async function rotateRefreshToken(
  rawOldToken: string,
  user: User,
  roles: Role[],
  permissions: Permission[],
  ipAddress?: string,
): Promise<TokenPair> {
  const oldHash = sha256(rawOldToken);

  // Revoke the old token first (within the same operation – not a transaction
  // here because the tokens table is append-friendly, but we guard against
  // re-use by checking the DB before issuing).
  await revokeRefreshToken(rawOldToken);

  // Issue a completely new pair
  return generateTokenPair(user, roles, permissions, ipAddress);
}

/**
 * Revoke a single refresh token by its raw value (we hash internally).
 */
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = sha256(rawToken);
  await query(
    `UPDATE refresh_tokens
     SET revoked = true, revoked_at = NOW()
     WHERE token_hash = $1
       AND revoked = false`,
    [tokenHash],
  );
}

/**
 * Revoke ALL refresh tokens for a user.
 * Called on password change, account suspension, or explicit "log out everywhere".
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens
     SET revoked = true, revoked_at = NOW()
     WHERE user_id = $1
       AND revoked = false`,
    [userId],
  );
}

/**
 * Return the PEM-encoded public key.
 * Exposed via GET /auth/public-key so other services can fetch it and verify
 * tokens locally without calling back to the auth service on each request.
 */
export function getPublicKey(): string {
  return publicKey;
}
