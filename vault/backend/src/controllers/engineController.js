import { sendOk } from '../lib/httpResponse.js';
import * as engineService from '../services/engineService.js';

export async function profile(_req, res) {
  sendOk(res, engineService.getVoiceProfile());
}

export async function profileReset(_req, res) {
  sendOk(res, engineService.resetVoiceProfile());
}

export async function chainPreview(req, res) {
  sendOk(res, engineService.chainPreview(req.body));
}

export async function diagnostics(req, res) {
  sendOk(res, await engineService.runDiagnostics(req.body));
}

export async function decisionsRecent(req, res) {
  sendOk(res, engineService.listRecentDecisions(req.query.limit));
}

export async function decisionsSession(req, res) {
  sendOk(res, engineService.listSessionDecisions(req.params.sessionId));
}

export async function exportSession(req, res) {
  const payload = await engineService.exportSession(req.body?.sessionId, req.body?.mode);
  sendOk(res, payload);
}

export async function downloadExport(req, res) {
  engineService.streamExportDownload(req.params.filename, res);
}
