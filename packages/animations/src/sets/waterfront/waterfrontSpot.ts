import { defineSpot } from '../spot';

/** The harbor promenade: flat ground and the flat bar, with the game's own view of them. */
export const WATERFRONT_SPOT = defineSpot({
  id: 'waterfront', label: 'Waterfront', grinds: true, terrain: null,
  card: {
    where: 'Harbor promenade', feature: 'Flatground and flat bar',
    profile: {
      ground: 'M0 27 H34 V33 Q38 30 42 33 T50 33 T58 33 T66 33 T74 33',
      marks: [
        { d: 'M4 21 H28 M7 21 V27 M25 21 V27' },
        { d: 'M36 19 H72 M53 23 V6 M51 7 H55 M35 17 Q47 16 53 6 Q60 16 72 17', strokeWidth: 1.3, strokeOpacity: 0.75 },
      ],
    },
  },
  lines: [{ label: 'Flatground', hit: 'gap', id: 'flatground' }, { label: 'Flat bar', hit: 'rail' }],
});
