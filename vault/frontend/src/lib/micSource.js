/** Matches backend `sessions.input_source` — drives smart-chain rescue bias. */
export const MIC_SOURCE_OPTIONS = [
  {
    id: 'phone',
    label: 'Phone / earbuds',
    hint: 'Built-in or Bluetooth mic — strongest cleanup, presence, and level.',
  },
  {
    id: 'budget',
    label: 'USB or laptop mic',
    hint: 'Budget gear — balanced polish without over-processing.',
  },
  {
    id: 'studio',
    label: 'Interface / studio mic',
    hint: 'Cleaner source — lighter touch, more natural.',
  },
];

export function micSourceLabel(id) {
  return MIC_SOURCE_OPTIONS.find((o) => o.id === id)?.label ?? 'Auto';
}
