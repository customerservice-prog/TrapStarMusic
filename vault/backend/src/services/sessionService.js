import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { runDb } from '../lib/runDb.js';
import { AppError } from '../lib/errors.js';
import { analyzeBeatFromMeta, logEngineDecision } from './smartEngine.js';
import {
  validateSessionCreate,
  validateSessionPatch,
  isUuid,
} from '../lib/validation.js';
import { resolveUnderDir, assertFileExists, isSafeTakeFilename } from '../lib/safePaths.js';
import { getBeatsDir, getTracksDir, deleteFileIfExists, ensureBeatSessionDir } from './storageService.js';

export function listSessions() {
  return runDb((db) =>
    db
      .prepare(
        `SELECT s.*, 
          (SELECT COUNT(*) FROM tracks t WHERE t.session_id = s.id) AS track_count,
          (SELECT t.track_type FROM tracks t WHERE t.session_id = s.id ORDER BY t.created_at DESC LIMIT 1) AS last_layer_type
         FROM sessions s ORDER BY s.updated_at DESC`
      )
      .all()
  );
}

export function createSession(body) {
  const v = validateSessionCreate(body || {});
  if (!v.ok) throw AppError.badRequest('VALIDATION_FAILED', v.error);
  const { name, bpm, musical_key, genre, beat_label, input_source } = v.data;
  const id = uuid();
  const now = new Date().toISOString();
  return runDb((db) => {
    db.prepare(
      `INSERT INTO sessions (id, name, bpm, musical_key, genre, beat_label, input_source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, bpm, musical_key, genre, beat_label, input_source ?? null, now, now);
    const analysis = analyzeBeatFromMeta({ bpm, genre, name, beat_label });
    logEngineDecision(id, 'beat_analysis', analysis);
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  });
}

export function getSession(sessionId) {
  if (!isUuid(sessionId)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid session id');
  const row = runDb((db) => db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId));
  if (!row) throw AppError.notFound('SESSION_NOT_FOUND', 'Session not found');
  return row;
}

export function patchSession(sessionId, body) {
  if (!isUuid(sessionId)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid session id');
  const v = validateSessionPatch(body || {});
  if (!v.ok) throw AppError.badRequest('VALIDATION_FAILED', v.error);
  const patch = v.data;
  const allowed = [
    'name',
    'bpm',
    'musical_key',
    'genre',
    'beat_label',
    'punch_in_start',
    'punch_in_end',
    'input_source',
  ];
  const updates = [];
  const vals = [];
  for (const k of allowed) {
    if (patch[k] !== undefined) {
      updates.push(`${k} = ?`);
      vals.push(patch[k]);
    }
  }
  if (!updates.length) throw AppError.badRequest('VALIDATION_FAILED', 'No valid fields');
  vals.push(new Date().toISOString(), sessionId);
  return runDb((db) => {
    db.prepare(`UPDATE sessions SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`).run(...vals);
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  });
}

export function deleteSession(sessionId) {
  if (!isUuid(sessionId)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid session id');
  const beatsDir = getBeatsDir();
  const tracksDir = getTracksDir();
  const deleted = runDb((db) => {
    const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!s) return null;
    const takeRows = db
      .prepare(
        `SELECT tk.filename FROM takes tk JOIN tracks t ON t.id = tk.track_id WHERE t.session_id = ?`
      )
      .all(sessionId);
    for (const row of takeRows) {
      if (!isSafeTakeFilename(row.filename)) continue;
      const fp = resolveUnderDir(tracksDir, row.filename);
      try {
        if (fp && assertFileExists(fp)) fs.unlinkSync(fp);
      } catch {
        /* */
      }
    }
    if (s.beat_filename) {
      const bfp = resolveUnderDir(beatsDir, s.beat_filename.replace(/^\//, ''));
      deleteFileIfExists(bfp);
      try {
        const emptyDir = path.join(beatsDir, sessionId);
        if (fs.existsSync(emptyDir) && fs.readdirSync(emptyDir).length === 0) {
          fs.rmdirSync(emptyDir);
        }
      } catch {
        /* */
      }
    }
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return { ok: true };
  });
  if (!deleted) throw AppError.notFound('SESSION_NOT_FOUND', 'Session not found');
  return deleted;
}

export function uploadBeat(sessionId, file) {
  if (!isUuid(sessionId)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid session id');
  if (!file) throw AppError.badRequest('UPLOAD_INVALID_TYPE', 'beat file required (.mp3, .wav, .ogg, .m4a)');
  const beatsDir = getBeatsDir();
  const r = runDb((db) => {
    const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!s) return null;
    if (s.beat_filename) {
      const prev = resolveUnderDir(beatsDir, s.beat_filename.replace(/^\//, ''));
      deleteFileIfExists(prev);
    }
    const relName = path.join(sessionId, file.filename).replace(/\\/g, '/');
    db.prepare(
      `UPDATE sessions SET beat_filename = ?, beat_mime = ?, beat_uploaded_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(relName, file.mimetype, new Date().toISOString(), new Date().toISOString(), sessionId);
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    const analysis = analyzeBeatFromMeta({
      bpm: row.bpm,
      genre: row.genre,
      name: row.name,
      beat_label: row.beat_label,
    });
    logEngineDecision(sessionId, 'beat_analysis', analysis);
    return {
      session: row,
      beatUrl: `/api/sessions/${sessionId}/beat/file`,
      analysis,
    };
  });
  if (!r) throw AppError.notFound('SESSION_NOT_FOUND', 'Session not found');
  return r;
}

export function streamBeatFile(sessionId, res) {
  if (!isUuid(sessionId)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid session id');
  const s = runDb((db) => db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId));
  if (!s || !s.beat_filename) throw AppError.notFound('BEAT_NOT_FOUND', 'No beat uploaded');
  const rel = s.beat_filename.replace(/^\//, '');
  const fp = resolveUnderDir(getBeatsDir(), rel);
  if (!fp || !assertFileExists(fp)) throw AppError.notFound('BEAT_NOT_FOUND', 'Beat file missing');
  res.setHeader('Content-Type', s.beat_mime || 'audio/mpeg');
  fs.createReadStream(fp).pipe(res);
}

export function saveSnapshot(sessionId, label = 'autosave') {
  if (!isUuid(sessionId)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid session id');
  const r = runDb((db) => {
    const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!s) return null;
    const tracks = db.prepare('SELECT * FROM tracks WHERE session_id = ? ORDER BY sort_order').all(sessionId);
    const takesByTrack = {};
    for (const t of tracks) {
      takesByTrack[t.id] = db.prepare('SELECT * FROM takes WHERE track_id = ?').all(t.id);
    }
    const snap = { session: s, tracks, takesByTrack, savedAt: new Date().toISOString() };
    const id = uuid();
    db.prepare(
      `INSERT INTO version_history (id, session_id, label, snapshot_json, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(id, sessionId, label, JSON.stringify(snap));
    return { id, label, created_at: new Date().toISOString() };
  });
  if (!r) throw AppError.notFound('SESSION_NOT_FOUND', 'Session not found');
  return r;
}

export function listVersions(sessionId) {
  if (!isUuid(sessionId)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid session id');
  return runDb((db) =>
    db
      .prepare(
        `SELECT id, label, created_at FROM version_history WHERE session_id = ? ORDER BY created_at DESC LIMIT 50`
      )
      .all(sessionId)
  );
}

export function restoreVersion(sessionId, versionId) {
  if (!isUuid(sessionId) || !isUuid(versionId)) {
    throw AppError.badRequest('VALIDATION_FAILED', 'Invalid session or version id');
  }
  const meta = runDb((db) => {
    const v = db.prepare('SELECT * FROM version_history WHERE id = ? AND session_id = ?').get(versionId, sessionId);
    if (!v) return null;
    let snap;
    try {
      snap = JSON.parse(v.snapshot_json);
    } catch {
      return { corrupt: true };
    }
    return { snap, version: v };
  });
  if (meta?.corrupt) throw AppError.badRequest('SNAPSHOT_CORRUPT', 'Snapshot data is corrupted');
  if (!meta) throw AppError.notFound('VERSION_NOT_FOUND', 'Version not found');

  const { snap } = meta;
  const session = runDb((db) => {
    const s = snap.session;
    db.prepare(
      `UPDATE sessions SET name = ?, bpm = ?, musical_key = ?, genre = ?, updated_at = ?
       WHERE id = ?`
    ).run(s.name, s.bpm, s.musical_key, s.genre, new Date().toISOString(), sessionId);
    db.prepare('DELETE FROM tracks WHERE session_id = ?').run(sessionId);
    for (const t of snap.tracks || []) {
      db.prepare(
        `INSERT INTO tracks (id, session_id, label, track_type, sort_order, active_take_id, chain_snapshot, feedback_grade, feedback_text, volume, muted, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        t.id,
        sessionId,
        t.label,
        t.track_type,
        t.sort_order,
        t.active_take_id,
        t.chain_snapshot,
        t.feedback_grade,
        t.feedback_text,
        t.volume ?? 1,
        t.muted ?? 0,
        t.created_at
      );
      const takes = (snap.takesByTrack && snap.takesByTrack[t.id]) || [];
      for (const tk of takes) {
        db.prepare(
          `INSERT INTO takes (id, track_id, filename, mime, duration_ms, energy_score, timing_score, metadata_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          tk.id,
          t.id,
          tk.filename,
          tk.mime,
          tk.duration_ms,
          tk.energy_score,
          tk.timing_score,
          tk.metadata_json,
          tk.created_at
        );
      }
    }
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  });
  return { session, restored: true };
}

export { ensureBeatSessionDir, getBeatsDir };
