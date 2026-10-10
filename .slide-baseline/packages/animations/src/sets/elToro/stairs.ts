import { FALL_T, FLIP_T, JUMP, LAND_T, ROLL_IN } from '../../motion/trick';
import { resolveSkateStyle } from '../../motion/style';
import type { SkateStyle } from '../../types';
import type { Handrail } from '../../motion/grind';
import { rad, smoothstep } from '../../math';
import { WHEEL_X } from '../../board/board';

/**
 * El Toro: the 20 stair at El Toro High School (Lake Forest, California),
 * for the three.js stage. Twenty steps falling 9.5 feet over 20 feet, laid out
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
/** Nine and a half feet down; geometry and physics share this drop. */
export const STAIR_DROP = 9.5 * FOOT;
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
  /**
   * The deck's height at each rollout position: on the bank, or in the air
   * where it rolls off a raised lower edge (Miami's granite slab) and drops
   * to the ground beyond it.
   */
  rolloutLift: readonly number[] | null;
  /** Touchdowns after rolling off an edge: clock time, and the speed the deck meets the ground with (square to it). */
  ledges: readonly { t: number; impact: number }[];
  /** Clock time of the pop (the tail striking at the lip) and of touchdown. */
  pop: number;
  land: number;
  /** Seconds in the air. */
  flight: number;
  /** Clock time the attempt ends at. */
  end: number;
  /** World units a second along the route (down the stairs, or a held line's angle): the approach, the flight, and the ride away. */
  speed: number;
  /** Horizontal airborne velocity; a side entry also crosses the spot in z. */
  velocity: { x: number; z: number };
  /** The deck's upward speed off the pop. */
  rise: number;
  /** The fixed spot always falls toward +x; fakie changes the rider's heading. */
  dir: 1;
  /** Ridden away (a held line carves back downhill), or a fall. */
  landed: boolean;
  /** The ride down a roll-in ramp (terrain.dropIn), sampled from its deck to its foot; null without one. */
  dropIn: DropInPath | null;
}

/** Clock times down a roll-in, with where the rider is (down the stairs) and how far they've rolled at each. */
export interface DropInPath {
  t: readonly number[];
  x: readonly number[];
  s: readonly number[];
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
  /**
   * A takeoff from beside the downhill line, or further back along it (yaw 0:
   * Miami's tip has a raised rim to pop before); without one, the pop is just
   * short of the lip. Yaw is degrees from +x toward +z.
   * The rider turns to face downhill (+x) by touchdown, unless `hold`: then
   * the whole route is one straight line at that heading, rolled in, flown
   * and ridden away (over Hollywood's fence at an angle), and the landing
   * (`run + landPast`, `laneZ`) lies on it.
   */
  entry?: { x: number; z: number; yaw: number; hold?: boolean };
  /** Extra approach before the trick's crouch; short schoolyard landings have less room. */
  runUp?: number;
  /**
   * A run-up that starts on a roll-in ramp's deck (`x`, its height ground(x)),
   * rolling at `speed`: the rider drops in and gains speed down it under
   * gravity, less what rolling and the air take, reaching the drop's speed at
   * its foot, then rolls on to the pop. It replaces `runUp`.
   */
  dropIn?: { x: number; speed: number };
  /**
   * The least pop the drop takes (as a style's popHeight): something to
   * clear on the way, a fence, gets popped over, however low the rider pops
   * on flatground. Their own trick is unchanged; the arc carrying it grows.
   */
  pop?: number;
  /** Signed height gradient. Omitted for discrete stairs with a flat landing. */
  slope?: (u: number) => number;
}

export const EL_TORO_TERRAIN: DropTerrain = {
  drop: STAIR_DROP, run: STAIR_RUN, landPast: LAND_PAST, laneZ: 12 * FOOT, ground: stairGround,
};
const ROLLOUT_HZ = 240;
/** How far the ground has to fall away under a rolling deck in one step for it to leave the surface. */
const LEDGE = 0.5;

export function planStairs(style: Pick<SkateStyle, 'popHeight'>, landed: boolean, terrain = EL_TORO_TERRAIN): StairPlan {
  const rise = Math.sqrt(2 * GRAVITY * POP_RISE * Math.max(style.popHeight, terrain.pop ?? 0));
  const landingX = terrain.run + terrain.landPast;
  const drop = -terrain.ground(landingX);
  const flight = (rise + Math.sqrt(rise * rise + 2 * GRAVITY * drop)) / GRAVITY;
  const velocity = {
    x: (landingX - (terrain.entry?.x ?? -POP_BEHIND)) / flight,
    z: (terrain.laneZ - (terrain.entry?.z ?? terrain.laneZ)) / flight,
  };
  const speed = Math.hypot(velocity.x, velocity.z);
  const dropIn = terrain.dropIn ? rollDown(terrain, terrain.dropIn, speed) : null;
  // Down the roll-in, then on along the flat at speed to the pop.
  const pop = dropIn
    ? dropIn.t[dropIn.t.length - 1] + (-POP_BEHIND - dropIn.x[dropIn.x.length - 1]) / speed
    : (terrain.runUp ?? RUN_UP) + ROLL_IN;
  const land = pop + flight;
  let rollout: number[] | null = null;
  let rolloutLift: number[] | null = null;
  const ledges: { t: number; impact: number }[] = [];
  if (terrain.slope && landed) {
    rollout = [landingX];
    rolloutLift = [terrain.ground(landingX)];
    const gradient = -terrain.slope(landingX);
    // Impact removes velocity normal to the bank; downhill momentum survives.
    // Wheels face downhill at touchdown. Impact scrubs the cross-bank component.
    let downhillSpeed = (velocity.x + (GRAVITY * flight - rise) * gradient) / Math.hypot(1, gradient);
    let x = landingX;
    let y = rolloutLift[0];
    // The deck's velocity while it's off an edge, falling to the ground past it.
    let air: { x: number; y: number } | null = null;
    for (let i = 0; i < Math.ceil(LAND_T * ROLLOUT_HZ) + 1; i++) {
      if (air) {
        air.y -= GRAVITY / ROLLOUT_HZ;
        x += air.x / ROLLOUT_HZ;
        y += air.y / ROLLOUT_HZ;
        const floor = terrain.ground(x);
        if (y <= floor) {
          // Back down: the hit scrubs the speed square to the ground, as on the bank.
          const slope = -terrain.slope(x);
          const n = Math.hypot(1, slope);
          downhillSpeed = (air.x - air.y * slope) / n;
          ledges.push({ t: land + (i + 1) / ROLLOUT_HZ, impact: (-air.y - air.x * slope) / n });
          y = floor;
          air = null;
        }
      } else {
        const slope = -terrain.slope(x);
        const n = Math.hypot(1, slope);
        downhillSpeed += GRAVITY * slope / n / ROLLOUT_HZ;
        const dx = downhillSpeed / n / ROLLOUT_HZ;
        // Where carrying straight on along the surface puts the deck. A bank
        // curving into the flat stays under it; a ledge falls away from it.
        const along = y - slope * dx;
        x += dx;
        const floor = terrain.ground(x);
        if (floor < along - LEDGE) {
          air = { x: downhillSpeed / n, y: -downhillSpeed * slope / n };
          y = along;
        } else y = floor;
      }
      rollout.push(x);
      rolloutLift.push(y);
    }
  }
  return {
    terrain,
    rollout,
    rolloutLift,
    ledges,
    pop,
    land,
    flight,
    end: land + (landed ? LAND_T : FALL_T),
    speed,
    velocity,
    rise,
    dir: 1,
    landed,
    dropIn,
  };
}

/** Samples down a roll-in. */
const DROP_IN_STEPS = 400;

/**
 * The ride down a roll-in ramp from its deck to its foot. Speed comes from
 * the height fallen: v² = v₀² + 2·k·g·h, where k is the share of gravity
 * left after rolling and the air take, set so the rider reaches the drop's
 * `speed` at the foot (a little over 1 where a low pop needs more speed than
 * the ramp gives, and the rider pumps its transition).
 */
function rollDown(terrain: DropTerrain, from: { x: number; speed: number }, speed: number): DropInPath {
  const { ground } = terrain;
  let foot = from.x;
  while (foot < 0 && ground(foot) > 1e-9) foot += 1;
  const top = ground(from.x);
  const k = (speed * speed - from.speed * from.speed) / (2 * GRAVITY * Math.max(1e-6, top - ground(foot)));
  const t = [0];
  const x = [from.x];
  const s = [0];
  for (let i = 1; i <= DROP_IN_STEPS; i++) {
    const a = x[i - 1];
    const b = from.x + ((foot - from.x) * i) / DROP_IN_STEPS;
    const length = Math.hypot(b - a, ground(b) - ground(a));
    const fallen = top - ground((a + b) / 2);
    const v = Math.sqrt(from.speed * from.speed + 2 * k * GRAVITY * Math.max(0, fallen));
    t.push(t[i - 1] + length / v);
    x.push(b);
    s.push(s[i - 1] + length);
  }
  return { t, x, s };
}

/** Where along a sampled roll-in the rider is at clock time `t` (before its foot). */
function alongDropIn(path: DropInPath, t: number, values: readonly number[]): number {
  let lo = 0;
  let hi = path.t.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path.t[mid] <= t) lo = mid;
    else hi = mid;
  }
  const p = (t - path.t[lo]) / (path.t[hi] - path.t[lo]);
  return values[lo] + (values[hi] - values[lo]) * Math.max(0, Math.min(1, p));
}

/** Clock time a roll-in reaches its foot; 0 without one. */
export const dropInEnd = (plan: StairPlan) => plan.dropIn?.t[plan.dropIn.t.length - 1] ?? 0;

/**
 * Where a board sits on a roll-in at `u`: the grade of the chord between
 * its wheels' contact points and the height of its middle. Pitched, its
 * wheels touch closer together than along the flat (WHEEL_X across the
 * slope), so the chord is found over the span they actually reach.
 */
function seat(ground: (u: number) => number, u: number): { grade: number; height: number } {
  let half = WHEEL_X;
  let grade = 0;
  for (let i = 0; i < 6; i++) {
    grade = (ground(u + half) - ground(u - half)) / (2 * half);
    half = WHEEL_X / Math.hypot(1, grade);
  }
  return { grade, height: (ground(u + half) + ground(u - half)) / 2 };
}

/**
 * How high the board rides over the top landing on the run-up: on a roll-in
 * the middle of the chord between its wheels, both on the ramp (through the
 * rounded lip too); 0 on flat ground and after the pop.
 */
export function rideHeight(plan: StairPlan, t: number): number {
  if (!plan.dropIn || t > plan.pop) return 0;
  return seat(plan.terrain.ground, stairDistance(plan, t, 0)).height;
}

/** The run-up's signed height gradient under the board, along the same chord; 0 off a roll-in. */
export function rideGrade(plan: StairPlan, t: number): number {
  if (!plan.dropIn || t > plan.pop) return 0;
  return seat(plan.terrain.ground, stairDistance(plan, t, 0)).grade;
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

/** A rollout sample's value at clock time `t` after touchdown. */
function alongRollout(values: readonly number[], plan: StairPlan, t: number): number {
  const at = Math.max(0, (t - plan.land) * ROLLOUT_HZ);
  const i = Math.min(values.length - 2, Math.floor(at));
  return values[i] + (values[i + 1] - values[i]) * (at - i);
}

/**
 * The height of the route the deck follows at `x` down the spot: the
 * ground, except where a bank's rollout leaves a raised edge and is in the
 * air over it. Its chord between the trucks is the board's pitch.
 */
export function routeHeight(plan: StairPlan, x: number): number {
  const { rollout, rolloutLift } = plan;
  if (!rollout || !rolloutLift || x <= rollout[0] || x >= rollout[rollout.length - 1]) return plan.terrain.ground(x);
  let lo = 0;
  let hi = rollout.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (rollout[mid] <= x) lo = mid;
    else hi = mid;
  }
  const p = (x - rollout[lo]) / (rollout[hi] - rollout[lo]);
  return rolloutLift[lo] + (rolloutLift[hi] - rolloutLift[lo]) * p;
}

/** The deck's height over the top landing at a stair clock time. */
export function stairDeckHeight(plan: StairPlan, t: number): number {
  if (t <= plan.pop) return 0;
  if (t >= plan.land && plan.rolloutLift) return alongRollout(plan.rolloutLift, plan, t);
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
  if (t <= plan.pop) return rideHeight(plan, t);
  if (t >= plan.land) return distance === undefined || plan.rolloutLift ? stairDeckHeight(plan, t) : plan.terrain.ground(distance);
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

/** Drops at or under this land without a jolt; one this high lands the hardest. */
const JOLT_FROM = 4 * FOOT;
const JOLT_FULL = 15 * FOOT;

/**
 * How hard a drop lands, 0 → 1, for what shows it beyond the knees (which
 * bottom out on any big set): the camera's jolt, the dust, how long the
 * rider stays down. It grows with the height fallen, as the energy the
 * landing takes does: Hollywood's 8 feet, then El Toro's 9.5, then Leap of
 * Faith and Lyon at nearly 15. A bank takes none: it turns the fall into
 * speed down it.
 */
export function landingJolt(plan: StairPlan): number {
  if (plan.terrain.slope) return 0;
  const drop = -plan.terrain.ground(plan.terrain.run + plan.terrain.landPast);
  return Math.max(0, Math.min(1, (drop - JOLT_FROM) / (JOLT_FULL - JOLT_FROM)));
}

/**
 * How far down the stairs (from the lip) the rider is. Full speed up to
 * touchdown; after it, the flatground ride away (rideAway: off a held line,
 * carving back downhill) — or a fall's slide coming to rest — at the route's
 * speed. `streetDist` is computeFrame's, at the flatground clock: seconds of
 * travel at full speed.
 */
export function stairDistance(plan: StairPlan, t: number, streetDist: number): number {
  const entry = plan.terrain.entry;
  if (plan.dropIn && t < dropInEnd(plan)) return alongDropIn(plan.dropIn, t, plan.dropIn.x);
  if (t <= plan.pop) return (entry?.x ?? -POP_BEHIND) + plan.speed * Math.cos(rad(entry?.yaw ?? 0)) * (t - plan.pop);
  if (t < plan.land) return (entry?.x ?? -POP_BEHIND) + plan.velocity.x * (t - plan.pop);
  if (plan.rollout) return alongRollout(plan.rollout, plan, t);
  return plan.terrain.run + plan.terrain.landPast + rideAway(plan, rolledAway(plan, streetDist)).x;
}

/**
 * How fast the rider rolls along the route at `t`, world units a second:
 * gaining speed down a roll-in, at the route's speed on to the pop and
 * through the air, then away from the landing — faster on down a bank.
 */
export function stairSpeed(plan: StairPlan, t: number): number {
  if (plan.dropIn && t < dropInEnd(plan)) {
    const h = 1 / ROLLOUT_HZ;
    return (runUpTravel(plan, t + h) - runUpTravel(plan, t - h)) / (2 * h);
  }
  if (!plan.rollout || t <= plan.land) return plan.speed;
  const i = Math.min(plan.rollout.length - 2, Math.floor((t - plan.land) * ROLLOUT_HZ));
  return (plan.rollout[i + 1] - plan.rollout[i]) * ROLLOUT_HZ;
}

/** World units rolled since touchdown, at the flatground clock's `streetDist`. */
const rolledAway = (plan: StairPlan, streetDist: number) => plan.speed * (streetDist - (ROLL_IN + FLIP_T));

/** The route's heading at touchdown (degrees from +x toward +z): downhill, or a held entry's. */
export const landingYaw = (terrain: DropTerrain) => (terrain.entry?.hold ? terrain.entry.yaw : 0);

/**
 * How far a held line's rider carves back to riding downhill after landing:
 * along the sidewalk past Hollywood's fence, rather than on out into the road.
 */
const CARVE_AWAY = 10 * FOOT;

/**
 * Where the ride away has got to `s` world units past touchdown, from the
 * landing (and the heading there, in degrees). Straight downhill off the
 * stairs; off a held line a landed rider carves round to downhill over
 * CARVE_AWAY, while a fall slides on along the line.
 */
function rideAway(plan: StairPlan, s: number): { x: number; z: number; yaw: number } {
  const from = landingYaw(plan.terrain);
  if (!from) return { x: s, z: 0, yaw: 0 };
  const yaw = (d: number) => from * (plan.landed ? 1 - smoothstep(d / CARVE_AWAY) : 1);
  if (!plan.landed || s <= 0) return { x: s * Math.cos(rad(from)), z: s * Math.sin(rad(from)), yaw: from };
  // Simpson's rule along the carve, then straight on downhill.
  const curve = Math.min(s, CARVE_AWAY);
  const n = 16;
  let x = 0;
  let z = 0;
  for (let i = 0; i <= n; i++) {
    const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
    const a = rad(yaw((curve * i) / n));
    x += w * Math.cos(a);
    z += w * Math.sin(a);
  }
  return { x: (x * curve) / (3 * n) + (s - curve), z: (z * curve) / (3 * n), yaw: yaw(s) };
}

/**
 * A side entry isn't squared up in the air: the rider is still finishing
 * the turn as the wheels meet the landing and carves the last of it out
 * after, over this many seconds past touchdown.
 */
export const TURN_PAST_TOUCHDOWN = 0.4;

/** How far round a side entry's turn the rider is: 0 at the pop, 1 once carved to face downhill. */
export const entryTurn = (plan: StairPlan, t: number) =>
  smoothstep((t - plan.pop) / (plan.flight + TURN_PAST_TOUCHDOWN));

/** Position and heading of a drop's route, independent of the trick's own spins. */
export function stairTrack(plan: StairPlan, t: number, streetDist: number) {
  const x = stairDistance(plan, t, streetDist);
  const { entry, laneZ } = plan.terrain;
  if (t >= plan.land) {
    // Rolled since touchdown: down the bank's rollout, or the ride away.
    const s = plan.rollout ? x - plan.terrain.run - plan.terrain.landPast : rolledAway(plan, streetDist);
    const away = plan.rollout ? null : rideAway(plan, s);
    // A side entry's last few degrees of turn carve out on the landing.
    const carving = entry && !entry.hold ? entry.yaw * (1 - entryTurn(plan, t)) : 0;
    // Wheel travel stays board-local when the entire route turns in the world.
    return { x, z: laneZ + (away?.z ?? 0), yaw: (away?.yaw ?? 0) + carving, travel: -POP_BEHIND + plan.speed * plan.flight + s };
  }
  const z = !entry ? laneZ
    : t <= plan.pop ? entry.z + plan.speed * Math.sin(rad(entry.yaw)) * (t - plan.pop)
    : entry.z + plan.velocity.z * (t - plan.pop);
  const yaw = !entry ? 0 : entry.hold ? entry.yaw : entry.yaw * (1 - entryTurn(plan, t));
  return { x, z, yaw, travel: runUpTravel(plan, t) };
}

/** Distance rolled before touchdown, 0 at the pop: down a roll-in by its own path, then at speed. */
function runUpTravel(plan: StairPlan, t: number): number {
  const end = dropInEnd(plan);
  if (!plan.dropIn || t >= end) return -POP_BEHIND + plan.speed * (t - plan.pop);
  const { s } = plan.dropIn;
  return -POP_BEHIND + plan.speed * (end - plan.pop) - (s[s.length - 1] - alongDropIn(plan.dropIn, t, s));
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
  radius: RAIL_R,
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
