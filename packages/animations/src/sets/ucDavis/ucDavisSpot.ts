import { PROFILE_GROUND as GROUND, defineSpot } from '../spot';
import { UC_DAVIS_FILMERS, UC_DAVIS_TERRAIN } from './ucDavisLayout';

/** UC Davis Gap: over the ivy bank at Roessler Hall (docs/UC_DAVIS_REFERENCE.md). */
export const UC_DAVIS_SPOT = defineSpot({
  id: 'uc-davis-gap', label: 'UC Davis Gap', grinds: false,
  description: 'Roessler Hall, UC Davis · Over the ivy bank beside the round planter. Estimated 24 ft 4 in across and 10 ft down in the classic filmed layout.',
  terrain: UC_DAVIS_TERRAIN,
  filmers: UC_DAVIS_FILMERS,
  card: {
    where: 'Roessler Hall · UC Davis', feature: 'Ivy gap · approx. 24 ft 4 in across, 10 ft down',
    // The campus walkway above a long ivy bank, with Roessler Hall behind it.
    profile: {
      ground: `M0 14 H15 L68 ${GROUND} H72`,
      marks: [
        { d: 'M1 14 V3 H11 V14 M1 7 H11 M4 3 V14 M8 3 V14', strokeWidth: 1.1, strokeOpacity: 0.7 },
        { d: 'M19 19 l3 2 3 -1 M29 23 l3 2 3 -1 M39 27 l3 2 3 -1 M49 31 l3 2 3 -1 M26 29 l3 2 3 -1 M38 34 l3 2 3 -1', strokeWidth: 1.1, strokeOpacity: 0.7 },
      ],
    },
  },
  lines: [{ label: 'Over the ivy', hit: 'gap' }],
});
