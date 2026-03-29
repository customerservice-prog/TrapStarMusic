import { sendOk } from '../lib/httpResponse.js';
import * as sessionService from '../services/sessionService.js';

export async function list(_req, res) {
  sendOk(res, await Promise.resolve(sessionService.listSessions()));
}

export async function create(req, res) {
  const row = sessionService.createSession(req.body);
  sendOk(res, row, 201);
}

export async function getById(req, res) {
  sendOk(res, sessionService.getSession(req.params.id));
}

export async function patch(req, res) {
  sendOk(res, sessionService.patchSession(req.params.id, req.body));
}

export async function remove(req, res) {
  sendOk(res, sessionService.deleteSession(req.params.id));
}

export async function uploadBeat(req, res) {
  sendOk(res, sessionService.uploadBeat(req.params.id, req.file));
}

export async function beatFile(req, res) {
  sessionService.streamBeatFile(req.params.id, res);
}

export async function snapshot(req, res) {
  const label = (req.body && req.body.label) || 'autosave';
  sendOk(res, sessionService.saveSnapshot(req.params.id, label), 201);
}

export async function versions(req, res) {
  sendOk(res, sessionService.listVersions(req.params.id));
}

export async function restore(req, res) {
  const { versionId } = req.body || {};
  sendOk(res, sessionService.restoreVersion(req.params.id, versionId));
}
