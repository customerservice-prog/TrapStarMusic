export function decisionToCopy(row) {
  const t = row.decision_type || '';
  const p = row.payload || {};
  if (t === 'beat_analysis') {
    return {
      title: 'Beat profile locked',
      message: `Rap Factory heard this as ${p.character || 'balanced'} with ${p.mid_density || 'medium'} mids and ${p.bass_intensity || 'solid'} low end — the chain is weighted so you sit in the pocket, not on top of the beat.`,
    };
  }
  if (t === 'vocal_classification') {
    return {
      title: 'Vocal layer classified',
      message: `This take reads as a ${p.layer || 'main'} layer with energy mapped for smart leveling — doubles and adlibs get width and space automatically.`,
    };
  }
  if (t === 'chain_build') {
    return {
      title: 'Processing chain built',
      message: 'Tune, compression, and space were shaped for this beat and your sound profile — no manual routing required.',
    };
  }
  if (t === 'auto_group') {
    return {
      title: 'Layer grouping',
      message: 'Rap Factory suggested stack placement so leads stay forward and textures wrap the sides.',
    };
  }
  return {
    title: t.replace(/_/g, ' ') || 'Engine note',
    message: 'Smart Engine updated processing for this session.',
  };
}

export function decisionDotClass(t) {
  if (t === 'beat_analysis') return 'blue';
  if (t === 'vocal_classification' || t === 'chain_build') return 'gold';
  if (t === 'auto_group') return 'green';
  return 'gold';
}
