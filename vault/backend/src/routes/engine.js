import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDb, dbSafe } from '../models/db.js';
import {
  safeBuildChain,
  getLatestBeatAnalysis,
  applyVibeToChain,
} from '../services/smartEngine.js';
import { insertSessionSnapshot } from '../lib/snapshot.js';
import { resolveUnderDir, assertFileExists, isSafeTakeFilename } from '../lib/safePaths.js';
import { isUuid } from '../lib/validation.js';
import { log } from '../lib/logger.js';
import {
  mixToWav,
  checkFfmpegAvailable,
  getExportsDir,
  vaultExportPath,
  mixBeatAndVocals,
  mixBeatAndVocalsWithOffsets,
  mixVocalsWithOffsets,
  zipAudioFiles,
} from '../services/exportAudio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tracksDir = path.join(__dirname, '../../../data/tracks');
const beatsDir = path.join(__dirname, '../../../data/beats');

export const engineRouter = Router();

engineRouter.get('/profile', (_req, res) => {
  const r = dbSafe(() => getDb().prepare('SELECT * FROM voice_profile WHERE id = 1').get());
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  res.json(r.data);
});

engineRouter.post('/profile/reset', (_req, res) => {
  const r = dbSafe(() => {
    const db = getDb();
    db.prepare(
      `UPDATE voice_profile SET
        tune_strength = 0.5, reverb_level = 0.35, compression = 0.5,
        saturation = 0.25, adlib_width = 0.4, sessions_trained = 0, takes_trained = 0,
        updated_at = datetime('now') WHERE id = 1`
    ).run();
    return db.prepare('SELECT * FROM voice_profile WHERE id = 1').get();
  });
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  res.json(r.data);
});

engineRouter.post('/chain-preview', (req, res) => {
  const { sessionId, vibe, trackLayer } = req.body || {};
  if (sessionId != null && sessionId !== '' && !isUuid(sessionId)) {
    return res.status(400).json({ error: 'Invalid sessionId' });
  }
  const layer =
    trackLayer === 'adlib' || trackLayer === 'double' || trackLayer === 'harmony' ? trackLayer : 'main';
  const r = dbSafe(() => {
    const db = getDb();
    const voiceProfile = db.prepare('SELECT * FROM voice_profile WHERE id = 1').get();
    const beatAnalysis =
      (sessionId && getLatestBeatAnalysis(sessionId)) || {
        character: 'melodic',
        mid_density: 'medium',
        bass_intensity: 'medium',
        arrangement: 'open',
      };
    const base = safeBuildChain({
      beatAnalysis,
      vocalClass: { layer, energy: 0.1, peak: -14 },
      voiceProfile,
      trackRole: layer,
    });
    return applyVibeToChain(base, vibe);
  });
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  res.json(r.data);
});

engineRouter.post('/diagnostics', async (req, res) => {
  const checks = [];
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  const dbOk = dbSafe(() => {
    getDb().prepare('SELECT 1').get();
    return true;
  });
  checks.push({
    id: 'database',
    label: 'Database',
    ok: dbOk.ok,
    detail: dbOk.ok ? 'Your project data is connected.' : 'Something is wrong with saved data — try restarting VAULT.',
  });

  let ffmpegOk = false;
  try {
    ffmpegOk = await checkFfmpegAvailable();
  } catch (_) {
    ffmpegOk = false;
  }
  checks.push({
    id: 'ffmpeg',
    label: 'Mix & export',
    ok: ffmpegOk,
    detail: ffmpegOk
      ? 'Ready to bounce full mixes and acapellas.'
      : 'Exports will use ZIP stems until FFmpeg is installed on this computer.',
  });

  let storageOk = true;
  try {
    fs.accessSync(tracksDir, fs.constants.W_OK);
    fs.accessSync(beatsDir, fs.constants.W_OK);
  } catch (_) {
    storageOk = false;
  }
  checks.push({
    id: 'uploads',
    label: 'Storage',
    ok: storageOk,
    detail: storageOk ? 'Room for beats and takes is available.' : 'Cannot write audio files — check folder permissions.',
  });

  const latencyMs = typeof body.latencyMs === 'number' ? body.latencyMs : null;
  if (latencyMs != null) {
    const ok = latencyMs <= 22;
    checks.push({
      id: 'latency',
      label: 'Headphone delay',
      ok,
      detail: ok
        ? `About ${Math.round(latencyMs)}ms — feels natural for most artists.`
        : `About ${Math.round(latencyMs)}ms — use wired headphones and close other heavy tabs for tighter feel.`,
    });
  }

  const micPeak = typeof body.micPeak === 'number' ? body.micPeak : null;
  if (micPeak != null) {
    if (micPeak < 0.03) {
      checks.push({
        id: 'mic_level',
        label: 'Mic level',
        ok: false,
        detail: 'Your voice is very quiet — move closer or turn up the gain on your interface.',
      });
    } else if (micPeak > 0.95) {
      checks.push({
        id: 'mic_level',
        label: 'Mic level',
        ok: false,
        detail: 'Input is very hot — back off the mic a little to avoid distortion.',
      });
    } else {
      checks.push({
        id: 'mic_level',
        label: 'Mic level',
        ok: true,
        detail: 'Level looks healthy for recording.',
      });
    }
  }

  checks.push({
    id: 'headphones',
    label: 'Monitoring tip',
    ok: true,
    detail: 'Wired headphones stop echo and keep timing tight — speakers make punch-ins harder.',
  });

  res.json({ checks, allPassed: checks.filter((c) => c.id !== 'headphones').every((c) => c.ok) });
});

engineRouter.get('/decisions/recent', (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '8'), 10) || 8));
  const r = dbSafe(() =>
    getDb()
      .prepare(
        `SELECT id, session_id, decision_type, payload_json, created_at FROM engine_decisions
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(limit)
  );
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  const rows = r.data.map((row) => {
    let payload = {};
    try {
      payload = JSON.parse(row.payload_json);
    } catch (_) {}
    return { ...row, payload };
  });
  res.json(rows);
});

engineRouter.get('/decisions/:sessionId', (req, res) => {
  const r = dbSafe(() =>
    getDb()
      .prepare(
        `SELECT id, decision_type, payload_json, created_at FROM engine_decisions
         WHERE session_id = ? ORDER BY created_at DESC LIMIT 100`
      )
      .all(req.params.sessionId)
  );
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });
  const rows = r.data.map((row) => ({
    ...row,
    payload: JSON.parse(row.payload_json),
  }));
  res.json(rows);
});

function safeStemLabel(label, id) {
  const s = String(label || 'track')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 48);
  return `${s || 'track'}_${id}`;
}

function isVaultExportFilename(base) {
  return /^VAULT_[A-Z0-9_]+_[A-Z0-9_]+_\d{8}T\d{6}Z\.(wav|zip)$/i.test(base);
}

engineRouter.post('/export', async (req, res) => {
  const { sessionId, mode } = req.body || {};
  if (!sessionId || !isUuid(sessionId)) return res.status(400).json({ error: 'sessionId required' });
  const exportMode = mode === 'full' ? 'full' : mode === 'stems' ? 'stems' : 'acapella';

  const snap = dbSafe(() => {
    const db = getDb();
    insertSessionSnapshot(db, sessionId, 'pre-export');
    return true;
  });
  if (!snap.ok) log.warn('pre-export snapshot skipped', { message: snap.error });

  const r = dbSafe(() => {
    const db = getDb();
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    const tracks = db.prepare('SELECT * FROM tracks WHERE session_id = ?').all(sessionId);
    const files = [];
    for (const t of tracks) {
      if (!t.active_take_id) continue;
      const tk = db.prepare('SELECT * FROM takes WHERE id = ?').get(t.active_take_id);
      if (!tk || !isSafeTakeFilename(tk.filename)) continue;
      const fp = resolveUnderDir(tracksDir, tk.filename);
      if (fp && assertFileExists(fp)) {
        files.push({
          path: fp,
          id: t.id,
          label: t.label,
          track_type: t.track_type,
          take: tk,
        });
      }
    }
    return { session, files };
  });
  if (!r.ok) return res.status(500).json({ error: r.error, code: r.code });

  const { session, files } = r.data;
  if (!files.length) {
    return res.status(400).json({
      error: 'No vocal takes to export',
      fallback: true,
      message: 'Record at least one take, or download raw stems from the track list when available.',
    });
  }

  const sessionName = session?.name || 'SESSION';
  const ffmpegOk = await checkFfmpegAvailable().catch(() => false);

  const zipEntries = files.map((f) => {
    const ext = path.extname(f.take.filename) || '.webm';
    const inner = `${safeStemLabel(f.label, f.id)}_${f.track_type || 'main'}${ext}`;
    return { path: f.path, name: inner };
  });

  const tryZip = async (typeLabel) => {
    const outPath = vaultExportPath(sessionName, typeLabel, 'zip');
    await zipAudioFiles(zipEntries, outPath);
    const rel = path.basename(outPath);
    return {
      ok: true,
      ffmpeg: false,
      downloadUrl: `/api/engine/download/${rel}`,
      suggestedFilename: rel,
      exportNote: 'Stem pack (ZIP). Import into your DAW.',
    };
  };

  if (exportMode === 'stems') {
    try {
      const payload = await tryZip('STEMS');
      return res.json(payload);
    } catch (err) {
      log.error('export zip failed', { message: err.message, sessionId });
      return res.status(500).json({ error: 'ZIP export failed', detail: err.message, fallback: true });
    }
  }

  if (!ffmpegOk) {
    try {
      const payload = await tryZip(exportMode === 'full' ? 'FULL_VOCALS_ZIP' : 'ACAPELLA_ZIP');
      return res.status(200).json({
        ...payload,
        exportNote:
          exportMode === 'full'
            ? 'FFmpeg unavailable — vocal stems in ZIP. Add beat in your DAW.'
            : 'FFmpeg unavailable — vocal stems in ZIP (acapella pack).',
      });
    } catch (err) {
      log.error('export zip fallback failed', { message: err.message, sessionId });
      return res.status(500).json({
        error: 'Export failed',
        detail: err.message,
        stems: files.map((f) => ({
          trackId: f.id,
          url: `/api/tracks/${f.id}/audio`,
        })),
        fallback: true,
      });
    }
  }

  const vocalPaths = files.map((f) => f.path);

  try {
    if (exportMode === 'acapella') {
      const outPath = vaultExportPath(sessionName, 'ACAPELLA', 'wav');
      await mixToWav(vocalPaths, outPath);
      const rel = path.basename(outPath);
      return res.json({
        ok: true,
        ffmpeg: true,
        downloadUrl: `/api/engine/download/${rel}`,
        suggestedFilename: rel,
        exportNote: 'Acapella mix (all active vocal takes).',
      });
    }

    const beatRel = session?.beat_filename;
    const beatPath = beatRel ? resolveUnderDir(beatsDir, beatRel.replace(/^\//, '')) : null;
    const hasBeat = beatPath && assertFileExists(beatPath);

    if (hasBeat) {
      const outPath = vaultExportPath(sessionName, 'FULL_MIX', 'wav');
      await mixBeatAndVocals(beatPath, vocalPaths, outPath);
      const rel = path.basename(outPath);
      return res.json({
        ok: true,
        ffmpeg: true,
        downloadUrl: `/api/engine/download/${rel}`,
        suggestedFilename: rel,
        exportNote: 'Full rough mix (beat + vocals).',
      });
    }

    const outPath = vaultExportPath(sessionName, 'FULL_VOCALS_ONLY_MIXDOWN', 'wav');
    await mixToWav(vocalPaths, outPath);
    const rel = path.basename(outPath);
    return res.json({
      ok: true,
      ffmpeg: true,
      downloadUrl: `/api/engine/download/${rel}`,
      suggestedFilename: rel,
      exportNote: 'No beat file in vault — vocals-only mixdown. Drop the beat in your DAW to finish.',
    });
  } catch (err) {
    log.error('export mix failed', { message: err.message, sessionId });
    return res.status(500).json({
      error: 'Export mix failed',
      detail: err.message,
      fallback: true,
    });
  }
});

engineRouter.get('/download/:filename', (req, res) => {
  const base = path.basename(req.params.filename);
  if (!isVaultExportFilename(base) && !/^vault-[a-z-]+-[a-f0-9-]{8,}\.wav$/i.test(base)) {
    return res.status(400).json({ error: 'Invalid file' });
  }
  const fp = resolveUnderDir(getExportsDir(), base);
  if (!assertFileExists(fp)) return res.status(404).json({ error: 'Expired or missing' });
  const isZip = base.toLowerCase().endsWith('.zip');
  res.setHeader('Content-Type', isZip ? 'application/zip' : 'audio/wav');
  res.setHeader('Content-Disposition', `attachment; filename="${base}"`);
  fs.createReadStream(fp).pipe(res);
});
