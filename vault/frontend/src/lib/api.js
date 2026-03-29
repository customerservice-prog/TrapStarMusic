const BASE = '';

const TOKEN_KEY = 'rapfactory_access_token';

export function getStoredAccessToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAccessToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* */
  }
}

function withJsonAuth() {
  const h = { 'Content-Type': 'application/json' };
  const t = getStoredAccessToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function withAuthHeaders() {
  const h = {};
  const t = getStoredAccessToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parses JSON API responses. Supports `{ ok, data }` / `{ ok, error }` envelope from the RAP FACTORY backend.
 * On success returns `data` only. On failure returns `{ error, code?, ...details }`.
 */
async function parseJson(res) {
  const text = await res.text();
  let parsed = {};
  if (text) {
    try {
      const p = JSON.parse(text);
      parsed = p != null && typeof p === 'object' ? p : { _primitive: p };
    } catch {
      return { error: text.length > 280 ? `${text.slice(0, 280)}…` : text || 'Invalid response' };
    }
  }

  if (parsed && typeof parsed === 'object' && parsed.ok === true && Object.prototype.hasOwnProperty.call(parsed, 'data')) {
    return parsed.data;
  }

  if (parsed && typeof parsed === 'object' && parsed.ok === false && parsed.error) {
    const e = parsed.error;
    const msg = typeof e === 'string' ? e : e.message || 'Request failed';
    const code = typeof e === 'object' && e.code ? e.code : undefined;
    const nested = typeof e === 'object' && e.details && typeof e.details === 'object' ? e.details : {};
    const fromData = parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
    return { error: msg, code, ...nested, ...fromData };
  }

  if (!res.ok) {
    const hasMessage =
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (parsed.error != null || typeof parsed.message === 'string' || typeof parsed.detail === 'string');
    if (!hasMessage) {
      const hint =
        parsed && typeof parsed === 'object' && typeof parsed.detail === 'string'
          ? parsed.detail
          : parsed && typeof parsed === 'object' && typeof parsed.message === 'string'
            ? parsed.message
            : `Something went wrong (${res.status})`;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed, error: hint } : { error: hint };
    }
  }

  return parsed;
}

export async function health() {
  const res = await fetch(`${BASE}/api/health`);
  const data = await parseJson(res);
  const healthy = res.ok && data && data.healthy === true && !data.error;
  return { ok: healthy, status: res.status, data };
}

export async function getPublicConfig() {
  const res = await fetch(`${BASE}/api/config`);
  return parseJson(res);
}

export async function listSessions() {
  const res = await fetch(`${BASE}/api/sessions`, { headers: withAuthHeaders() });
  return parseJson(res);
}

export async function createSession(body) {
  const res = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: withJsonAuth(),
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function getSession(id) {
  const res = await fetch(`${BASE}/api/sessions/${id}`, { headers: withAuthHeaders() });
  return parseJson(res);
}

export async function deleteSession(id) {
  const res = await fetch(`${BASE}/api/sessions/${id}`, { method: 'DELETE', headers: withAuthHeaders() });
  return parseJson(res);
}

export async function patchSession(id, body) {
  const res = await fetch(`${BASE}/api/sessions/${id}`, {
    method: 'PATCH',
    headers: withJsonAuth(),
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function uploadBeat(sessionId, file) {
  const fd = new FormData();
  fd.append('beat', file);
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/beat`, {
    method: 'POST',
    body: fd,
    headers: withAuthHeaders(),
  });
  return parseJson(res);
}

export function beatFileUrl(sessionId) {
  return `${BASE}/api/sessions/${sessionId}/beat/file`;
}

export async function saveSnapshot(sessionId, label = 'autosave') {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/snapshot`, {
    method: 'POST',
    headers: withJsonAuth(),
    body: JSON.stringify({ label }),
  });
  return parseJson(res);
}

export async function listVersions(sessionId) {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/versions`, { headers: withAuthHeaders() });
  return parseJson(res);
}

export async function restoreVersion(sessionId, versionId) {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/restore`, {
    method: 'POST',
    headers: withJsonAuth(),
    body: JSON.stringify({ versionId }),
  });
  return parseJson(res);
}

export async function listTracks(sessionId) {
  const res = await fetch(`${BASE}/api/tracks/session/${sessionId}`, { headers: withAuthHeaders() });
  return parseJson(res);
}

export async function createTrack(sessionId, body) {
  const res = await fetch(`${BASE}/api/tracks/session/${sessionId}`, {
    method: 'POST',
    headers: withJsonAuth(),
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function patchTrack(trackId, body) {
  const res = await fetch(`${BASE}/api/tracks/${trackId}`, {
    method: 'PATCH',
    headers: withJsonAuth(),
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function deleteTrack(trackId) {
  const res = await fetch(`${BASE}/api/tracks/${trackId}`, { method: 'DELETE', headers: withAuthHeaders() });
  return parseJson(res);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Uploads a take. When the backend queues Smart Engine work (default), polls until the take is committed.
 */
export async function uploadTake(trackId, blob, metadata, filename = 'take.webm', timeoutMs = 180000) {
  const fd = new FormData();
  fd.append('audio', blob, filename);
  fd.append('metadata', JSON.stringify(metadata));
  const uploadBudget = Math.min(Math.max(60000, timeoutMs), 300000);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), uploadBudget);
  let first;
  try {
    const res = await fetch(`${BASE}/api/tracks/${trackId}/takes`, {
      method: 'POST',
      body: fd,
      signal: ctrl.signal,
      headers: withAuthHeaders(),
    });
    first = await parseJson(res);
  } catch (e) {
    if (e.name === 'AbortError') {
      return { error: 'Upload timed out — your take is still saved on this device. Try Retry upload.' };
    }
    return { error: e.message || 'Upload failed' };
  } finally {
    clearTimeout(timer);
  }

  if (first?.error) return first;
  if (!first?.jobId) return first;

  const pollDeadline = Date.now() + Math.max(120000, timeoutMs);
  while (Date.now() < pollDeadline) {
    await sleep(500);
    const stRes = await fetch(`${BASE}/api/tracks/jobs/take/${first.jobId}`, { headers: withAuthHeaders() });
    const st = await parseJson(stRes);
    if (st?.error) return st;
    if (st?.status === 'done' && st?.result) return st.result;
    if (st?.status === 'failed') {
      return { error: st.error || 'Take processing failed', message: st.error || 'Take processing failed' };
    }
  }
  return {
    error: 'Take processing timed out — check your connection and retry upload.',
    message: 'Take processing timed out — check your connection and retry upload.',
  };
}

export function trackAudioUrl(trackId) {
  return `${BASE}/api/tracks/${trackId}/audio`;
}

export async function fetchArrayBuffer(url) {
  const res = await fetch(url, { headers: withAuthHeaders() });
  if (!res.ok) {
    const path = typeof url === 'string' ? url : '';
    if (res.status === 404 && path.includes('/beat/file')) {
      throw new Error(
        'Beat audio missing on the server — upload a beat again (built-in library or your own file).'
      );
    }
    if (res.status === 404 && path.includes('/takes/') && path.includes('/audio')) {
      throw new Error('Take audio missing on the server — re-record or restore a version.');
    }
    throw new Error(`Download failed (${res.status}).`);
  }
  return res.arrayBuffer();
}

export function takeAudioUrl(trackId, takeId) {
  return `${BASE}/api/tracks/${trackId}/takes/${takeId}/audio`;
}

export async function chainPreview(sessionId, vibe, trackLayer) {
  const res = await fetch(`${BASE}/api/engine/chain-preview`, {
    method: 'POST',
    headers: withJsonAuth(),
    body: JSON.stringify({ sessionId, vibe, trackLayer }),
  });
  return parseJson(res);
}

export async function getVoiceProfile() {
  const res = await fetch(`${BASE}/api/engine/profile`, { headers: withAuthHeaders() });
  return parseJson(res);
}

export async function resetVoiceProfile() {
  const res = await fetch(`${BASE}/api/engine/profile/reset`, { method: 'POST', headers: withAuthHeaders() });
  return parseJson(res);
}

export async function runDiagnostics(clientMetrics = null) {
  const res = await fetch(`${BASE}/api/engine/diagnostics`, {
    method: 'POST',
    headers: withJsonAuth(),
    body: JSON.stringify(clientMetrics && typeof clientMetrics === 'object' ? clientMetrics : {}),
  });
  return parseJson(res);
}

export async function getEngineDecisions(sessionId) {
  const res = await fetch(`${BASE}/api/engine/decisions/${sessionId}`, { headers: withAuthHeaders() });
  return parseJson(res);
}

export async function getRecentDecisions(limit = 8) {
  const res = await fetch(`${BASE}/api/engine/decisions/recent?limit=${limit}`, { headers: withAuthHeaders() });
  return parseJson(res);
}

/**
 * Starts export; if the backend queues heavy work (default), polls until done or timeout.
 * Set RAPFACTORY_EXPORT_SYNC=1 on the server for immediate inline responses (e2e).
 */
export async function exportSession(sessionId, mode = 'acapella', options = {}) {
  const pollMs = options.pollMs ?? 900;
  const maxWaitMs = options.maxWaitMs ?? 420000;
  const res = await fetch(`${BASE}/api/engine/export`, {
    method: 'POST',
    headers: withJsonAuth(),
    body: JSON.stringify({ sessionId, mode }),
  });
  const first = await parseJson(res);
  if (first?.error) return first;
  if (first?.downloadUrl) return first;
  const jobId = first?.jobId;
  if (!jobId) return first;

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const stRes = await fetch(`${BASE}/api/engine/export-job/${jobId}`, { headers: withAuthHeaders() });
    const st = await parseJson(stRes);
    if (st?.error) return st;
    if (st?.status === 'done' && st?.result) return st.result;
    if (st?.status === 'failed') {
      return {
        error: st.error || 'Export failed',
        message: st.error || 'Export failed',
      };
    }
  }
  return {
    error: 'Export timed out while waiting for the render queue.',
    message: 'Export timed out while waiting for the render queue.',
  };
}

export function triggerBrowserDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function smartComp(trackId) {
  const res = await fetch(`${BASE}/api/tracks/smart-comp`, {
    method: 'POST',
    headers: withJsonAuth(),
    body: JSON.stringify({ trackId }),
  });
  return parseJson(res);
}

export async function loginApi(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: withJsonAuth(),
    body: JSON.stringify({ email, password }),
  });
  return parseJson(res);
}

export async function registerApi(email, password, displayName) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: withJsonAuth(),
    body: JSON.stringify({ email, password, displayName }),
  });
  return parseJson(res);
}

export async function getPortalMe() {
  const res = await fetch(`${BASE}/api/portal/me`, { headers: withAuthHeaders() });
  return parseJson(res);
}

export async function patchPortalMe(body) {
  const res = await fetch(`${BASE}/api/portal/me`, {
    method: 'PATCH',
    headers: withJsonAuth(),
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function getPortalBilling() {
  const res = await fetch(`${BASE}/api/portal/billing`, { headers: withAuthHeaders() });
  return parseJson(res);
}

export async function getPortalUsage() {
  const res = await fetch(`${BASE}/api/portal/usage`, { headers: withAuthHeaders() });
  return parseJson(res);
}

export async function getExportCatalog() {
  const res = await fetch(`${BASE}/api/portal/export-catalog`, { headers: withAuthHeaders() });
  return parseJson(res);
}

export async function createSupportTicket(body) {
  const res = await fetch(`${BASE}/api/portal/support/tickets`, {
    method: 'POST',
    headers: withJsonAuth(),
    body: JSON.stringify(body),
  });
  return parseJson(res);
}
