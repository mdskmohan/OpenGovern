/**
 * DataHub GMS Proxy Routes
 *
 * Mounted at /api/v1/datahub-proxy — mirrors the DataHub GMS REST API
 * so the datahub-rest sink can write directly into OpenGovern's PostgreSQL.
 */

import { Router } from 'express';
import {
  getConfig,
  ingestProposal,
  ingestProposalBatch,
  ingestEntities,
  proxyHealth,
} from '../controllers/datahub-proxy.controller';

const router = Router();

// DataHub REST emitter capability handshake
router.get('/config', getConfig);

// Primary MCP write path — handles both single and batch (DataHub 1.4.x uses batch)
router.post('/aspects', async (req, res) => {
  const action = req.query.action as string;
  if (action === 'ingestProposal')      return ingestProposal(req, res);
  if (action === 'ingestProposalBatch') return ingestProposalBatch(req, res);
  res.status(400).json({ error: `Unknown action: ${action}` });
});

// Legacy v1 entity write path
router.post('/entities', async (req, res) => {
  const action = req.query.action as string;
  if (action === 'ingest') {
    return ingestEntities(req, res);
  }
  res.status(400).json({ error: `Unknown action: ${action}` });
});

// Health check
router.get('/health', proxyHealth);

// Catch-all for any other DataHub GMS paths the emitter might call
router.all('*', (req, res) => {
  res.json({ status: 'ok', path: req.path });
});

export default router;
