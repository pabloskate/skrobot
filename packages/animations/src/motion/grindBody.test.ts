import { describe, expect, it } from 'vitest';
import { GROUND, H, SKY_PAD, W } from './trick';
import { resolveSkateStyle } from './style';
import { isFiniteFrame, SWEEP_TIMEOUT } from '../testing';
import { stageFrame } from '../stage/stage';
import { deckTopY } from '../board/board';
import { DEFAULT_SCENE_CAMERA, fallSink, makeCamera } from '../camera/camera';
import { grindCameraLift, grindCameraTrack } from './grind';
import { GRIND_BASES } from './grindDefinitions';
import { solveGrindRig } from './grindRig';
import { DECK_HALF_WIDTH, SHIN, SHOE_HALF_HEIGHT, THIGH, type Rig } from './skeleton';
import {
  COMBO_DIMS,
  FALLS,
  NEUTRAL,
  OUTCOMES,
  SIDES,
  covering,
  dist,
  everyGrind,
  jointJolts,
  joints,
  nameOf,
  planFor,
  stageOf,
  stepOf,
  sweepBounds,
  toBoard,
} from './grindTesting';

/**
 * The body on a plain grind keeps the flatground rig's promises: whole legs,
 * soles on the grip, no pops, always in frame (see grind.test.ts).
 */

/** Seconds a pop keeps the board's end dipped at its steepest. */
const POP_SNAP_T = 0.1;

describe('Grind body', () => {
  it('holds the complete starting pose throughout the lead-in', () => {
    // Compare physical points and frame axes, including soles and head aim;
    // rendering attributes alone do not expose all of the rider's geometry.
    const pose = (rig: Rig) => JSON.parse(JSON.stringify(rig));
    for (const { base, side, rider, stance, label } of covering(everyGrind(), ...COMBO_DIMS)) {
      const { plan, mechanics } = planFor(base, side, stance, rider, null);
      const start = pose(solveGrindRig(0, plan, mechanics, NEUTRAL).rig);
      for (const t of [-2, -0.9, -0.001]) {
        expect(pose(solveGrindRig(t, plan, mechanics, NEUTRAL).rig), `${label} t=${t}`).toEqual(start);
      }
    }
  });

  it('never stretches a leg, and keeps the soles on the grip until a slip', () => {
    const sweep = sweepBounds();
    for (const { base, side, rider, stance, label } of covering(everyGrind(), ...COMBO_DIMS)) {
      for (const fall of OUTCOMES) {
        const { plan, mechanics } = planFor(base, side, stance, rider, fall);
        for (let t = 0; t <= plan.end; t += stepOf(0.04)) {
          // The drop off the bar blends two poses; the legs are whole on both ends of it.
          if (plan.fail != null && t > plan.fail && t < plan.fail + plan.drop) continue;
          const { rig, falling } = solveGrindRig(t, plan, mechanics, NEUTRAL);
          const where = () => `${label} ${fall ?? 'landed'} t=${t.toFixed(2)}`;
          for (const leg of rig.legs) {
            sweep.below('thigh length error', Math.abs(dist(leg.hip, leg.knee) - THIGH), 0.5e-6, where);
            sweep.below('shin length error', Math.abs(dist(leg.knee, leg.ankle) - SHIN), 0.5e-6, where);
            // A leg (all but) straight can't follow a popped tail down any
            // further: the planted foot eases off it over the last few units.
            const straight = dist(leg.hip, leg.ankle) > THIGH + SHIN - 4.5;
            if (falling || straight) continue;
            const sole = toBoard(rig, leg.shoe.at(0, -SHOE_HALF_HEIGHT, 0));
            sweep.below('sole height', Math.abs(sole.y - deckTopY(sole.x)), 0.5, () => `${where()} ${leg.side} sole`);
            sweep.below('sole width', Math.abs(sole.z), DECK_HALF_WIDTH + 2, () => `${where()} ${leg.side} on deck`);
          }
        }
      }
    }
    sweep.verify();
  }, SWEEP_TIMEOUT);

  it('moves every joint continuously: no pops onto the bar, off it, or into a slip', () => {
    const sweep = sweepBounds();
    // Worst joint acceleration between 120 Hz frames, as the flatground test.
    // The allowed jolts are the two snaps: the tail off the ground and off the bar.
    const dt = 1 / 120;
    const combos = GRIND_BASES.flatMap((base) => SIDES.flatMap((side) => (['regular', 'nollie'] as const).map((stance) => ({ base, side, stance }))));
    for (const { base, side, stance } of covering(combos, (c) => c.base, (c) => c.side, (c) => c.stance)) {
      for (const fall of OUTCOMES) {
        const { plan, mechanics } = planFor(base, side, stance, 'regular', fall);
        const snaps = [plan.pop, plan.off];
        const jolt = jointJolts(sweep);
        for (let t = 0; t <= plan.end; t += dt) {
          const now = joints(solveGrindRig(t, plan, mechanics, NEUTRAL).rig);
          const nearSnap = snaps.some((s) => t > s - 0.09 && t < s + 2 * dt);
          jolt(now, nearSnap, (i) => `${side} ${base} ${stance} ${fall ?? 'landed'} joint ${i} t=${t.toFixed(3)}`);
        }
      }
    }
    sweep.verify();
  }, SWEEP_TIMEOUT);

  it('keeps the robot inside the stage for every grind, side, stance, outcome, and pop style', () => {
    // Worst reach past each edge, with where it happened.
    const worst = { top: [-Infinity, ''], bottom: [-Infinity, ''], left: [-Infinity, ''], right: [-Infinity, ''] } as Record<string, [number, string]>;
    const push = (edge: string, over: number, where: () => string) => {
      if (over > worst[edge][0]) worst[edge] = [over, where()];
    };
    const cases = [0.45, 1.15].flatMap((popHeight) => [...everyGrind()].map((combo) => ({ popHeight, ...combo })));
    for (const { popHeight, base, side, rider, stance, label } of covering(cases, ...COMBO_DIMS, (c) => c.popHeight)) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1.25 });
      for (const fall of OUTCOMES) {
        const { plan, mechanics } = planFor(base, side, stance, rider, fall, style);
        for (let t = 0; t <= plan.end; t += stepOf(0.06)) {
          const { rig, frame, falling } = solveGrindRig(t, plan, mechanics, style);
          const sink = falling ? fallSink(GROUND - rig.head.origin.y) : 0;
          const cam = makeCamera(grindCameraLift(plan, t, frame.rail, sink), { ...DEFAULT_SCENE_CAMERA, targetZ: grindCameraTrack(plan, t) });
          const where = () => `${label} ${fall ?? 'landed'} pop ${popHeight} t=${t.toFixed(2)}`;
          push('top', -SKY_PAD - cam.project(rig.head.at(0, 28, 0)).y, where);
          const extremes = [
            ...[-1, 1].flatMap((a) => [-1, 1].map((b) => rig.head.at(a * 14, 15, b * 18))),
            ...rig.legs.map((leg) => leg.shoe.origin),
            ...rig.arms.map((arm) => arm.hand),
            // A slipped board may skid out of shot, like a flatground board shooting
            // out, and the pop snaps its end past the frame's foot for a few frames,
            // as a flatground pop does.
            ...(falling || (t >= plan.pop && t < plan.pop + POP_SNAP_T)
              ? []
              : [rig.board.point({ x: 48, y: 0, z: 0 }), rig.board.point({ x: -48, y: 0, z: 0 })]),
          ];
          for (const p of extremes) {
            const pp = cam.project(p);
            push('bottom', pp.y - H, where);
            push('left', -pp.x, where);
            push('right', pp.x - W, where);
          }
        }
      }
    }
    for (const [edge, [over, where]] of Object.entries(worst)) expect(over, `${edge}: ${where}`).toBeLessThan(0);
  }, SWEEP_TIMEOUT);

  it('stages finite geometry for every grind and outcome, and holds the t = 0 pose through a lead-in', () => {
    for (const base of GRIND_BASES) {
      for (const side of SIDES) {
        const name = nameOf(base, side);
        for (const fall of FALLS) {
          const { plan } = planFor(base, side, 'regular', 'goofy', fall);
          const stage = stageOf(name, false, fall);
          for (const t of [plan.lockAt + 0.3, plan.end]) {
            expect(isFiniteFrame(stageFrame(stage, t, 1)), `${name} ${fall} t=${t}`).toBe(true);
          }
        }
        const stage = stageOf(name, true, 'slam');
        expect(`${stage.grind?.spec.side} ${stage.grind?.spec.base}`).toBe(`${side} ${base}`);
        const start = stageFrame(stage, 0, 1);
        const lead = stageFrame(stage, -1.2, 1);
        expect(lead.rig.legs.map((leg) => leg.ankle), name).toEqual(start.rig.legs.map((leg) => leg.ankle));
        expect(lead.rig.head.origin, name).toEqual(start.rig.head.origin);
        expect(lead.lift, name).toBe(start.lift);
      }
    }
  }, SWEEP_TIMEOUT);
});
