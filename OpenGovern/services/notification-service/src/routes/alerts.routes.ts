import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  list,
  get,
  acknowledge,
  resolve,
  listDefinitions,
  createDefinition,
  updateDefinition,
  deleteDefinition,
} from '../controllers/alerts.controller';

const router = Router();

router.use(requireAuth);

// Alert CRUD
router.get('/', list);
router.get('/definitions', listDefinitions);
router.post('/definitions', createDefinition);
router.put('/definitions/:id', updateDefinition);
router.delete('/definitions/:id', deleteDefinition);

// Alert actions (must come after /definitions routes to avoid shadowing)
router.get('/:id', get);
router.post('/:id/acknowledge', acknowledge);
router.post('/:id/resolve', resolve);

export { router as alertsRouter };
