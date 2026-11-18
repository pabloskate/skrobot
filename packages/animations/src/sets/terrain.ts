/**
 * What a spot hands the stage to fly a gap trick down: a fixed takeoff and
 * the landing surface under it. A spot lays its terrain out in its own set
 * units (its `<spot>Layout.ts`); the stage's planner (stage/drop.ts) takes
 * it in the stage's, scaled as the spot is registered (setScale.ts).
 *
 * Distances down the drop are measured from the lip (the takeoff's edge),
 * downhill positive; heights are over the top landing, up positive.
 */

import type { BoardSweep } from '../motion/trick';

/** A fixed takeoff and its actual landing surface: a set lays it out in set units, the planner takes it in the stage's (stageTerrain). */
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
   * A run-up that comes in off the pop's line and carves onto it (Carlsbad's,
   * out of the classroom hallway): the rider rolls in at `yaw` (degrees from
   * +x toward +z), carves round to the pop's heading over `over`, and rolls
   * the last `straight` of it square to the lip (both along the path). The
   * rider leans into the carve as its speed and curve ask.
   */
  carveIn?: { yaw: number; over: number; straight: number };
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
  /**
   * The pop each trick takes, whoever rides it (as a style's popHeight, in
   * place of both theirs and `pop`), by how its board sweeps past what's
   * beside the line (motion/trick.ts boardSweep): over obstacles about level
   * with the takeoff (Hollywood's side rail and fence) a skater pops just
   * what the trick needs to clear them, not as high as they can; over Leap
   * of Faith's stair rail an impossible's wrap needs more than the rest.
   * Without a trick, the planner takes the most of the three.
   */
  trickPop?: Readonly<Record<BoardSweep, number>>;
  /** Signed height gradient. Omitted for discrete stairs with a flat landing. */
  slope?: (u: number) => number;
  /**
   * How far down the route (`u`) a landing can be ridden: past it there's no
   * room (Emage's river bank), so a landed rider steps off the board before
   * it and runs it out on their feet (motion/fall/stepOff.ts).
   */
  runout?: number;
  /** Brush on the ground at (u, z): how fast it slows a rider or a board going through it (a share of the speed a second). */
  brush?: (u: number, z: number) => number;
}

/** The ground under (x, z): a spot's two-axis surface where it has one, else its profile down the drop. */
export function terrainSurface(terrain: DropTerrain, x: number, z: number): number {
  return terrain.surface?.(x, z) ?? terrain.ground(x);
}

/** The route's heading at touchdown (degrees from +x toward +z): downhill, or a held entry's. */
export const landingYaw = (terrain: DropTerrain) => (terrain.entry?.hold ? terrain.entry.yaw : 0);
