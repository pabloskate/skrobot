import { FALL_T, FLIP_T, JUMP, LAND_T, ROLL_IN } from '../../motion/trick';
import { resolveSkateStyle } from '../../motion/style';
import type { SkateStyle } from '../../types';
import type { Handrail } from '../../motion/grind';
import { rad, smoothstep } from '../../math';

/**
 * El Toro: the 20 stair at El Toro High School (Lake Forest, California),
 * for the three.js stage. Twenty steps falling 9 feet over 20 feet, laid out
 * at the robot's scale (about five feet tall), and the flight down them.
 *
 * The trick itself is the flatground one, frame for frame: the stage plays
 * computeFrame on a clock whose flight is stretched over the longer hang
 * time (stairClock), solves the rider exactly as on flatground, and then
 * carries board and rider together down a real ballistic arc — a pop off the
 * lip, the drop under true gravity, and a landing past the bottom step. The
 * approach speed is whatever clears the set for that robot's pop.
 *
 * Distances down the stairs are measured from the lip (the top step's edge),
 * downhill positive; heights are over the top landing, up positive.
 */

/** World units per foot: the robot stands about five feet over its deck. */
export const FOOT = 29;
export const STAIR_STEPS = 20;
/** Nine feet down… */
export const STAIR_DROP = 9 * FOOT;
/** …over twenty feet, lip to bottom step. */
export const STAIR_RUN = 20 * FOOT;
/** Twenty risers and the nineteen treads between them. */
export const RISER = STAIR_DROP / STAIR_STEPS;
export const TREAD = STAIR_RUN / (STAIR_STEPS - 1);

/** 32 ft/s², so the drop takes the time a real one does at this scale. */
const GRAVITY = 32.2 * FOOT;
/** How far the deck rises over the top landing off a neutral pop. */
const POP_RISE = 2 * FOOT;
/**
 * Seconds of the run-up shown before the flatground roll-in (its crouch and
 * pop): El Toro's run-up is long, and the rider is seen rolling up it.
 */
const RUN_UP = 0.6;
/** Board center behind the lip when the tail strikes. */
const POP_BEHIND = 26;
/** Board center past the bottom step at touchdown. */
const LAND_PAST = 4 * FOOT;

export interface StairPlan {
  terrain: DropTerrain;
  /** Post-landing horizontal positions; only bank landings accelerate. */
  rollout: readonly number[] | null;
  /** Clock time of the pop (the tail striking at the lip) and of touchdown. */
  pop: number;
  land: number;
  /** Seconds in the air. */
  flight: number;
  /** Clock time the attempt ends at. */
  end: number;
  /** World units a second along the stairs: the approach, the flight, and the ride away. */
  speed: number;
  /** Horizontal airborne velocity; a side entry also crosses the spot in z. */
  velocity: { x: number; z: number };
  /** The deck's upward speed off the pop. */
  rise: number;
  /** The fixed spot always falls toward +x; fakie changes the rider's heading. */
  dir: 1;
}

/** A fixed takeoff and its actual landing surface; distances use the same scale as scenery. */
export interface DropTerrain {
  drop: number;
  run: number;
  landPast: number;
  laneZ: number;
  ground: (u: number) => number;
  /** Finite roof/bank boundaries where height depends on both world axes. */
  surface?: (x: number, z: number) => number;
  /** A takeoff from beside the downhill line; yaw is degrees from +x toward +z. */
  entry?: { x: number; z: number; yaw: number };
  /** Extra approach before the trick's crouch; short schoolyard landings have less room. */
  runUp?: number;
  /** Signed height gradient. Omitted for discrete stairs with a flat landing. */
  slope?: (u: number) => number;
}

export const EL_TORO_TERRAIN: DropTerrain = {
  drop: STAIR_DROP, run: STAIR_RUN, landPast: LAND_PAST, laneZ: 12 * FOOT, ground: stairGround,
};
const ROLLOUT_HZ = 240;

export function planStairs(style: Pick<SkateStyle, 'popHeight'>, landed: boolean, terrain = EL_TORO_TERRAIN): StairPlan {
  const rise = Math.sqrt(2 * GRAVITY * POP_RISE * style.popHeight);
  const landingX = terrain.run + terrain.landPast;
  const drop = -terrain.ground(landingX);
  const flight = (rise + Math.sqrt(rise * rise + 2 * GRAVITY * drop)) / GRAVITY;
  const pop = (terrain.runUp ?? RUN_UP) + ROLL_IN;
  const land = pop + flight;
  const velocity = {
    x: (landingX - (terrain.entry?.x ?? -POP_BEHIND)) / flight,
    z: (terrain.laneZ - (terrain.entry?.z ?? terrain.laneZ)) / flight,
  };
  const speed = Math.hypot(velocity.x, velocity.z);
  let rollout: number[] | null = null;
  if (terrain.slope && landed) {
    rollout = [landingX];
    const gradient = -terrain.slope(landingX);
    // Impact removes velocity normal to the bank; downhill momentum survives.
    // Wheels face downhill at touchdown. Impact scrubs the cross-bank component.
    let downhillSpeed = (velocity.x + (GRAVITY * flight - rise) * gradient) / Math.hypot(1, gradient);
    let x = landingX;
    for (let i = 0; i < Math.ceil(LAND_T * ROLLOUT_HZ) + 1; i++) {
      const slope = -terrain.slope(x);
      downhillSpeed += GRAVITY * slope / Math.hypot(1, slope) / ROLLOUT_HZ;
      x += downhillSpeed / Math.hypot(1, slope) / ROLLOUT_HZ;
      rollout.push(x);
    }
  }
  return {
    terrain,
    rollout,
    pop,
    land,
    flight,
    end: land + (landed ? LAND_T : FALL_T),
    speed,
    velocity,
    rise,
    dir: 1,
  };
}

/**
 * The flatground clock for a moment on the stairs: cruising up the run-up
 * (before the flatground clock starts), the roll-in as it is, the flight
 * stretched to the drop's hang time, and the landing (or fall) after it.
 */
export function stairClock(plan: StairPlan, t: number): number {
  if (t <= plan.pop) return t - (plan.pop - ROLL_IN);
  if (t < plan.land) return ROLL_IN + ((t - plan.pop) * FLIP_T) / plan.flight;
  return t - plan.land + ROLL_IN + FLIP_T;
}

/** The deck's height over the top landing at a stair clock time. */
export function stairDeckHeight(plan: StairPlan, t: number): number {
  if (t <= plan.pop) return 0;
  if (t >= plan.land) return plan.terrain.ground(stairDistance(plan, t, ROLL_IN + FLIP_T + t - plan.land));
  const u = t - plan.pop;
  return plan.rise * u - (GRAVITY * u * u) / 2;
}

/**
 * How far over its own flatground arc the deck is at a stair clock time:
 * board and rider are carried by this, so the trick's flatground pop arc
 * (over the flatground clock) becomes the drop down the stairs.
 */
export function stairLift(plan: StairPlan, t: number, popHeight: number, distance?: number): number {
  if (t <= plan.pop) return 0;
  if (t >= plan.land) return distance === undefined ? stairDeckHeight(plan, t) : plan.terrain.ground(distance);
  const p = (t - plan.pop) / plan.flight;
  return stairDeckHeight(plan, t) - 4 * JUMP * popHeight * p * (1 - p);
}

/**
 * How much faster (world units a second) the deck comes down at touchdown
 * than its flatground arc does on the stretched clock: the extra impact the
 * drop puts through the legs.
 */
export function landingImpact(plan: StairPlan, popHeight: number): number {
  const slope = -(plan.terrain.slope?.(plan.terrain.run + plan.terrain.landPast) ?? 0);
  const normalSpeed = (GRAVITY * plan.flight - plan.rise - plan.velocity.x * slope) / Math.hypot(1, slope);
  return Math.max(0, normalSpeed - (4 * JUMP * popHeight) / plan.flight);
}

/**
 * How far down the stairs (from the lip) the rider is. Full speed up to
 * touchdown; after it, the flatground ride away — or a fall's slide coming to
 * rest — at the stairs' speed. `streetDist` is computeFrame's, at the
 * flatground clock: seconds of travel at full speed.
 */
export function stairDistance(plan: StairPlan, t: number, streetDist: number): number {
  const entry = plan.terrain.entry;
  if (t <= plan.pop) return (entry?.x ?? -POP_BEHIND) + plan.speed * Math.cos(rad(entry?.yaw ?? 0)) * (t - plan.pop);
  if (t < plan.land) return (entry?.x ?? -POP_BEHIND) + plan.velocity.x * (t - plan.pop);
  if (plan.rollout) {
    const at = Math.max(0, (t - plan.land) * ROLLOUT_HZ);
    const i = Math.min(plan.rollout.length - 2, Math.floor(at));
    return plan.rollout[i] + (plan.rollout[i + 1] - plan.rollout[i]) * (at - i);
  }
  return plan.terrain.run + plan.terrain.landPast + plan.speed * (streetDist - (ROLL_IN + FLIP_T));
}

/** Position and heading of a drop's route, independent of the trick's own spins. */
export function stairTrack(plan: StairPlan, t: number, streetDist: number) {
  const x = stairDistance(plan, t, streetDist);
  const { entry, laneZ } = plan.terrain;
  const z = !entry || t >= plan.land ? laneZ
    : t <= plan.pop ? entry.z + plan.speed * Math.sin(rad(entry.yaw)) * (t - plan.pop)
    : entry.z + plan.velocity.z * (t - plan.pop);
  const yaw = (entry?.yaw ?? 0) * (1 - smoothstep((t - plan.pop) / plan.flight));
  // Wheel travel stays board-local when the entire route turns in the world.
  const travel = -POP_BEHIND + (t < plan.land ? plan.speed * (t - plan.pop)
    : plan.speed * plan.flight + x - plan.terrain.run - plan.terrain.landPast);
  return { x, z, yaw, travel };
}

export function terrainSurface(terrain: DropTerrain, x: number, z: number): number {
  return terrain.surface?.(x, z) ?? terrain.ground(x);
}

/** Height of the ground over the top landing, `u` down the stairs. */
export function stairGround(u: number): number {
  if (u < 0) return 0;
  if (u >= STAIR_RUN) return -STAIR_DROP;
  return -RISER * (Math.floor(u / TREAD) + 1);
}

/** Where a step's nosing line runs: through every step's top edge, from the lip down. */
export const nosingLine = (u: number) => (-u * RISER) / TREAD;

// ----- The center handrail -----

/** Galvanized pipe, its axis 36" over the nosings, as the code wants a handrail. */
export const RAIL_R = 2.4;
export const RAIL_TOP = 3 * FOOT;
/** The straight rail runs on this far past the top and bottom steps. */
export const RAIL_EXT = 35;

/**
 * El Toro's center handrail as a grind sees it: a straight pipe from just
 * before the lip to just past the bottom step, its top (a radius over the
 * axis, square to the slope) falling with the nosings. A slip comes down
 * on the steps, and a body lying on them rests along the nosings.
 */
export const EL_TORO_RAIL: Handrail = {
  start: -RAIL_EXT,
  end: STAIR_RUN + RAIL_EXT,
  top: RAIL_TOP + RAIL_R * Math.hypot(1, RISER / TREAD),
  slope: RISER / TREAD,
  ground: stairGround,
  rest: (u) => Math.max(-STAIR_DROP, Math.min(0, nosingLine(u))),
  // A good roll for a rail: well under the speed it takes to jump the set.
  speed: 13 * FOOT,
};

export interface StairTimeline {
  pop: number;
  /** The top of the arc. */
  peak: number;
  /** Where the flatground trick is caught, on the stretched clock. */
  catch: number;
  land: number;
  end: number;
}

/** The moments of a trick down the stairs, for a robot's style (its pop sets the hang time). */
export function stairTimeline(style: SkateStyle | undefined, landed = true, terrain = EL_TORO_TERRAIN): StairTimeline {
  const plan = planStairs(resolveSkateStyle(style), landed, terrain);
  return {
    pop: plan.pop,
    peak: plan.pop + plan.rise / GRAVITY,
    catch: plan.pop + plan.flight * 0.88,
    land: plan.land,
    end: plan.end,
  };
}
