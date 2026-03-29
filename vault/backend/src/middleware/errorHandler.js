import { AppError } from '../lib/errors.js';
import { sendErrorEnvelope } from '../lib/httpResponse.js';
import { log } from '../lib/logger.js';
import { env } from '../config/env.js';

/**
 * Central error middleware — must be registered last among route handlers.
 */
export function errorHandler(err, req, res, _next) {
  if (res.headersSent) {
    log.error('error after headers sent', { path: req.path, message: err?.message });
    return;
  }

  if (err instanceof AppError) {
    log.warn('app error', { path: req.path, code: err.code, message: err.message });
    return sendErrorEnvelope(res, err.httpStatus, err.code, err.message, err.details);
  }

  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.name === 'MulterError')) {
    return sendErrorEnvelope(res, 400, 'UPLOAD_TOO_LARGE', err.message || 'Upload too large');
  }

  log.error('unhandled error', {
    path: req.path,
    message: err?.message,
    stack: env.isProduction ? undefined : err?.stack,
  });

  const message = env.hideErrorDetails ? 'Internal server error' : err?.message || 'Internal server error';
  sendErrorEnvelope(res, err?.status || 500, err?.code || 'SERVER_ERROR', message);
}
