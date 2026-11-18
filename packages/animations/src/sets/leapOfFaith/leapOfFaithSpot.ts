import { PROFILE_GROUND as GROUND, defineSpot } from '../spot';
import { LEAP_OF_FAITH_FILMERS, LEAP_OF_FAITH_TERRAIN } from './leapOfFaithLayout';

/** Leap of Faith: over the walkway guardrail into the courtyard (docs/LEAP_OF_FAITH_REFERENCE.md). */
export const LEAP_OF_FAITH_SPOT = defineSpot({
  id: 'leap-of-faith', label: 'Leap of Faith', grinds: false,
  description: 'Point Loma High School, San Diego · Over the walkway guardrail into the courtyard, a 14.3-foot drop in the classic Jamie Thomas setting.',
  terrain: LEAP_OF_FAITH_TERRAIN,
  filmers: LEAP_OF_FAITH_FILMERS,
  card: {
    where: 'Point Loma High · San Diego', feature: 'Over the rail · 14.3 ft courtyard drop',
    // Balcony over the courtyard, with the original galvanized mesh guardrail.
    profile: {
      ground: `M0 14 H27 V${GROUND} H72`,
      marks: [
        { d: 'M0 5 H27 V14 M0 11 H27 M9 5 V14 M18 5 V14 M0 18 H27', strokeWidth: 1.2 },
        { d: 'M0 5 L9 11 L18 5 L27 11 M0 11 L9 5 L18 11 L27 5', strokeWidth: 0.6, strokeOpacity: 0.65 },
        { d: 'M6 36 V23 H18 V36', strokeWidth: 1.2, strokeOpacity: 0.6 },
      ],
    },
  },
  lines: [{ label: 'Over the rail', hit: 'gap' }],
});
