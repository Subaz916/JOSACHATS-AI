import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { planSchema, adminUserSchema } from '../validators/schemas.js';
import {
  getOverview,
  getUsers,
  updateUserStatus,
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getAgents,
  updateAgentStatus,
  getLogs,
  getPayments
} from '../controllers/admin-controller.js';

const router = express.Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const admin = [requireAuth, requireAdmin];

router.get('/overview', ...admin, asyncRoute(getOverview));
router.get('/users', ...admin, asyncRoute(getUsers));
router.patch('/users/:id', ...admin, validate(adminUserSchema), asyncRoute(updateUserStatus));
router.get('/plans', ...admin, asyncRoute(getPlans));
router.post('/plans', ...admin, validate(planSchema), asyncRoute(createPlan));
router.patch('/plans/:id', ...admin, validate(planSchema.partial()), asyncRoute(updatePlan));
router.delete('/plans/:id', ...admin, asyncRoute(deletePlan));
router.get('/agents', ...admin, asyncRoute(getAgents));
router.patch('/agents/:id', ...admin, asyncRoute(updateAgentStatus));
router.get('/logs', ...admin, asyncRoute(getLogs));
router.get('/payments', ...admin, asyncRoute(getPayments));

export default router;
