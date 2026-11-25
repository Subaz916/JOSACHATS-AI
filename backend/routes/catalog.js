import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { productSchema, serviceSchema } from '../validators/schemas.js';
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listServices,
  createService,
  updateService,
  deleteService
} from '../controllers/catalog-controller.js';

const router = Router();

function captureAgentId(req, res, next) {
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'agentId')) {
    req.catalogAgentIdProvided = true;
    req.catalogAgentId = req.body.agentId || null;
  }
  next();
}

router.use(requireAuth);

router.get('/products', listProducts);
router.post('/products', captureAgentId, validate(productSchema), createProduct);
router.patch('/products/:id', captureAgentId, validate(productSchema.partial()), updateProduct);
router.delete('/products/:id', deleteProduct);

router.get('/services', listServices);
router.post('/services', captureAgentId, validate(serviceSchema), createService);
router.patch('/services/:id', captureAgentId, validate(serviceSchema.partial()), updateService);
router.delete('/services/:id', deleteService);

export default router;
