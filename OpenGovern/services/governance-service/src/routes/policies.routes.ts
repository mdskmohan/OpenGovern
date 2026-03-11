import { Router } from 'express';
import { policiesController } from '../controllers/policies.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/',                    policiesController.list);
router.post('/',                   policiesController.create);
router.post('/evaluate',           policiesController.evaluate);
router.get('/:id',                 policiesController.get);
router.put('/:id',                 policiesController.update);
router.delete('/:id',              policiesController.delete);
router.post('/:id/activate',       policiesController.activate);
router.post('/:id/deactivate',     policiesController.deactivate);

export default router;
