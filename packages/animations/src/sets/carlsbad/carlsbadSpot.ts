import { defineSpot } from '../spot';
import { CARLSBAD_FILMERS, CARLSBAD_TERRAIN } from './carlsbadLayout';

/** Carlsbad Gap: the original grass gap onto its uphill landing (docs/CARLSBAD_REFERENCE.md). */
export const CARLSBAD_SPOT = defineSpot({
  id: 'carlsbad-gap', label: 'Carlsbad Gap', grinds: false,
  description: 'Carlsbad High, California · The original grass gap beside the yellow-edged 11 stair, with its low toe wall, curved curb and uphill landing. Dimensions estimated from archival photos.',
  terrain: CARLSBAD_TERRAIN,
  filmers: CARLSBAD_FILMERS,
  card: {
    where: 'Carlsbad High · California', feature: 'Grass gap beside the 11 stair · uphill landing',
    // Low classroom canopy, grassy bank and concrete toe, then uphill pavement.
    profile: {
      ground: 'M0 15 H19 L46 31 V36 L72 31',
      marks: [
        { d: 'M0 15 V5 H14 V15 M0 4 H18 M3 9 H14 M7 5 V15', strokeWidth: 1.2, strokeOpacity: 0.75 },
        { d: 'M22 19 l3 -1 M28 23 l3 -1 M35 27 l3 -1 M44 31 H49', strokeWidth: 1.1, strokeOpacity: 0.7 },
      ],
    },
  },
  lines: [{ label: 'Over the grass', hit: 'gap' }],
});
