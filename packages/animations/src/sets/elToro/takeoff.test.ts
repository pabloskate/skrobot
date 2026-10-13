import { describe, expect, it } from 'vitest';
import { TIP_X } from '../../board/deck';
import { resolveSkateStyle } from '../../motion/style';
import { X0 } from '../../motion/trick';
import { planStage, stageFrame, type StagePlan } from '../../stage/stage';
import type { RiderStance, Stance } from '../../types';
import { INCH } from '../../units';
import { STAGE_SETS, setTerrain, setTimeline, type Obstacle } from '../sets';
import { sweep } from '../../testing';
import { planStairs, popsFromNose, terrainSurface } from './stairs';

/**
 * Where a gap trick leaves the ground. A nollie pops off the nose, the end
 * that leads to the edge: it strikes the takeoff's ground short of the edge,
 * never the air past it, so the rider pops further back than a tail pop does,
 * on the same flight, clock and landing. Every other stance takes off where
 * it always has.
 */

const DROPS = STAGE_SETS.filter((set) => set.terrain).flatMap((set) =>
  (set.obstacles?.map((o) => o.id) ?? ['stairs' as Obstacle]).map((obstacle) => ({ set: set.id, obstacle })));
const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const RIDERS: RiderStance[] = ['regular', 'goofy'];
const BASES = ['Ollie', 'Kickflip', 'Heelflip', '360 Flip', 'Frontside 180'];

const plan = (drop: (typeof DROPS)[number], base: string, stance: Stance, rider: RiderStance = 'regular', landed = true): StagePlan =>
  planStage({ id: base, name: base, base, stance }, {
    landed, riderStance: rider, style: resolveSkateStyle(undefined), fall: 'kickout', shankProgress: 0.65, set: drop.set, obstacle: drop.obstacle,
  });

/** The nose's tip and the ground under it (over the top landing) at clock `t`, and the board's middle. */
function nose(stage: StagePlan, t: number) {
  const frame = stageFrame(stage, t, 1);
  const world = (p: { x: number; z: number }) => ({ x: frame.scroll + p.x - X0, z: frame.stairs!.across + p.z });
  const tip = world(frame.rig.board.point({ x: TIP_X, y: 0, z: 0 }));
  return { tip, ground: terrainSurface(stage.stairs!.terrain, tip.x, tip.z), center: world(frame.rig.board.center) };
}

describe('drop takeoff', () => {
  it('strikes a nollie’s nose on the takeoff, from the wind-up to the pop, at every drop', () => {
    for (const drop of DROPS) for (const base of sweep(BASES, 2)) for (const rider of RIDERS) {
      const stage = plan(drop, base, 'nollie', rider);
      const { pop } = stage.stairs!;
      for (const t of [pop - 0.3, pop - 0.15, pop - 0.05, pop]) {
        expect(nose(stage, t).ground, `${drop.set} ${drop.obstacle} ${base} ${rider} at ${t}`).toBeGreaterThan(-0.5);
      }
    }
  });

  it('pops a nollie just short of a stair lip, not a board length back', () => {
    for (const set of ['el-toro', 'hollywood-high', 'lyon-25', 'wallenberg'] as const) {
      const stage = plan({ set, obstacle: 'stairs' }, 'Ollie', 'nollie');
      const { tip } = nose(stage, stage.stairs!.pop);
      expect(tip.x).toBeLessThan(0);
      expect(tip.x).toBeGreaterThan(-2 * INCH - 1.5);
    }
  });

  it('leaves every other stance’s takeoff and trajectory exactly as it was, fakie’s included', () => {
    for (const drop of DROPS) {
      const terrain = setTerrain(drop.set, drop.obstacle)!;
      const style = resolveSkateStyle(undefined);
      // The plan a drop had before stances took part in it.
      const before = planStairs(style, true, terrain);
      for (const stance of STANCES.filter((s) => !popsFromNose(s))) {
        expect(plan(drop, 'Kickflip', stance).stairs, `${drop.set} ${drop.obstacle} ${stance}`).toEqual(before);
      }
      expect(before.takeoff).toEqual({ x: terrain.entry?.x ?? -26, z: terrain.entry?.z ?? terrain.laneZ });
    }
  });

  it('moves a nollie back along the route only, on the same flight to the same landing', () => {
    for (const drop of DROPS) {
      const regular = plan(drop, 'Ollie', 'regular').stairs!;
      const nollie = plan(drop, 'Ollie', 'nollie').stairs!;
      expect(nollie.flight).toBe(regular.flight);
      expect(nollie.rise).toBe(regular.rise);
      expect(nollie.land - nollie.pop).toBe(regular.land - regular.pop);
      const yaw = (regular.terrain.entry?.yaw ?? 0) * Math.PI / 180;
      const back = { x: regular.takeoff.x - nollie.takeoff.x, z: regular.takeoff.z - nollie.takeoff.z };
      expect(Math.abs(back.x * Math.sin(yaw) - back.z * Math.cos(yaw))).toBeLessThan(1e-9);
      expect(back.x * Math.cos(yaw) + back.z * Math.sin(yaw)).toBeGreaterThanOrEqual(0);
      expect(back.x * Math.cos(yaw) + back.z * Math.sin(yaw)).toBeLessThan(TIP_X + 2 * INCH);
      // Popping earlier, it carries a little more speed to the same landing.
      expect(nollie.speed).toBeGreaterThanOrEqual(regular.speed);
    }
  });

  it('keeps a nollie’s approach, pop and flight continuous and lands it where the tail pop lands', () => {
    for (const drop of DROPS) for (const base of sweep(BASES, 2)) {
      const stage = plan(drop, base, 'nollie');
      const tail = plan(drop, base, 'regular');
      const { pop, land, speed } = stage.stairs!;
      // The board's middle moves at the route's speed through the pop: no jump at the strike.
      const step = 1 / 240;
      for (let t = pop - 0.1; t <= pop + 0.1; t += step) {
        const a = nose(stage, t).center, b = nose(stage, t + step).center;
        expect(Math.hypot(b.x - a.x, b.z - a.z), `${drop.set} ${base} at ${t}`).toBeLessThan(speed * step * 1.6 + 1);
      }
      const touchdown = stageFrame(stage, land, 1), tailTouchdown = stageFrame(tail, tail.stairs!.land, 1);
      expect(touchdown.scroll, `${drop.set} ${drop.obstacle} ${base}`).toBeCloseTo(tailTouchdown.scroll, 6);
      expect(touchdown.stairs!.across).toBeCloseTo(tailTouchdown.stairs!.across, 6);
    }
  });

  it('puts regular and goofy riders on the same takeoff', () => {
    for (const drop of DROPS) for (const stance of STANCES) {
      expect(plan(drop, 'Kickflip', stance, 'goofy').stairs).toEqual(plan(drop, 'Kickflip', stance, 'regular').stairs);
    }
  });

  it('times a drop by the same plan the stage plays, in every stance', () => {
    for (const drop of DROPS) for (const stance of STANCES) {
      const stairs = plan(drop, 'Ollie', stance).stairs!;
      const timeline = setTimeline(drop.set, undefined, true, drop.obstacle, stance);
      expect(timeline.pop).toBe(stairs.pop);
      expect(timeline.land).toBe(stairs.land);
      expect(timeline.end).toBe(stairs.end);
    }
  });

  it('pops a nollie kick-out off the same takeoff as the landed attempt', () => {
    for (const drop of DROPS) {
      expect(plan(drop, 'Kickflip', 'nollie', 'regular', false).stairs!.takeoff).toEqual(plan(drop, 'Kickflip', 'nollie').stairs!.takeoff);
    }
  });
});
