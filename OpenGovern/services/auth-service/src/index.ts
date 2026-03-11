/**
 * Auth service entry point.
 *
 * Bootstrap sequence:
 *  1. Validate all environment variables (env.ts – crashes if invalid)
 *  2. Connect to PostgreSQL with retry logic
 *  3. Connect to Redis
 *  4. Build the Express application with all middleware and routes
 *  5. Start the HTTP server
 *  6. Register SIGTERM/SIGINT handlers for graceful shutdown
 *
 * Graceful shutdown:
 *  - Stop accepting new connections
 *  - Wait for in-flight requests to complete (up to SHUTDOWN_TIMEOUT_MS)
 *  - Close the database pool and Redis connection
 *  - Exit with code 0
 *
 * This makes the service play nicely with Kubernetes rolling deployments:
 * the pod is gracefully terminated without dropping in-flight requests.
 */

// Import env first – it will exit the process immediately if any required
// variable is missing, so nothing else initialises if config is wrong.
import { env } from './config/env';

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import { connectWithRetry, pool } from './config/database';
import { connectRedis, redisClient } from './config/redis';

import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';

// ---------------------------------------------------------------------------
// Express application
// ---------------------------------------------------------------------------

const app = express();

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------

/**
 * Helmet sets a collection of security-related HTTP headers:
 *  - Content-Security-Policy
 *  - X-Frame-Options
 *  - X-Content-Type-Options
 *  - Referrer-Policy
 *  - etc.
 *
 * We configure it explicitly rather than using defaults so headers are
 * documented and intentional.
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: {
      // Enforce HTTPS for 1 year (only meaningful behind a TLS terminator)
      maxAge: 31_536_000,
      includeSubDomains: true,
      preload: true,
    },
  }),
);

/**
 * CORS – restrict which origins may call this service.
 * Origins are read from the CORS_ORIGINS environment variable
 * (comma-separated list).
 */
const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin header (e.g. curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  }),
);

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

// Parse JSON request bodies (limits to 1MB to prevent payload-based DoS)
app.use(express.json({ limit: '1mb' }));

// Parse URL-encoded bodies (for form submissions, though we primarily use JSON)
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ---------------------------------------------------------------------------
// Request logging
// ---------------------------------------------------------------------------

/**
 * Morgan HTTP request logger.
 *
 * In development we use 'dev' format (concise, coloured).
 * In production we use 'combined' format (Apache Combined Log Format) which
 * is parseable by most log aggregators (Datadog, Splunk, etc.).
 */
const morganFormat = env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat));

// ---------------------------------------------------------------------------
// Trust proxy
// ---------------------------------------------------------------------------

/**
 * When running behind a reverse proxy (nginx, AWS ALB, Kubernetes ingress),
 * set trust proxy so Express correctly reads the client IP from
 * X-Forwarded-For rather than the proxy's IP.
 *
 * '1' means trust the first hop (the immediately adjacent proxy).
 * Adjust this if you have multiple proxy layers.
 */
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------

/**
 * GET /health
 *
 * Returns 200 when the service is healthy. Used by:
 *  - Kubernetes liveness and readiness probes
 *  - Load balancer health checks
 *  - Monitoring systems
 *
 * This endpoint intentionally has no auth middleware – it must be reachable
 * without a token so probes work before authentication is set up.
 */
app.get('/health', async (_req: Request, res: Response): Promise<void> => {
  const dependencies: Record<string, 'ok' | 'degraded' | 'down'> = {};

  // Check database
  try {
    await pool.query('SELECT 1');
    dependencies['postgres'] = 'ok';
  } catch {
    dependencies['postgres'] = 'down';
  }

  // Check Redis
  try {
    await redisClient.ping();
    dependencies['redis'] = 'ok';
  } catch {
    dependencies['redis'] = 'down';
  }

  const allOk = Object.values(dependencies).every((v) => v === 'ok');
  const status = allOk ? 'ok' : 'degraded';

  res.status(allOk ? 200 : 503).json({
    status,
    version: process.env['npm_package_version'] ?? '1.0.0',
    timestamp: new Date().toISOString(),
    dependencies,
  });
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

/**
 * Authentication routes – login, register, token refresh, etc.
 * Mounted at /api/v1/auth
 */
app.use('/api/v1/auth', authRoutes);

/**
 * User and role management routes.
 * Mounted at /api/v1
 */
app.use('/api/v1', usersRoutes);

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------

app.use((_req: Request, res: Response): void => {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: 'The requested endpoint does not exist.',
  });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

/**
 * Express calls this 4-argument handler whenever next(err) is called or an
 * async handler throws (via express-async-errors or explicit next(err) calls).
 *
 * We deliberately do NOT expose internal error details in production to
 * prevent information leakage.
 */
app.use(
  (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
    console.error('[error]', err.stack ?? err.message);

    // CORS errors should return 403 rather than 500
    if (err.message.startsWith('CORS:')) {
      res.status(403).json({ code: 'FORBIDDEN', message: err.message });
      return;
    }

    const isProduction = env.NODE_ENV === 'production';

    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: isProduction
        ? 'An internal server error occurred. Please try again later.'
        : err.message,
      ...(isProduction ? {} : { stack: err.stack }),
    });
  },
);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

const SHUTDOWN_TIMEOUT_MS = 10_000; // 10 seconds to drain in-flight requests

async function start(): Promise<void> {
  console.log(
    `[auth-service] Starting in ${env.NODE_ENV} mode on port ${env.PORT}…`,
  );

  // Connect to dependencies before accepting traffic
  await connectWithRetry();
  await connectRedis();

  const server = app.listen(env.PORT, () => {
    console.log(`[auth-service] HTTP server listening on port ${env.PORT}`);
  });

  // ---------------------------------------------------------------------------
  // Graceful shutdown
  // ---------------------------------------------------------------------------

  /**
   * Handle SIGTERM (sent by Kubernetes/Docker when stopping a container) and
   * SIGINT (Ctrl-C during development).
   *
   * 1. Stop accepting new connections immediately.
   * 2. Give in-flight requests up to SHUTDOWN_TIMEOUT_MS to complete.
   * 3. Close downstream connections (DB pool, Redis).
   * 4. Exit cleanly with code 0.
   */
  async function shutdown(signal: string): Promise<void> {
    console.log(`\n[auth-service] Received ${signal}. Shutting down gracefully…`);

    // Stop accepting new connections
    server.close(async (err) => {
      if (err) {
        console.error('[auth-service] HTTP server close error:', err.message);
      } else {
        console.log('[auth-service] HTTP server closed');
      }

      // Close database pool
      try {
        await pool.end();
        console.log('[auth-service] Database pool closed');
      } catch (dbErr) {
        console.error('[auth-service] Error closing database pool:', dbErr);
      }

      // Close Redis connection
      try {
        await redisClient.quit();
        console.log('[auth-service] Redis connection closed');
      } catch (redisErr) {
        console.error('[auth-service] Error closing Redis connection:', redisErr);
      }

      console.log('[auth-service] Shutdown complete. Goodbye.');
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      console.error(
        `[auth-service] Forced shutdown after ${SHUTDOWN_TIMEOUT_MS}ms timeout`,
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Catch unhandled promise rejections – log and exit so the container
  // restarts rather than limping along in an unknown state.
  process.on('unhandledRejection', (reason) => {
    console.error('[auth-service] Unhandled promise rejection:', reason);
    process.exit(1);
  });

  process.on('uncaughtException', (err) => {
    console.error('[auth-service] Uncaught exception:', err.stack ?? err.message);
    process.exit(1);
  });
}

start().catch((err) => {
  console.error('[auth-service] Startup failed:', err);
  process.exit(1);
});

export default app;
