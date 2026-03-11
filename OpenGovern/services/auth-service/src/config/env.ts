/**
 * Environment configuration with runtime validation.
 *
 * We use Zod to parse and validate every required environment variable when
 * this module is first imported. If anything is missing or has the wrong type
 * the process exits immediately with a clear, human-readable error message.
 *
 * This "fail fast" approach is intentional: a misconfigured service that
 * crashes at startup is far safer than one that silently uses a wrong value
 * and corrupts data or leaks secrets later.
 *
 * Usage: import { env } from './env';
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema definition
// ---------------------------------------------------------------------------

const envSchema = z.object({
  // Postgres connection string, e.g. postgresql://user:pass@host:5432/db
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),

  // Redis connection string, e.g. redis://:pass@host:6379
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),

  // Absolute path to the RSA private key PEM file used to sign JWTs.
  // In production this is typically a Kubernetes Secret mounted as a file.
  JWT_PRIVATE_KEY_PATH: z.string().min(1, 'JWT_PRIVATE_KEY_PATH is required'),

  // Absolute path to the RSA public key PEM file used to verify JWTs.
  JWT_PUBLIC_KEY_PATH: z.string().min(1, 'JWT_PUBLIC_KEY_PATH is required'),

  // TCP port the HTTP server listens on
  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT must be a numeric string')
    .transform(Number)
    .refine((n) => n > 0 && n < 65536, 'PORT must be between 1 and 65535'),

  // bcrypt cost factor; 10-14 is a reasonable range for production.
  // Higher is slower but more secure; lower is faster but weaker.
  BCRYPT_ROUNDS: z
    .string()
    .regex(/^\d+$/, 'BCRYPT_ROUNDS must be a numeric string')
    .transform(Number)
    .refine(
      (n) => n >= 8 && n <= 20,
      'BCRYPT_ROUNDS must be between 8 and 20',
    ),

  // Short-lived access token expiry, e.g. "15m", "1h"
  JWT_ACCESS_TOKEN_EXPIRES_IN: z
    .string()
    .min(1, 'JWT_ACCESS_TOKEN_EXPIRES_IN is required'),

  // Long-lived refresh token expiry, e.g. "7d", "30d"
  JWT_REFRESH_TOKEN_EXPIRES_IN: z
    .string()
    .min(1, 'JWT_REFRESH_TOKEN_EXPIRES_IN is required'),

  // Runtime environment; controls log verbosity, error detail level, etc.
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),

  // Optional: issuer claim embedded in every JWT (default: opengovern)
  JWT_ISSUER: z.string().default('opengovern'),

  // Optional: audience claim embedded in every JWT (default: opengovern-api)
  JWT_AUDIENCE: z.string().default('opengovern-api'),

  // Optional: CORS allowed origin list (comma-separated)
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

// parse() throws a ZodError if validation fails, which we catch and re-throw
// with a friendlier message before exiting.
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  const issues = parseResult.error.issues
    .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  // We deliberately write to stderr and exit here because the app cannot
  // function without valid configuration. Logging frameworks are not yet
  // initialised at this point, so console.error is intentional.
  console.error(
    '\n[auth-service] FATAL: Environment validation failed:\n' +
      issues +
      '\n\nPlease check your .env file or container environment variables.\n',
  );
  process.exit(1);
}

/**
 * Strongly-typed, validated environment variables.
 * All numeric conversions (PORT, BCRYPT_ROUNDS) have already been applied.
 */
export const env = parseResult.data;

/** Convenience accessor: true when running in production mode */
export const isProduction = env.NODE_ENV === 'production';

/** Convenience accessor: true when running in test mode */
export const isTest = env.NODE_ENV === 'test';
