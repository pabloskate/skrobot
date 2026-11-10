import { describe, expect, it } from 'vitest';
import { TIP_X } from '../../board/deck';
import { resolveSkateStyle } from '../../motion/style';
import { ROLL_IN, X0 } from '../../motion/trick';
import { planStage, stageFrame, type StagePlan } from '../../stage/stage';
import type { RiderStance, Stance } from '../../types';
import { INCH } from '../../units';
import { STAGE_SETS, setTerrain, setTimeline, type Obstacle } from '../sets';
import { sweep } from '../../testing';
import { planStairs, popsFromLeadingEnd, terrainSurface } from './stairs';

/**
 * Where a gap trick leaves the ground. A nollie pops off the nose and a fakie
 * off the tail, the end that leads to the edge: it strikes the takeoff's
 * ground short of the edge, never the air past it, so the rider pops further
 * back than a trailing tail's pop does, on the same flight, clock and
 * landing. Regular and switch take off where they always have.
 */
const LEADING: Stance[] = ['nollie', 'fakie'];

const DROPS = STAGE_SETS.filter((set) => set.terrain).flatMap((set) =>
  (set.obstacles?.map((o) => o.id) ?? ['stairs' as Obstacle]).map((obstacle) => ({ set: set.id, obstacle })));
const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const RIDERS: RiderStance[] = ['regular', 'goofy'];
const BASES = ['Ollie', 'Kickflip', 'Heelflip', '360 Flip', 'Frontside 180'];

const plan = (drop: (typeof DROPS)[number], base: string, stance: Stance, rider: RiderStance = 'regular', landed = true): StagePlan =>
  planStage({ id: base, name: base, base, stance }, {
    landed, riderStance: rider, style: resolveSkateStyle(undefined), fall: 'kickout', shankProgress: 0.65, set: drop.set, obstacle: drop.obstacle,
  });

/** The leading end's tip and the ground under it (over the top landing) at clock `t`, and the board's middle. */
function nose(stage: StagePlan, t: number) {
  const frame = stageFrame(stage, t, 1);
  const world = (p: { x: number; z: number }) => ({ x: frame.scroll + p.x - X0, z: frame.stairs!.across + p.z });
  const { velocity } = stage.stairs!;
  const ahead = (p: { x: number; z: number }) => p.x * velocity.x + p.z * velocity.z;
  const [a, b] = [TIP_X, -TIP_X].map((x) => world(frame.rig.board.point({ x, y: 0, z: 0 })));
  const tip = ahead(a) >= ahead(b) ? a : b;
  return { tip, ground: terrainSurface(stage.stairs!.terrain, tip.x, tip.z), center: world(frame.rig.board.center) };
}

describe('drop takeoff', () => {
  it('strikes a nollie’s nose and a fakie’s tail on the takeoff, from the wind-up to the pop, at every drop', () => {
    for (const drop of DROPS) for (const base of sweep(BASES, 2)) for (const rider of RIDERS) for (const stance of LEADING) {
      const stage = plan(drop, base, stance, rider);
      const { pop } = stage.stairs!;
      for (const t of [pop - 0.3, pop - 0.15, pop - 0.05, pop]) {
        expect(nose(stage, t).ground, `${drop.set} ${drop.obstacle} ${base} ${stance} ${rider} at ${t}`).toBeGreaterThan(-0.5);
      }
    }
  });

  it('pops a nollie or a fakie just short of a stair lip, not a board length back', () => {
    for (const set of ['el-toro', 'hollywood-high', 'lyon-25', 'wallenberg'] as const) for (const stance of LEADING) {
      const stage = plan({ set, obstacle: 'stairs' }, 'Ollie', stance);
      const { tip } = nose(stage, stage.stairs!.pop);
      expect(tip.x, `${set} ${stance}`).toBeLessThan(0);
      expect(tip.x, `${set} ${stance}`).toBeGreaterThan(-2 * INCH - 1.5);
    }
  });

  it('leaves a trailing tail’s takeoff and trajectory exactly as it was, regular and switch', () => {
    for (const drop of DROPS) {
      const terrain = setTerrain(drop.set, drop.obstacle)!;
      const style = resolveSkateStyle(undefined);
      // The plan a drop had before stances took part in it (the same trick: Hollywood's fence pops each its own).
      const before = planStairs(style, true, terrain, 'regular', 'Kickflip');
      for (const stance of STANCES.filter((s) => !popsFromLeadingEnd(s))) {
        expect(plan(drop, 'Kickflip', stance).stairs, `${drop.set} ${drop.obstacle} ${stance}`).toEqual(before);
      }
      expect(before.takeoff).toEqual({ x: terrain.entry?.x ?? -26, z: terrain.entry?.z ?? terrain.laneZ });
    }
  });

  it('moves a nollie or fakie back along the route only, on the same flight to the same landing', () => {
    for (const drop of DROPS) for (const stance of LEADING) {
      const regular = plan(drop, 'Ollie', 'regular').stairs!;
      const nollie = plan(drop, 'Ollie', stance).stairs!;
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

  it('keeps a nollie’s or fakie’s approach, pop and flight continuous and lands it where the tail pop lands', () => {
    for (const drop of DROPS) for (const base of sweep(BASES, 2)) for (const stance of LEADING) {
      const stage = plan(drop, base, stance);
      const tail = plan(drop, base, 'regular');
      const { pop, land, speed } = stage.stairs!;
      // The board's middle moves at the route's speed through the pop: no jump at the strike.
      const step = 1 / 240;
      for (let t = pop - 0.1; t <= pop + 0.1; t += step) {
        const a = nose(stage, t).center, b = nose(stage, t + step).center;
        expect(Math.hypot(b.x - a.x, b.z - a.z), `${drop.set} ${base} ${stance} at ${t}`).toBeLessThan(speed * step * 1.6 + 1);
      }
      const touchdown = stageFrame(stage, land, 1), tailTouchdown = stageFrame(tail, tail.stairs!.land, 1);
      expect(touchdown.scroll, `${drop.set} ${drop.obstacle} ${base} ${stance}`).toBeCloseTo(tailTouchdown.scroll, 6);
      expect(touchdown.stairs!.across).toBeCloseTo(tailTouchdown.stairs!.across, 6);
    }
  });

  it('snaps the board up off a drop as quickly as on flatground, in every stance', () => {
    // The tail strike is a foot hitting the ground: the drop's longer hang mustn't slow it.
    const style = resolveSkateStyle(undefined);
    for (const drop of DROPS) for (const stance of STANCES) {
      const stage = plan(drop, 'Ollie', stance);
      const flat = planStage({ id: 'Ollie', name: 'Ollie', base: 'Ollie', stance }, {
        landed: true, riderStance: 'regular', style, fall: 'kickout', shankProgress: 0.65, set: 'plaza',
      });
      for (const after of [0.025, 0.05, 0.075]) {
        const atDrop = Math.abs(stageFrame(stage, stage.stairs!.pop + after, 1).rig.board.pitchDeg);
        const onFlat = Math.abs(stageFrame(flat, ROLL_IN + after, 1).rig.board.pitchDeg);
        expect(atDrop, `${drop.set} ${drop.obstacle} ${stance} +${after}`).toBeGreaterThan(onFlat * 0.8);
      }
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
      const timeline = setTimeline(drop.set, undefined, true, drop.obstacle, stance, 'Ollie');
      expect(timeline.pop).toBe(stairs.pop);
      expect(timeline.land).toBe(stairs.land);
      expect(timeline.end).toBe(stairs.end);
    }
  });

  it('pops a nollie or fakie kick-out off the same takeoff as the landed attempt', () => {
    for (const drop of DROPS) for (const stance of LEADING) {
      expect(plan(drop, 'Kickflip', stance, 'regular', false).stairs!.takeoff).toEqual(plan(drop, 'Kickflip', stance).stairs!.takeoff);
    }
  });
});
