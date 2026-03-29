import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { fileURLToPath } from 'url';
import { getDb, dbSafe } from '../models/db.js';
import {
  analyzeBeatFromMeta,
  logEngineDecision,
} from '../services/smartEngine.js';
import { resolveUnderDir, assertFileExists, isSafeTakeFilename } from '../lib/safePaths.js';
import {
  validateSessionCreate,
  validateSessionPatch,
  validateSnapshotLabel,
  isUuid,
} from '../lib/validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const beatsDir = path.join(__dirname, '../../../data/beats');
const tracksDir = path.join(__dirname, '../../../data/tracks');

function ensureBeatsDir() {
  if (!fs.existsSync(beatsDir)) fs.mkdirSync(beatsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const sessionId = req.params.id;
    if (!sessionId) {
      ensureBeatsDir();
      cb(null, beatsDir);
      return;
    }
    const dir = path.join(beatsDir, sessionId);
    fs.mkdirSync(dir, { recursive: true });
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

sessionsRouter.get('/', (_req, res) => {
  const r = dbSafe(() => {
    const db = getDb();
    return db
      .prepare(
        `SELECT s.*, 
          (SELECT COUNT(*) FROM tracks t WHERE t.session_id = s.id) AS track_count
         FROM sessions s ORDER BY s.updated_at DESC`
      )
      .all();
  });
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  res.json(r.data);
});

sessionsRouter.post('/', (req, res) => {
  const v = validateSessionCreate(req.body || {});
  if (!v.ok) return res.status(400).json({ error: v.error });
  const { name, bpm, musical_key, genre, beat_label } = v.data;
  const id = uuid();
  const now = new Date().toISOString();
  const r = dbSafe(() => {
    const db = getDb();
    db.prepare(
      `INSERT INTO sessions (id, name, bpm, musical_key, genre, beat_label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, bpm, musical_key, genre, beat_label, now, now);
    const analysis = analyzeBeatFromMeta({ bpm, genre, name, beat_label });
    logEngineDecision(id, 'beat_analysis', analysis);
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  });
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  res.status(201).json(r.data);
});

sessionsRouter.get('/:id', (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid session' });
  const r = dbSafe(() => getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id));
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  if (!r.data) return res.status(404).json({ error: 'Session not found' });
  res.json(r.data);
});

sessionsRouter.patch('/:id', (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid session' });
  const v = validateSessionPatch(req.body || {});
  if (!v.ok) return res.status(400).json({ error: v.error });
  const body = v.data;
  const allowed = ['name', 'bpm', 'musical_key', 'genre', 'beat_label', 'punch_in_start', 'punch_in_end'];
  const updates = [];
  const vals = [];
  for (const k of allowed) {
    if (body[k] !== undefined) {
      updates.push(`${k} = ?`);
      vals.push(body[k]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });
  vals.push(new Date().toISOString(), req.params.id);
  const r = dbSafe(() => {
    const db = getDb();
    db.prepare(`UPDATE sessions SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`).run(...vals);
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  });
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  if (!r.data) return res.status(404).json({ error: 'Session not found' });
  res.json(r.data);
});

sessionsRouter.delete('/:id', (req, res) => {
  const sessionId = req.params.id;
  if (!isUuid(sessionId)) return res.status(400).json({ error: 'Invalid session' });
  const r = dbSafe(() => {
    const db = getDb();
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
      } catch (_) {}
    }
    if (s.beat_filename) {
      const bfp = resolveUnderDir(beatsDir, s.beat_filename.replace(/^\//, ''));
      try {
        if (bfp && fs.existsSync(bfp)) fs.unlinkSync(bfp);
      } catch (_) {}
      try {
        const emptyDir = path.join(beatsDir, sessionId);
        if (fs.existsSync(emptyDir) && fs.readdirSync(emptyDir).length === 0) {
          fs.rmdirSync(emptyDir);
        }
      } catch (_) {}
    }
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return { ok: true };
  });
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  if (!r.data) return res.status(404).json({ error: 'Session not found' });
  res.json(r.data);
});

sessionsRouter.post('/:id/beat', (req, res, next) => {
  if (!isUuid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid session' });
  }
  uploadBeat.single('beat')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Beat upload rejected' });
    }
    next();
  });
}, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'beat file required (.mp3, .wav, .ogg, .m4a)' });
  }
  const sessionId = req.params.id;
  const r = dbSafe(() => {
    const db = getDb();
    const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!s) return null;
    if (s.beat_filename) {
      const prev = resolveUnderDir(beatsDir, s.beat_filename.replace(/^\//, ''));
      try {
        if (prev && fs.existsSync(prev)) fs.unlinkSync(prev);
      } catch (_) {}
    }
    const relName = path.join(sessionId, req.file.filename).replace(/\\/g, '/');
    db.prepare(
      `UPDATE sessions SET beat_filename = ?, beat_mime = ?, beat_uploaded_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(relName, req.file.mimetype, new Date().toISOString(), new Date().toISOString(), sessionId);
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    const analysis = analyzeBeatFromMeta({
      bpm: row.bpm,
      genre: row.genre,
      name: row.name,
      beat_label: row.beat_label,
    });
    logEngineDecision(sessionId, 'beat_analysis', analysis);
    return { session: row, analysis, beatPath: rel };
  });
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  if (!r.data) return res.status(404).json({ error: 'Session not found' });
  res.json({
    session: r.data.session,
    beatUrl: `/api/sessions/${sessionId}/beat/file`,
    analysis: r.data.analysis,
  });
});

sessionsRouter.get('/:id/beat/file', (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid session' });
  const r = dbSafe(() => getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id));
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  const s = r.data;
  if (!s || !s.beat_filename) return res.status(404).json({ error: 'No beat uploaded' });
  const rel = s.beat_filename.replace(/^\//, '');
  const fp = resolveUnderDir(beatsDir, rel);
  if (!fp || !assertFileExists(fp)) return res.status(404).json({ error: 'Beat file missing' });
  res.setHeader('Content-Type', s.beat_mime || 'audio/mpeg');
  fs.createReadStream(fp).pipe(res);
});

sessionsRouter.post('/:id/snapshot', (req, res) => {
  const sessionId = req.params.id;
  const label = (req.body && req.body.label) || 'autosave';
  const r = dbSafe(() => {
    const db = getDb();
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
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  if (!r.data) return res.status(404).json({ error: 'Session not found' });
  res.status(201).json(r.data);
});

sessionsRouter.get('/:id/versions', (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid session' });
  const r = dbSafe(() =>
    getDb()
      .prepare(
        `SELECT id, label, created_at FROM version_history WHERE session_id = ? ORDER BY created_at DESC LIMIT 50`
      )
      .all(req.params.id)
  );
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  res.json(r.data);
});

sessionsRouter.post('/:id/restore', (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid session' });
  const { versionId } = req.body || {};
  if (!versionId || !isUuid(versionId)) return res.status(400).json({ error: 'versionId required' });
  const r = dbSafe(() => {
    const db = getDb();
    const v = db.prepare('SELECT * FROM version_history WHERE id = ? AND session_id = ?').get(versionId, req.params.id);
    if (!v) return null;
    let snap;
    try {
      snap = JSON.parse(v.snapshot_json);
    } catch {
      return { __corrupt: true };
    }
    return { snap, version: v };
  });
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  if (r.data && r.data.__corrupt) return res.status(400).json({ error: 'Snapshot data is corrupted' });
  if (!r.data) return res.status(404).json({ error: 'Version not found' });

  const { snap } = r.data;
  const sessionId = req.params.id;

  const wr = dbSafe(() => {
    const db = getDb();
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
    return getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  });
  if (!wr.ok) return res.status(500).json({ error: wr.error, code: wr.code });
  res.json({ session: wr.data, restored: true });
});
