import { ClassicSpot3D } from '../classicSpot3d';
import { CARLSBAD_LOOK } from '../carlsbad/carlsbad3d';
import type { SpotLook } from '../surfaces';
import { buildLeapOfFaithGeometry } from './leapOfFaithGeometry';
import { LEAP_OF_FAITH_TREES, LEAP_OF_FAITH_CARS } from './leapOfFaithTrees';
import { LEAP_OF_FAITH_PAINT as PAINT } from './leapOfFaithPalette';
import {
  LEAP_OF_FAITH_FOOT as F, LEAP_OF_FAITH_STAIR_RUN, LEAP_OF_FAITH_STAIR_WIDTH,
  LEAP_OF_FAITH_TREAD, LEAP_OF_FAITH_RISER, LEAP_OF_FAITH_LANE_Z, LEAP_OF_FAITH_RUN,
  LEAP_OF_FAITH_DROP, LEAP_OF_FAITH_FILMERS, leapOfFaithGround,
} from './leapOfFaithLayout';

/**
 * San Diego coastal daylight on a 1998 school court (refs 20, 82, 91, 129; 05 and 122 from 1997), with none of
 * Carlsbad's own windows or skating marks.
 */
export const LEAP_OF_FAITH_LOOK: SpotLook = {
  ...CARLSBAD_LOOK,
  // Little bounce: the shaded court is red-brown, and the deep undercroft and the gallery's underside sit dark
  // in the 1998 frames. The open sky lights what it reaches; under a box overhead, only as much of it as the
  // box leaves open, so the undercroft's back wall darkens toward its ceiling.
  fill: { sky: 0.65, bounce: 0.42 },
  soffit: 1,
  // Urethane where boards land and roll away below the gap.
  marks: [{ x: [9, 30], z: [-17, -1] }],
  markDepth: 0.1,
  // A school court: gum trodden into the paving.
  gum: 1,
  // The court's slabs, about 13 ft square on tooled joints, each pour a touch its own tone. The concrete's own
  // weathering reads warm tan as safety paint and chips it, so the slabs take the pavers' surface, which feeds it
  // a neutral grey and keeps the paint's colour.
  pavers: { size: 13, joint: 0.045, jointColor: PAINT.joint, paint: PAINT.court, spread: 0.035 },
  // The street beyond the perimeter wall.
  asphalt: { scale: 0.03, contrast: 0.14 },
  // Only the straight upper flight fits the shared stair-wear projection. The turned lower flight keeps
  // concrete aggregate and its own repeated contacts, without projecting an incorrect +x pattern over it.
  stairs: {
    x: [0, LEAP_OF_FAITH_STAIR_RUN / F], z: [0, LEAP_OF_FAITH_STAIR_WIDTH / F], top: 0,
    tread: LEAP_OF_FAITH_TREAD / F, riser: LEAP_OF_FAITH_RISER / F,
    rails: [0, 4.5, 8.65],
  },
  // The right wing's windows face the court along x, 12 ft wide every 16 ft from x = -114: four panes upstairs,
  // two in each lower window beside its door, with a transom bar.
  sash: {
    yaw: 0, from: -114, period: 16, width: 12,
    columns: [[0, 0.16], [2.95, 3.05], [5.92, 6.08], [8.95, 9.05], [11.84, 12]],
    rows: [[4, 4.15], [6.95, 7.05], [8.85, 9], [-9, -8.86], [-7.05, -6.95], [-5.14, -5]],
    frame: PAINT.sashFrame,
  },
  // Painted concrete walls in two pours (a faint seam some 5.6 ft under every top edge, ref 05), rolled over in
  // patches, flaked back where boards hit, dirty at the foot. A wall a storey and a half high: its patches and
  // runs are bigger than a curb's.
  walls: { bare: PAINT.concrete, coats: 0.03, damp: 0.15, boards: 11.2, scale: 1.8 },
  foliage: true,
};

export class LeapOfFaith3D extends ClassicSpot3D {
  constructor() {
    super({
      build: buildLeapOfFaithGeometry,
      laneZ: LEAP_OF_FAITH_LANE_Z,
      ground: leapOfFaithGround,
      grade: 0,
      run: LEAP_OF_FAITH_RUN,
      drop: LEAP_OF_FAITH_DROP,
      framing: 0.84,
      // The crane stays up on the walkway and tilts down after the drop, as the
      // filmer up top does, rather than sinking into the stair block beside it.
      stayUp: ['stairs'],
      streetProps: { trees: LEAP_OF_FAITH_TREES, cars: LEAP_OF_FAITH_CARS },
      look: LEAP_OF_FAITH_LOOK,
      filmers: LEAP_OF_FAITH_FILMERS,
    });
  }
}

export const createLeapOfFaith = () => new LeapOfFaith3D();
