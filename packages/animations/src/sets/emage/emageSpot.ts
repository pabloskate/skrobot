import { defineSpot, stairProfile } from '../spot';
import { EMAGE_FILMERS, EMAGE_RAIL, EMAGE_RAIL_Z, EMAGE_TERRAIN } from './emageLayout';

/** Emage 20: the riverside 20 stair and its one skateable rail (docs/EMAGE_REFERENCE.md). */
export const EMAGE_SPOT = defineSpot({
  id: 'emage-20', label: 'Emage 20', grinds: true,
  description: 'Denver, Colorado · The riverside 20 stair inset into ten seating terraces, with its skateable river-side rail and the Platte River Bridge. Dimensions estimated from reference photos.',
  terrain: EMAGE_TERRAIN,
  rails: { handrail: EMAGE_RAIL, z: { center: EMAGE_RAIL_Z, left: EMAGE_RAIL_Z, right: EMAGE_RAIL_Z }, fixedLine: 'right' },
  filmers: EMAGE_FILMERS,
  card: {
    where: 'Denver · Colorado', feature: '20 stair and side rail',
    // The long riverside flight with one round rail along its outer edge.
    profile: {
      ground: `M0 10 H16${stairProfile(16, 10, 20, 1.8, 1.3)} H72`,
      strokeWidth: 0.9,
      marks: [{ d: 'M14 5 Q15 2 18 4 L54 30 M19 5 V12 M31 14 V21 M43 23 V30', strokeWidth: 1.4 }],
    },
  },
  lines: [{ label: '20 stair', hit: 'gap' }, { label: 'Side rail', hit: 'rail', rail: 'side' }],
});
