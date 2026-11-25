import { ZodError } from 'zod';
import { HttpError } from '../utils/http-error.js';
import { logger } from '../utils/logger.js';

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = 500;
  let message = 'Internal server error';
  let details;

  if (error instanceof HttpError) {
    status = error.status;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    status = 400;
    message = 'Validation failed';
    details = error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
  } else if (error?.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = 'Uploaded file is too large';
  } else if (error?.status === 502) {
    status = 502;
    message = error.message || 'Database request failed';
    details = error.details;
  }

  if (status >= 500) logger.error('request_failed', { method: req.method, path: req.originalUrl, error: error.message });
  res.status(status).json({ error: { message, ...(details ? { details } : {}) } });
}
