import type { Vec3 } from '../../camera/view';
import type { TripodId } from '../../camera/camera';
import { ClassicSpot3D, type SpotTripod } from '../classicSpot3d';
import type { CarPlacement, StreetPropPlacements } from '../props/streetProps';
import { buildMiamiGeometry, MIAMI_BOULEVARD, MIAMI_SOUTHBOUND, miamiBoulevard, miamiParkingStall } from './miamiGeometry';
import {
  MIAMI_DROP, MIAMI_FOOT as F, MIAMI_PLAZA_Y, MIAMI_SLAB_GRADE, MIAMI_SLAB_LIP_X, miamiGround,
} from './miamiLayout';

export { buildMiamiGeometry } from './miamiGeometry';

/** World units a second for a mile an hour. */
const MPH = (5280 * F) / 3600;
/** Each driving car comes round again out of sight, down the boulevard. */
const LAP = 1400 * F;
const lane = (k: number) => MIAMI_BOULEVARD.kerb + (k + 0.5) * 12.5 * F;
const farLane = (k: number) => MIAMI_BOULEVARD.medianEnd + (k + 0.5) * 12 * F;

/**
 * Biscayne's traffic keeps right: northbound in the lanes by the park,
 * southbound beyond the median.
 */
export const MIAMI_TRAFFIC: CarPlacement[] = ([
  [lane(1), -300, 'sedan', '#c9c5bb', 34], [lane(2), 250, 'suv', '#1f2428', 31], [lane(0), 650, 'hatchback', '#8c1e22', 28],
  [lane(3), -700, 'sedan', '#9aa3a6', 36],
  [farLane(0), 100, 'suv', '#e2e0d8', 33], [farLane(1), -500, 'sedan', '#2e3f55', 30], [farLane(2), 500, 'hatchback', '#6b2a2c', 35],
] as const).map(([across, along, model, paint, mph]) => ({
  at: miamiBoulevard(along * F, across), model, paint,
  yaw: across > MIAMI_BOULEVARD.median ? MIAMI_SOUTHBOUND : MIAMI_SOUTHBOUND + 180,
  speed: mph * MPH, lap: LAP,
}));

/** Cars nosed into the park's car park beyond the plaza's left side. */
const PARKED: CarPlacement[] = ([
  [0, 'sedan', '#d8d5cc'], [1, 'suv', '#43505a'], [3, 'sedan', '#1d1f22'], [4, 'hatchback', '#b8bcbd'],
  [5, 'suv', '#e6e3da'], [7, 'sedan', '#7a1f25'], [8, 'sedan', '#2c3a4f'], [10, 'suv', '#9a9c98'],
  [11, 'hatchback', '#cfc9b8'], [12, 'sedan', '#30302d'], [14, 'suv', '#5f6a70'],
] as const).map(([k, model, paint]) => ({ at: miamiParkingStall(k) as Vec3, yaw: 225, model, paint }));

export const MIAMI_STREET_PROPS: StreetPropPlacements = {
  cars: [...MIAMI_TRAFFIC, ...PARKED],
  // Broad shade trees in the park behind the terrace.
  trees: [
    { at: [-118 * F, MIAMI_PLAZA_Y, -40 * F], height: 34 * F, yaw: 40 },
    { at: [-130 * F, MIAMI_PLAZA_Y, 35 * F], height: 30 * F, yaw: 160 },
  ],
};

export const MIAMI_TRIPODS: Readonly<Record<TripodId, SpotTripod>> = {
  // On the plaza looking back up the line, as Carpenter's filmer did;
  // off to the boulevard side, or the slab's apex would hide the deck.
  bottom: { u: 24 * F, z: 9 * F, height: MIAMI_PLAZA_Y + 3.5 * F, frame: 18 * F, place: 0.55 },
  // Side-on from the plaza's boulevard side, Ehrlund's angle: the box,
  // the wall and the slab in one line, the box on the left.
  side: { u: 8 * F, z: 24 * F, height: MIAMI_PLAZA_Y + 4.5 * F, frame: 20 * F, place: 0.5 },
  // Up on the deck behind the rider, beside their line.
  top: { u: -14 * F, z: 6 * F, height: 5.5 * F, frame: 14 * F, place: 0.55 },
};

const across = (tripod: SpotTripod): SpotTripod => ({ ...tripod, z: -tripod.z });

/**
 * Grinding an edge the filmers move round: the one up top stands on the
 * other side of the deck from the line in (it rolls in along the far side
 * from the edge), the side one outside the edge, and the one at the bottom
 * across the line from where the rider rolls away.
 */
export const MIAMI_LEDGE_TRIPODS: Readonly<Record<'left' | 'right', Readonly<Record<TripodId, SpotTripod>>>> = {
  right: { ...MIAMI_TRIPODS, bottom: across(MIAMI_TRIPODS.bottom) },
  left: { ...MIAMI_TRIPODS, side: across(MIAMI_TRIPODS.side), top: across(MIAMI_TRIPODS.top) },
};

export class Miami3D extends ClassicSpot3D {
  constructor() {
    super({
      build: buildMiamiGeometry,
      laneZ: 0, ground: miamiGround,
      grade: MIAMI_SLAB_GRADE, run: MIAMI_SLAB_LIP_X, drop: MIAMI_DROP,
      framing: 0.85,
      streetProps: MIAMI_STREET_PROPS,
      tripods: MIAMI_TRIPODS,
      ledgeTripods: MIAMI_LEDGE_TRIPODS,
    });
  }
}

export const createMiami = () => new Miami3D();
