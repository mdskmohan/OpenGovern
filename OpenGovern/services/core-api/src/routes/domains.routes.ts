import { Router } from 'express';
import * as domainsController from '../controllers/domains.controller';

const router = Router();

router.get('/', domainsController.list);
router.post('/', domainsController.create);
router.get('/:id', domainsController.get);
router.put('/:id', domainsController.update);
router.delete('/:id', domainsController.remove);
router.get('/:id/assets', domainsController.listAssets);

export default router;
