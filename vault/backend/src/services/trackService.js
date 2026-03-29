import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { runDb } from '../lib/runDb.js';
import { AppError } from '../lib/errors.js';
import {
  safeBuildChain,
  classifyVocal,
  gradeTake,
  logEngineDecision,
  getLatestBeatAnalysis,
  updateVoiceProfileAfterTake,
  takeQualityHints,
} from './smartEngine.js';
import { resolveUnderDir, assertFileExists, isSafeTakeFilename } from '../lib/safePaths.js';
import { isUuid, validateTrackPatch, normalizeTakeMetadata, sanitizeTrackType } from '../lib/validation.js';
import { getTracksDir, deleteFileIfExists } from './storageService.js';

export function smartComp(trackId) {
  if (!trackId) throw AppError.badRequest('VALIDATION_FAILED', 'trackId required');
  return runDb((db) => {
    const takes = db.prepare('SELECT * FROM takes WHERE track_id = ?').all(trackId);
    if (!takes.length) return { takes: [], bestId: null };
    let best = takes[0];
    let bestScore = -1;
    for (const tk of takes) {
      const e = tk.energy_score ?? 0;
      const tim = tk.timing_score ?? 0.5;
      const sc = tim * 0.55 + Math.min(e * 4, 1) * 0.45;
      if (sc > bestScore) {
        bestScore = sc;
        best = tk;
      }
    }
    return { takes, bestId: best.id, bestScore };
  });
}

export function listTracksForSession(sessionId) {
  if (!isUuid(sessionId)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid session id');
  return runDb((db) => {
    const tracks = db
      .prepare(`SELECT * FROM tracks WHERE session_id = ? ORDER BY sort_order, created_at`)
      .all(sessionId);
    return tracks.map((t) => ({
      ...t,
      takes: db.prepare(`SELECT * FROM takes WHERE track_id = ? ORDER BY created_at`).all(t.id),
    }));
  });
}

export function createTrack(sessionId, body) {
  if (!isUuid(sessionId)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid session id');
  const { label, track_type } = body || {};
  const tt = sanitizeTrackType(track_type);
  const lab = typeof label === 'string' ? label.trim().slice(0, 120) : '';
  const row = runDb((db) => {
    if (!db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId)) return null;
    const id = uuid();
    const maxOrder =
      db.prepare('SELECT MAX(sort_order) AS m FROM tracks WHERE session_id = ?').get(sessionId)?.m ?? -1;
    db.prepare(
      `INSERT INTO tracks (id, session_id, label, track_type, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).run(id, sessionId, lab || 'Vocal', tt, maxOrder + 1);
    return db.prepare('SELECT * FROM tracks WHERE id = ?').get(id);
  });
  if (!row) throw AppError.notFound('SESSION_NOT_FOUND', 'Session not found');
  return row;
}

export function patchTrack(trackId, body) {
  if (!isUuid(trackId)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid track id');
  const v = validateTrackPatch(body || {});
  if (!v.ok) throw AppError.badRequest('VALIDATION_FAILED', v.error);
  const patch = v.data;
  const allowed = ['label', 'sort_order', 'active_take_id', 'chain_snapshot', 'volume', 'muted'];
  const updates = [];
  const vals = [];
  for (const k of allowed) {
    if (patch[k] !== undefined) {
      updates.push(`${k} = ?`);
      vals.push(k === 'muted' ? (patch[k] ? 1 : 0) : patch[k]);
    }
  }
  if (!updates.length) throw AppError.badRequest('VALIDATION_FAILED', 'No valid fields');
  vals.push(trackId);
  const row = runDb((db) => {
    db.prepare(`UPDATE tracks SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    return db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId);
  });
  if (!row) throw AppError.notFound('TRACK_NOT_FOUND', 'Track not found');
  return row;
}

export function deleteTrack(trackId) {
  if (!isUuid(trackId)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid track id');
  const tracksDir = getTracksDir();
  const ok = runDb((db) => {
    const t = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId);
    if (!t) return null;
    const takes = db.prepare('SELECT * FROM takes WHERE track_id = ?').all(t.id);
    for (const tk of takes) {
      if (!isSafeTakeFilename(tk.filename)) continue;
      const fp = resolveUnderDir(tracksDir, tk.filename);
      deleteFileIfExists(fp);
    }
    db.prepare('DELETE FROM tracks WHERE id = ?').run(trackId);
    return { ok: true };
  });
  if (!ok) throw AppError.notFound('TRACK_NOT_FOUND', 'Track not found');
  return ok;
}

export function processTakeUpload(trackId, file, rawMeta) {
  if (!isUuid(trackId)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid track id');
  if (!file) throw AppError.badRequest('UPLOAD_INVALID_TYPE', 'audio file required');
  if (!isSafeTakeFilename(file.filename)) {
    deleteFileIfExists(file.path);
    throw AppError.badRequest('UPLOAD_INVALID_TYPE', 'Invalid stored filename');
  }
  let raw = {};
  try {
    raw = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta || {};
  } catch {
    deleteFileIfExists(file.path);
    throw AppError.badRequest('VALIDATION_FAILED', 'metadata must be valid JSON');
  }
  const meta = normalizeTakeMetadata(raw);

  try {
    const result = runDb((db) => {
      const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId);
      if (!track) return null;
      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(track.session_id);
      const vocalClass = classifyVocal({
        energyRms: meta.energyRms,
        peakDb: meta.peakDb,
      });
      const beatAnalysis = getLatestBeatAnalysis(track.session_id) || {
        character: 'melodic',
        mid_density: 'medium',
        bass_intensity: 'medium',
        arrangement: 'open',
      };
      const voiceProfile = db.prepare('SELECT * FROM voice_profile WHERE id = 1').get();
      const trackRole = track.track_type || vocalClass.layer || 'main';
      const chain = safeBuildChain({
        beatAnalysis,
        vocalClass,
        voiceProfile,
        trackRole,
        inputSource: session.input_source ?? 'phone',
      });
      const grade = gradeTake({
        energyRms: meta.energyRms,
        peakDb: meta.peakDb,
        timingScore: meta.timingScore,
      });
      const quality = takeQualityHints(meta);

      const takeId = uuid();
      db.prepare(
        `INSERT INTO takes (id, track_id, filename, mime, duration_ms, energy_score, timing_score, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(
        takeId,
        trackId,
        file.filename,
        file.mimetype,
        meta.durationMs,
        meta.energyRms,
        meta.timingScore,
        JSON.stringify(meta)
      );

      db.prepare(
        `UPDATE tracks SET active_take_id = ?, chain_snapshot = ?, feedback_grade = ?, feedback_text = ?
         WHERE id = ?`
      ).run(takeId, JSON.stringify(chain), grade.grade, grade.detail, trackId);

      db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), session.id);

      logEngineDecision(track.session_id, 'vocal_classification', vocalClass);
      logEngineDecision(track.session_id, 'chain_build', chain);

      updateVoiceProfileAfterTake({
        energyRms: meta.energyRms,
        peakDb: meta.peakDb,
        trackRole,
      });

      const sessionTakeCount =
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM takes tk JOIN tracks t ON t.id = tk.track_id WHERE t.session_id = ?`
          )
          .get(track.session_id)?.c ?? 0;
      if (sessionTakeCount === 1) {
        db.prepare('UPDATE voice_profile SET sessions_trained = sessions_trained + 1 WHERE id = 1').run();
      }

      const take = db.prepare('SELECT * FROM takes WHERE id = ?').get(takeId);
      const updated = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId);
      return { take, track: updated, chain, feedback: grade, quality };
    });
    if (!result) {
      deleteFileIfExists(file.path);
      throw AppError.notFound('TRACK_NOT_FOUND', 'Track not found');
    }
    return result;
  } catch (e) {
    deleteFileIfExists(file.path);
    throw e;
  }
}

export function streamTakeAudio(trackId, takeId, res) {
  if (!isUuid(trackId) || !isUuid(takeId)) {
    throw AppError.badRequest('VALIDATION_FAILED', 'Invalid id');
  }
  const tk = runDb((db) =>
    db
      .prepare('SELECT tk.* FROM takes tk JOIN tracks t ON t.id = tk.track_id WHERE tk.id = ? AND t.id = ?')
      .get(takeId, trackId)
  );
  if (!tk) throw AppError.notFound('TAKE_NOT_FOUND', 'Take not found');
  if (!isSafeTakeFilename(tk.filename)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid file reference');
  const fp = resolveUnderDir(getTracksDir(), tk.filename);
  if (!fp || !assertFileExists(fp)) throw AppError.notFound('FILE_NOT_FOUND', 'File missing');
  res.setHeader('Content-Type', tk.mime || 'audio/webm');
  fs.createReadStream(fp).pipe(res);
}

export function streamActiveTakeAudio(trackId, res) {
  if (!isUuid(trackId)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid track id');
  const tk = runDb((db) => {
    const t = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId);
    if (!t || !t.active_take_id) return null;
    return db.prepare('SELECT * FROM takes WHERE id = ?').get(t.active_take_id);
  });
  if (!tk) throw AppError.notFound('TAKE_NOT_FOUND', 'No active take');
  if (!isSafeTakeFilename(tk.filename)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid file reference');
  const fp = resolveUnderDir(getTracksDir(), tk.filename);
  if (!fp || !assertFileExists(fp)) throw AppError.notFound('FILE_NOT_FOUND', 'File missing');
  res.setHeader('Content-Type', tk.mime || 'audio/webm');
  fs.createReadStream(fp).pipe(res);
}
