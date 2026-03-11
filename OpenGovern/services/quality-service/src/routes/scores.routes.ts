import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getLatest,
  getHistory,
  triggerRun,
  getDashboard,
} from '../controllers/scores.controller';

const router = Router();

// All quality-score routes require authentication
router.use(requireAuth);

router.get('/dashboard', getDashboard);
router.get('/:assetUrn/latest', getLatest);
router.get('/:assetUrn/history', getHistory);
router.post('/:assetUrn/run', triggerRun);

export { router as scoresRouter };
