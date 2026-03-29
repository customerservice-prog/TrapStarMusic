import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { isUuid } from '../lib/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as sessionsController from '../controllers/sessionsController.js';
import { ensureBeatSessionDir } from '../services/sessionService.js';
import { AppError } from '../lib/errors.js';

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const sessionId = req.params.id;
    if (!sessionId) {
      return cb(new Error('session required'));
    }
    const dir = ensureBeatSessionDir(sessionId);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.wav';
    cb(null, `beat${ext}`);
  },
});

const uploadBeat = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    const okMime =
      mime === 'audio/mpeg' ||
      mime === 'audio/mp3' ||
      mime === 'audio/wav' ||
      mime === 'audio/x-wav' ||
      mime === 'audio/wave' ||
      mime === 'audio/ogg' ||
      mime === 'audio/webm' ||
      mime === 'audio/mp4' ||
      mime === 'audio/aac' ||
      mime === 'audio/x-m4a';
    const okExt = ['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac'].includes(ext);
    cb(null, okMime || okExt);
  },
});

export const sessionsRouter = Router();

function requireSessionUuid(req, _res, next) {
  if (!isUuid(req.params.id)) {
    return next(AppError.badRequest('VALIDATION_FAILED', 'Invalid session'));
  }
  next();
}

sessionsRouter.get('/', asyncHandler(sessionsController.list));
sessionsRouter.post('/', asyncHandler(sessionsController.create));
sessionsRouter.get('/:id/beat/file', requireSessionUuid, asyncHandler(sessionsController.beatFile));
sessionsRouter.post(
  '/:id/beat',
  requireSessionUuid,
  (req, res, next) => {
    uploadBeat.single('beat')(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  },
  asyncHandler(sessionsController.uploadBeat)
);
sessionsRouter.post('/:id/snapshot', requireSessionUuid, asyncHandler(sessionsController.snapshot));
sessionsRouter.get('/:id/versions', requireSessionUuid, asyncHandler(sessionsController.versions));
sessionsRouter.post('/:id/restore', requireSessionUuid, asyncHandler(sessionsController.restore));
sessionsRouter.get('/:id', requireSessionUuid, asyncHandler(sessionsController.getById));
sessionsRouter.patch('/:id', requireSessionUuid, asyncHandler(sessionsController.patch));
sessionsRouter.delete('/:id', requireSessionUuid, asyncHandler(sessionsController.remove));
