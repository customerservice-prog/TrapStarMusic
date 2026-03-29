import { Router } from 'express';
import { sendOk } from '../lib/httpResponse.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AppError } from '../lib/errors.js';

export const adminRouter = Router();

function requireAdmin(req, _res, next) {
  const key = env.adminApiKey;
  if (!key) {
    return next(AppError.notFound('NOT_FOUND', 'Not found'));
  }
  const hdr = req.headers.authorization;
  const bearer = hdr && hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  const headerKey = req.headers['x-admin-key'];
  if (bearer === key || headerKey === key) {
    return next();
  }
  return next(AppError.unauthorized('Invalid admin credentials'));
}

adminRouter.use(requireAdmin);

adminRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    sendOk(res, {
      service: 'rap-factory-admin',
      nodeEnv: env.nodeEnv,
      time: new Date().toISOString(),
      note: 'Extended metrics can be added here (queue depth, export failure counts, etc.).',
    });
  })
);
