import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exportsDir = path.join(__dirname, '../../../data/exports');

function ensureExportsDir() {
  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });
}

function sanitizeSessionName(name) {
  return String(name || 'SESSION')
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
}

function exportTimestamp() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${mo}${day}T${h}${m}${s}Z`;
}

/**
 * VAULT_{SESSION_NAME}_{EXPORT_TYPE}_{TIMESTAMP}.wav|.zip
 */
export function vaultExportBasename(sessionName, exportType, ext = 'wav') {
  const safe = sanitizeSessionName(sessionName);
  const type = String(exportType || 'EXPORT').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  const ts = exportTimestamp();
  return `VAULT_${safe}_${type}_${ts}.${ext.replace(/^\./, '')}`;
}

export function vaultExportPath(sessionName, exportType, ext = 'wav') {
  ensureExportsDir();
  return path.join(exportsDir, vaultExportBasename(sessionName, exportType, ext));
}

export function checkFfmpegAvailable() {
  return new Promise((resolve) => {
    ffmpeg.getAvailableEncoders((err, enc) => {
      resolve(!err && enc && Object.keys(enc).length > 0);
    });
  });
}

/**
 * Mix multiple WAV/webm files to one WAV using ffmpeg amix.
 * @param {string[]} inputPaths absolute paths
 * @param {string} outPath absolute output path
 */
export function mixToWav(inputPaths, outPath) {
  return new Promise((resolve, reject) => {
    if (!inputPaths.length) {
      reject(new Error('No audio inputs'));
      return;
    }
    ensureExportsDir();
    const cmd = ffmpeg();
    inputPaths.forEach((p) => cmd.input(p));
    if (inputPaths.length === 1) {
      cmd
        .outputOptions(['-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2'])
        .on('end', () => resolve(outPath))
        .on('error', reject)
        .save(outPath);
      return;
    }
    const n = inputPaths.length;
    const filter = `amix=inputs=${n}:duration=longest:dropout_transition=2`;
    cmd
      .complexFilter(filter)
      .outputOptions(['-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2'])
      .on('end', () => resolve(outPath))
      .on('error', reject)
      .save(outPath);
  });
}

export function newExportFilename(prefix) {
  ensureExportsDir();
  return path.join(exportsDir, `${prefix}-${uuid().slice(0, 8)}.wav`);
}

/**
 * Mix beat + N vocal files to stereo WAV (ffmpeg amix).
 */
export function mixBeatAndVocals(beatPath, vocalPaths, outPath) {
  return new Promise((resolve, reject) => {
    if (!beatPath || !fs.existsSync(beatPath)) {
      reject(new Error('Beat file missing'));
      return;
    }
    const vocals = vocalPaths.filter((p) => p && fs.existsSync(p));
    if (!vocals.length) {
      reject(new Error('No vocal files'));
      return;
    }
    ensureExportsDir();
    const cmd = ffmpeg();
    cmd.input(beatPath);
    vocals.forEach((p) => cmd.input(p));
    const n = vocals.length + 1;
    const filter = `amix=inputs=${n}:duration=longest:dropout_transition=2`;
    cmd
      .complexFilter(filter)
      .outputOptions(['-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2'])
      .on('end', () => resolve(outPath))
      .on('error', reject)
      .save(outPath);
  });
}

/**
 * @param {{ path: string, name: string }[]} entries — name = entry path inside zip
 */
export function zipAudioFiles(entries, outPath) {
  return new Promise((resolve, reject) => {
    if (!entries.length) {
      reject(new Error('No files to zip'));
      return;
    }
    ensureExportsDir();
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', () => resolve(outPath));
    archive.on('error', reject);
    archive.pipe(output);
    for (const ent of entries) {
      if (fs.existsSync(ent.path)) {
        archive.file(ent.path, { name: ent.name });
      }
    }
    archive.finalize();
  });
}

export function getExportsDir() {
  ensureExportsDir();
  return exportsDir;
}
