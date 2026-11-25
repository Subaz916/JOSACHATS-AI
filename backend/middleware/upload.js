import multer from 'multer';
import { env } from '../config/env.js';

const allowed = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/webp'
]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const ok = allowed.has(file.mimetype) || /\.(pdf|docx|txt|md|png|jpe?g|webp)$/i.test(file.originalname);
    cb(ok ? null : new Error('Unsupported file type'), ok);
  }
});
