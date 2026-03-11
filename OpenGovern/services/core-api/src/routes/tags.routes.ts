import { Router } from 'express';
import * as tagsController from '../controllers/tags.controller';

const router = Router();

router.get('/', tagsController.list);
router.post('/', tagsController.create);
router.get('/:id', tagsController.get);
router.put('/:id', tagsController.update);
router.delete('/:id', tagsController.remove);

export default router;
