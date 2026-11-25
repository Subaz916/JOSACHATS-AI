import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { settingsSchema } from '../validators/schemas.js';
import {
  getSettings,
  updateSettings,
  getNotifications,
  markNotificationRead,
  getIntegrations,
  createIntegration,
  getSystemSettings,
  updateSystemSettings,
  health
} from '../controllers/system-controller.js';

const router = express.Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const settingsBody = validate(settingsSchema.passthrough());

router.get('/settings', requireAuth, asyncRoute(getSettings));
router.patch('/settings', requireAuth, settingsBody, asyncRoute(updateSettings));
router.get('/notifications', requireAuth, asyncRoute(getNotifications));
router.patch('/notifications/:id', requireAuth, asyncRoute(markNotificationRead));
router.get('/integrations', requireAuth, asyncRoute(getIntegrations));
router.post('/integrations', requireAuth, asyncRoute(createIntegration));
router.get('/system/settings', requireAuth, requireAdmin, asyncRoute(getSystemSettings));
router.patch('/system/settings', requireAuth, requireAdmin, asyncRoute(updateSystemSettings));
router.get('/system/health', asyncRoute(health));

export default router;
