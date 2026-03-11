/**
 * Auth controller – HTTP handlers for authentication endpoints.
 *
 * Each handler follows the same pattern:
 *  1. Validate the request body with a Zod schema.
 *  2. Call the appropriate auth.service function.
 *  3. Return a structured JSON response.
 *  4. Catch errors and return a consistent error envelope.
 *
 * Controllers are intentionally thin: no business logic lives here.
 * Business rules belong in auth.service, data access in models.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import * as AuthService from '../services/auth.service';
import * as TokenService from '../services/token.service';
import { AuthenticatedRequest } from '../types';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email('Valid email address is required'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  email: z.string().email('Valid email address is required'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must not exceed 30 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username may only contain letters, numbers, underscores, and hyphens',
    ),
  fullName: z
    .string()
    .min(1, 'Full name is required')
    .max(100, 'Full name must not exceed 100 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(128, 'New password must not exceed 128 characters'),
    confirmNewPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'Passwords do not match',
    path: ['confirmNewPassword'],
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the client's real IP, respecting proxy headers if present */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
  }
  return req.ip ?? 'unknown';
}

/** Respond with a consistent validation error envelope */
function sendValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    details: error.flatten().fieldErrors,
  });
}

/** Respond with a consistent business logic error envelope */
function sendBusinessError(res: Response, status: number, message: string): void {
  const codes: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    500: 'INTERNAL_ERROR',
  };
  res.status(status).json({
    code: codes[status] ?? 'ERROR',
    message,
  });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /auth/login
 * Authenticate with email + password; returns a new token pair.
 */
export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const { user, tokens } = await AuthService.login(
      parsed.data.email,
      parsed.data.password,
      getClientIp(req),
    );

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        isActive: user.isActive,
        isSuperuser: user.isSuperuser,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
      tokens,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed';
    // Use 401 for credential failures, 403 for account disabled
    const status = message.includes('disabled') ? 403 : 401;
    sendBusinessError(res, status, message);
  }
}

/**
 * POST /auth/logout
 * Revoke the provided refresh token.
 */
export async function logout(req: Request, res: Response): Promise<void> {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    await AuthService.logout(parsed.data.refreshToken);
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    // Logout should be idempotent: if the token is already revoked or doesn't
    // exist we still return 200 so the client always ends up in a logged-out state.
    res.status(200).json({ message: 'Logged out successfully' });
  }
}

/**
 * POST /auth/register
 * Create a new user account; returns a token pair (auto-login on signup).
 */
export async function register(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const { user, tokens } = await AuthService.register(
      parsed.data.email,
      parsed.data.username,
      parsed.data.fullName,
      parsed.data.password,
      getClientIp(req),
    );

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        isActive: user.isActive,
        isSuperuser: user.isSuperuser,
        createdAt: user.createdAt,
      },
      tokens,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    // 409 for duplicate email, 400 for other validation errors
    const status = message.toLowerCase().includes('already exists') ? 409 : 400;
    sendBusinessError(res, status, message);
  }
}

/**
 * POST /auth/refresh
 * Exchange a refresh token for a new access + refresh token pair.
 */
export async function refresh(req: Request, res: Response): Promise<void> {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const tokens = await AuthService.refreshTokens(
      parsed.data.refreshToken,
      getClientIp(req),
    );
    res.status(200).json({ tokens });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token refresh failed';
    sendBusinessError(res, 401, message);
  }
}

/**
 * GET /auth/me
 * Return the profile of the currently authenticated user.
 * Requires: requireAuth middleware upstream.
 */
export async function me(req: Request, res: Response): Promise<void> {
  const authedReq = req as AuthenticatedRequest;

  // The JWT payload contains enough for a lightweight profile response.
  // If the client needs full profile data (e.g. lastLoginAt) they can call
  // GET /users/:id.
  res.status(200).json({
    id: authedReq.user.sub,
    email: authedReq.user.email,
    username: authedReq.user.username,
    roles: authedReq.user.roles,
    permissions: authedReq.user.permissions,
  });
}

/**
 * POST /auth/change-password
 * Change the authenticated user's password.
 * Requires: requireAuth middleware upstream.
 */
export async function changePassword(
  req: Request,
  res: Response,
): Promise<void> {
  const authedReq = req as AuthenticatedRequest;

  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    await AuthService.changePassword(
      authedReq.user.sub,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    res.status(200).json({
      message:
        'Password changed successfully. All active sessions have been invalidated.',
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Password change failed';
    sendBusinessError(res, 400, message);
  }
}

/**
 * GET /auth/public-key
 * Return the PEM-encoded RSA public key.
 * Other services use this to verify JWTs locally without calling back to
 * the auth service on every request.
 */
export async function getPublicKey(
  _req: Request,
  res: Response,
): Promise<void> {
  const publicKey = TokenService.getPublicKey();
  res.status(200).json({ publicKey });
}
