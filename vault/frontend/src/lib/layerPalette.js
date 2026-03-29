/** Artist-facing layer labels + tints (VAULT spec). */
export const LAYER_HEX = {
  main: '#c9a84c',
  double: '#6b9fd4',
  adlib: '#9b7fd6',
  harmony: '#5cbf8f',
  midi: '#e070c0',
};

export function trackTypeLabel(type) {
  const t = type || 'main';
  if (t === 'main') return 'Lead';
  if (t === 'double') return 'Double';
  if (t === 'adlib') return 'Adlib';
  if (t === 'harmony') return 'Harmony';
  if (t === 'midi') return 'MIDI';
  return t;
}
