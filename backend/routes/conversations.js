import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listConversations,
  getConversationDetail,
  updateConversation,
  exportConversation
} from '../controllers/conversation-controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', listConversations);
router.get('/:id/export', exportConversation);
router.get('/:id', getConversationDetail);
router.patch('/:id', updateConversation);

export default router;
