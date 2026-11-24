import { SET_FOOT } from '../setScale';
import type { DropTerrain } from '../terrain';
import type { SpotFilmers } from '../tripods';

/**
 * The water tower gap: two concrete reservoirs side by side, their roofs
 * level, ollied roof to roof. Dimensions are from the 2023 lidar survey and
 * the 1997 footage (docs/WATER_TOWER_REFERENCE.md).
 *
 * +x runs along the rider's line from the lip, the takeoff roof's edge,
 * toward the landing tank (north-north-east on the ground). +z is the
 * rider's right, toward the road; −z is the hillside the footage was filmed
 * from. Heights are over the roofs.
 */
export const WATER_TOWER_FOOT = SET_FOOT;
const F = WATER_TOWER_FOOT;

/** Each roof slab's radius: 174.1 and 174.6 ft across in the survey, drawn alike. */
export const WATER_TOWER_ROOF_RADIUS = 87.2 * F;
/** Roof edge to roof edge on the line through both centres. The 16 ft of legend is wall to wall at the foot. */
export const WATER_TOWER_GAP = 13.9 * F;
/** How far each roof slab stands out past its wall. */
export const WATER_TOWER_OVERHANG = 1 * F;
/** The roofs over the pavement between the tanks: 21.0 and 21.3 ft in the survey, not the 40 of legend. */
export const WATER_TOWER_HEIGHT = 21 * F;
/** The rider crosses on the line through both centres, where the gap is narrowest. */
export const WATER_TOWER_LANE_Z = 0;
/** Each roof's centre along the line. */
export const WATER_TOWER_TAKEOFF_X = -WATER_TOWER_ROOF_RADIUS;
export const WATER_TOWER_LANDING_X = WATER_TOWER_GAP + WATER_TOWER_ROOF_RADIUS;
/** The board's middle comes down this far in from the landing roof's edge: the back wheels a foot or so inside it, as filmed. */
export const WATER_TOWER_LAND_PAST = 2 * F;

/** Whether (x, z) is on the roof centred `centre` along the line. */
const onRoof = (centre: number, x: number, z: number) => Math.hypot(x - centre, z) <= WATER_TOWER_ROOF_RADIUS;

/** Which roof (x, z) is on, if either. */
export function waterTowerRoof(x: number, z: number): 'takeoff' | 'landing' | null {
  if (onRoof(WATER_TOWER_TAKEOFF_X, x, z)) return 'takeoff';
  return onRoof(WATER_TOWER_LANDING_X, x, z) ? 'landing' : null;
}

/** The two roofs, and the pavement far below everywhere else. */
export const waterTowerSurface = (x: number, z: number) => (waterTowerRoof(x, z) ? 0 : -WATER_TOWER_HEIGHT);

export const waterTowerGround = (u: number) => waterTowerSurface(u, WATER_TOWER_LANE_Z);

/**
 * The hillside on the rider's left, as far as the filmer there needs it: the
 * pavement runs level out to its foot, then the slope climbs past the roofs'
 * height. Heights over the roofs, like the rest.
 */
export const WATER_TOWER_HILL_FOOT_Z = -96 * F;
export const WATER_TOWER_HILL_GRADE = 0.62;
export const waterTowerHill = (z: number) => -WATER_TOWER_HEIGHT + Math.max(0, WATER_TOWER_HILL_FOOT_Z - z) * WATER_TOWER_HILL_GRADE;

/**
 * The pop every trick takes here, whoever rides it (as a style's popHeight):
 * low and quick, as Wray's was, pushing hard at the slot. With no drop to add
 * hang the air is the pop's own, about 0.62 s against a flatground hop's 0.8,
 * so it crosses at about 18 mph and the tricks turn about 1.3 times as fast to
 * be round by touchdown. (The day's ollie was nearer 0.5 s and 22 mph.)
 */
export const WATER_TOWER_POP = 0.78;

/** No drop at all: the speed is whatever carries the pop across, and the pop is the spot's, not the rider's. */
export const WATER_TOWER_TERRAIN: DropTerrain = {
  drop: 0,
  run: WATER_TOWER_GAP,
  landPast: WATER_TOWER_LAND_PAST,
  laneZ: WATER_TOWER_LANE_Z,
  ground: waterTowerGround,
  surface: waterTowerSurface,
  trickPop: { along: WATER_TOWER_POP, across: WATER_TOWER_POP, wrap: WATER_TOWER_POP },
};

/** The side filmer's stand on the hillside, about level with the roofs. */
const HILL_STAND_Z = -134 * F;

/**
 * Where the filmers stand (tripods.ts), each where the day's pictures were
 * taken. Bottom is the magazine cover: on the pavement in the slot, on the
 * rider's left, looking up as they cross the sky between the walls; across
 * the line that filmer is up on the landing roof instead, the rider coming
 * at them. Side is the video: up the hillside on the left, a long lens
 * across both roofs to the road. Top stands on the takeoff roof by the lip.
 */
export const WATER_TOWER_FILMERS: SpotFilmers = {
  stairs: {
    line: WATER_TOWER_LANE_Z,
    stands: {
      bottom: { u: WATER_TOWER_GAP / 2 + 2 * F, z: -30 * F, height: -WATER_TOWER_HEIGHT + 4.5 * F, frame: 16 * F, place: 0.4 },
      side: { u: WATER_TOWER_GAP / 2, z: HILL_STAND_Z, height: waterTowerHill(HILL_STAND_Z) + 5.6 * F, frame: 66 * F, place: 0.5 },
      top: { u: -4 * F, z: 9 * F, height: 5.6 * F, frame: 18 * F, place: 0.56 },
    },
    across: {
      // Crouched on the landing roof, just off the line the rider rolls away down.
      bottom: { u: WATER_TOWER_GAP + 36 * F, z: 5 * F, height: 3.2 * F, frame: 22 * F, place: 0.5 },
      // No hill on the road side: out on the landing roof's rim, looking back across the slot.
      side: { u: WATER_TOWER_GAP + 14 * F, z: 40 * F, height: 5.6 * F, frame: 24 * F, place: 0.52 },
    },
  },
};
