import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { agentSchema, agentPatchSchema } from '../validators/schemas.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http-error.js';
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  publishAgent,
  shareAgent
} from '../controllers/agent-controller.js';

const router = Router();

const allowedTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp'
]);

const agentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 11 },
  fileFilter(req, file, cb) {
    const ok = allowedTypes.has(file.mimetype) || /\.(pdf|docx|txt|md|csv|png|jpe?g|webp)$/i.test(file.originalname);
    cb(ok ? null : new Error('Unsupported file type'), ok);
  }
});

const agentFiles = agentUpload.fields([
  { name: 'logoFile', maxCount: 1 },
  { name: 'knowledgeFiles', maxCount: 10 }
]);

const publishSchema = z.object({
  status: z.enum(['active', 'inactive', 'draft'])
});

function parseAgentPayload(req, res, next) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (typeof body.payload === 'string') {
      const parsed = JSON.parse(body.payload);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new HttpError(400, 'Invalid agent payload');
      }
      req.body = parsed;
    } else {
      req.body = { ...body };
    }

    const files = req.files || {};
    if (files.logoFile?.length) req.body.logoFile = files.logoFile[0];
    if (files.knowledgeFiles?.length) req.body.knowledgeFiles = files.knowledgeFiles;
    next();
  } catch (error) {
    if (error instanceof HttpError) return next(error);
    next(new HttpError(400, 'Invalid agent payload JSON'));
  }
}

router.use(requireAuth);

router.get('/', listAgents);
router.get('/:id', getAgent);
router.post('/', agentFiles, parseAgentPayload, validate(agentSchema), createAgent);
router.patch('/:id', parseAgentPayload, validate(agentPatchSchema), updateAgent);
router.delete('/:id', deleteAgent);
router.post('/:id/publish', validate(publishSchema), publishAgent);
router.get('/:id/share', shareAgent);

export default router;
