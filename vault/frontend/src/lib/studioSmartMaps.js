/**
 * Maps plain-language Smart Engine choices to vocalMode + vibe sliders.
 * Vibe keys match useStore / vibeUiToApi (cleanGritty, naturalTuned, drySpacious, upfrontBlended).
 */

export const SMART_VOCAL_STYLES = [
  { id: 'clean', label: 'Clean', vocalMode: 'double', vibe: { cleanGritty: 84, naturalTuned: 58 } },
  { id: 'gritty', label: 'Gritty', vocalMode: 'dark_trap', vibe: { cleanGritty: 26, upfrontBlended: 68 } },
  { id: 'melodic', label: 'Melodic', vocalMode: 'melodic', vibe: { naturalTuned: 74, cleanGritty: 52 } },
  { id: 'aggressive', label: 'Aggressive', vocalMode: 'aggressive', vibe: { cleanGritty: 32, upfrontBlended: 80 } },
  { id: 'adlib_cut', label: 'Adlib cut', vocalMode: 'adlib', vibe: { drySpacious: 62, upfrontBlended: 72, cleanGritty: 55 } },
  { id: 'harmony_blend', label: 'Harmony', vocalMode: 'harmony', vibe: { naturalTuned: 68, drySpacious: 42, upfrontBlended: 48 } },
  { id: 'auto_flow', label: 'Auto', vocalMode: 'auto', vibe: { naturalTuned: 52, upfrontBlended: 52, cleanGritty: 50 } },
];

export const SMART_POLISH_LEVELS = [
  { id: 'raw', label: 'Raw', vibe: { naturalTuned: 32, upfrontBlended: 42 } },
  { id: 'balanced', label: 'Balanced', vibe: { naturalTuned: 52, upfrontBlended: 52, cleanGritty: 50 } },
  { id: 'studio', label: 'Studio', vibe: { naturalTuned: 70, upfrontBlended: 62 } },
  { id: 'radio', label: 'Radio Ready', vibe: { naturalTuned: 86, upfrontBlended: 72, drySpacious: 52 } },
];

export const SMART_SPACE_PRESETS = [
  { id: 'dry', label: 'Dry', vibe: { drySpacious: 18 } },
  { id: 'light', label: 'Light', vibe: { drySpacious: 40 } },
  { id: 'wide', label: 'Wide', vibe: { drySpacious: 64 } },
  { id: 'atmospheric', label: 'Atmospheric', vibe: { drySpacious: 90 } },
];

export function inferSmartEngineSelection(vocalMode, vibe) {
  const v = vibe || {};
  const styleMatch = SMART_VOCAL_STYLES.find((s) => s.vocalMode === vocalMode);
  const style = styleMatch?.id ?? 'melodic';

  let polishId = 'balanced';
  let bestP = Infinity;
  for (const p of SMART_POLISH_LEVELS) {
    const score = Object.keys(p.vibe).reduce(
      (acc, k) => acc + Math.abs((v[k] ?? 50) - (p.vibe[k] ?? 50)),
      0
    );
    if (score < bestP) {
      bestP = score;
      polishId = p.id;
    }
  }

  let spaceId = 'light';
  let bestS = Infinity;
  for (const s of SMART_SPACE_PRESETS) {
    const score = Math.abs((v.drySpacious ?? 50) - s.vibe.drySpacious);
    if (score < bestS) {
      bestS = score;
      spaceId = s.id;
    }
  }

  return { style, polish: polishId, space: spaceId };
}
