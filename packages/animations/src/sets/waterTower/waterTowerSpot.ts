import { PROFILE_GROUND as GROUND, defineSpot } from '../spot';
import { WATER_TOWER_FILMERS, WATER_TOWER_TERRAIN } from './waterTowerLayout';

/** The water tower gap: roof to roof between two reservoirs (docs/WATER_TOWER_REFERENCE.md). */
export const WATER_TOWER_SPOT = defineSpot({
  id: 'water-tower-gap', label: 'Water Tower Gap', grinds: false,
  description: 'Rowland Heights, California · Roof to roof between two water tanks, 14 feet across and 21 feet up, as Jeremy Wray ollied it in 1997.',
  terrain: WATER_TOWER_TERRAIN,
  filmers: WATER_TOWER_FILMERS,
  // The video's angle shows the whole line; the cover's, from down in the slot, only the air.
  opens: 'side',
  card: {
    where: 'Rowland Heights · California', feature: 'Tank to tank · 14 ft across, 21 ft up',
    // Two wide, flat-roofed tanks and the slot between them, each roof slab standing out past its wall.
    profile: {
      ground: `M0 15 H31 V17 H30 V${GROUND} H42 V17 H41 V15 H72`,
      marks: [{ d: 'M0 17 H30 M42 17 H72', strokeWidth: 0.8, strokeOpacity: 0.6 }],
    },
  },
  lines: [{ label: 'Tank to tank', hit: 'gap' }],
});
