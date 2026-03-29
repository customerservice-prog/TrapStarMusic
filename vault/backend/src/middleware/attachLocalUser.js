/**
 * Placeholder until real auth ships. Gives a stable shape for future ownership checks.
 * All sessions/tracks remain global for single-user / local installs.
 */
export function attachLocalUser(req, _res, next) {
  req.user = { id: 'local', role: 'owner' };
  next();
}
