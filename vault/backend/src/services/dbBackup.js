import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');
const dbPath = path.join(dataDir, 'vault.db');
const backupsDir = path.join(dataDir, 'backups');
const MAX_BACKUPS = 10;

let backupTimer = null;

function ensureBackupsDir() {
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
}

export function rotateBackupsNow() {
  if (!fs.existsSync(dbPath)) return;
  ensureBackupsDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupsDir, `vault-${stamp}.db`);
  try {
    fs.copyFileSync(dbPath, dest);
    const files = fs
      .readdirSync(backupsDir)
      .filter((f) => /^vault-.*\.db$/i.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    while (files.length > MAX_BACKUPS) {
      const drop = files.pop();
      try {
        fs.unlinkSync(path.join(backupsDir, drop.f));
      } catch (e) {
        log.warn('backup prune failed', { file: drop.f, message: e.message });
      }
    }
    log.debug('database backup written', { dest: path.basename(dest) });
  } catch (e) {
    log.error('database backup failed', { message: e.message });
  }
}

/** Debounced so bursts of writes create one backup */
export function scheduleRotatingBackup() {
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    backupTimer = null;
    rotateBackupsNow();
  }, 8000);
}

/**
 * If primary DB file is unreadable, copy newest backup over vault.db
 * @returns {boolean} whether a file was restored
 */
export function restoreLatestBackupIfNeeded() {
  ensureBackupsDir();
  if (!fs.existsSync(backupsDir)) return false;
  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => /^vault-.*\.db$/i.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) return false;
  const src = path.join(backupsDir, files[0].f);
  try {
    fs.copyFileSync(src, dbPath);
    log.warn('database restored from backup', { from: files[0].f });
    return true;
  } catch (e) {
    log.error('database restore failed', { message: e.message });
    return false;
  }
}
