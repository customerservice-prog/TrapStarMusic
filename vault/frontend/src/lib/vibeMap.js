/** Map UI vibe sliders (spec) to Smart Engine API shape. */
export function vibeUiToApi(v) {
  if (!v) {
    return { space: 50, shine: 50, punch: 50, width: 50, grit: 50 };
  }
  if (v.cleanGritty != null) {
    return {
      space: clamp(v.drySpacious ?? 50),
      shine: clamp(v.naturalTuned ?? 50),
      punch: clamp(v.upfrontBlended ?? 50),
      width: clamp(Math.round(((v.drySpacious ?? 50) + (v.upfrontBlended ?? 50)) / 2)),
      grit: clamp(100 - (v.cleanGritty ?? 50)),
    };
  }
  return {
    space: clamp(v.space ?? 50),
    shine: clamp(v.shine ?? 50),
    punch: clamp(v.punch ?? 50),
    width: clamp(v.width ?? 50),
    grit: clamp(v.grit ?? 50),
  };
}

function clamp(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export const VOCAL_MODES = [
  { id: 'auto', label: 'Auto-Detect' },
  { id: 'dark_trap', label: 'Dark Trap Lead' },
  { id: 'aggressive', label: 'Aggressive Punch' },
  { id: 'melodic', label: 'Melodic Hook' },
  { id: 'adlib', label: 'Wide Adlib Stack' },
  { id: 'double', label: 'Clean Double' },
  { id: 'harmony', label: 'Harmony Layer' },
];

export function vocalModeToTrackLayer(modeId) {
  if (modeId === 'adlib') return 'adlib';
  if (modeId === 'double') return 'double';
  if (modeId === 'harmony') return 'harmony';
  if (modeId === 'midi_lane') return 'main';
  return 'main';
}

export function vocalModeToTrackType(modeId) {
  if (modeId === 'adlib') return 'adlib';
  if (modeId === 'double') return 'double';
  if (modeId === 'harmony') return 'harmony';
  return 'main';
}

/** Align Smart Engine vocal mode with an existing layer before recording. */
export function suggestedVocalModeForTrackType(trackType) {
  if (trackType === 'double') return 'double';
  if (trackType === 'adlib') return 'adlib';
  if (trackType === 'harmony') return 'harmony';
  if (trackType === 'main') return 'dark_trap';
  return 'dark_trap';
}

/** Desktop lane desk: each control sets vocal mode + creates a typed track. */
export const VOCAL_LANE_PRESETS = [
  { mode: 'dark_trap', trackType: 'main', defaultLabel: 'Lead', strip: 'LEAD', hint: 'Main vocal — sits up front in the mix' },
  { mode: 'double', trackType: 'double', defaultLabel: 'Double', strip: 'DBL', hint: 'Tight stack under the lead' },
  { mode: 'adlib', trackType: 'adlib', defaultLabel: 'Adlib', strip: 'ADL', hint: 'Wide accents, tags, and ear candy' },
  { mode: 'harmony', trackType: 'harmony', defaultLabel: 'Harmony', strip: 'HRM', hint: 'Melody doubles and stacks' },
  {
    mode: 'aggressive',
    trackType: 'main',
    defaultLabel: 'Punch-in',
    strip: 'PNCH',
    hint: 'Turn punch mode on in Record, then tap the beat twice for in/out',
  },
  { mode: 'midi_lane', trackType: 'midi', defaultLabel: 'MIDI lane', strip: 'MDI', hint: 'Pattern clips — synth sketch lane' },
];

export function nextLaneLabel(tracks, trackType, baseLabel) {
  const list = Array.isArray(tracks) ? tracks : [];
  const same = list.filter((t) => t.track_type === trackType).length;
  if (same === 0) return baseLabel;
  return `${baseLabel} ${same + 1}`;
}
