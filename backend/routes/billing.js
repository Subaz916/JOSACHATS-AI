import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { checkoutSchema } from '../validators/schemas.js';
import {
  getPlans,
  getSubscription,
  createCheckout,
  getPayments,
  getPaymentStatus,
  cancelSubscription,
  billingSuccess,
  safepayWebhook,
  getBillingConfig
} from '../controllers/billing-controller.js';

const router = express.Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const rawBody = express.raw({ type: '*/*' });

router.get('/plans', asyncRoute(getPlans));
router.get('/billing/subscription', requireAuth, asyncRoute(getSubscription));
router.post('/billing/checkout', requireAuth, validate(checkoutSchema), asyncRoute(createCheckout));
router.get('/billing/payments', requireAuth, asyncRoute(getPayments));
router.get('/billing/payments/:id/status', requireAuth, asyncRoute(getPaymentStatus));
router.post('/billing/cancel', requireAuth, asyncRoute(cancelSubscription));
router.get('/billing/success', requireAuth, asyncRoute(billingSuccess));
router.get('/billing/config', requireAuth, asyncRoute(getBillingConfig));
router.post('/webhooks/safepay', rawBody, asyncRoute(safepayWebhook));

export default router;
