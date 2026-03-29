import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as engineController from '../controllers/engineController.js';

export const engineRouter = Router();

engineRouter.get('/profile', asyncHandler(engineController.profile));
engineRouter.post('/profile/reset', asyncHandler(engineController.profileReset));
engineRouter.post('/chain-preview', asyncHandler(engineController.chainPreview));
engineRouter.post('/diagnostics', asyncHandler(engineController.diagnostics));
engineRouter.get('/decisions/recent', asyncHandler(engineController.decisionsRecent));
engineRouter.get('/decisions/:sessionId', asyncHandler(engineController.decisionsSession));
engineRouter.post('/export', asyncHandler(engineController.exportSession));
engineRouter.get('/download/:filename', asyncHandler(engineController.downloadExport));
