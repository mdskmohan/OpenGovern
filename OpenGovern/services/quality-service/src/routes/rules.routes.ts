import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  listRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
} from '../controllers/rules.controller';

const router = Router();

// All quality-rule routes require authentication
router.use(requireAuth);

router.get('/', listRules);
router.get('/:id', getRule);
router.post('/', createRule);
router.put('/:id', updateRule);
router.delete('/:id', deleteRule);

export { router as rulesRouter };
