import { Router } from 'express';
import { workflowsController } from '../controllers/workflows.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/definitions',              workflowsController.listDefinitions);
router.get('/instances',                workflowsController.listInstances);
router.post('/instances',               workflowsController.initiate);
router.get('/instances/:id',            workflowsController.getInstance);
router.post('/instances/:id/approve',   workflowsController.approve);
router.post('/instances/:id/reject',    workflowsController.reject);
router.post('/instances/:id/comment',   workflowsController.comment);
router.post('/instances/:id/reassign',  workflowsController.reassign);
router.post('/instances/:id/cancel',    workflowsController.cancel);

export default router;
