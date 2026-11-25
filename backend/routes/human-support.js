import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listHumanSupport, updateHumanSupport } from '../controllers/conversation-controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', listHumanSupport);
router.patch('/:id', updateHumanSupport);

export default router;
