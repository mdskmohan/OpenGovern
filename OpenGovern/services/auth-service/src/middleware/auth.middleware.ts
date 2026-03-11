/**
 * Authentication and authorization middleware.
 *
 * Three middleware variants are exported:
 *
 *  1. requireAuth       – validates the Bearer JWT; attaches payload to req.user.
 *                         Rejects requests with no or invalid token.
 *
 *  2. requirePermission – runs requireAuth, then checks the user's RBAC
 *                         permissions. Returns 403 if the required permission
 *                         is missing.
 *
 *  3. optionalAuth      – validates the Bearer JWT if present but never rejects.
 *                         Useful for endpoints that serve different content to
 *                         authenticated vs anonymous callers.
 *
 * Error response format matches ApiError from @opengovern/types.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import * as TokenService from '../services/token.service';
import * as RbacService from '../services/rbac.service';
import { AuthenticatedRequest } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the raw JWT from the Authorization: Bearer <token> header.
 * Returns undefined if the header is absent or malformed.
 */
function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader) return undefined;

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined;

  return token;
}

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

/**
 * Middleware that requires a valid JWT access token.
 *
 * On success: attaches the decoded payload to `req.user` and calls `next()`.
 * On failure: responds with 401 and a structured error body.
 *
 * The middleware extracts the token only from the Authorization header
 * (not cookies or query strings) to align with RFC 6750.
 */
export const requireAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = extractBearerToken(req);

  if (!token) {
    res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Authentication required. Please provide a Bearer token.',
    });
    return;
  }

  try {
    const payload = await TokenService.verifyAccessToken(token);
    // Attach the decoded payload to the request for downstream handlers
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      res.status(401).json({
        code: 'TOKEN_EXPIRED',
        message: 'Access token has expired. Please refresh your session.',
      });
      return;
    }

    if (err instanceof JsonWebTokenError) {
      res.status(401).json({
        code: 'INVALID_TOKEN',
        message: 'Access token is invalid.',
      });
      return;
    }

    // Unexpected error – let the global error handler deal with it
    next(err);
  }
};

// ---------------------------------------------------------------------------
// requirePermission
// ---------------------------------------------------------------------------

/**
 * Middleware factory that first authenticates the request (via requireAuth),
 * then asserts that the user has the specified RBAC permission.
 *
 * @param resource  The resource name, e.g. "assets", "policies"
 * @param action    The action name, e.g. "read", "write", "delete"
 *
 * @example
 * router.get('/assets', requirePermission('assets', 'read'), handler);
 */
export function requirePermission(
  resource: string,
  action: string,
): RequestHandler[] {
  return [
    // First enforce authentication
    requireAuth,

    // Then check the specific RBAC permission
    async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      const authedReq = req as AuthenticatedRequest;

      try {
        const allowed = await RbacService.hasPermission(
          authedReq.user.sub,
          resource,
          action,
        );

        if (!allowed) {
          res.status(403).json({
            code: 'FORBIDDEN',
            message: `You do not have the '${resource}:${action}' permission required for this action.`,
          });
          return;
        }

        next();
      } catch (err) {
        next(err);
      }
    },
  ];
}

// ---------------------------------------------------------------------------
// optionalAuth
// ---------------------------------------------------------------------------

/**
 * Middleware that attaches the user payload if a valid token is present but
 * never rejects the request if it is absent or invalid.
 *
 * Useful for endpoints like GET /assets/:id where anonymous users can see
 * public assets but authenticated users see additional metadata.
 */
export const optionalAuth: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = extractBearerToken(req);

  if (token) {
    try {
      const payload = await TokenService.verifyAccessToken(token);
      (req as AuthenticatedRequest).user = payload;
    } catch {
      // Invalid / expired token in an optional context is silently ignored.
      // The request proceeds as an unauthenticated call.
    }
  }

  next();
};

// ---------------------------------------------------------------------------
// requireSuperuser
// ---------------------------------------------------------------------------

/**
 * Convenience middleware that requires authentication AND the user's isSuperuser
 * flag to be true.
 *
 * The isSuperuser flag is not embedded in the JWT (to keep tokens lean), so
 * this middleware CANNOT rely solely on req.user. Instead, it relies on the
 * RBAC "*:admin" wildcard permission which is assigned only to superusers.
 *
 * For API simplicity, we reuse requirePermission with a superuser-only permission.
 */
export const requireSuperuser: RequestHandler[] = requirePermission(
  '*',
  'admin',
);
