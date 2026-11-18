import { defineSpot, stairProfile } from '../spot';
import { LYON_FILMERS, LYON_TERRAIN } from './lyonLayout';

/** 25 Stair, in a redesigned courtyard (docs/LYON_REFERENCE.md). */
export const LYON_SPOT = defineSpot({
  id: 'lyon-25', label: '25 Stair', slug: '25-stair', grinds: false,
  description: '25 stairs, 14.76 feet down and 21.29 feet across, in a redesigned courtyard.',
  terrain: LYON_TERRAIN,
  filmers: LYON_FILMERS,
  card: {
    where: 'Redesigned courtyard', feature: '25 stairs · 14.76 ft down, 21.29 ft across',
    // The full 25-step flight beside the redesigned low-rise courtyard.
    profile: {
      ground: `M0 12.25 H16${stairProfile(16, 12.25, 25, 1.36, 0.95)} H72`,
      strokeWidth: 0.8,
      marks: [
        { d: 'M0 12 V3 H9 V6 H16 V12', strokeWidth: 1.4 },
        { d: 'M3 6 H6 V9 H3 Z M11 8 H13 V10 H11 Z', strokeOpacity: 0.6 },
      ],
    },
  },
  lines: [{ label: '25 stairs', hit: 'gap' }],
});
