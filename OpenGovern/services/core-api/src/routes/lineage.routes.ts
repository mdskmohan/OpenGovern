import { Router } from 'express';
import * as lineageController from '../controllers/lineage.controller';
import { optionalAuth } from '../middleware/auth.middleware';

const router = Router();

// POST /lineage — add a lineage edge (auth required, applied at the app level)
router.post('/', lineageController.addEdge);

// POST /lineage/openlineage — webhook, no auth middleware (uses X-OpenLineage-API-Key)
router.post('/openlineage', optionalAuth, lineageController.openlineageWebhook);

export default router;
