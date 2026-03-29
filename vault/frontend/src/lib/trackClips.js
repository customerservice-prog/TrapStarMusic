function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** @typedef {{ id: string, kind: 'audio'|'midi', takeId?: string, start: number, duration: number, trimStart?: number, trimEnd?: number, notes?: Array<{ t: number, midi: number, dur: number, vel?: number }> }} TimelineClip */

export function parseClips(track) {
  if (!track?.clips_json) return [];
  try {
    const a = JSON.parse(track.clips_json);
    return Array.isArray(a) ? a.map(normalizeClip).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function normalizeClip(c) {
  if (!c || typeof c !== 'object') return null;
  const id = typeof c.id === 'string' && c.id.length > 4 ? c.id : newId();
  const kind = c.kind === 'midi' ? 'midi' : 'audio';
  const start = clampNum(c.start, 0, 86400);
  const duration = clampNum(c.duration, 0.05, 86400);
  const trimStart = clampNum(c.trimStart ?? 0, 0, duration);
  const trimEnd = clampNum(c.trimEnd ?? 0, 0, duration);
  const takeId = kind === 'audio' && typeof c.takeId === 'string' ? c.takeId : undefined;
  const notes = kind === 'midi' && Array.isArray(c.notes) ? c.notes.map(normalizeNote).filter(Boolean) : [];
  return { id, kind, takeId, start, duration, trimStart, trimEnd, notes };
}

function normalizeNote(n) {
  if (!n || typeof n !== 'object') return null;
  const t = clampNum(n.t, 0, 86400);
  const midi = Math.round(clampNum(n.midi, 0, 127));
  const dur = clampNum(n.dur, 0.02, 20);
  const vel = n.vel != null ? clampNum(n.vel, 0.05, 1) : 0.75;
  return { t, midi, dur, vel };
}

function clampNum(v, a, b) {
  const n = Number(v);
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}

export function clipsToJson(arr) {
  const list = Array.isArray(arr) ? arr.map(normalizeClip).filter(Boolean) : [];
  return JSON.stringify(list.slice(0, 64));
}

export function defaultAudioClip(takeId, durationSec) {
  const d = Math.max(0.2, Math.min(600, durationSec || 4));
  return {
    id: newId(),
    kind: 'audio',
    takeId,
    start: 0,
    duration: d,
    trimStart: 0,
    trimEnd: 0,
  };
}

export function defaultMidiClip(startSec = 0, durationSec = 4) {
  return {
    id: newId(),
    kind: 'midi',
    start: Math.max(0, startSec),
    duration: Math.max(0.5, durationSec),
    notes: [
      { t: 0, midi: 60, dur: 0.25, vel: 0.7 },
      { t: 0.5, midi: 64, dur: 0.25, vel: 0.65 },
      { t: 1, midi: 67, dur: 0.25, vel: 0.65 },
    ],
  };
}
