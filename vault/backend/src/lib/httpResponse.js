import { env } from '../config/env.js';

/**
 * Standard JSON success envelope.
 * @param {import('express').Response} res
 * @param {unknown} data
 * @param {number} [status]
 * @param {Record<string, unknown>} [meta]
 */
export function sendOk(res, data, status = 200, meta) {
  const body = { ok: true, data };
  if (meta != null && typeof meta === 'object') body.meta = meta;
  res.status(status).json(body);
}

/**
 * Standard JSON error envelope (usually called from errorHandler).
 */
export function sendErrorEnvelope(res, httpStatus, code, message, details) {
  const err = { code, message };
  if (details != null && typeof details === 'object' && !env.hideErrorDetails) {
    err.details = details;
  }
  res.status(httpStatus).json({ ok: false, error: err });
}
