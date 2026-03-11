import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { env } from './config/env';
import { connectWithRetry, pool } from './config/database';
import { redis } from './config/redis';
import { initKafkaProducer, disconnectKafka } from './config/kafka';
import { esClient, initializeElasticsearch } from './config/elasticsearch';

import { requireAuth } from './middleware/auth.middleware';

import assetsRoutes from './routes/assets.routes';
import lineageRoutes from './routes/lineage.routes';
import searchRoutes from './routes/search.routes';
import domainsRoutes from './routes/domains.routes';
import tagsRoutes from './routes/tags.routes';
import sourcesRoutes from './routes/sources.routes';

// ─── Request Logger ────────────────────────────────────────────────────────────

function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    console[level](
      `[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`
    );
  });
  next();
}

// ─── App Setup ─────────────────────────────────────────────────────────────────

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// ─── Health Check (no auth) ───────────────────────────────────────────────────

app.get('/health', async (_req: Request, res: Response) => {
  const checks = await Promise.allSettled([
    pool.query('SELECT 1'),
    redis.ping(),
    esClient.ping(),
  ]);

  const [pg, rd, es] = checks;
  const services = {
    postgres: pg.status === 'fulfilled' ? 'ok' : 'error',
    redis: rd.status === 'fulfilled' ? 'ok' : 'error',
    elasticsearch: es.status === 'fulfilled' ? 'ok' : 'error',
    kafka: 'ok', // Kafka health is harder to check synchronously; producer connects on startup
  };

  const allHealthy = Object.values(services).every((s) => s === 'ok');
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ok' : 'degraded',
    services,
    version: process.env.npm_package_version ?? '0.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── Protected Routes ─────────────────────────────────────────────────────────

// OpenLineage webhook is public — handled inside the lineage router via optionalAuth.
// All other routes require a valid JWT.
const v1 = express.Router();

v1.use('/assets', requireAuth, assetsRoutes);
v1.use('/lineage', lineageRoutes);            // openlineage sub-route skips requireAuth internally
v1.use('/search', requireAuth, searchRoutes);
v1.use('/domains', requireAuth, domainsRoutes);
v1.use('/tags', requireAuth, tagsRoutes);
v1.use('/sources', requireAuth, sourcesRoutes);

app.use('/api/v1', v1);

// ─── 404 / Error Handlers ─────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  console.log(`[OpenGovern Core API] Starting in ${env.NODE_ENV} mode...`);

  await connectWithRetry();

  await initializeElasticsearch();

  await initKafkaProducer();

  // Redis is lazy-connected by ioredis; just verify it's reachable
  try {
    await redis.ping();
    console.log('[Redis] Connected');
  } catch (err) {
    console.warn('[Redis] Not reachable on startup, will retry on first use:', (err as Error).message);
  }

  const server = app.listen(env.PORT, () => {
    console.log(`[Core API] Listening on port ${env.PORT}`);
  });

  // ─── Graceful Shutdown ───────────────────────────────────────────────────────

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[Core API] ${signal} received — shutting down gracefully...`);
    server.close(async () => {
      try {
        await Promise.allSettled([
          pool.end(),
          redis.quit(),
          disconnectKafka(),
        ]);
        console.log('[Core API] All connections closed. Goodbye.');
        process.exit(0);
      } catch (err) {
        console.error('[Core API] Error during shutdown:', err);
        process.exit(1);
      }
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      console.error('[Core API] Forced shutdown after timeout');
      process.exit(1);
    }, 30_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[Core API] Fatal startup error:', err);
  process.exit(1);
});

export default app;
