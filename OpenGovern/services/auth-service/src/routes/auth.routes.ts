/**
 * Authentication routes.
 *
 * Mounted at /api/v1/auth in index.ts
 *
 * Public endpoints (no token required):
 *   POST /login         – authenticate with email + password
 *   POST /register      – create a new account
 *   POST /refresh       – exchange a refresh token for a new token pair
 *   GET  /public-key    – fetch the RSA public key for offline JWT verification
 *
 * Protected endpoints (valid access token required):
 *   POST /logout        – revoke the refresh token
 *   GET  /me            – return the current user's profile
 *   POST /change-password
 *
 * Rate limiting is applied to public endpoints only.
 */

import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

// ---------------------------------------------------------------------------
// Public routes (no authentication required)
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/auth/login
 * Body: { email, password }
 * Returns: { user, tokens }
 */
router.post('/login', authLimiter, AuthController.login);

/**
 * POST /api/v1/auth/register
 * Body: { email, username, fullName, password }
 * Returns: { user, tokens }
 */
router.post('/register', authLimiter, AuthController.register);

/**
 * POST /api/v1/auth/refresh
 * Body: { refreshToken }
 * Returns: { tokens }
 *
 * Rate limited at the auth limiter level but not blocked – refresh requests
 * from a legitimate client should succeed freely. The limiter here catches
 * refresh-token brute-force attempts.
 */
router.post('/refresh', authLimiter, AuthController.refresh);

/**
 * GET /api/v1/auth/public-key
 * Returns: { publicKey }
 *
 * No rate limit – this is a static value and will typically be cached
 * by consuming services for the lifetime of the key rotation period.
 */
router.get('/public-key', AuthController.getPublicKey);

// ---------------------------------------------------------------------------
// Protected routes (valid JWT access token required)
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/auth/logout
 * Body: { refreshToken }
 * Returns: { message }
 * Auth: Bearer <access_token>
 */
router.post('/logout', requireAuth, AuthController.logout);

/**
 * GET /api/v1/auth/me
 * Returns: { id, email, username, roles, permissions }
 * Auth: Bearer <access_token>
 */
router.get('/me', requireAuth, AuthController.me);

/**
 * POST /api/v1/auth/change-password
 * Body: { currentPassword, newPassword, confirmNewPassword }
 * Returns: { message }
 * Auth: Bearer <access_token>
 */
router.post('/change-password', requireAuth, AuthController.changePassword);

export default router;
