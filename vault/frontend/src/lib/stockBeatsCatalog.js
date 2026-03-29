/**
 * 50 bundled real loops from Freesound (Creative Commons 0 — public domain dedication).
 * Files live in /public/stock-beats/ — see stock-beats/LICENSING.txt for sources.
 */

/** Vite `base` (trailing slash); keeps paths valid when app is hosted under a subpath. */
const PUBLIC_BASE = import.meta.env.BASE_URL || '/';

const FREESOUND_IDS = [
  829259, 720248, 399748, 582465, 844463, 816348, 422434, 807831, 807202, 528221, 524313, 518628,
  487544, 455645, 721440, 747451, 742895, 741959, 814324, 813669, 841784, 593247, 635304, 353608,
  352409, 382276, 416061, 431187, 434898, 365187, 467521, 800887, 799204, 687957, 166029, 790598,
  384581, 400996, 416989, 416988, 254989, 703568, 516736, 517740, 404913, 324406, 793393, 833548,
  521145, 482123,
];

const TITLES = [
  '808 Basement',
  'Southside Alley',
  'Metro Midnight',
  'Trap Cathedral',
  'Hi-Hat Hurricane',
  'Subwoofer Sunday',
  'Lean Back Loop',
  'Purple Haze 808',
  'Brick Squad Bounce',
  'Skrrt Skrrt',
  'Dark Room',
  'Migos Pocket',
  'Atlanta Night',
  'Rattling Trunk',
  'Ghost Note City',
  'Zaytoven Keys',
  'Drill Adjacent',
  'Sizzle Hats',
  'Low End Theory',
  'Cookie Jar',
  "Flex O'Clock",
  'Bandcamp 808',
  'Rimshot Riddim',
  'Smoke Session',
  'Triplets & Trouble',
  'Chrome Slugs',
  'Afterparty',
  'Bando Bounce',
  'Ice Out',
  'Henny & Heartbreak',
  'Woo Walk',
  'Phonk Adjacent',
  'Creek Water',
  'No Auto-Tune',
  'Slide Season',
  'Chop Shop',
  'Late Night FM',
  'Rubber Band',
  'Gucci Pocket',
  'Eastside Slide',
  'Memphis Mud',
  'Cash App Carti',
  '808 Therapy',
  'Rolls & Rims',
  'Tunnel Vision',
  'Drip Check',
  'Opps Quiet',
  'Studio A',
  'Final Form',
  'TrapStar Default',
];

export const STOCK_TRAP_BEATS = FREESOUND_IDS.map((freesoundId, i) => ({
  id: `ts-${String(i + 1).padStart(2, '0')}`,
  title: TITLES[i],
  file: `${PUBLIC_BASE}stock-beats/${String(i + 1).padStart(2, '0')}.mp3`,
  freesoundId,
}));

export function pickRandomStockBeat() {
  const j = Math.floor(Math.random() * STOCK_TRAP_BEATS.length);
  return STOCK_TRAP_BEATS[j];
}
