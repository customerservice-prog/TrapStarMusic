import fs from 'fs';
import { sendOk } from '../lib/httpResponse.js';
import { getDb } from '../models/db.js';
import { env } from '../config/env.js';
import { ensureDataTree } from '../services/storageService.js';

export function health(_req, res) {
  let database = false;
  let storage = false;
  try {
    getDb().prepare('SELECT 1').get();
    database = true;
  } catch {
    database = false;
  }
  try {
    ensureDataTree();
    fs.accessSync(env.paths.tracksDir, fs.constants.W_OK);
    fs.accessSync(env.paths.beatsDir, fs.constants.W_OK);
    storage = true;
  } catch {
    storage = false;
  }
  const healthy = database && storage;
  const time = new Date().toISOString();
  if (!healthy) {
    res.status(503).json({
      ok: false,
      error: {
        code: 'SERVICE_DEGRADED',
        message: 'Database or storage is not ready.',
      },
      data: { healthy: false, database, storage, service: 'rap-factory-backend', time },
    });
    return;
  }
  sendOk(res, {
    healthy: true,
    database,
    storage,
    service: 'rap-factory-backend',
    time,
  });
}
