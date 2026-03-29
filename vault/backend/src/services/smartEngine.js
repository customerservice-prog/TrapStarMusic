import { v4 as uuid } from 'uuid';
import { getDb } from '../models/db.js';
import { log } from '../lib/logger.js';

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function analyzeBeatFromMeta({ bpm, genre, name, beat_label } = {}) {
  const g = (genre || '').toLowerCase();
  const n = ((name || '') + ' ' + (beat_label || '')).toLowerCase();
  let character = 'melodic';
  if (g.includes('drill') || g.includes('hard') || n.includes('dark') || n.includes('drill')) character = 'dark';
  else if (g.includes('trap') && (n.includes('air') || n.includes('sky') || n.includes('melodic'))) character = 'airy';
  else if (g.includes('trap') || g.includes('hip')) character = 'hard';

  const midDensity = bpm > 150 ? 'high' : bpm > 95 ? 'medium' : 'low';
  const bassIntensity = g.includes('phonk') || g.includes('808') ? 'heavy' : 'medium';
  const arrangement = midDensity === 'high' ? 'crowded' : 'open';

  return {
    character,
    mid_density: midDensity,
    bass_intensity: bassIntensity,
    arrangement,
    bpm_hint: bpm || 140,
  };
}

export function classifyVocal({ energyRms, peakDb }) {
  const e = energyRms ?? 0.08;
  const p = peakDb ?? -12;
  let layer = 'main';
  if (e < 0.04 && p < -20) layer = 'adlib';
  else if (e > 0.12) layer = 'double';
  return { layer, energy: e, peak: p };
}

/**
 * Builds the Smart Chain from beat analysis, vocal role, delivery, and learned profile.
 *
 * Trap / hip-hop mix logic (preserved relationships):
 * - Leads (main): upfront, relatively dry, harder compression and limiting so they cut.
 * - Doubles: tucked back, narrower stereo, slightly less comp/limit so they support without competing.
 * - Adlibs: wider, more room and energy in the reverb/width — “expensive” space.
 * - Harmonies: smoother, tighter tune, blended back (lower limit, moderate width).
 * - Aggressive delivery (high energy / hot peaks): more punch comp and presence; less “airy polish.”
 * - Melodic / softer delivery: smoother tuning bias, more air and reverb from profile.
 * - Dark beats: pull brightness (air) back so vocals don’t fight the mood.
 * - Busy / crowded mids: stronger de-ess and EQ carve (higher processor engagement on EQ slot).
 */
export function buildChain({ beatAnalysis, vocalClass, voiceProfile, trackRole }) {
  const ba = beatAnalysis || {};
  const vp = voiceProfile || {};
  const vc = vocalClass || { energy: 0.1, peak: -14 };

  let role = trackRole || vc.layer || 'main';
  if (role === 'midi') role = 'main';
  const isMain = role === 'main';
  const isDouble = role === 'double';
  const isAdlib = role === 'adlib';
  const isHarmony = role === 'harmony';

  const energy = vc.energy ?? 0.1;
  const peak = vc.peak ?? -14;
  // Loud, dense performance reads as “aggressive” for processing bias.
  const aggressive = energy > 0.11 || peak > -10;
  const melodicDelivery = !aggressive;

  const dark = ba.character === 'dark';
  const airy = ba.character === 'airy';
  const busyMids = ba.mid_density === 'high' || ba.arrangement === 'crowded';

  const vpTune = vp.tune_strength ?? 0.5;
  const vpComp = vp.compression ?? 0.5;
  const vpRev = vp.reverb_level ?? 0.35;
  const vpSat = vp.saturation ?? 0.25;
  const vpWidth = vp.adlib_width ?? 0.4;

  let gate = 0.32;
  let eqCarve = 0.48;
  let deess = 0.42;
  let comp = 0.5;
  let sat = 0.22;
  let tune = 0.45;
  let air = 0.38;
  let verb = 0.32;
  let width = 0.35;
  let limit = 0.55;

  if (isMain) {
    gate = 0.38;
    comp = clamp(0.52 + vpComp * 0.28 + (aggressive ? 0.12 : 0), 0, 1);
    limit = clamp(0.62 + vpComp * 0.12, 0, 1);
    verb = clamp(vpRev * 0.75 + (melodicDelivery ? 0.08 : 0), 0, 1);
    width = clamp(vpWidth * 0.45, 0, 1);
    tune = clamp(0.4 + vpTune * 0.35 + (melodicDelivery ? 0.08 : -0.04), 0, 1);
    air = clamp(0.35 + (airy ? 0.14 : 0) + (melodicDelivery ? 0.08 : 0.04) - (dark ? 0.12 : 0), 0, 1);
    sat = clamp(0.2 + vpSat * 0.45 + (aggressive ? 0.12 : 0), 0, 1);
  } else if (isDouble) {
    gate = 0.28;
    comp = clamp(0.38 + vpComp * 0.22, 0, 1);
    limit = clamp(0.42 + vpComp * 0.1, 0, 1);
    verb = clamp(vpRev * 0.55, 0, 1);
    width = clamp(vpWidth * 0.35, 0, 1);
    tune = clamp(0.32 + vpTune * 0.25, 0, 1);
    air = clamp(0.28 - (dark ? 0.08 : 0), 0, 1);
    sat = clamp(0.15 + vpSat * 0.3, 0, 1);
  } else if (isAdlib) {
    gate = 0.22;
    comp = clamp(0.44 + vpComp * 0.18, 0, 1);
    limit = clamp(0.48 + vpComp * 0.08, 0, 1);
    verb = clamp(vpRev * 1.15 + 0.12, 0, 1);
    width = clamp(vpWidth * 1.25 + 0.15, 0, 1);
    tune = clamp(0.36 + vpTune * 0.3, 0, 1);
    air = clamp(0.42 + (melodicDelivery ? 0.1 : 0), 0, 1);
    sat = clamp(0.22 + vpSat * 0.4 + (aggressive ? 0.08 : 0), 0, 1);
  } else if (isHarmony) {
    gate = 0.26;
    comp = clamp(0.4 + vpComp * 0.2, 0, 1);
    limit = clamp(0.4 + vpComp * 0.08, 0, 1);
    verb = clamp(vpRev * 0.95, 0, 1);
    width = clamp(vpWidth * 0.85, 0, 1);
    tune = clamp(0.48 + vpTune * 0.38, 0, 1);
    air = clamp(0.34 + (melodicDelivery ? 0.1 : 0) - (dark ? 0.1 : 0), 0, 1);
    sat = clamp(0.18 + vpSat * 0.35, 0, 1);
  }

  if (busyMids) {
    eqCarve = clamp(eqCarve + 0.18, 0, 1);
    deess = clamp(deess + 0.16, 0, 1);
  } else {
    eqCarve = clamp(eqCarve + 0.06, 0, 1);
  }

  if (dark) {
    air = clamp(air - 0.14, 0, 1);
    eqCarve = clamp(eqCarve + 0.04, 0, 1);
  }

  if (aggressive) {
    comp = clamp(comp + 0.08, 0, 1);
    air = clamp(air + 0.06, 0, 1);
    sat = clamp(sat + 0.06, 0, 1);
  } else {
    tune = clamp(tune + 0.05, 0, 1);
    verb = clamp(verb + 0.06, 0, 1);
    air = clamp(air + 0.05, 0, 1);
  }

  return {
    processors: [
      { id: 'gate', name: 'Smart Gate', value: clamp(gate, 0, 1) },
      { id: 'eq', name: 'Tone EQ', value: clamp(eqCarve, 0, 1) },
      { id: 'deess', name: 'De-Ess', value: clamp(deess, 0, 1) },
      { id: 'comp1', name: 'Punch Comp', value: clamp(comp, 0, 1) },
      { id: 'sat', name: 'Trap Saturation', value: clamp(sat, 0, 1) },
      { id: 'tune', name: 'Tune Assist', value: clamp(tune, 0, 1) },
      { id: 'air', name: 'Air & Presence', value: clamp(air, 0, 1) },
      { id: 'verb', name: 'Space', value: clamp(verb, 0, 1) },
      { id: 'width', name: 'Stereo Width', value: clamp(width, 0, 1) },
      { id: 'limit', name: 'Final Level', value: clamp(limit, 0, 1) },
    ],
    tone: clamp(0.42 + sat * 0.2, 0, 1),
  };
}

const FALLBACK_BEAT = {
  character: 'melodic',
  mid_density: 'medium',
  bass_intensity: 'medium',
  arrangement: 'open',
};

/** Never throw — safe default chain if anything in buildChain goes wrong */
export function safeBuildChain(args) {
  try {
    const chain = buildChain(args);
    const procs = chain.processors || [];
    for (const p of procs) {
      if (typeof p.value === 'number' && (p.value < 0 || p.value > 1 || Number.isNaN(p.value))) {
        throw new Error(`Invalid processor value ${p.id}`);
      }
    }
    const lim = procs.find((p) => p.id === 'limit');
    if (lim && lim.value < 0.25) lim.value = 0.45;
    return chain;
  } catch (e) {
    log.warn('safeBuildChain fallback', { message: e.message });
    return buildChain({
      beatAnalysis: FALLBACK_BEAT,
      vocalClass: { layer: 'main', energy: 0.1, peak: -14 },
      voiceProfile: args?.voiceProfile || {},
      trackRole: 'main',
    });
  }
}

export function takeQualityHints(meta) {
  const e = meta?.energyRms ?? 0;
  const p = meta?.peakDb ?? -20;
  return {
    silenceSuspected: e < 0.018,
    clippingRisk: p > -5 || e > 0.95,
    headphoneBleedSuspected: e > 0.08 && e < 0.22 && p > -18 && p < -8,
  };
}

export function gradeTake({ energyRms, peakDb, timingScore }) {
  const t = timingScore ?? 0.75;
  const e = energyRms ?? 0.1;
  const p = peakDb ?? -14;
  const hot = p > -6 || e > 0.92;
  const quiet = e < 0.04 && p < -28;
  const score = t * 0.5 + clamp(e * 5, 0, 1) * 0.35 + (p > -22 ? 0.15 : 0.05);

  if (hot) {
    return {
      grade: 'Too loud',
      detail: 'Ease off the mic a little so the take stays clean and doesn’t clip.',
    };
  }
  if (quiet) {
    return {
      grade: 'Too quiet',
      detail: 'Move closer or sing louder so Rap Factory has enough level to work with.',
    };
  }
  if (t < 0.5) {
    return {
      grade: 'Tighten the pocket',
      detail: 'Rhythm feels a little loose — lock in with the snare and try once more.',
    };
  }
  if (score > 0.82) return { grade: 'Great take', detail: 'Timing and energy feel locked — that’s a keeper.' };
  if (score > 0.65) return { grade: 'Solid take', detail: 'Nice work — another pass could make it bulletproof.' };
  if (score > 0.45) return { grade: 'Almost there', detail: 'Lean into the groove a touch more; you’re close.' };
  return { grade: 'Run it again', detail: 'Let’s go one more time with steadier levels and timing.' };
}

export function logEngineDecision(sessionId, type, payload) {
  const db = getDb();
  const id = uuid();
  db.prepare(
    `INSERT INTO engine_decisions (id, session_id, decision_type, payload_json, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(id, sessionId, type, JSON.stringify(payload));
  return id;
}

export function getLatestBeatAnalysis(sessionId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT payload_json FROM engine_decisions
       WHERE session_id = ? AND decision_type = 'beat_analysis'
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(sessionId);
  if (!row) return null;
  try {
    return JSON.parse(row.payload_json);
  } catch {
    return null;
  }
}

/**
 * User-facing vibe sliders (0–100) nudge the chain without breaking role relationships.
 */
export function applyVibeToChain(baseChain, vibe) {
  const v = vibe || {};
  const mult = (key, factor = 0.15) => 1 + ((v[key] ?? 50) - 50) / 50 * factor;
  const processors = baseChain.processors.map((p) => {
    let value = p.value;
    if (p.id === 'verb' || p.id === 'air') value *= mult('space', 0.2);
    if (p.id === 'tune') value *= mult('shine', 0.18);
    if (p.id === 'comp1' || p.id === 'limit') value *= mult('punch', 0.12);
    if (p.id === 'width') value *= mult('width', 0.2);
    if (p.id === 'sat') value *= mult('grit', 0.15);
    return { ...p, value: clamp(value, 0, 1) };
  });
  return { ...baseChain, processors };
}

/**
 * Learn from each uploaded take — small nudges so the profile converges over many sessions.
 * Called once per successful take; `buildChain` reads these columns every time.
 */
export function updateVoiceProfileAfterTake({ energyRms, peakDb, trackRole }) {
  if (trackRole === 'midi') return;
  const db = getDb();
  const profile = db.prepare('SELECT * FROM voice_profile WHERE id = 1').get();
  if (!profile) return;

  const e = energyRms ?? 0.1;
  const p = peakDb ?? -14;
  const aggressive = e > 0.12 || p > -10;
  const rate = 0.035;

  let tune = profile.tune_strength ?? 0.5;
  let comp = profile.compression ?? 0.5;
  let rev = profile.reverb_level ?? 0.35;
  let sat = profile.saturation ?? 0.25;
  let width = profile.adlib_width ?? 0.4;

  if (aggressive) {
    comp = clamp(comp + rate * 0.2, 0.25, 0.92);
    sat = clamp(sat + rate * 0.15, 0.12, 0.65);
  } else {
    tune = clamp(tune + rate * 0.12, 0.22, 0.88);
    rev = clamp(rev + rate * 0.1, 0.18, 0.55);
  }

  if (trackRole === 'adlib') {
    width = clamp(width + rate * 0.18, 0.22, 0.88);
    rev = clamp(rev + rate * 0.08, 0.18, 0.58);
  }
  if (trackRole === 'harmony') {
    tune = clamp(tune + rate * 0.1, 0.22, 0.88);
    rev = clamp(rev + rate * 0.05, 0.18, 0.55);
  }
  if (trackRole === 'double') {
    width = clamp(width - rate * 0.06, 0.22, 0.88);
  }

  db.prepare(
    `UPDATE voice_profile SET
      tune_strength = ?, compression = ?, reverb_level = ?, saturation = ?, adlib_width = ?,
      takes_trained = takes_trained + 1,
      updated_at = datetime('now')
     WHERE id = 1`
  ).run(tune, comp, rev, sat, width);
}

/** @deprecated Prefer updateVoiceProfileAfterTake per take */
export function updateVoiceProfileAfterSession(sessionId) {
  const db = getDb();
  const takeCount =
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM takes tk
         JOIN tracks t ON t.id = tk.track_id WHERE t.session_id = ?`
      )
      .get(sessionId)?.c ?? 0;
  if (takeCount === 0) return;
  const profile = db.prepare('SELECT * FROM voice_profile WHERE id = 1').get();
  const tune = clamp((profile.tune_strength || 0.5) + 0.02, 0.2, 0.85);
  const comp = clamp((profile.compression || 0.5) + 0.015, 0.25, 0.9);
  db.prepare(
    `UPDATE voice_profile SET tune_strength = ?, compression = ?, updated_at = datetime('now') WHERE id = 1`
  ).run(tune, comp);
}

/** Same as buildChain — studio / docs name. */
export const buildProcessingChain = buildChain;
