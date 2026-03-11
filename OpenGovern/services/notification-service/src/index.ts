/**
 * OpenGovern Notification Service
 *
 * Entry point. Bootstraps Express, connects infrastructure,
 * starts Kafka consumer, mounts API routes, and handles graceful shutdown.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env';
import { connectWithRetry, pool } from './config/database';
import { connectRedis, redisClient } from './config/redis';

import { alertsRouter } from './routes/alerts.routes';
import { EmailService } from './services/email.service';
import { SlackService } from './services/slack.service';
import { WebhookService } from './services/webhook.service';
import { AlertService } from './services/alert.service';
import { KafkaConsumerService } from './services/kafka-consumer.service';

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
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
      service: 'notification-service',
      version: '1.0.0',
      checks: {
        database: 'ok',
        redis: redisPing === 'PONG' ? 'ok' : 'degraded',
      },
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'notification-service',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

app.use('/api/v1/alerts', alertsRouter);

// ---------------------------------------------------------------------------
// 404 + global error handler
// ---------------------------------------------------------------------------

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  const stack = err instanceof Error && env.NODE_ENV !== 'production' ? err.stack : undefined;
  console.error('[notification-service] Unhandled error:', err);
  res.status(500).json({ success: false, error: message, stack });
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const emailService = new EmailService();
const slackService = new SlackService();
const webhookService = new WebhookService();
const alertService = new AlertService(emailService, slackService, webhookService);
const kafkaConsumer = new KafkaConsumerService(alertService);

let server: ReturnType<typeof app.listen>;

async function main(): Promise<void> {
  console.log(`[notification-service] Starting in ${env.NODE_ENV} mode…`);

  await connectWithRetry();
  await connectRedis();

  server = app.listen(env.PORT, () => {
    console.log(`[notification-service] HTTP server listening on port ${env.PORT}`);
  });

  // Start Kafka consumer (non-blocking — log errors but don't crash startup)
  kafkaConsumer.start().catch((err) => {
    console.error('[notification-service] Kafka consumer failed to start:', err);
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[notification-service] ${signal} received — shutting down…`);

  if (server) {
    server.close(() => console.log('[notification-service] HTTP server closed'));
  }

  await Promise.allSettled([
    kafkaConsumer.stop(),
    redisClient.quit(),
    pool.end(),
  ]);

  console.log('[notification-service] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  console.error('[notification-service] Fatal startup error:', err);
  process.exit(1);
});
