import { trackTypeLabel } from './layerPalette.js';

/**
 * Human-readable song-in-progress state for dashboard / studio chrome.
 */
export function sessionProgressMeta(session, trackCount = 0, lastLayerType = null) {
  const beatOk = !!(session?.beat_filename || session?.beat_label);
  const n = Math.max(0, Number(trackCount) || 0);

  if (!beatOk && n === 0) {
    return { stage: 'start', label: 'Start here', badge: 'New', hint: 'Drop your beat to begin the record.' };
  }
  if (!beatOk && n > 0) {
    return { stage: 'no_beat', label: 'Beat missing', badge: 'Needs beat', hint: 'Add a beat so layers lock to the pocket.' };
  }
  if (beatOk && n === 0) {
    return { stage: 'beat_only', label: 'Beat loaded', badge: 'Ready to record', hint: 'Hit record — your first take becomes the lead.' };
  }

  const hasStack = n >= 2;
  const lastLabel = lastLayerType ? trackTypeLabel(lastLayerType) : 'Lead';

  if (n === 1) {
    return {
      stage: 'lead',
      label: 'Lead started',
      badge: 'Building',
      hint: 'Stack doubles or adlibs when the lead feels right.',
    };
  }
  if (hasStack && (lastLayerType === 'adlib' || lastLayerType === 'double')) {
    return {
      stage: 'layers',
      label: 'Layers building',
      badge: 'In session',
      hint: 'Keep stacking — mix-ready when you say so.',
    };
  }
  return {
    stage: 'deep',
    label: 'Song taking shape',
    badge: 'In progress',
    hint: `Last layer: ${lastLabel} · ${n} vocal lanes`,
  };
}

export function suggestNextStudioMove(tracks, vocalMode) {
  const list = Array.isArray(tracks) ? tracks : [];
  if (!list.length) {
    return 'Drop a beat, add a lead lane, then print your first take — the chain locks to the instrumental.';
  }
  const types = new Set(list.map((t) => t.track_type));
  const n = list.length;

  if (!types.has('main') && types.has('double')) {
    return 'Lay a main lead first so doubles and stacks have something to hug.';
  }
  if (types.has('main') && !types.has('double')) {
    return 'Doubles would thicken this — tuck a stack under the lead on the hook.';
  }
  if (n >= 2 && !types.has('adlib')) {
    return 'Adlibs would widen this — paint accents and tags around the pocket.';
  }
  if (!types.has('harmony') && n >= 3) {
    return 'A harmony pass could lift the hook — add a lane and lean into the melody.';
  }
  if (vocalMode === 'melodic') {
    return 'Melodic mode is biased for air and tune — lean into the line, then stack backs.';
  }
  if (vocalMode === 'adlib') {
    return 'Adlib chain is wide — keep energy lighter so accents sit around the lead.';
  }
  if (vocalMode === 'dark_trap' || vocalMode === 'aggressive') {
    return 'Aggressive pocket locked — beat profile is driving a harder upfront chain.';
  }
  if (n >= 4) {
    return 'Song is stacking — solo layers, check the hook, then print a reference bounce.';
  }
  return 'Keep building — when it feels finished, Export is your mastering room.';
}
