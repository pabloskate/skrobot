import { defineSpot } from '../spot';
import {
  SET_FOOT, WALLENBERG_DROP, WALLENBERG_DROP_IN, WALLENBERG_FILMERS, WALLENBERG_LANE_Z, WALLENBERG_RUN,
  wallenbergGround, wallenbergSurface,
} from './wallenbergLayout';

/** Wallenberg's four block, rolled into from the ramp (docs/WALLENBERG_REFERENCE.md). */
export const WALLENBERG_SPOT = defineSpot({
  id: 'wallenberg', label: 'Wallenberg', grinds: false,
  description: 'San Francisco · Down the roll-in, then four blocks: 51 inches down and 198 inches across.',
  terrain: {
    drop: WALLENBERG_DROP, run: WALLENBERG_RUN, landPast: 3 * SET_FOOT, laneZ: WALLENBERG_LANE_Z,
    ground: wallenbergGround, surface: wallenbergSurface, dropIn: WALLENBERG_DROP_IN,
  },
  filmers: WALLENBERG_FILMERS,
  card: {
    where: 'San Francisco', feature: 'The four block gap',
    // Down the roll-in, along the run-up, then three tall blocks and the short street curb.
    profile: { ground: 'M0 4 H4 C9 4 9 16 16 16 H27 V22 H33 V28 H39 V34 H45 V36.4 H72' },
  },
  lines: [{ label: 'Four block', hit: 'gap' }],
});
