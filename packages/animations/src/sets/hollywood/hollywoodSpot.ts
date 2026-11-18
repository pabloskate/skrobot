import { SET_FOOT } from '../setScale';
import { defineSpot, stairProfile } from '../spot';
import type { DropTerrain } from '../terrain';
import {
  HOLLYWOOD_12_DROP, HOLLYWOOD_12_FILMERS, HOLLYWOOD_12_LANE_Z, HOLLYWOOD_12_RAIL, HOLLYWOOD_12_RUN,
  HOLLYWOOD_CENTER_Z, HOLLYWOOD_DROP, HOLLYWOOD_FENCE_TERRAIN, HOLLYWOOD_FILMERS, HOLLYWOOD_LANE_Z,
  HOLLYWOOD_LEFT_RAIL_Z, HOLLYWOOD_RAIL, HOLLYWOOD_RIGHT_RAIL_Z, HOLLYWOOD_RUN,
  hollywood12Ground, hollywood12Surface, hollywoodGround,
} from './hollywoodLayout';

/**
 * Hollywood High: one location, two flights off the same walkway
 * (docs/HOLLYWOOD_REFERENCE.md). The 16 carries the location's card; the 12
 * is a flight of it.
 */

const STAIRS: DropTerrain = { drop: HOLLYWOOD_DROP, run: HOLLYWOOD_RUN, landPast: 4 * SET_FOOT, laneZ: HOLLYWOOD_LANE_Z, ground: hollywoodGround };

export const HOLLYWOOD_SPOT = defineSpot({
  id: 'hollywood-high', label: 'Hollywood High', lineLabel: '16 stair', grinds: true,
  description: 'Hollywood High, Los Angeles · The 16 and 12 descend opposite ends of one auditorium walkway, with center handrails and the fence beside the 16.',
  terrain: STAIRS,
  obstacles: [
    { id: 'stairs', label: 'Stairs', hint: 'down the stairs', terrain: STAIRS },
    { id: 'fence', label: 'Fence', hint: 'over the rail and fence, coming in at an angle', terrain: HOLLYWOOD_FENCE_TERRAIN },
  ],
  rails: { handrail: HOLLYWOOD_RAIL, z: { center: HOLLYWOOD_CENTER_Z, left: HOLLYWOOD_LEFT_RAIL_Z, right: HOLLYWOOD_RIGHT_RAIL_Z }, sideGrinds: false },
  filmers: HOLLYWOOD_FILMERS,
  card: {
    where: 'Los Angeles', feature: 'Back-to-back 16 and 12 stairs, rails, and fence',
    // Opposite flights descend from one elevated walkway; the twelve is
    // shorter than the sixteen, rather than a second stair set in series.
    profile: {
      ground: `M0 28 H4${stairProfile(4, 28, 12, 1.75, -1.5)} H43${stairProfile(43, 10, 16, 1.55, 1.5)} H72`,
      strokeWidth: 1,
      marks: [{ d: 'M4 22 L25 4 M43 4 L68 28' }],
    },
  },
  lines: [{ label: '16 stair', hit: 'gap' }, { label: '16 rail', hit: 'rail' }, { label: 'Over the fence', hit: 'gap', obstacle: 'fence' }],
});

export const HOLLYWOOD_12_SPOT = defineSpot({
  id: 'hollywood-high-12', label: 'Hollywood 12', location: 'hollywood-high', lineLabel: '12 stair', grinds: true,
  description: 'The steeper north-facing 12, behind the 16 across the shared upper walkway.',
  terrain: { drop: HOLLYWOOD_12_DROP, run: HOLLYWOOD_12_RUN, landPast: 4 * SET_FOOT, laneZ: HOLLYWOOD_12_LANE_Z, ground: hollywood12Ground, surface: hollywood12Surface },
  // The street-side cheek has no grindable pipe; the wall rail is scenery.
  rails: { handrail: HOLLYWOOD_12_RAIL, z: { center: 0, left: -HOLLYWOOD_RIGHT_RAIL_Z, right: -HOLLYWOOD_LEFT_RAIL_Z }, sideGrinds: false },
  filmers: HOLLYWOOD_12_FILMERS,
  lines: [{ label: '12 stair', hit: 'gap', id: 'twelve-stairs' }, { label: '12 rail', hit: 'rail', id: 'twelve-rail' }],
});
