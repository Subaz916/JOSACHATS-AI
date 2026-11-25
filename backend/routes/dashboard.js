import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { overview, recent } from '../controllers/dashboard-controller.js';

const router = Router();
router.use(requireAuth);

router.get('/overview', overview);
router.get('/recent', recent);

export default router;
