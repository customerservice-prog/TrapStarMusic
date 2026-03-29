import { v4 as uuid } from 'uuid';

/**
 * Insert a version_history row (used before risky ops like export).
 */
export function insertSessionSnapshot(db, sessionId, label) {
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!s) return false;
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
  return true;
}
