import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),
  KAFKA_BROKERS: z.string().min(1, 'KAFKA_BROKERS must not be empty'),
  ELASTICSEARCH_URL: z.string().url('ELASTICSEARCH_URL must be a valid URL'),
  QDRANT_URL: z.string().url('QDRANT_URL must be a valid URL').optional().default('http://qdrant:6333'),
  GOVERNANCE_SERVICE_URL: z.string().url('GOVERNANCE_SERVICE_URL must be a valid URL'),
  AUTH_SERVICE_URL: z.string().url('AUTH_SERVICE_URL must be a valid URL'),
  JWT_PUBLIC_KEY_URL: z.string().url('JWT_PUBLIC_KEY_URL must be a valid URL'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3001'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
