import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { messageSchema, feedbackSchema, handoffSchema } from '../validators/schemas.js';
import {
  createConversation,
  getConversation,
  postMessage,
  submitFeedback,
  requestHandoff
} from '../controllers/public-controller.js';

const router = Router();

function captureChannel(req, res, next) {
  req.interactionChannel = req.body?.channel || req.query.channel || req.headers['x-channel'];
  next();
}

router.post('/agents/:slug/conversations', createConversation);
router.get('/conversations/:token', getConversation);
router.post('/conversations/:token/messages', captureChannel, validate(messageSchema), postMessage);
router.post('/conversations/:token/feedback', validate(feedbackSchema), submitFeedback);
router.post('/conversations/:token/handoff', validate(handoffSchema), requestHandoff);

export default router;
