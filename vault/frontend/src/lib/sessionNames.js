/** Default session titles — music-first, not technical. */
export const SUGGESTED_SESSION_NAMES = [
  'Midnight Session',
  'Hook Ideas',
  'Verse One',
  'New Drop',
  'Studio Night',
  'Untitled Heat',
  'Late Night Booth',
  'Demo Run',
  'Freestyle Room',
];

export function pickSuggestedSessionName() {
  const i = Math.floor(Math.random() * SUGGESTED_SESSION_NAMES.length);
  return SUGGESTED_SESSION_NAMES[i];
}
