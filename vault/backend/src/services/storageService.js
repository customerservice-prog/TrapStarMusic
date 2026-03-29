import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { resolveUnderDir, assertFileExists, isSafeTakeFilename } from '../lib/safePaths.js';
import { getExportsDir } from './exportAudio.js';

export function ensureDataTree() {
  const { dataDir, beatsDir, tracksDir } = env.paths;
  for (const d of [dataDir, beatsDir, tracksDir]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

export function getBeatsDir() {
  return env.paths.beatsDir;
}

export function getTracksDir() {
  return env.paths.tracksDir;
}

export function ensureBeatSessionDir(sessionId) {
  const dir = path.join(getBeatsDir(), sessionId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveBeatFile(relFromDb) {
  const rel = String(relFromDb || '').replace(/^\//, '');
  return resolveUnderDir(getBeatsDir(), rel);
}

export function resolveTrackTakeFile(filename) {
  if (!isSafeTakeFilename(filename)) return null;
  return resolveUnderDir(getTracksDir(), filename);
}

export function deleteFileIfExists(fp) {
  if (!fp) return;
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch {
    /* best effort */
  }
}

export function beatFileExists(relFromDb) {
  const fp = resolveBeatFile(relFromDb);
  return !!(fp && assertFileExists(fp));
}

export function exportFilePath(basename) {
  return resolveUnderDir(getExportsDir(), basename);
}
