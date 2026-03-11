import { Router } from 'express';
import * as assetsController from '../controllers/assets.controller';
import * as lineageController from '../controllers/lineage.controller';

const router = Router();

// Stats endpoint must come before /:urn to avoid route conflicts
router.get('/stats', assetsController.getStats);

// Asset CRUD
router.get('/', assetsController.list);
router.post('/upsert', assetsController.upsert);
router.post('/', assetsController.create);
router.get('/:urn', assetsController.get);
router.put('/:urn/aspects/:aspectType', assetsController.updateAspect);
router.delete('/:id', assetsController.softDelete);

// Asset sub-resources
router.get('/:urn/schema', assetsController.getSchema);
router.get('/:urn/ownership', assetsController.getOwnership);
router.get('/:urn/lineage', lineageController.getGraph);
router.get('/:urn/impact', lineageController.getImpact);

export default router;
