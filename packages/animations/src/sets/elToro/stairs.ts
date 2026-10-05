import { FALL_T, FLIP_T, JUMP, LAND_T, ROLL_IN } from '../../motion/trick';
import { resolveSkateStyle } from '../../motion/style';
import type { SkateStyle } from '../../types';
import type { Handrail } from '../../motion/grind';

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
  /** Clock time of the pop (the tail striking at the lip) and of touchdown. */
  pop: number;
  land: number;
  /** Seconds in the air. */
  flight: number;
  /** Clock time the attempt ends at. */
  end: number;
  /** World units a second along the stairs: the approach, the flight, and the ride away. */
  speed: number;
  /** The deck's upward speed off the pop. */
  rise: number;
  /** The fixed spot always falls toward +x; fakie changes the rider's heading. */
  dir: 1;
}

export function planStairs(style: Pick<SkateStyle, 'popHeight'>, landed: boolean): StairPlan {
  const rise = Math.sqrt(2 * GRAVITY * POP_RISE * style.popHeight);
  const flight = (rise + Math.sqrt(rise * rise + 2 * GRAVITY * STAIR_DROP)) / GRAVITY;
  const pop = RUN_UP + ROLL_IN;
  const land = pop + flight;
  return {
    pop,
    land,
    flight,
    end: land + (landed ? LAND_T : FALL_T),
    speed: (POP_BEHIND + STAIR_RUN + LAND_PAST) / flight,
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
  if (t <= plan.pop) return t - RUN_UP;
  if (t < plan.land) return ROLL_IN + ((t - plan.pop) * FLIP_T) / plan.flight;
  return t - plan.land + ROLL_IN + FLIP_T;
}

/** The deck's height over the top landing at a stair clock time. */
export function stairDeckHeight(plan: StairPlan, t: number): number {
  if (t <= plan.pop) return 0;
  if (t >= plan.land) return -STAIR_DROP;
  const u = t - plan.pop;
  return plan.rise * u - (GRAVITY * u * u) / 2;
}

/**
 * How far over its own flatground arc the deck is at a stair clock time:
 * board and rider are carried by this, so the trick's flatground pop arc
 * (over the flatground clock) becomes the drop down the stairs.
 */
export function stairLift(plan: StairPlan, t: number, popHeight: number): number {
  if (t <= plan.pop) return 0;
  if (t >= plan.land) return -STAIR_DROP;
  const p = (t - plan.pop) / plan.flight;
  return stairDeckHeight(plan, t) - 4 * JUMP * popHeight * p * (1 - p);
}

/**
 * How much faster (world units a second) the deck comes down at touchdown
 * than its flatground arc does on the stretched clock: the extra impact the
 * drop puts through the legs.
 */
export function landingImpact(plan: StairPlan, popHeight: number): number {
  return Math.max(0, GRAVITY * plan.flight - plan.rise - (4 * JUMP * popHeight) / plan.flight);
}

/**
 * How far down the stairs (from the lip) the rider is. Full speed up to
 * touchdown; after it, the flatground ride away — or a fall's slide coming to
 * rest — at the stairs' speed. `streetDist` is computeFrame's, at the
 * flatground clock: seconds of travel at full speed.
 */
export function stairDistance(plan: StairPlan, t: number, streetDist: number): number {
  if (t < plan.land) return -POP_BEHIND + plan.speed * (t - plan.pop);
  return STAIR_RUN + LAND_PAST + plan.speed * (streetDist - (ROLL_IN + FLIP_T));
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
export function stairTimeline(style: SkateStyle | undefined, landed = true): StairTimeline {
  const plan = planStairs(resolveSkateStyle(style), landed);
  return {
    pop: plan.pop,
    peak: plan.pop + plan.rise / GRAVITY,
    catch: plan.pop + plan.flight * 0.88,
    land: plan.land,
    end: plan.end,
  };
}
