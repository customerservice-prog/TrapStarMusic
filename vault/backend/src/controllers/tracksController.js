import { sendOk } from '../lib/httpResponse.js';
import * as trackService from '../services/trackService.js';
import { AppError } from '../lib/errors.js';
import { isUuid } from '../lib/validation.js';

export async function smartComp(req, res) {
  sendOk(res, trackService.smartComp(req.body?.trackId));
}

export async function listBySession(req, res) {
  sendOk(res, trackService.listTracksForSession(req.params.sessionId));
}

export async function create(req, res) {
  sendOk(res, trackService.createTrack(req.params.sessionId, req.body), 201);
}

export async function patch(req, res) {
  sendOk(res, trackService.patchTrack(req.params.trackId, req.body));
}

export async function remove(req, res) {
  sendOk(res, trackService.deleteTrack(req.params.trackId));
}

export async function uploadTake(req, res) {
  sendOk(res, trackService.processTakeUpload(req.params.trackId, req.file, req.body?.metadata), 201);
}

export async function takeAudio(req, res) {
  trackService.streamTakeAudio(req.params.trackId, req.params.takeId, res);
}

export async function activeTakeAudio(req, res) {
  trackService.streamActiveTakeAudio(req.params.trackId, res);
}

/** Multer / param guard before upload pipeline */
export function assertTrackIdParam(req, _res, next) {
  if (!isUuid(req.params.trackId)) {
    return next(AppError.badRequest('VALIDATION_FAILED', 'Invalid track'));
  }
  next();
}
