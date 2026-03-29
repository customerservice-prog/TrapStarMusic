const BASE = '';

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

export async function listSessions() {
  const res = await fetch(`${BASE}/api/sessions`);
  return parseJson(res);
}

export async function createSession(body) {
  const res = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function getSession(id) {
  const res = await fetch(`${BASE}/api/sessions/${id}`);
  return parseJson(res);
}

export async function deleteSession(id) {
  const res = await fetch(`${BASE}/api/sessions/${id}`, { method: 'DELETE' });
  return parseJson(res);
}

export async function patchSession(id, body) {
  const res = await fetch(`${BASE}/api/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function uploadBeat(sessionId, file) {
  const fd = new FormData();
  fd.append('beat', file);
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/beat`, { method: 'POST', body: fd });
  return parseJson(res);
}

export function beatFileUrl(sessionId) {
  return `${BASE}/api/sessions/${sessionId}/beat/file`;
}

export async function saveSnapshot(sessionId, label = 'autosave') {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  return parseJson(res);
}

export async function listVersions(sessionId) {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/versions`);
  return parseJson(res);
}

export async function restoreVersion(sessionId, versionId) {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ versionId }),
  });
  return parseJson(res);
}

export async function listTracks(sessionId) {
  const res = await fetch(`${BASE}/api/tracks/session/${sessionId}`);
  return parseJson(res);
}

export async function createTrack(sessionId, body) {
  const res = await fetch(`${BASE}/api/tracks/session/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function patchTrack(trackId, body) {
  const res = await fetch(`${BASE}/api/tracks/${trackId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function deleteTrack(trackId) {
  const res = await fetch(`${BASE}/api/tracks/${trackId}`, { method: 'DELETE' });
  return parseJson(res);
}

export async function uploadTake(trackId, blob, metadata, filename = 'take.webm', timeoutMs = 180000) {
  const fd = new FormData();
  fd.append('audio', blob, filename);
  fd.append('metadata', JSON.stringify(metadata));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/api/tracks/${trackId}/takes`, {
      method: 'POST',
      body: fd,
      signal: ctrl.signal,
    });
    return parseJson(res);
  } catch (e) {
    if (e.name === 'AbortError') {
      return { error: 'Upload timed out — your take is still saved on this device. Try Retry upload.' };
    }
    return { error: e.message || 'Upload failed' };
  } finally {
    clearTimeout(timer);
  }
}

export function trackAudioUrl(trackId) {
  return `${BASE}/api/tracks/${trackId}/audio`;
}

export async function fetchArrayBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) {
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, vibe, trackLayer }),
  });
  return parseJson(res);
}

export async function getVoiceProfile() {
  const res = await fetch(`${BASE}/api/engine/profile`);
  return parseJson(res);
}

export async function resetVoiceProfile() {
  const res = await fetch(`${BASE}/api/engine/profile/reset`, { method: 'POST' });
  return parseJson(res);
}

export async function runDiagnostics(clientMetrics = null) {
  const res = await fetch(`${BASE}/api/engine/diagnostics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clientMetrics && typeof clientMetrics === 'object' ? clientMetrics : {}),
  });
  return parseJson(res);
}

export async function getEngineDecisions(sessionId) {
  const res = await fetch(`${BASE}/api/engine/decisions/${sessionId}`);
  return parseJson(res);
}

export async function getRecentDecisions(limit = 8) {
  const res = await fetch(`${BASE}/api/engine/decisions/recent?limit=${limit}`);
  return parseJson(res);
}

export async function exportSession(sessionId, mode = 'acapella') {
  const res = await fetch(`${BASE}/api/engine/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, mode }),
  });
  return parseJson(res);
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId }),
  });
  return parseJson(res);
}
