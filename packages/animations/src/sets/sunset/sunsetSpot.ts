import { PROFILE_GROUND as GROUND, defineSpot } from '../spot';
import {
  SUNSET_DROP, SUNSET_FILMERS, SUNSET_LAND_X, SUNSET_LANE_Z, SUNSET_POP_X, SUNSET_POP_Z,
  sunsetGround, sunsetSlope, sunsetSurface,
} from './sunsetLayout';

/** Roof to Bank: along the roof, a quarter-turn into the bank, then downhill (docs/SUNSET_REFERENCE.md). */
export const SUNSET_SPOT = defineSpot({
  id: 'sunset-car-wash', label: 'Roof to Bank', slug: 'roof-to-bank', grinds: false,
  description: 'An unbranded roof-to-bank setting. Along the roof, a quarter-turn into the bank, then downhill.',
  terrain: {
    drop: SUNSET_DROP, run: SUNSET_LAND_X, landPast: 0, laneZ: SUNSET_LANE_Z,
    ground: sunsetGround, slope: sunsetSlope, surface: sunsetSurface,
    entry: { x: SUNSET_POP_X, z: SUNSET_POP_Z, yaw: -90 },
  },
  filmers: SUNSET_FILMERS,
  card: {
    where: 'Redesigned setting', feature: 'Off the roof into the bank',
    profile: { ground: `M0 ${GROUND} V10 H26 V20 L50 ${GROUND} H72`, marks: [{ d: 'M4 10 V4 H22 V10', strokeOpacity: 0.7 }] },
  },
  lines: [{ label: 'Roof to bank', hit: 'gap' }],
});
