/**
 * Environment configuration with runtime validation for notification-service.
 *
 * Fails fast at startup if required variables are missing or malformed.
 */

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),

  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT must be numeric')
    .transform(Number)
    .refine((n) => n > 0 && n < 65536, 'PORT out of range')
    .default('3005'),

  // PostgreSQL
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),

  // Redis
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),

  // Kafka — comma-separated broker list
  KAFKA_BROKERS: z.string().min(1, 'KAFKA_BROKERS is required'),

  // Auth
  JWT_PUBLIC_KEY_URL: z
    .string()
    .url()
    .default('http://auth-service:3000/api/v1/auth/public-key'),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // ── SMTP ────────────────────────────────────────────────────────────────
  SMTP_HOST: z.string().min(1, 'SMTP_HOST is required'),
  SMTP_PORT: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('587'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z
    .string()
    .email('SMTP_FROM must be a valid email address')
    .default('noreply@opengovern.io'),

  // ── Slack ────────────────────────────────────────────────────────────────
  // Optional global Slack webhook (per-definition webhooks override this)
  // Empty string treated as "not configured" — transform before url validation
  SLACK_WEBHOOK_URL: z.string().optional().transform(v => v === '' ? undefined : v).pipe(z.string().url().optional()),

  // ── Core API ─────────────────────────────────────────────────────────────
  CORE_API_URL: z
    .string()
    .url()
    .default('http://core-api:3001'),
});

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  const issues = parseResult.error.issues
    .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error(
    '\n[notification-service] FATAL: Environment validation failed:\n' + issues + '\n',
  );
  process.exit(1);
}

export const env = parseResult.data;
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
