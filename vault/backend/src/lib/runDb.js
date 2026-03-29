import { getDb, dbSafe } from '../models/db.js';
import { AppError } from './errors.js';

/** Run a DB callback; on failure throw AppError instead of manual branching. */
export function runDb(fn) {
  const r = dbSafe(() => fn(getDb()));
  if (!r.ok) {
    throw AppError.internal(r.error || 'Database error', 'DATABASE_ERROR');
  }
  return r.data;
}
