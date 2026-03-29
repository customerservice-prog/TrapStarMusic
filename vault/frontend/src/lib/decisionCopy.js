export function decisionToCopy(row) {
  const t = row.decision_type || '';
  const p = row.payload || {};
  if (t === 'beat_analysis') {
    return {
      title: 'Beat profile locked',
      message: `Vocals will sit tighter and more upfront — we heard this beat as ${p.character || 'balanced'} with ${p.mid_density || 'medium'} mids and ${p.bass_intensity || 'solid'} low end.`,
    };
  }
  if (t === 'vocal_classification') {
    return {
      title: 'Layer dialed for the stack',
      message: `This take reads as ${p.layer || 'lead'} — leveling and width adjust so doubles and adlibs wrap the main without you touching a fader.`,
    };
  }
  if (t === 'chain_build') {
    return {
      title: 'Session chain is live',
      message:
        'Tune, compression, tone, and space are set for this beat and your mic — major-booth polish, zero DAW homework.',
    };
  }
  if (t === 'auto_group') {
    return {
      title: 'Stack spacing suggested',
      message: 'Adlib spacing and width are nudged so your last hook breathes like a finished session, not a rough bounce.',
    };
  }
  return {
    title: (t && String(t).replace(/_/g, ' ')) || 'Studio note',
    message: 'The built-in producer updated something in your session — keep recording when you are ready.',
  };
}

export function decisionDotClass(t) {
  if (t === 'beat_analysis') return 'blue';
  if (t === 'vocal_classification' || t === 'chain_build') return 'gold';
  if (t === 'auto_group') return 'green';
  return 'gold';
}
