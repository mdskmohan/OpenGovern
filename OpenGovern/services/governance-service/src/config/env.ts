import { z } from 'zod';
// dotenv is not required in Docker (env vars injected directly)

const envSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3003'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  KAFKA_BROKERS: z.string().min(1, 'KAFKA_BROKERS is required'),

  OPA_URL: z.string().url('OPA_URL must be a valid URL'),
  CORE_API_URL: z.string().url('CORE_API_URL must be a valid URL'),
  JWT_PUBLIC_KEY_URL: z.string().url('JWT_PUBLIC_KEY_URL must be a valid URL'),

  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[GovernanceService] Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
