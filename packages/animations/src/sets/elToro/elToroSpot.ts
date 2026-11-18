import { defineSpot, stairProfile } from '../spot';
import { CENTER_Z, EL_TORO_FILMERS, FAR_RAIL_Z, HILL_RAIL_Z } from './elToroLayout';
import { EL_TORO_RAIL, EL_TORO_TERRAIN } from './stairs';

/** El Toro's 20 stair and its three handrails (docs/EL_TORO_REFERENCE.md). */
export const EL_TORO_SPOT = defineSpot({
  id: 'el-toro', label: 'El Toro', grinds: true,
  terrain: EL_TORO_TERRAIN,
  rails: { handrail: EL_TORO_RAIL, z: { center: CENTER_Z, left: HILL_RAIL_Z, right: FAR_RAIL_Z } },
  filmers: EL_TORO_FILMERS,
  card: {
    where: 'Lake Forest, CA', feature: '20 stair and handrails',
    profile: { ground: `M0 10 H16${stairProfile(16, 10, 10, 2.6, 2.6)} H72`, marks: [{ d: 'M15 4 L42 31' }] },
  },
  lines: [{ label: '20 stair', hit: 'gap' }, { label: 'Center rail', hit: 'rail' }, { label: 'Side rail', hit: 'rail', rail: 'side' }],
});
