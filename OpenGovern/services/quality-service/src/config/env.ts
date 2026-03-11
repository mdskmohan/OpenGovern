/**
 * Environment configuration with runtime validation for quality-service.
 *
 * Fails fast at startup if any required variable is missing or malformed.
 * All numeric conversions are applied so callers always receive the correct type.
 */

import { z } from 'zod';

const envSchema = z.object({
  // Postgres connection string
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),

  // Redis connection string
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),

  // Comma-separated Kafka broker list, e.g. "kafka:9092,kafka2:9092"
  KAFKA_BROKERS: z.string().min(1, 'KAFKA_BROKERS is required'),

  // Base URL of the core-api service for asset lookups and updates
  CORE_API_URL: z
    .string()
    .url('CORE_API_URL must be a valid URL')
    .default('http://core-api:3001'),

  // URL to fetch the JWT public key for token verification
  JWT_PUBLIC_KEY_URL: z
    .string()
    .url('JWT_PUBLIC_KEY_URL must be a valid URL')
    .default('http://auth-service:3000/api/v1/auth/public-key'),

  // HTTP port this service listens on
  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT must be a numeric string')
    .transform(Number)
    .refine((n) => n > 0 && n < 65536, 'PORT must be between 1 and 65535')
    .default('3004'),

  // Runtime environment
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),

  // Optional: CORS allowed origin list (comma-separated)
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  const issues = parseResult.error.issues
    .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  console.error(
    '\n[quality-service] FATAL: Environment validation failed:\n' +
      issues +
      '\n\nPlease check your .env file or container environment variables.\n',
  );
  process.exit(1);
}

export const env = parseResult.data;
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
