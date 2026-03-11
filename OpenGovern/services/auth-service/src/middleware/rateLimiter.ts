/**
 * Rate-limiting middleware using express-rate-limit.
 *
 * Two limiters are exported:
 *
 *  authLimiter – Applied to authentication endpoints (login, register).
 *                Tighter limit because brute-force credential stuffing is
 *                the primary threat these endpoints face.
 *                Limit: 10 requests per IP per 15-minute window.
 *
 *  apiLimiter  – Applied to all other API endpoints as a general defence
 *                against abuse and denial-of-service.
 *                Limit: 100 requests per IP per 1-minute window.
 *
 * In production, the `standardHeaders` and `legacyHeaders` options tell the
 * limiter to send RFC-6585-compliant Retry-After and RateLimit-* headers so
 * well-behaved clients can back off gracefully.
 *
 * Note: In a multi-instance deployment, switch the `store` option to a Redis-
 * backed store (e.g. rate-limit-redis) so limits are shared across all
 * instances. The default in-memory store only works correctly with a single
 * process.
 */

import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';

// ---------------------------------------------------------------------------
// Auth limiter – login / register
// ---------------------------------------------------------------------------

/**
 * Rate limiter for authentication endpoints.
 *
 * 10 attempts per IP in a 15-minute window.
 *
 * Why 10? A legitimate user who genuinely misremembers their password
 * might try 3–5 times. Setting the limit to 10 gives a comfortable margin
 * while still blocking automated credential-stuffing tools that fire hundreds
 * of attempts per minute.
 */
export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes in milliseconds
  max: 10,
  standardHeaders: true, // Return RateLimit-* headers (RFC 6585)
  legacyHeaders: false,  // Disable X-RateLimit-* headers (deprecated)
  message: {
    code: 'RATE_LIMITED',
    message:
      'Too many authentication attempts from this IP address. ' +
      'Please wait 15 minutes before trying again.',
  },
  // Skip rate-limiting for localhost during development to avoid frustration
  // when running tests locally. NEVER skip in production.
  skip: (req) => {
    if (process.env['NODE_ENV'] === 'development') {
      return req.ip === '::1' || req.ip === '127.0.0.1';
    }
    return false;
  },
  // Handler called when the limit is exceeded (gives us control over the
  // response format rather than letting the library pick its own)
  handler: (_req, res, _next, options) => {
    res.status(429).json(options.message);
  },
});

// ---------------------------------------------------------------------------
// API limiter – general endpoints
// ---------------------------------------------------------------------------

/**
 * Rate limiter for all non-auth API endpoints.
 *
 * 100 requests per IP per minute.
 *
 * This is generous enough that legitimate API consumers won't hit it during
 * normal use, while still throttling scripts that poll aggressively.
 */
export const apiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMITED',
    message:
      'Too many requests from this IP address. ' +
      'Please wait a moment before retrying.',
  },
  skip: (req) => {
    if (process.env['NODE_ENV'] === 'development') {
      return req.ip === '::1' || req.ip === '127.0.0.1';
    }
    return false;
  },
  handler: (_req, res, _next, options) => {
    res.status(429).json(options.message);
  },
});
