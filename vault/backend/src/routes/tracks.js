import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { fileURLToPath } from 'url';
import { getDb, dbSafe } from '../models/db.js';
import {
  safeBuildChain,
  classifyVocal,
  gradeTake,
  logEngineDecision,
  getLatestBeatAnalysis,
  updateVoiceProfileAfterTake,
  takeQualityHints,
} from '../services/smartEngine.js';
import { resolveUnderDir, assertFileExists, isSafeTakeFilename } from '../lib/safePaths.js';
import {
  isUuid,
  validateTrackPatch,
  validateTakePatch,
  normalizeTakeMetadata,
  sanitizeTrackType,
} from '../lib/validation.js';
import { log } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tracksDir = path.join(__dirname, '../../../data/tracks');

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
  if (!fs.existsSync(tracksDir)) fs.mkdirSync(tracksDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureTracksDir();
      cb(null, tracksDir);
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

tracksRouter.post('/smart-comp', (req, res) => {
  const { trackId } = req.body || {};
  if (!trackId) return res.status(400).json({ error: 'trackId required' });
  const r = dbSafe(() => {
    const db = getDb();
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
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  res.json(r.data);
});

tracksRouter.get('/session/:sessionId', (req, res) => {
  if (!isUuid(req.params.sessionId)) return res.status(400).json({ error: 'Invalid session' });
  const r = dbSafe(() => {
    const db = getDb();
    const tracks = db
      .prepare(`SELECT * FROM tracks WHERE session_id = ? ORDER BY sort_order, created_at`)
      .all(req.params.sessionId);
    const out = tracks.map((t) => {
      const takes = db.prepare(`SELECT * FROM takes WHERE track_id = ? ORDER BY created_at`).all(t.id);
      return { ...t, takes };
    });
    return out;
  });
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  res.json(r.data);
});

tracksRouter.post('/session/:sessionId', (req, res) => {
  const { label, track_type } = req.body || {};
  const sessionId = req.params.sessionId;
  if (!isUuid(sessionId)) return res.status(400).json({ error: 'Invalid session' });
  const tt = sanitizeTrackType(track_type);
  const lab = typeof label === 'string' ? label.trim().slice(0, 120) : '';
  const r = dbSafe(() => {
    const db = getDb();
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
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  if (!r.data) return res.status(404).json({ error: 'Session not found' });
  res.status(201).json(r.data);
});

tracksRouter.patch('/:trackId', (req, res) => {
  if (!isUuid(req.params.trackId)) return res.status(400).json({ error: 'Invalid track' });
  const v = validateTrackPatch(req.body || {});
  if (!v.ok) return res.status(400).json({ error: v.error });
  const body = v.data;
  const allowed = ['label', 'sort_order', 'active_take_id', 'chain_snapshot', 'volume', 'muted'];
  const updates = [];
  const vals = [];
  for (const k of allowed) {
    if (body[k] !== undefined) {
      updates.push(`${k} = ?`);
      vals.push(k === 'muted' ? (body[k] ? 1 : 0) : body[k]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });
  vals.push(req.params.trackId);
  const r = dbSafe(() => {
    const db = getDb();
    db.prepare(`UPDATE tracks SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    return db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.trackId);
  });
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  if (!r.data) return res.status(404).json({ error: 'Track not found' });
  res.json(r.data);
});

tracksRouter.delete('/:trackId', (req, res) => {
  if (!isUuid(req.params.trackId)) return res.status(400).json({ error: 'Invalid track' });
  const r = dbSafe(() => {
    const db = getDb();
    const t = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.trackId);
    if (!t) return null;
    const takes = db.prepare('SELECT * FROM takes WHERE track_id = ?').all(t.id);
    for (const tk of takes) {
      if (!isSafeTakeFilename(tk.filename)) continue;
      const fp = resolveUnderDir(tracksDir, tk.filename);
      try {
        if (fp && fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch (_) {}
    }
    db.prepare('DELETE FROM tracks WHERE id = ?').run(req.params.trackId);
    return { ok: true };
  });
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  if (!r.data) return res.status(404).json({ error: 'Track not found' });
  res.json(r.data);
});

tracksRouter.post('/:trackId/takes', (req, res, next) => {
  if (!isUuid(req.params.trackId)) {
    return res.status(400).json({ error: 'Invalid track' });
  }
  upload.single('audio')(req, res, (err) => {
    if (err) {
      log.warn('take upload rejected', { message: err.message });
      return res.status(400).json({ error: err.message || 'Upload rejected' });
    }
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'audio file required' });
  if (!isSafeTakeFilename(req.file.filename)) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {}
    return res.status(400).json({ error: 'Invalid stored filename' });
  }
  const trackId = req.params.trackId;
  let rawMeta = {};
  try {
    rawMeta = req.body.metadata ? JSON.parse(req.body.metadata) : {};
  } catch {
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {}
    return res.status(400).json({ error: 'metadata must be valid JSON' });
  }
  const meta = normalizeTakeMetadata(rawMeta);

  const r = dbSafe(() => {
    const db = getDb();
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
    const chain = safeBuildChain({ beatAnalysis, vocalClass, voiceProfile, trackRole });
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
      req.file.filename,
      req.file.mimetype,
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

  if (!r.ok) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {}
    log.error('take processing failed', { message: r.error });
    return res.status(500).json({ error: r.error, code: r.code });
  }
  if (!r.data) {
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {}
    return res.status(404).json({ error: 'Track not found' });
  }
  res.status(201).json(r.data);
});

tracksRouter.get('/:trackId/takes/:takeId/audio', (req, res) => {
  if (!isUuid(req.params.trackId) || !isUuid(req.params.takeId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const r = dbSafe(() => {
    const db = getDb();
    const tk = db
      .prepare('SELECT tk.* FROM takes tk JOIN tracks t ON t.id = tk.track_id WHERE tk.id = ? AND t.id = ?')
      .get(req.params.takeId, req.params.trackId);
    return tk;
  });
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  const tk = r.data;
  if (!tk) return res.status(404).json({ error: 'Take not found' });
  if (!isSafeTakeFilename(tk.filename)) return res.status(400).json({ error: 'Invalid file reference' });
  const fp = resolveUnderDir(tracksDir, tk.filename);
  if (!fp || !assertFileExists(fp)) return res.status(404).json({ error: 'File missing' });
  res.setHeader('Content-Type', tk.mime || 'audio/webm');
  fs.createReadStream(fp).pipe(res);
});

/** Legacy: active take audio */
tracksRouter.get('/:trackId/audio', (req, res) => {
  if (!isUuid(req.params.trackId)) return res.status(400).json({ error: 'Invalid track' });
  const r = dbSafe(() => {
    const db = getDb();
    const t = db.prepare('SELECT * FROM tracks WHERE id = ?').get(req.params.trackId);
    if (!t || !t.active_take_id) return null;
    return db.prepare('SELECT * FROM takes WHERE id = ?').get(t.active_take_id);
  });
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  const tk = r.data;
  if (!tk) return res.status(404).json({ error: 'No active take' });
  if (!isSafeTakeFilename(tk.filename)) return res.status(400).json({ error: 'Invalid file reference' });
  const fp = resolveUnderDir(tracksDir, tk.filename);
  if (!fp || !assertFileExists(fp)) return res.status(404).json({ error: 'File missing' });
  res.setHeader('Content-Type', tk.mime || 'audio/webm');
  fs.createReadStream(fp).pipe(res);
});
