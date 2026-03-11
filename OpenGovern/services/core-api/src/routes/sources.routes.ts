import { Router } from 'express';
import * as sourcesController from '../controllers/sources.controller';

const router = Router();

router.get('/', sourcesController.list);
router.post('/test-connection', sourcesController.testConnection);
router.post('/', sourcesController.create);
router.get('/:id', sourcesController.get);
router.put('/:id', sourcesController.update);
router.delete('/:id', sourcesController.remove);
router.post('/:id/trigger', sourcesController.triggerIngestion);
router.get('/:id/runs', sourcesController.listRuns);

export default router;
