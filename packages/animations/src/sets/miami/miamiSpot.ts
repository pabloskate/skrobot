import { PROFILE_GROUND as GROUND, defineSpot } from '../spot';
import { MIAMI_BANK_TERRAIN, MIAMI_FILMERS, MIAMI_GAP_TERRAIN, MIAMI_LEDGES } from './miamiLayout';

/** Triangle Bank: onto the triangular bank, over it, or down one of its edges (docs/MIAMI_TRIANGLE_REFERENCE.md). */
export const MIAMI_SPOT = defineSpot({
  id: 'miami-triangle', label: 'Triangle Bank', slug: 'triangle-bank', grinds: true,
  description: 'A redesigned park setting. Gap from the raised deck onto a plain triangular bank, clear it to the plaza, or grind an edge.',
  terrain: MIAMI_BANK_TERRAIN,
  obstacles: [
    { id: 'stairs', label: 'Bank', hint: 'off the deck onto the triangular bank, then down it', terrain: MIAMI_BANK_TERRAIN },
    { id: 'triangle', label: 'Over', hint: 'over the whole triangle to the plaza', terrain: MIAMI_GAP_TERRAIN },
  ],
  ledges: MIAMI_LEDGES,
  filmers: MIAMI_FILMERS,
  card: {
    where: 'Redesigned park', feature: 'Gap to the triangular bank, or its edges',
    // At 4.2 units a foot: the terrace tip 5 ft over the plaza with its 3 in rim curving up at the edge,
    // the low planter wall 2 ft out, then the concrete slab, its apex level with the deck 5.5 ft from the tip,
    // tilted down about 24 degrees to a foot-thick low edge 1.75 ft up, on a pedestal.
    profile: {
      ground: `M0 15 H9 Q10.5 15 10.5 13.95 H12 V${GROUND} H20.4 V29.7 H22.9 V${GROUND} H72`,
      strokeWidth: 1.5,
      marks: [
        { d: 'M35 15 L66 28.65 V32.85 L35 19.2 Z', fillOpacity: 0.35 },
        { d: 'M44.2 23.3 V36 M58.4 29.5 V36', strokeOpacity: 0.7 },
      ],
    },
  },
  lines: [{ label: 'Gap to bank', hit: 'gap' }, { label: 'Over the triangle', hit: 'gap', obstacle: 'triangle' }, { label: 'Down an edge', hit: 'rail' }],
});
