/**
 * Heavy export work should move here (queue worker) so HTTP stays fast.
 * Today exports run synchronously in engineService; this module is the hook for a future job runner.
 */
import { v4 as uuidv4 } from 'uuid';

/** @returns {{ jobId: string, status: 'queued' }} */
export function enqueueExportPlaceholder(_payload) {
  return { jobId: uuidv4(), status: 'queued' };
}
