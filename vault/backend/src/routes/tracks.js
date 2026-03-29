import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as tracksController from '../controllers/tracksController.js';
import { isUuid } from '../lib/validation.js';
import { AppError } from '../lib/errors.js';
import { getTracksDir } from '../services/storageService.js';

const TAKE_MIME_TO_EXT = {
  'audio/webm': '.webm',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'video/webm': '.webm',
};

const ALLOWED_TAKE_EXT = new Set(['.webm', '.wav', '.mp3', '.ogg', '.m4a']);

function ensureTracksDir() {
  const d = getTracksDir();
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureTracksDir();
      cb(null, getTracksDir());
    },
    filename: (_req, file, cb) => {
      const mime = (file.mimetype || '').toLowerCase();
      let ext = TAKE_MIME_TO_EXT[mime];
      if (!ext) {
        const fromName = path.extname(file.originalname || '').toLowerCase();
        ext = ALLOWED_TAKE_EXT.has(fromName) ? fromName : '.webm';
      }
      cb(null, `${uuid()}${ext}`);
    },
  }),
  limits: { fileSize: 120 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (TAKE_MIME_TO_EXT[mime] || ALLOWED_TAKE_EXT.has(ext)) {
      cb(null, true);
      return;
    }
    cb(new Error('Only .webm, .wav, .mp3, or .ogg audio is allowed'));
  },
});

export const tracksRouter = Router();

function requireSessionParam(req, _res, next) {
  if (!isUuid(req.params.sessionId)) {
    return next(AppError.badRequest('VALIDATION_FAILED', 'Invalid session'));
  }
  next();
}

tracksRouter.post('/smart-comp', asyncHandler(tracksController.smartComp));
tracksRouter.get('/session/:sessionId', requireSessionParam, asyncHandler(tracksController.listBySession));
tracksRouter.post('/session/:sessionId', requireSessionParam, asyncHandler(tracksController.create));
tracksRouter.post(
  '/:trackId/takes',
  tracksController.assertTrackIdParam,
  (req, res, next) => {
    upload.single('audio')(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  },
  asyncHandler(tracksController.uploadTake)
);
tracksRouter.get(
  '/:trackId/takes/:takeId/audio',
  asyncHandler(tracksController.takeAudio)
);
tracksRouter.get('/:trackId/audio', asyncHandler(tracksController.activeTakeAudio));
tracksRouter.patch('/:trackId', asyncHandler(tracksController.patch));
tracksRouter.delete('/:trackId', asyncHandler(tracksController.remove));
