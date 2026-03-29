const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_RE = /^[A-G][#b]?m?$/i;
const INPUT_SOURCES = new Set(['phone', 'budget', 'studio']);

export function isUuid(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

export function validateSessionCreate(body) {
  const err = (msg) => ({ ok: false, error: msg });
  if (!body || typeof body !== 'object') return err('Invalid body');
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 120) return err('Name must be 1–120 characters');
  let bpm = body.bpm;
  if (bpm != null && bpm !== '') {
    const n = Number(bpm);
    if (!Number.isFinite(n) || n < 40 || n > 200) return err('BPM must be between 40 and 200');
    bpm = n;
  } else bpm = null;
  let musical_key = body.musical_key;
  if (musical_key != null && musical_key !== '') {
    if (typeof musical_key !== 'string' || musical_key.length > 12) return err('Key is invalid');
    if (!KEY_RE.test(musical_key.trim())) return err('Key format should look like C, Am, F#');
    musical_key = musical_key.trim();
  } else musical_key = null;
  const genre =
    body.genre == null || body.genre === ''
      ? null
      : String(body.genre).trim().slice(0, 64) || null;
  const beat_label =
    body.beat_label == null || body.beat_label === ''
      ? null
      : String(body.beat_label).trim().slice(0, 120) || null;
  let input_source = null;
  if (body.input_source != null && body.input_source !== '') {
    const is = String(body.input_source).trim().toLowerCase();
    if (!INPUT_SOURCES.has(is)) return err('input_source must be phone, budget, or studio');
    input_source = is;
  }
  return { ok: true, data: { name, bpm, musical_key, genre, beat_label, input_source } };
}

export function validateSessionPatch(body) {
  const err = (msg) => ({ ok: false, error: msg });
  if (!body || typeof body !== 'object') return err('Invalid body');
  const out = {};
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > 120) return err('Name must be 1–120 characters');
    out.name = name;
  }
  if (body.bpm !== undefined) {
    if (body.bpm === null || body.bpm === '') out.bpm = null;
    else {
      const n = Number(body.bpm);
      if (!Number.isFinite(n) || n < 40 || n > 200) return err('BPM must be between 40 and 200');
      out.bpm = n;
    }
  }
  if (body.musical_key !== undefined) {
    if (body.musical_key === null || body.musical_key === '') out.musical_key = null;
    else {
      const k = String(body.musical_key).trim();
      if (k.length > 12 || !KEY_RE.test(k)) return err('Key format is invalid');
      out.musical_key = k;
    }
  }
  if (body.genre !== undefined) {
    out.genre =
      body.genre == null || body.genre === '' ? null : String(body.genre).trim().slice(0, 64) || null;
  }
  if (body.beat_label !== undefined) {
    out.beat_label =
      body.beat_label == null || body.beat_label === ''
        ? null
        : String(body.beat_label).trim().slice(0, 120) || null;
  }
  if (body.punch_in_start !== undefined) {
    const v = Number(body.punch_in_start);
    if (!Number.isFinite(v) || v < 0) return err('punch_in_start invalid');
    out.punch_in_start = v;
  }
  if (body.punch_in_end !== undefined) {
    const v = Number(body.punch_in_end);
    if (!Number.isFinite(v) || v < 0) return err('punch_in_end invalid');
    out.punch_in_end = v;
  }
  if (body.input_source !== undefined) {
    if (body.input_source === null || body.input_source === '') out.input_source = null;
    else {
      const is = String(body.input_source).trim().toLowerCase();
      if (!INPUT_SOURCES.has(is)) return err('input_source must be phone, budget, or studio');
      out.input_source = is;
    }
  }
  return { ok: true, data: out };
}

export function validateTrackPatch(body) {
  const err = (msg) => ({ ok: false, error: msg });
  if (!body || typeof body !== 'object') return err('Invalid body');
  const out = {};
  if (body.label !== undefined) {
    out.label = String(body.label || 'Vocal').trim().slice(0, 120) || 'Vocal';
  }
  if (body.sort_order !== undefined) {
    const n = parseInt(String(body.sort_order), 10);
    if (!Number.isFinite(n) || n < 0 || n > 9999) return err('sort_order invalid');
    out.sort_order = n;
  }
  if (body.active_take_id !== undefined) {
    if (body.active_take_id === null) out.active_take_id = null;
    else if (!isUuid(body.active_take_id)) return err('active_take_id invalid');
    else out.active_take_id = body.active_take_id;
  }
  if (body.chain_snapshot !== undefined) {
    if (typeof body.chain_snapshot !== 'string' || body.chain_snapshot.length > 500_000) {
      return err('chain_snapshot too large');
    }
    out.chain_snapshot = body.chain_snapshot;
  }
  if (body.volume !== undefined) {
    const v = Number(body.volume);
    if (!Number.isFinite(v) || v < 0 || v > 1) return err('volume must be between 0 and 1');
    out.volume = v;
  }
  if (body.muted !== undefined) {
    out.muted = !!body.muted;
  }
  return { ok: true, data: out };
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/** Normalize client take metadata — never trust the wire */
export function normalizeTakeMetadata(raw) {
  let meta = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) meta = raw;
  const durationMs = meta.durationMs != null ? clamp(parseInt(String(meta.durationMs), 10) || 0, 0, 3_600_000) : null;
  const energyRms =
    meta.energyRms != null && Number.isFinite(Number(meta.energyRms))
      ? clamp(Number(meta.energyRms), 0, 2)
      : null;
  const peakDb =
    meta.peakDb != null && Number.isFinite(Number(meta.peakDb))
      ? clamp(Number(meta.peakDb), -120, 0)
      : null;
  const timingScore =
    meta.timingScore != null && Number.isFinite(Number(meta.timingScore))
      ? clamp(Number(meta.timingScore), 0, 1)
      : null;
  return { durationMs, energyRms, peakDb, timingScore };
}

const TRACK_TYPES = new Set(['main', 'double', 'adlib', 'harmony']);

export function sanitizeTrackType(t) {
  const s = typeof t === 'string' ? t.trim().toLowerCase() : 'main';
  return TRACK_TYPES.has(s) ? s : 'main';
}

export function validateSnapshotLabel(label) {
  const s = typeof label === 'string' ? label.trim().slice(0, 80) : 'autosave';
  return s || 'autosave';
}
