/**
 * Governance Service — entry point.
 *
 * Starts the Express API, verifies OPA connectivity,
 * loads all active policies into OPA on startup,
 * and runs the workflow overdue check cron job.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cron from 'node-cron';
import { env } from './config/env';
import { connectWithRetry } from './config/database';
import { initKafkaProducer } from './config/kafka';
import { opaClient } from './config/opa';
import * as policyModelModule from './models/policy.model';
const policyModel = policyModelModule;
import { WorkflowService } from './services/workflow.service';
import policiesRouter from './routes/policies.routes';
import workflowsRouter from './routes/workflows.routes';

const app = express();
const workflowService = new WorkflowService();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/v1/policies',  policiesRouter);
app.use('/api/v1/workflows', workflowsRouter);

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const opaHealthy = await opaClient.healthCheck();
  res.json({
    status: 'ok',
    service: 'governance-service',
    version: '1.0.0',
    opa: opaHealthy ? 'connected' : 'unreachable',
  });
});

// ── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  await connectWithRetry();
  await initKafkaProducer();

  // Verify OPA is reachable
  const opaHealthy = await opaClient.healthCheck();
  if (!opaHealthy) {
    console.warn('⚠️  OPA is not reachable — policy enforcement will be unavailable');
  } else {
    console.log('✓ OPA connected');

    // Re-deploy all active policies to OPA (in case OPA was restarted)
    try {
      const result = await policyModel.list({ isActive: true, page: 1, limit: 1000 });
      let deployed = 0;
      for (const policy of result.items) {
        try {
          await opaClient.deployPolicy(policy.id, policy.rego_code);
          deployed++;
        } catch (err: any) {
          console.error(`Failed to deploy policy ${policy.name}: ${err.message}`);
        }
      }
      console.log(`✓ ${deployed} active policies loaded into OPA`);
    } catch (err: any) {
      console.error('Failed to load policies into OPA:', err.message);
    }
  }

  // Cron: check overdue workflows every hour
  cron.schedule('0 * * * *', async () => {
    try {
      await workflowService.checkOverdueWorkflows();
    } catch (err: any) {
      console.error('Overdue workflow check failed:', err.message);
    }
  });

  app.listen(env.PORT, () => {
    console.log(`✓ Governance service running on port ${env.PORT}`);
  });
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down');
  process.exit(0);
});

start().catch((err) => {
  console.error('Failed to start governance service:', err);
  process.exit(1);
});
