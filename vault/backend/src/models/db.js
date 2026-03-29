import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { scheduleRotatingBackup, restoreLatestBackupIfNeeded } from '../services/dbBackup.js';
import { log } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');
const dbPath = path.join(dataDir, 'vault.db');

let SQL;
let rawDb;
let persistTimer;

function ensureDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function persist() {
  if (!rawDb) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      ensureDir();
      const data = rawDb.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    } catch (err) {
      console.error('[db] persist failed:', err.message);
    }
  }, 100);
}

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  run(...params) {
    try {
      this.db.run(this.sql, params);
      persist();
    } catch (e) {
      throw e;
    }
  }

  get(...params) {
    const stmt = this.db.prepare(this.sql);
    stmt.bind(params);
    if (!stmt.step()) {
      stmt.free();
      return undefined;
    }
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }

  all(...params) {
    const stmt = this.db.prepare(this.sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }
}

class DatabaseWrapper {
  constructor(db) {
    this._db = db;
  }

  exec(sql) {
    this._db.exec(sql);
    persist();
  }

  pragma(s) {
    try {
      this._db.exec(`PRAGMA ${s}`);
    } catch (_) {}
  }

  prepare(sql) {
    return new Statement(this._db, sql);
  }
}

let wrapper;

function openDatabaseFromPath(SQL, filePath) {
  const buf = fs.readFileSync(filePath);
  return new SQL.Database(new Uint8Array(buf));
}

export async function initDb() {
  if (wrapper) return wrapper;
  try {
    ensureDir();
    SQL = await initSqlJs();
    let db;
    if (fs.existsSync(dbPath)) {
      try {
        db = openDatabaseFromPath(SQL, dbPath);
      } catch (primaryErr) {
        log.error('db primary file unreadable', { message: primaryErr.message });
        if (restoreLatestBackupIfNeeded()) {
          db = openDatabaseFromPath(SQL, dbPath);
        } else {
          throw primaryErr;
        }
      }
    } else {
      db = new SQL.Database();
    }
    rawDb = db;
    wrapper = new DatabaseWrapper(db);
    initSchema(wrapper);
    persist();
    return wrapper;
  } catch (err) {
    log.error('Failed to open database', { message: err.message });
    throw new Error(
      'Database could not be opened. Check disk permissions or restore from backup.'
    );
  }
}

export function getDb() {
  if (!wrapper) {
    throw new Error('Database not initialized. Call await initDb() first.');
  }
  return wrapper;
}

function initSchema(database) {
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      bpm REAL,
      musical_key TEXT,
      genre TEXT,
      beat_label TEXT,
      beat_filename TEXT,
      beat_mime TEXT,
      beat_uploaded_at TEXT,
      punch_in_start REAL,
      punch_in_end REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      label TEXT,
      track_type TEXT DEFAULT 'main',
      sort_order INTEGER DEFAULT 0,
      active_take_id TEXT,
      chain_snapshot TEXT,
      feedback_grade TEXT,
      feedback_text TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS takes (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime TEXT,
      duration_ms INTEGER,
      energy_score REAL,
      timing_score REAL,
      metadata_json TEXT,
      timeline_start_sec REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS engine_decisions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      decision_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS version_history (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      label TEXT,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS voice_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      tune_strength REAL DEFAULT 0.5,
      reverb_level REAL DEFAULT 0.35,
      compression REAL DEFAULT 0.5,
      saturation REAL DEFAULT 0.25,
      adlib_width REAL DEFAULT 0.4,
      sessions_trained INTEGER DEFAULT 0,
      takes_trained INTEGER DEFAULT 0,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_session ON tracks(session_id);
    CREATE INDEX IF NOT EXISTS idx_takes_track ON takes(track_id);
    CREATE INDEX IF NOT EXISTS idx_decisions_session ON engine_decisions(session_id);
    CREATE INDEX IF NOT EXISTS idx_versions_session ON version_history(session_id);
  `);

  const row = database.prepare('SELECT id FROM voice_profile WHERE id = 1').get();
  if (!row) {
    database
      .prepare(
        `INSERT INTO voice_profile (id, tune_strength, reverb_level, compression, saturation, adlib_width, sessions_trained, takes_trained, updated_at)
         VALUES (1, 0.5, 0.35, 0.5, 0.25, 0.4, 0, 0, datetime('now'))`
      )
      .run();
  }

  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN punch_in_start REAL`);
  } catch (_) {}
  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN punch_in_end REAL`);
  } catch (_) {}
  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN beat_label TEXT`);
  } catch (_) {}
  try {
    database.exec(`ALTER TABLE tracks ADD COLUMN volume REAL DEFAULT 1`);
  } catch (_) {}
  try {
    database.exec(`ALTER TABLE tracks ADD COLUMN muted INTEGER DEFAULT 0`);
  } catch (_) {}
}

export function dbSafe(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    log.error('db operation', { message: err.message });
    return {
      ok: false,
      error: err.message || 'Database error',
      code: 'DB_ERROR',
    };
  }
}
