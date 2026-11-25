import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import {
  listKnowledge,
  createKnowledge,
  deleteKnowledge
} from '../controllers/knowledge-controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listKnowledge);
router.post('/', upload.single('file'), createKnowledge);
router.delete('/:id', deleteKnowledge);

export default router;
