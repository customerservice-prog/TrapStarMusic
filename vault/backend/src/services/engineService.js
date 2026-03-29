import fs from 'fs';
import path from 'path';
import { runDb } from '../lib/runDb.js';
import { AppError } from '../lib/errors.js';
import { safeBuildChain, getLatestBeatAnalysis, applyVibeToChain } from './smartEngine.js';
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
  zipAudioFiles,
} from './exportAudio.js';
import { getBeatsDir, getTracksDir } from './storageService.js';

export function getVoiceProfile() {
  return runDb((db) => db.prepare('SELECT * FROM voice_profile WHERE id = 1').get());
}

export function resetVoiceProfile() {
  return runDb((db) => {
    db.prepare(
      `UPDATE voice_profile SET
        tune_strength = 0.5, reverb_level = 0.35, compression = 0.5,
        saturation = 0.25, adlib_width = 0.4, sessions_trained = 0, takes_trained = 0,
        updated_at = datetime('now') WHERE id = 1`
    ).run();
    return db.prepare('SELECT * FROM voice_profile WHERE id = 1').get();
  });
}

export function chainPreview(body) {
  const { sessionId, vibe, trackLayer } = body || {};
  if (sessionId != null && sessionId !== '' && !isUuid(sessionId)) {
    throw AppError.badRequest('VALIDATION_FAILED', 'Invalid sessionId');
  }
  const layer =
    trackLayer === 'adlib' || trackLayer === 'double' || trackLayer === 'harmony' ? trackLayer : 'main';
  return runDb((db) => {
    const voiceProfile = db.prepare('SELECT * FROM voice_profile WHERE id = 1').get();
    const beatAnalysis =
      (sessionId && getLatestBeatAnalysis(sessionId)) || {
        character: 'melodic',
        mid_density: 'medium',
        bass_intensity: 'medium',
        arrangement: 'open',
      };
    let inputSource = null;
    if (sessionId) {
      const row = db.prepare('SELECT input_source FROM sessions WHERE id = ?').get(sessionId);
      inputSource = row?.input_source ?? 'phone';
    }
    const base = safeBuildChain({
      beatAnalysis,
      vocalClass: { layer, energy: 0.1, peak: -14 },
      voiceProfile,
      trackRole: layer,
      inputSource,
    });
    return applyVibeToChain(base, vibe);
  });
}

export async function runDiagnostics(clientBody) {
  const checks = [];
  const body = clientBody && typeof clientBody === 'object' ? clientBody : {};
  const tracksDir = getTracksDir();
  const beatsDir = getBeatsDir();

  const dbOk = (() => {
    try {
      runDb((db) => db.prepare('SELECT 1').get());
      return true;
    } catch {
      return false;
    }
  })();
  checks.push({
    id: 'database',
    label: 'Database',
    ok: dbOk,
    detail: dbOk ? 'Your project data is connected.' : 'Something is wrong with saved data — try restarting the app.',
  });

  let ffmpegOk = false;
  try {
    ffmpegOk = await checkFfmpegAvailable();
  } catch {
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
  } catch {
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

  return { checks, allPassed: checks.filter((c) => c.id !== 'headphones').every((c) => c.ok) };
}

export function listRecentDecisions(limitRaw) {
  const limit = Math.min(50, Math.max(1, parseInt(String(limitRaw || '8'), 10) || 8));
  const rows = runDb((db) =>
    db
      .prepare(
        `SELECT id, session_id, decision_type, payload_json, created_at FROM engine_decisions
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(limit)
  );
  return rows.map((row) => {
    let payload = {};
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      /* */
    }
    return { ...row, payload };
  });
}

export function listSessionDecisions(sessionId) {
  if (!isUuid(sessionId)) throw AppError.badRequest('VALIDATION_FAILED', 'Invalid session id');
  const rows = runDb((db) =>
    db
      .prepare(
        `SELECT id, decision_type, payload_json, created_at FROM engine_decisions
         WHERE session_id = ? ORDER BY created_at DESC LIMIT 100`
      )
      .all(sessionId)
  );
  return rows.map((row) => {
    let payload = {};
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      payload = {};
    }
    return { ...row, payload };
  });
}

function safeStemLabel(label, id) {
  const s = String(label || 'track')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 48);
  return `${s || 'track'}_${id}`;
}

function isExportDownloadFilename(base) {
  return (
    /^RAPFACTORY_[A-Z0-9_]+_[A-Z0-9_]+_\d{8}T\d{6}Z\.(wav|zip)$/i.test(base) ||
    /^VAULT_[A-Z0-9_]+_[A-Z0-9_]+_\d{8}T\d{6}Z\.(wav|zip)$/i.test(base) ||
    /^vault-[a-z-]+-[a-f0-9-]{8,}\.wav$/i.test(base)
  );
}

/**
 * @returns {Promise<Record<string, unknown>>} Export payload (download URLs, notes) — no outer `ok`; envelope added by controller.
 */
export async function exportSession(sessionId, mode) {
  if (!sessionId || !isUuid(sessionId)) {
    throw AppError.badRequest('VALIDATION_FAILED', 'sessionId required');
  }
  const exportMode = mode === 'full' ? 'full' : mode === 'stems' ? 'stems' : 'acapella';
  const tracksDir = getTracksDir();
  const beatsDir = getBeatsDir();

  try {
    runDb((db) => {
      insertSessionSnapshot(db, sessionId, 'pre-export');
      return true;
    });
  } catch (e) {
    log.warn('pre-export snapshot skipped', { message: e?.message });
  }

  const { session, files } = runDb((db) => {
    const sessionRow = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    const tracks = db.prepare('SELECT * FROM tracks WHERE session_id = ?').all(sessionId);
    const list = [];
    for (const t of tracks) {
      if (!t.active_take_id) continue;
      const tk = db.prepare('SELECT * FROM takes WHERE id = ?').get(t.active_take_id);
      if (!tk || !isSafeTakeFilename(tk.filename)) continue;
      const fp = resolveUnderDir(tracksDir, tk.filename);
      if (fp && assertFileExists(fp)) {
        list.push({
          path: fp,
          id: t.id,
          label: t.label,
          track_type: t.track_type,
          take: tk,
        });
      }
    }
    return { session: sessionRow, files: list };
  });

  if (!files.length) {
    throw AppError.badRequest('EXPORT_NOT_READY', 'No vocal takes to export', {
      fallback: true,
      message:
        'Record at least one take, or download raw stems from the track list when available.',
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
      ffmpeg: false,
      downloadUrl: `/api/engine/download/${rel}`,
      suggestedFilename: rel,
      exportNote: 'Stem pack (ZIP). Import into your DAW.',
    };
  };

  if (exportMode === 'stems') {
    try {
      return await tryZip('STEMS');
    } catch (err) {
      log.error('export zip failed', { message: err.message, sessionId });
      throw AppError.internal('ZIP export failed', 'EXPORT_FAILED', { detail: err.message, fallback: true });
    }
  }

  if (!ffmpegOk) {
    try {
      const payload = await tryZip(exportMode === 'full' ? 'FULL_VOCALS_ZIP' : 'ACAPELLA_ZIP');
      return {
        ...payload,
        exportNote:
          exportMode === 'full'
            ? 'FFmpeg unavailable — vocal stems in ZIP. Add beat in your DAW.'
            : 'FFmpeg unavailable — vocal stems in ZIP (acapella pack).',
      };
    } catch (err) {
      log.error('export zip fallback failed', { message: err.message, sessionId });
      throw AppError.internal('Export failed', 'EXPORT_FAILED', {
        detail: err.message,
        fallback: true,
        stems: files.map((f) => ({
          trackId: f.id,
          url: `/api/tracks/${f.id}/audio`,
        })),
      });
    }
  }

  const vocalPaths = files.map((f) => f.path);

  try {
    if (exportMode === 'acapella') {
      const outPath = vaultExportPath(sessionName, 'ACAPELLA', 'wav');
      await mixToWav(vocalPaths, outPath);
      const rel = path.basename(outPath);
      return {
        ffmpeg: true,
        downloadUrl: `/api/engine/download/${rel}`,
        suggestedFilename: rel,
        exportNote: 'Acapella mix (all active vocal takes).',
      };
    }

    const beatRel = session?.beat_filename;
    const beatPath = beatRel ? resolveUnderDir(beatsDir, beatRel.replace(/^\//, '')) : null;
    const hasBeat = beatPath && assertFileExists(beatPath);

    if (hasBeat) {
      const outPath = vaultExportPath(sessionName, 'FULL_MIX', 'wav');
      await mixBeatAndVocals(beatPath, vocalPaths, outPath);
      const rel = path.basename(outPath);
      return {
        ffmpeg: true,
        downloadUrl: `/api/engine/download/${rel}`,
        suggestedFilename: rel,
        exportNote: 'Full rough mix (beat + vocals).',
      };
    }

    const outPath = vaultExportPath(sessionName, 'FULL_VOCALS_ONLY_MIXDOWN', 'wav');
    await mixToWav(vocalPaths, outPath);
    const rel = path.basename(outPath);
    return {
      ffmpeg: true,
      downloadUrl: `/api/engine/download/${rel}`,
      suggestedFilename: rel,
      exportNote:
        'No beat in this session — vocals-only mixdown. Drop the beat in your DAW to finish the record.',
    };
  } catch (err) {
    log.error('export mix failed', { message: err.message, sessionId });
    throw AppError.internal('Export mix failed', 'EXPORT_FAILED', { detail: err.message, fallback: true });
  }
}

export function streamExportDownload(basename, res) {
  const base = path.basename(basename);
  if (!isExportDownloadFilename(base)) {
    throw AppError.badRequest('VALIDATION_FAILED', 'Invalid file');
  }
  const fp = resolveUnderDir(getExportsDir(), base);
  if (!assertFileExists(fp)) throw AppError.notFound('FILE_NOT_FOUND', 'Expired or missing');
  const isZip = base.toLowerCase().endsWith('.zip');
  res.setHeader('Content-Type', isZip ? 'application/zip' : 'audio/wav');
  res.setHeader('Content-Disposition', `attachment; filename="${base}"`);
  fs.createReadStream(fp).pipe(res);
}
