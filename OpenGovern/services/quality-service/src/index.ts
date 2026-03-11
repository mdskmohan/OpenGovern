/**
 * OpenGovern Quality Service
 *
 * Entry point. Bootstraps Express, connects to PostgreSQL, Redis, and Kafka,
 * mounts API routes, starts the quality scheduler, and sets up graceful shutdown.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env';
import { connectWithRetry, pool } from './config/database';
import { connectRedis, redisClient } from './config/redis';
import { initKafkaProducer, disconnectKafka } from './config/kafka';

import { rulesRouter } from './routes/rules.routes';
import { scoresRouter } from './routes/scores.routes';
import { ScorerService } from './services/scorer.service';
import { QualityScheduler } from './services/scheduler.service';

// ---------------------------------------------------------------------------
// Express app setup
// ---------------------------------------------------------------------------

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    const redisPing = await redisClient.ping();
    res.json({
      status: 'healthy',
      service: 'quality-service',
      version: '1.0.0',
      checks: {
        database: 'ok',
        redis: redisPing === 'PONG' ? 'ok' : 'degraded',
      },
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'quality-service',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

app.use('/api/v1/quality/rules', rulesRouter);
app.use('/api/v1/quality/scores', scoresRouter);

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  const stack = err instanceof Error && env.NODE_ENV !== 'production' ? err.stack : undefined;
  console.error('[quality-service] Unhandled error:', err);
  res.status(500).json({ success: false, error: message, stack });
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const scorer = new ScorerService();
const scheduler = new QualityScheduler(scorer);
let server: ReturnType<typeof app.listen>;

async function main(): Promise<void> {
  console.log(`[quality-service] Starting in ${env.NODE_ENV} mode…`);

  // Connect infrastructure
  await connectWithRetry();
  await connectRedis();
  await initKafkaProducer();

  // Start HTTP server
  server = app.listen(env.PORT, () => {
    console.log(`[quality-service] HTTP server listening on port ${env.PORT}`);
  });

  // Start automated quality scheduler
  scheduler.start();
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[quality-service] Received ${signal} — shutting down gracefully…`);

  // 1. Stop accepting new connections
  if (server) {
    server.close(() => console.log('[quality-service] HTTP server closed'));
  }

  // 2. Stop scheduler
  scheduler.stop();

  // 3. Disconnect infrastructure
  await Promise.allSettled([
    disconnectKafka(),
    redisClient.quit(),
    pool.end(),
  ]);

  console.log('[quality-service] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  console.error('[quality-service] Fatal startup error:', err);
  process.exit(1);
});
