/**
 * Maps plain-language Smart Engine choices to existing vocalMode + vibe sliders.
 * Vibe keys match useStore / vibeUiToApi (cleanGritty, naturalTuned, drySpacious, upfrontBlended).
 */

export const VAULT_VOCAL_STYLES = [
  { id: 'clean', label: 'Clean', vocalMode: 'double', vibe: { cleanGritty: 84, naturalTuned: 58 } },
  { id: 'gritty', label: 'Gritty', vocalMode: 'dark_trap', vibe: { cleanGritty: 26, upfrontBlended: 68 } },
  { id: 'melodic', label: 'Melodic', vocalMode: 'melodic', vibe: { naturalTuned: 74, cleanGritty: 52 } },
  { id: 'aggressive', label: 'Aggressive', vocalMode: 'aggressive', vibe: { cleanGritty: 32, upfrontBlended: 80 } },
];

export const VAULT_POLISH = [
  { id: 'raw', label: 'Raw', vibe: { naturalTuned: 32, upfrontBlended: 42 } },
  { id: 'balanced', label: 'Balanced', vibe: { naturalTuned: 52, upfrontBlended: 52, cleanGritty: 50 } },
  { id: 'studio', label: 'Studio', vibe: { naturalTuned: 70, upfrontBlended: 62 } },
  { id: 'radio', label: 'Radio Ready', vibe: { naturalTuned: 86, upfrontBlended: 72, drySpacious: 52 } },
];

export const VAULT_SPACE = [
  { id: 'dry', label: 'Dry', vibe: { drySpacious: 18 } },
  { id: 'light', label: 'Light', vibe: { drySpacious: 40 } },
  { id: 'wide', label: 'Wide', vibe: { drySpacious: 64 } },
  { id: 'atmospheric', label: 'Atmospheric', vibe: { drySpacious: 90 } },
];

export function inferVaultSelection(vocalMode, vibe) {
  const v = vibe || {};
  const styleMatch = VAULT_VOCAL_STYLES.find((s) => s.vocalMode === vocalMode);
  const style = styleMatch?.id ?? 'melodic';

  let polishId = 'balanced';
  let bestP = Infinity;
  for (const p of VAULT_POLISH) {
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
  for (const s of VAULT_SPACE) {
    const score = Math.abs((v.drySpacious ?? 50) - s.vibe.drySpacious);
    if (score < bestS) {
      bestS = score;
      spaceId = s.id;
    }
  }

  return { style, polish: polishId, space: spaceId };
}
